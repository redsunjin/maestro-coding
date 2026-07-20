import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { screen, act, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  setupAppUiEnvironment,
  teardownAppUiEnvironment,
  startLiveSession,
} from './test/appUiHarness.jsx';

const emitNote = async (socket, requestId, title) => {
  await act(async () => {
    socket.emitMessage({
      event: 'AGENT_TASK_READY',
      requestId,
      laneIndex: 1,
      diffSummary: { title, shortDescription: 'grip regression' },
    });
  });
  expect(await screen.findByText(title)).toBeInTheDocument();
};

describe('App UI regression - handheld grip layout', () => {
  beforeEach(() => {
    setupAppUiEnvironment();
  });

  afterEach(() => {
    teardownAppUiEnvironment();
  });

  test('grip toggle renders zones, persists state, and hides center lane buttons', async () => {
    await startLiveSession();

    const toggle = screen.getByRole('button', { name: '그립 토글' });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByTestId('grip-zone-left')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Frontend Agent 승인' })).toBeInTheDocument();

    await userEvent.click(toggle);

    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    expect(window.localStorage.getItem('maestro.grip-mode')).toBe('on');
    expect(screen.getByTestId('grip-zone-left')).toBeInTheDocument();
    expect(screen.getByTestId('grip-zone-right')).toBeInTheDocument();
    // 그립 모드에서는 레인 중앙 승인/반려 버튼 숨김 (중복 제거)
    expect(screen.queryByRole('button', { name: 'Frontend Agent 승인' })).not.toBeInTheDocument();

    await userEvent.click(toggle);
    expect(screen.queryByTestId('grip-zone-left')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Frontend Agent 승인' })).toBeInTheDocument();
  });

  test('grip lanes split left/right halves (4 lanes → 2/2)', async () => {
    await startLiveSession();
    await userEvent.click(screen.getByRole('button', { name: '그립 토글' }));

    const leftZone = screen.getByTestId('grip-zone-left');
    const rightZone = screen.getByTestId('grip-zone-right');
    expect(leftZone.querySelectorAll('button').length).toBe(2);
    expect(rightZone.querySelectorAll('button').length).toBe(2);
  });

  test('grip button short tap sends APPROVE through existing judgment path', async () => {
    const socket = await startLiveSession();
    await userEvent.click(screen.getByRole('button', { name: '그립 토글' }));
    await emitNote(socket, 'req_grip_tap_1', 'Grip Tap Note');

    const gripButton = screen.getByRole('button', { name: 'Frontend Agent 그립 승인 (길게 눌러 반려)' });
    fireEvent.pointerDown(gripButton);
    fireEvent.pointerUp(gripButton);

    // 기존 판정 경로 그대로 (스폰 직후 → EARLY)
    expect(await screen.findByText('EARLY')).toBeInTheDocument();
    await waitFor(() => {
      expect(socket.sent.length).toBe(1);
    });
    const payload = JSON.parse(socket.sent[0]);
    expect(payload.action).toBe('APPROVE');
    expect(payload.requestId).toBe('req_grip_tap_1');
  });

  test('grip button long press opens reject sheet and confirm sends REJECT', async () => {
    const socket = await startLiveSession();
    await userEvent.click(screen.getByRole('button', { name: '그립 토글' }));
    await emitNote(socket, 'req_grip_long_1', 'Grip Long Note');

    const gripButton = screen.getByRole('button', { name: 'Frontend Agent 그립 승인 (길게 눌러 반려)' });
    fireEvent.pointerDown(gripButton);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 600));
    });
    fireEvent.pointerUp(gripButton);

    expect(await screen.findByTestId('reject-sheet')).toBeInTheDocument();
    expect(socket.sent.length).toBe(0);

    fireEvent.click(screen.getByRole('button', { name: '반려 확정' }));
    await waitFor(() => {
      expect(socket.sent.length).toBe(1);
    });
    expect(JSON.parse(socket.sent[0]).action).toBe('REJECT');
  });
});
