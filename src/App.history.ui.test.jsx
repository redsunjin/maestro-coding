import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { screen, act, fireEvent, waitFor } from '@testing-library/react';
import {
  setupAppUiEnvironment,
  teardownAppUiEnvironment,
  startLiveSession,
} from './test/appUiHarness.jsx';

describe('App UI regression - history score panel', () => {
  beforeEach(() => {
    setupAppUiEnvironment();
  });

  afterEach(() => {
    teardownAppUiEnvironment();
  });

  test('history panel toggles and renders HISTORY_APPEND entry', async () => {
    const socket = await startLiveSession();

    const panel = screen.getByTestId('history-panel');
    expect(panel).toHaveAttribute('aria-hidden', 'true');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '히스토리 패널 토글' }));
    });

    expect(panel).toHaveAttribute('aria-hidden', 'false');

    await act(async () => {
      socket.emitMessage({
        event: 'HISTORY_APPEND',
        item: {
          id: 'hist_ui_1',
          timestamp: new Date().toISOString(),
          requestId: 'req_hist_1',
          projectId: 'proj_b2c',
          laneIndex: 1,
          agentId: 'frontend_agent',
          branchName: 'feature/history-ui',
          title: 'History UI Regression',
          result: 'APPROVED',
          source: 'manual',
          reason: 'MERGE_SUCCESS',
          autoApproved: false,
        },
      });
    });

    await waitFor(() => {
      expect(screen.getByText('History UI Regression')).toBeInTheDocument();
      expect(screen.getAllByText('Approved').length).toBeGreaterThan(0);
    });
  });

  test('H shortcut closes history panel when input is not focused', async () => {
    await startLiveSession();
    const panel = screen.getByTestId('history-panel');

    await act(async () => {
      fireEvent.keyDown(window, { key: 'h' });
    });
    expect(panel).toHaveAttribute('aria-hidden', 'false');

    await act(async () => {
      fireEvent.keyDown(window, { key: 'h' });
    });
    expect(panel).toHaveAttribute('aria-hidden', 'true');
  });
});
