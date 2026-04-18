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

    render(
      <PlayerRunPanel
        tempo={120}
        onRunComplete={onRunComplete}
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
    expect(onRunComplete).toHaveBeenCalledTimes(1);
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

    render(
      <PlayerRunPanel
        tempo={120}
        onRunComplete={onRunComplete}
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
    expect(screen.getByText(/Completed manual play with 2 \/ 2 notes resolved/i)).toBeVisible();
    expect(onRunComplete).toHaveBeenCalledTimes(1);
    expect(onRunComplete).toHaveBeenCalledWith(expect.objectContaining({
      playMode: 'manual',
      notesHit: 2,
      totalNotes: 2,
    }));
  });
});
