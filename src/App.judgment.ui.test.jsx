import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, act, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HAPTIC_PATTERNS } from './utils/haptics.js';
import {
  setupAppUiEnvironment,
  teardownAppUiEnvironment,
  startLiveSession,
} from './test/appUiHarness.jsx';

describe('App UI regression - timing judgment (score-only)', () => {
  let vibrateSpy;

  beforeEach(() => {
    setupAppUiEnvironment();
    vibrateSpy = vi.fn(() => true);
    Object.defineProperty(window.navigator, 'vibrate', {
      value: vibrateSpy,
      configurable: true,
      writable: true,
    });
  });

  afterEach(() => {
    delete window.navigator.vibrate;
    teardownAppUiEnvironment();
  });

  test('approve tap shows timing grade, fires haptic, and sends unchanged APPROVE payload', async () => {
    const socket = await startLiveSession();

    await act(async () => {
      socket.emitMessage({
        event: 'AGENT_TASK_READY',
        requestId: 'req_judgment_1',
        laneIndex: 1,
        diffSummary: {
          title: 'Judgment Note',
          shortDescription: 'timing judgment regression',
        },
      });
    });

    expect(await screen.findByText('Judgment Note')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Frontend Agent 승인' }));

    // 스폰 직후(판정선에서 먼 위치) 탭 → EARLY 등급
    expect(await screen.findByText('EARLY')).toBeInTheDocument();
    expect(vibrateSpy).toHaveBeenCalledWith(HAPTIC_PATTERNS.EARLY);

    // 안전 회귀: 등급과 무관하게 APPROVE는 기존과 동일하게 전송
    await waitFor(() => {
      expect(socket.sent.length).toBe(1);
    });
    const payload = JSON.parse(socket.sent[0]);
    expect(payload.action).toBe('APPROVE');
    expect(payload.requestId).toBe('req_judgment_1');
  });

  test('merge success applies grade-based score and separate merged count', async () => {
    const socket = await startLiveSession();

    await act(async () => {
      socket.emitMessage({
        event: 'AGENT_TASK_READY',
        requestId: 'req_judgment_2',
        laneIndex: 1,
        diffSummary: {
          title: 'Judgment Score Note',
          shortDescription: 'grade score regression',
        },
      });
    });

    expect(await screen.findByText('Judgment Score Note')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Frontend Agent 승인' }));

    await act(async () => {
      socket.emitMessage({ event: 'MERGE_SUCCESS', requestId: 'req_judgment_2' });
    });

    await waitFor(() => {
      // EARLY 등급 → 리듬 점수 +40, 머지 수 +1 (점수와 머지 수는 분리)
      expect(screen.getByTestId('rhythm-score')).toHaveTextContent('40');
      expect(screen.getByTestId('merged-count')).toHaveTextContent('1');
    });
  });
});
