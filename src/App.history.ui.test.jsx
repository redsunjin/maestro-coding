import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { screen, act, fireEvent, waitFor, within } from '@testing-library/react';
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

    const toggleButton = screen.getByRole('button', { name: '히스토리 패널 토글' });
    const panel = screen.getByTestId('history-panel');
    expect(toggleButton).toHaveAttribute('aria-expanded', 'false');
    expect(panel).toHaveAttribute('role', 'dialog');
    expect(panel).toHaveAttribute('aria-hidden', 'true');

    await act(async () => {
      fireEvent.click(toggleButton);
    });

    expect(toggleButton).toHaveAttribute('aria-expanded', 'true');
    expect(panel).toHaveAttribute('aria-hidden', 'false');
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '히스토리 패널 닫기' })).toHaveFocus();
    });

    const sharedTimestamp = '2026-03-08T00:00:00.000Z';

    await act(async () => {
      socket.emitMessage({
        event: 'HISTORY_APPEND',
        item: {
          id: 'hist_ui_1',
          timestamp: sharedTimestamp,
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
      socket.emitMessage({
        event: 'HISTORY_APPEND',
        item: {
          id: 'hist_ui_2',
          timestamp: sharedTimestamp,
          requestId: 'req_hist_2',
          projectId: 'proj_b2c',
          laneIndex: 1,
          agentId: 'frontend_agent',
          branchName: 'feature/history-density',
          title: 'History Density Marker',
          result: 'REQUESTED',
          source: 'manual',
          reason: 'AGENT_TASK_READY',
          autoApproved: false,
        },
      });
    });

    await waitFor(() => {
      expect(screen.getByText('History UI Regression')).toBeInTheDocument();
      expect(screen.getAllByText('Approved').length).toBeGreaterThan(0);
      const overview = screen.getByTestId('history-score-overview');
      expect(overview).toBeInTheDocument();
      expect(within(overview).getAllByTestId('history-score-note').length).toBeGreaterThan(0);
      expect(within(overview).getByTestId('history-score-density')).toHaveTextContent('2');
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
