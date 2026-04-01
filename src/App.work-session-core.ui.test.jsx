import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import {
  setupAppUiEnvironment,
  startLiveSession,
  teardownAppUiEnvironment,
} from './test/appUiHarness.jsx';

function createFetchResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

describe('App UI regression - work session core', () => {
  beforeEach(() => {
    setupAppUiEnvironment();
  });

  afterEach(() => {
    teardownAppUiEnvironment();
  });

  test('work console loads session list, selects a session, and submits /status', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      const url = String(input);

      if (url.includes('/api/work-sessions/wsn_1/messages') && init?.method === 'POST') {
        return Promise.resolve(createFetchResponse({
          success: true,
          item: {
            workSessionId: 'wsn_1',
            projectId: 'runtime_default',
            title: 'History Export Session',
            status: 'active',
            agentId: 'openclaw',
            source: 'dashboard',
            createdAt: '2026-04-01T00:00:00.000Z',
            updatedAt: '2026-04-01T00:02:00.000Z',
            lastMessageAt: '2026-04-01T00:02:00.000Z',
            pendingOperatorDecision: false,
            metadata: {},
          },
          messages: [
            {
              workMessageId: 'wmsg_2',
              workSessionId: 'wsn_1',
              role: 'operator',
              kind: 'command',
              body: '/status',
              command: '/status',
              status: null,
              createdAt: '2026-04-01T00:02:00.000Z',
            },
            {
              workMessageId: 'wmsg_3',
              workSessionId: 'wsn_1',
              role: 'system',
              kind: 'command_result',
              body: 'status=active, messages=2, lastMessageAt=2026-04-01T00:01:00.000Z, pendingDecision=no',
              command: '/status',
              status: 'completed',
              createdAt: '2026-04-01T00:02:00.500Z',
            },
          ],
        }));
      }

      if (url.includes('/api/work-sessions/wsn_1')) {
        return Promise.resolve(createFetchResponse({
          item: {
            workSessionId: 'wsn_1',
            projectId: 'runtime_default',
            title: 'History Export Session',
            status: 'active',
            agentId: 'openclaw',
            source: 'dashboard',
            createdAt: '2026-04-01T00:00:00.000Z',
            updatedAt: '2026-04-01T00:01:00.000Z',
            lastMessageAt: '2026-04-01T00:01:00.000Z',
            pendingOperatorDecision: false,
            metadata: {},
          },
          messages: [
            {
              workMessageId: 'wmsg_1',
              workSessionId: 'wsn_1',
              role: 'system',
              kind: 'status',
              body: 'Work session created.',
              command: null,
              status: null,
              createdAt: '2026-04-01T00:00:00.000Z',
            },
          ],
          count: 1,
        }));
      }

      if (url.includes('/api/work-sessions')) {
        return Promise.resolve(createFetchResponse({
          items: [
            {
              workSessionId: 'wsn_1',
              projectId: 'runtime_default',
              title: 'History Export Session',
              status: 'active',
              agentId: 'openclaw',
              source: 'dashboard',
              createdAt: '2026-04-01T00:00:00.000Z',
              updatedAt: '2026-04-01T00:01:00.000Z',
              lastMessageAt: '2026-04-01T00:01:00.000Z',
              pendingOperatorDecision: false,
              metadata: {},
            },
          ],
          count: 1,
          maxItems: 60,
        }));
      }

      if (url.includes('/api/history')) {
        return Promise.resolve(createFetchResponse({ items: [], count: 0 }));
      }

      return Promise.resolve(createFetchResponse({}));
    });

    await startLiveSession();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Work Console 패널 토글' }));
    });

    await waitFor(() => {
      expect(screen.getAllByText('History Export Session').length).toBeGreaterThan(0);
      expect(screen.getByText('Work session created.')).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Work Console 명령 입력'), { target: { value: '/status' } });
      fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    });

    await waitFor(() => {
      expect(screen.getByText('/status')).toBeInTheDocument();
      expect(screen.getByText(/status=active, messages=2/)).toBeInTheDocument();
    });
  });

  test('work console creates a new session from the empty state', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      const url = String(input);

      if (url.includes('/api/history')) {
        return Promise.resolve(createFetchResponse({ items: [], count: 0 }));
      }

      if (url.includes('/api/work-sessions') && init?.method === 'POST') {
        return Promise.resolve(createFetchResponse({
          success: true,
          item: {
            workSessionId: 'wsn_created',
            projectId: 'runtime_default',
            title: '새 작업 세션',
            status: 'active',
            agentId: 'openclaw',
            source: 'dashboard',
            createdAt: '2026-04-01T01:00:00.000Z',
            updatedAt: '2026-04-01T01:00:00.000Z',
            lastMessageAt: '2026-04-01T01:00:00.000Z',
            pendingOperatorDecision: false,
            metadata: {},
          },
          messages: [
            {
              workMessageId: 'wmsg_created',
              workSessionId: 'wsn_created',
              role: 'system',
              kind: 'status',
              body: 'Work session created.',
              command: null,
              status: null,
              createdAt: '2026-04-01T01:00:00.000Z',
            },
          ],
        }));
      }

      if (url.includes('/api/work-sessions/wsn_created')) {
        return Promise.resolve(createFetchResponse({
          item: {
            workSessionId: 'wsn_created',
            projectId: 'runtime_default',
            title: '새 작업 세션',
            status: 'active',
            agentId: 'openclaw',
            source: 'dashboard',
            createdAt: '2026-04-01T01:00:00.000Z',
            updatedAt: '2026-04-01T01:00:00.000Z',
            lastMessageAt: '2026-04-01T01:00:00.000Z',
            pendingOperatorDecision: false,
            metadata: {},
          },
          messages: [
            {
              workMessageId: 'wmsg_created',
              workSessionId: 'wsn_created',
              role: 'system',
              kind: 'status',
              body: 'Work session created.',
              command: null,
              status: null,
              createdAt: '2026-04-01T01:00:00.000Z',
            },
          ],
          count: 1,
        }));
      }

      if (url.includes('/api/work-sessions')) {
        return Promise.resolve(createFetchResponse({
          items: [],
          count: 0,
          maxItems: 60,
        }));
      }

      return Promise.resolve(createFetchResponse({}));
    });

    await startLiveSession();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Work Console 패널 토글' }));
    });

    await waitFor(() => {
      expect(screen.getAllByText('아직 열린 작업 세션이 없습니다.').length).toBeGreaterThan(0);
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '새 작업 시작' }));
    });

    await waitFor(() => {
      expect(screen.getAllByText('새 작업 세션').length).toBeGreaterThan(0);
      expect(screen.getByText('Work session created.')).toBeInTheDocument();
    });
  });
});
