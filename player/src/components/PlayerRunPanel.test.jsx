import React from 'react';
import { act } from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

import PlayerRunPanel from './PlayerRunPanel.jsx';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('PlayerRunPanel', () => {
  test('renders an empty state before a chart is loaded', () => {
    render(<PlayerRunPanel chart={null} />);

    expect(screen.getByRole('heading', { name: 'Play the chart' })).toBeVisible();
    expect(screen.getByText('No chart loaded')).toBeVisible();
    expect(screen.getByText(/Load a replay source to generate a playable chart/i)).toBeVisible();
  });

  test('supports autoplay preview completion and retry', () => {
    vi.useFakeTimers();
    const onRunComplete = vi.fn();
    const audioDriver = createAudioDriverHarness();
    const bgmDriver = createBgmDriverHarness();

    render(
      <PlayerRunPanel
        tempo={120}
        onRunComplete={onRunComplete}
        audioDriver={audioDriver}
        bgmDriver={bgmDriver}
        chart={{
          laneCount: 4,
          notes: [
            { noteId: 'note-1', laneIndex: 1, beatOffset: 0, durationBeats: 1, noteType: 'tap' },
            { noteId: 'note-2', laneIndex: 3, beatOffset: 1, durationBeats: 1, noteType: 'accent' },
          ],
        }}
      />,
    );

    fireEvent.click(screen.getByRole('tab', { name: 'Auto Preview' }));
    fireEvent.click(screen.getByRole('button', { name: 'Start Run' }));

    act(() => {
      vi.advanceTimersByTime(1200);
    });

    expect(screen.getByText('Run complete')).toBeVisible();
    expect(screen.getByText(/Completed autoplay preview with 2 \/ 2 notes resolved/i)).toBeVisible();
    expect(screen.getByText('240')).toBeVisible();
    expect(screen.getByText('Click Track On')).toBeVisible();
    expect(screen.getByText('BGM Layer On')).toBeVisible();
    expect(onRunComplete).toHaveBeenCalledTimes(1);
    expect(audioDriver.prime).toHaveBeenCalledTimes(1);
    expect(bgmDriver.prime).toHaveBeenCalledTimes(1);
    expect(audioDriver.pulse).toHaveBeenCalled();
    expect(bgmDriver.playCueBatch).toHaveBeenCalled();
    expect(onRunComplete).toHaveBeenCalledWith(expect.objectContaining({
      playMode: 'auto',
      score: 240,
      maxCombo: 2,
      notesHit: 2,
      totalNotes: 2,
    }));

    fireEvent.click(screen.getByRole('button', { name: 'Retry Run' }));

    expect(screen.getByText('Ready to play')).toBeVisible();
  });

  test('supports manual judgment with lane buttons and renders chart lanes', () => {
    vi.useFakeTimers();
    const onRunComplete = vi.fn();
    const audioDriver = createAudioDriverHarness();
    const bgmDriver = createBgmDriverHarness();

    render(
      <PlayerRunPanel
        tempo={120}
        onRunComplete={onRunComplete}
        audioDriver={audioDriver}
        bgmDriver={bgmDriver}
        chart={{
          laneCount: 4,
          notes: [
            { noteId: 'manual-1', laneIndex: 1, beatOffset: 0.5, durationBeats: 1, noteType: 'tap' },
            { noteId: 'manual-2', laneIndex: 2, beatOffset: 1, durationBeats: 1, noteType: 'accent' },
          ],
        }}
      />,
    );

    expect(screen.getByRole('tab', { name: 'Manual Play' })).toBeVisible();
    expect(screen.getByLabelText('Chart lanes')).toBeVisible();
    expect(screen.getByLabelText('Beat meter')).toBeVisible();
    expect(screen.getAllByRole('button', { name: /Hit / })).toHaveLength(4);

    fireEvent.click(screen.getByRole('button', { name: 'Start Run' }));

    act(() => {
      vi.advanceTimersByTime(200);
    });
    fireEvent.click(screen.getByRole('button', { name: 'Hit A' }));

    act(() => {
      vi.advanceTimersByTime(160);
    });
    fireEvent.click(screen.getByRole('button', { name: 'Hit S' }));

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(screen.getByText('Perfect 2')).toBeVisible();
    expect(screen.getByText('Great 0')).toBeVisible();
    expect(screen.getByText('Timing bias: Centered')).toBeVisible();
    expect(screen.getByText(/BGM state:/i)).toBeVisible();
    expect(screen.getByText(/Completed manual play with 2 \/ 2 notes resolved/i)).toBeVisible();
    expect(onRunComplete).toHaveBeenCalledTimes(1);
    expect(onRunComplete).toHaveBeenCalledWith(expect.objectContaining({
      playMode: 'manual',
      notesHit: 2,
      totalNotes: 2,
    }));
  });

  test('allows muting the click track without removing the beat meter', () => {
    const audioDriver = createAudioDriverHarness();
    const bgmDriver = createBgmDriverHarness();

    render(
      <PlayerRunPanel
        tempo={132}
        audioDriver={audioDriver}
        bgmDriver={bgmDriver}
        chart={{
          laneCount: 4,
          notes: [
            { noteId: 'muted-1', laneIndex: 1, beatOffset: 0, durationBeats: 1, noteType: 'tap' },
          ],
        }}
      />,
    );

    expect(screen.getByText('Click Track On')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Mute Click Track' }));

    expect(screen.getByText('Click Track Off')).toBeVisible();
    expect(screen.getByLabelText('Beat meter')).toBeVisible();
  });

  test('allows muting the BGM layer independently from the click track', () => {
    const audioDriver = createAudioDriverHarness();
    const bgmDriver = createBgmDriverHarness();

    render(
      <PlayerRunPanel
        tempo={124}
        audioDriver={audioDriver}
        bgmDriver={bgmDriver}
        chart={{
          laneCount: 4,
          notes: [
            { noteId: 'bgm-1', laneIndex: 2, beatOffset: 0, durationBeats: 1, noteType: 'accent' },
          ],
        }}
      />,
    );

    expect(screen.getByText('BGM Layer On')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Mute BGM Layer' }));

    expect(screen.getByText('BGM Layer Off')).toBeVisible();
    expect(screen.getByText('BGM state: BGM muted')).toBeVisible();
  });

  test('maps near-miss timing into a great judgment tier', () => {
    vi.useFakeTimers();
    const audioDriver = createAudioDriverHarness();
    const bgmDriver = createBgmDriverHarness();

    render(
      <PlayerRunPanel
        tempo={120}
        audioDriver={audioDriver}
        bgmDriver={bgmDriver}
        chart={{
          laneCount: 4,
          notes: [
            { noteId: 'great-1', laneIndex: 1, beatOffset: 0.8, durationBeats: 0.25, noteType: 'tap' },
          ],
        }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Start Run' }));

    act(() => {
      vi.advanceTimersByTime(320);
    });
    fireEvent.click(screen.getByRole('button', { name: 'Hit A' }));

    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(screen.getByText('Great 1')).toBeVisible();
    expect(screen.getByText(/Timing bias: Avg late 100ms/i)).toBeVisible();
  });
});

function createAudioDriverHarness() {
  return {
    isSupported: () => true,
    prime: vi.fn(),
    pulse: vi.fn(),
    stop: vi.fn(),
  };
}

function createBgmDriverHarness() {
  return {
    isSupported: () => true,
    prime: vi.fn(),
    playCueBatch: vi.fn(),
    stop: vi.fn(),
  };
}
