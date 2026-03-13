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

describe('App UI regression - auto approve ops panel', () => {
  beforeEach(() => {
    setupAppUiEnvironment();
  });

  afterEach(() => {
    teardownAppUiEnvironment();
  });

  test('auto approve ops panel renders status and events from the operability APIs', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = String(input);

      if (url.includes('/api/history')) {
        return Promise.resolve(createFetchResponse({ items: [], count: 0 }));
      }

      if (url.includes('/api/auto-approve/status')) {
        return Promise.resolve(createFetchResponse({
          config: {
            enabled: true,
            dryRun: false,
            requireExplicit: true,
            cooldownMs: 60000,
            maxDescriptionLength: 180,
            branchPrefix: 'feature/',
            trustedAgents: ['qa_agent'],
            trustedAgentsCount: 1,
          },
          runtime: {
            inFlightCount: 1,
            trackedRequestCount: 4,
            requestStateSummary: {
              ready: 1,
              approving: 1,
              merged: 1,
              rejected: 1,
            },
            lastAutoApproveAt: '2026-03-12T01:23:45.000Z',
            autoApproveEventCount: 3,
          },
          recentEvents: [],
          count: 0,
        }));
      }

      if (url.includes('/api/auto-approve/events')) {
        return Promise.resolve(createFetchResponse({
          items: [
            {
              id: 'auto_evt_1',
              timestamp: '2026-03-12T01:24:00.000Z',
              phase: 'execution',
              requestId: 'req_auto_1',
              agentId: 'qa_agent',
              projectId: 'proj_b2c',
              branchName: 'feature/ops-panel',
              decision: 'MERGED',
              reason: 'MERGE_SUCCESS',
              retryAfterMs: null,
              dryRun: false,
            },
          ],
          count: 1,
          maxItems: 500,
        }));
      }

      return Promise.resolve(createFetchResponse({}));
    });

    await startLiveSession();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '자동승인 운영 패널 토글' }));
    });

    const panel = screen.getByTestId('auto-approve-panel');
    expect(panel).toHaveAttribute('aria-hidden', 'false');

    await waitFor(() => {
      expect(screen.getByText('Auto Approve Ops')).toBeInTheDocument();
      expect(screen.getByText('Enabled')).toBeInTheDocument();
      expect(screen.getByText('qa_agent')).toBeInTheDocument();
      expect(screen.getByText('MERGE_SUCCESS')).toBeInTheDocument();
      expect(screen.getByText(/feature\/ops-panel/)).toBeInTheDocument();
    });
  });

  test('auto approve ops panel retries with bearer token after unauthorized response', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      const url = String(input);
      const authorization = init?.headers?.Authorization;

      if (url.includes('/api/history')) {
        return Promise.resolve(createFetchResponse({ items: [], count: 0 }));
      }

      if (url.includes('/api/auto-approve/status')) {
        if (authorization !== 'Bearer dev-token') {
          return Promise.resolve(createFetchResponse({ error: 'Unauthorized' }, 401));
        }

        return Promise.resolve(createFetchResponse({
          config: {
            enabled: true,
            dryRun: true,
            requireExplicit: true,
            cooldownMs: 300000,
            maxDescriptionLength: 180,
            branchPrefix: 'feature/',
            trustedAgents: [],
            trustedAgentsCount: 0,
          },
          runtime: {
            inFlightCount: 0,
            trackedRequestCount: 2,
            requestStateSummary: {
              ready: 2,
              approving: 0,
              merged: 0,
              rejected: 0,
            },
            lastAutoApproveAt: null,
            autoApproveEventCount: 2,
          },
          recentEvents: [],
          count: 0,
        }));
      }

      if (url.includes('/api/auto-approve/events')) {
        if (authorization !== 'Bearer dev-token') {
          return Promise.resolve(createFetchResponse({ error: 'Unauthorized' }, 401));
        }

        return Promise.resolve(createFetchResponse({
          items: [
            {
              id: 'auto_evt_2',
              timestamp: '2026-03-12T02:00:00.000Z',
              phase: 'execution',
              requestId: 'req_auto_auth_1',
              agentId: 'qa_agent',
              projectId: 'proj_b2c',
              branchName: 'feature/auth',
              decision: 'SKIPPED',
              reason: 'DRY_RUN',
              retryAfterMs: null,
              dryRun: true,
            },
          ],
          count: 1,
          maxItems: 500,
        }));
      }

      return Promise.resolve(createFetchResponse({}));
    });

    await startLiveSession();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '자동승인 운영 패널 토글' }));
    });

    await waitFor(() => {
      expect(screen.getByText('자동승인 운영 API 인증이 필요합니다. 서버 토큰을 입력해주세요.')).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.change(screen.getByLabelText('운영 API 토큰'), { target: { value: 'dev-token' } });
      fireEvent.click(screen.getByRole('button', { name: '저장' }));
    });

    await waitFor(() => {
      expect(screen.getByText('Dry Run')).toBeInTheDocument();
      expect(screen.getByText('DRY_RUN')).toBeInTheDocument();
    });

    expect(
      fetchSpy.mock.calls.some(([, init]) => init?.headers?.Authorization === 'Bearer dev-token'),
    ).toBe(true);
  });
});
