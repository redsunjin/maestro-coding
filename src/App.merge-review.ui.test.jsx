import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  setupAppUiEnvironment,
  startLiveSession,
  teardownAppUiEnvironment,
} from './test/appUiHarness.jsx';

const REVIEW_FIXTURE = {
  requestId: 'req_ui_review',
  branchName: 'feature/login-fix',
  baseRef: 'main',
  mergeable: true,
  conflictFiles: [],
  stats: { filesChanged: 2, additions: 41, deletions: 3, truncated: false },
  commits: [
    { sha: 'abc1234', subject: 'fix: login flow hardening', author: 'backend_agent', date: '2026-07-22T00:00:00.000Z' },
  ],
  files: [
    {
      path: 'src/login.js',
      status: 'modified',
      additions: 40,
      deletions: 2,
      binary: false,
      patch: '@@ -1,2 +1,3 @@\n-const login = null;\n+export const login = () => true;\n+export const logout = () => false;',
      truncated: false,
    },
    { path: 'src/session.js', status: 'added', additions: 1, deletions: 1, binary: false, patch: '', truncated: false },
  ],
  generatedAt: '2026-07-22T00:00:00.000Z',
};

describe('App UI - merge review sheet', () => {
  let reviewFetchMock;

  beforeEach(() => {
    setupAppUiEnvironment();
    const baseFetch = globalThis.fetch;
    reviewFetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => REVIEW_FIXTURE,
    }));
    globalThis.fetch = vi.fn(async (input, init) => {
      const url = String(input);
      if (url.includes('/api/requests/') && url.endsWith('/review')) {
        return reviewFetchMock(url);
      }
      return baseFetch(input, init);
    });
  });

  afterEach(() => {
    teardownAppUiEnvironment();
  });

  async function openReviewSheet(socket, overrides = {}) {
    await act(async () => {
      socket.emitMessage({
        event: 'AGENT_TASK_READY',
        requestId: 'req_ui_review',
        laneIndex: 1,
        branchName: 'feature/login-fix',
        diffSummary: {
          title: 'UI Review Note',
          shortDescription: 'agent self-reported summary',
        },
        ...overrides,
      });
    });

    await userEvent.click(await screen.findByText('UI Review Note'));
    expect(await screen.findByTestId('preview-modal-backdrop')).toBeInTheDocument();
  }

  test('note click opens review sheet with real diff data', async () => {
    const socket = await startLiveSession();
    await openReviewSheet(socket);

    await waitFor(() => {
      expect(screen.getByTestId('review-merge-badge')).toHaveTextContent('머지 가능');
    });
    expect(screen.getByText('src/login.js')).toBeInTheDocument();
    expect(screen.getByText(/fix: login flow hardening/)).toBeInTheDocument();
    expect(screen.getByText(/\+export const login/)).toBeInTheDocument();
    expect(reviewFetchMock).toHaveBeenCalledWith(expect.stringContaining('/api/requests/req_ui_review/review'));
  });

  test('review approve sends APPROVE for the exact request', async () => {
    const socket = await startLiveSession();
    await openReviewSheet(socket);

    await waitFor(() => {
      expect(screen.getByTestId('review-merge-badge')).toBeInTheDocument();
    });
    await userEvent.click(screen.getByRole('button', { name: '리뷰 승인' }));

    await waitFor(() => {
      const approvals = socket.sent.map((raw) => JSON.parse(raw)).filter((action) => action.action === 'APPROVE');
      expect(approvals.some((action) => action.requestId === 'req_ui_review')).toBe(true);
    });
    expect(screen.queryByTestId('preview-modal-backdrop')).not.toBeInTheDocument();
  });

  test('review reject routes through reject sheet with feedback', async () => {
    const socket = await startLiveSession();
    await openReviewSheet(socket);

    await waitFor(() => {
      expect(screen.getByTestId('review-merge-badge')).toBeInTheDocument();
    });
    await userEvent.click(screen.getByRole('button', { name: '리뷰 반려' }));

    expect(await screen.findByTestId('reject-sheet')).toBeInTheDocument();
    await userEvent.type(screen.getByRole('textbox', { name: '반려 사유 입력' }), 'needs tests');
    await userEvent.click(screen.getByRole('button', { name: '반려 확정' }));

    await waitFor(() => {
      const rejects = socket.sent.map((raw) => JSON.parse(raw)).filter((action) => action.action === 'REJECT');
      expect(rejects.some((action) => action.requestId === 'req_ui_review' && action.feedback === 'needs tests')).toBe(true);
    });
  });

  test('falls back to agent summary when review fetch fails', async () => {
    reviewFetchMock.mockImplementation(async () => ({
      ok: false,
      status: 500,
      json: async () => ({ error: 'REVIEW_FAILED' }),
    }));

    const socket = await startLiveSession();
    await openReviewSheet(socket);

    expect(await screen.findByTestId('review-fallback')).toBeInTheDocument();
    expect(screen.getByText(/agent self-reported summary/)).toBeInTheDocument();
  });

  test('notes without requestId skip the review fetch and show fallback', async () => {
    const socket = await startLiveSession();
    await openReviewSheet(socket, { requestId: undefined });

    expect(await screen.findByTestId('review-fallback')).toBeInTheDocument();
    expect(reviewFetchMock).not.toHaveBeenCalled();
  });
});
