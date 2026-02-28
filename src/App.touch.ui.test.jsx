import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, act, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  setupAppUiEnvironment,
  teardownAppUiEnvironment,
  startLiveSession,
} from './test/appUiHarness.jsx';

describe('App UI regression - touch controls', () => {
  beforeEach(() => {
    setupAppUiEnvironment();
  });

  afterEach(() => {
    teardownAppUiEnvironment();
  });

  test('touch approve button sends APPROVE payload', async () => {
    const socket = await startLiveSession();

    await act(async () => {
      socket.emitMessage({
        event: 'AGENT_TASK_READY',
        requestId: 'req_touch_approve_1',
        laneIndex: 1,
        diffSummary: {
          title: 'Touch Approve Note',
          shortDescription: 'touch approve flow regression',
        },
      });
    });

    expect(await screen.findByText('Touch Approve Note')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Frontend Agent 승인' }));

    await waitFor(() => {
      expect(socket.sent.length).toBe(1);
    });

    const approvePayload = JSON.parse(socket.sent[0]);
    expect(approvePayload.action).toBe('APPROVE');
    expect(approvePayload.requestId).toBe('req_touch_approve_1');
  });

  test('touch reject button sends REJECT payload with feedback prompt', async () => {
    const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue('Touch reject feedback');
    const socket = await startLiveSession();

    await act(async () => {
      socket.emitMessage({
        event: 'AGENT_TASK_READY',
        requestId: 'req_touch_reject_1',
        laneIndex: 1,
        diffSummary: {
          title: 'Touch Reject Note',
          shortDescription: 'touch reject flow regression',
        },
      });
    });

    expect(await screen.findByText('Touch Reject Note')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Frontend Agent 반려' }));

    await waitFor(() => {
      expect(promptSpy).toHaveBeenCalled();
      expect(socket.sent.length).toBe(1);
    });

    const rejectPayload = JSON.parse(socket.sent[0]);
    expect(rejectPayload.action).toBe('REJECT');
    expect(rejectPayload.feedback).toBe('Touch reject feedback');
  });

  test('touch undo button sends UNDO payload in live mode', async () => {
    const socket = await startLiveSession();

    await userEvent.click(screen.getByRole('button', { name: '롤백 실행' }));

    await waitFor(() => {
      expect(socket.sent.length).toBe(1);
    });

    const undoPayload = JSON.parse(socket.sent[0]);
    expect(undoPayload.action).toBe('UNDO');
  });
});
