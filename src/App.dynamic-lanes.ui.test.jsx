import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  MockWebSocket,
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

describe('App UI regression - dynamic lane count', () => {
  beforeEach(() => {
    setupAppUiEnvironment();
  });

  afterEach(() => {
    teardownAppUiEnvironment();
  });

  test('active project lane count expands board actions and approve payloads', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = String(input);

      if (url.includes('/api/history')) {
        return Promise.resolve(createFetchResponse({ items: [], count: 0 }));
      }

      if (url.includes('/api/projects')) {
        return Promise.resolve(createFetchResponse({
          currentProject: {
            id: 'orchestra',
            name: 'orchestra',
            path: '/workspace/orchestra',
            repoUrl: 'https://example.com/orchestra.git',
            laneCount: 6,
            isActive: true,
          },
          items: [
            {
              id: 'orchestra',
              name: 'orchestra',
              path: '/workspace/orchestra',
              repoUrl: 'https://example.com/orchestra.git',
              laneCount: 6,
              isActive: true,
            },
          ],
          count: 1,
        }));
      }

      return Promise.resolve(createFetchResponse({}));
    });

    const ws = await startLiveSession();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Lane 6 승인' })).toBeInTheDocument();
    });

    act(() => {
      ws.emitMessage({
        event: 'AGENT_TASK_READY',
        requestId: 'req_lane_6',
        laneIndex: 6,
        projectId: 'proj_b2c',
        branchName: 'feature/lane-6',
        diffSummary: {
          title: 'lane six ready',
          shortDescription: 'dynamic lane test',
        },
      });
    });

    await userEvent.click(screen.getByRole('button', { name: 'Lane 6 승인' }));

    await waitFor(() => {
      const sentPayload = ws.sent.map((payload) => JSON.parse(payload));
      expect(sentPayload.some((payload) => payload.requestId === 'req_lane_6' && payload.laneIndex === 6 && payload.action === 'APPROVE')).toBe(true);
    });

    expect(MockWebSocket.instances).toHaveLength(1);
  });
});
