import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App.jsx';
import { setupAppUiEnvironment, teardownAppUiEnvironment, MockWebSocket } from './test/appUiHarness.jsx';

function makeWorkRequest(overrides = {}) {
  return {
    workRequestId: 'wrk_test_1',
    projectId: 'runtime_default',
    laneIndex: 2,
    requestedBy: 'operator',
    preferredAgent: 'openclaw',
    title: '승인 이력 export 설계',
    goal: '히스토리 export API를 설계한다',
    constraints: [],
    acceptanceCriteria: [],
    priority: 'high',
    targetBranch: 'main',
    workflowState: 'submitted',
    createdAt: '2026-07-15T00:00:00.000Z',
    updatedAt: '2026-07-15T00:00:00.000Z',
    ...overrides,
  };
}

describe('App UI regression - work request intake', () => {
  beforeEach(() => {
    setupAppUiEnvironment();
  });

  afterEach(() => {
    teardownAppUiEnvironment();
  });

  test('shows the Requests toggle only when the workflow feature is enabled and creates/decides a request', async () => {
    const created = makeWorkRequest();
    const workRequests = [];

    globalThis.fetch = vi.fn(async (input, init = {}) => {
      const url = String(input);
      const method = (init.method || 'GET').toUpperCase();

      if (url.includes('/health')) {
        return { ok: true, status: 200, json: async () => ({ status: 'ok', workflow: { enabled: true } }) };
      }
      if (url.includes('/api/work-requests') && method === 'POST' && url.endsWith('/decision')) {
        const decided = { ...created, workflowState: 'request_approved' };
        const index = workRequests.findIndex((item) => item.workRequestId === created.workRequestId);
        if (index >= 0) workRequests[index] = decided;
        return { ok: true, status: 200, json: async () => ({ success: true, item: decided, decision: 'approve' }) };
      }
      if (url.includes('/api/work-requests') && method === 'POST') {
        workRequests.unshift(created);
        return { ok: true, status: 200, json: async () => ({ success: true, item: created }) };
      }
      if (url.includes('/api/work-requests')) {
        return { ok: true, status: 200, json: async () => ({ items: workRequests, count: workRequests.length, maxItems: 100 }) };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    });

    await act(async () => {
      render(<App />);
    });

    const toggle = await screen.findByRole('button', { name: '작업 요청 패널 토글' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');

    await userEvent.click(toggle);
    await waitFor(() => expect(toggle).toHaveAttribute('aria-expanded', 'true'));

    const panel = screen.getByTestId('work-request-panel');
    await userEvent.type(within(panel).getByLabelText('작업 제목'), '승인 이력 export 설계');
    await userEvent.type(within(panel).getByLabelText('작업 목표'), '히스토리 export API를 설계한다');
    await userEvent.click(within(panel).getByRole('button', { name: '작업 요청 등록' }));

    await waitFor(() => {
      expect(within(panel).getByText('승인 이력 export 설계')).toBeInTheDocument();
      expect(within(panel).getByText('submitted')).toBeInTheDocument();
    });

    await userEvent.click(within(panel).getByRole('button', { name: '작업 요청 승인' }));

    await waitFor(() => {
      expect(within(panel).getByText('request_approved')).toBeInTheDocument();
    });
  });

  test('Work Console and Work Requests panels are mutually exclusive (no right-dock overlap)', async () => {
    globalThis.fetch = vi.fn(async (input) => {
      const url = String(input);
      if (url.includes('/health')) {
        return { ok: true, status: 200, json: async () => ({ status: 'ok', workflow: { enabled: true } }) };
      }
      if (url.includes('/api/work-requests')) {
        return { ok: true, status: 200, json: async () => ({ items: [], count: 0, maxItems: 100 }) };
      }
      if (url.includes('/api/work-sessions')) {
        return { ok: true, status: 200, json: async () => ({ items: [], count: 0, maxItems: 60 }) };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    });

    await act(async () => {
      render(<App />);
    });

    const workConsoleToggle = await screen.findByRole('button', { name: 'Work Console 패널 토글' });
    const requestsToggle = await screen.findByRole('button', { name: '작업 요청 패널 토글' });

    // Open Work Console first.
    await userEvent.click(workConsoleToggle);
    await waitFor(() => expect(workConsoleToggle).toHaveAttribute('aria-expanded', 'true'));

    // Opening Work Requests must close Work Console (same right-dock real estate).
    await userEvent.click(requestsToggle);
    await waitFor(() => {
      expect(requestsToggle).toHaveAttribute('aria-expanded', 'true');
      expect(workConsoleToggle).toHaveAttribute('aria-expanded', 'false');
    });

    // And reopening Work Console must close Work Requests.
    await userEvent.click(workConsoleToggle);
    await waitFor(() => {
      expect(workConsoleToggle).toHaveAttribute('aria-expanded', 'true');
      expect(requestsToggle).toHaveAttribute('aria-expanded', 'false');
    });
  });

  test('hides the Requests toggle when the workflow feature is disabled', async () => {
    await act(async () => {
      render(<App />);
    });

    // Default harness /health returns {} (no workflow.enabled), so the toggle stays hidden.
    await waitFor(() => {
      expect(MockWebSocket.instances.length).toBeGreaterThanOrEqual(0);
    });
    expect(screen.queryByRole('button', { name: '작업 요청 패널 토글' })).toBeNull();
  });
});
