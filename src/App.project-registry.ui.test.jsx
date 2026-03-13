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

describe('App UI regression - project registry panel', () => {
  beforeEach(() => {
    setupAppUiEnvironment();
  });

  afterEach(() => {
    teardownAppUiEnvironment();
  });

  test('project registry panel switches the active runtime repo from the dashboard', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      const url = String(input);

      if (url.includes('/api/history')) {
        return Promise.resolve(createFetchResponse({ items: [], count: 0 }));
      }

      if (url.includes('/api/projects/select') && init?.method === 'POST') {
        return Promise.resolve(createFetchResponse({
          success: true,
          currentProject: {
            id: 'beta',
            name: 'beta',
            path: '/workspace/beta',
            repoUrl: 'https://example.com/beta.git',
            laneCount: 6,
            isActive: true,
          },
          items: [
            {
              id: 'alpha',
              name: 'alpha',
              path: '/workspace/alpha',
              repoUrl: 'https://example.com/alpha.git',
              laneCount: 4,
              isActive: false,
            },
            {
              id: 'beta',
              name: 'beta',
              path: '/workspace/beta',
              repoUrl: 'https://example.com/beta.git',
              laneCount: 6,
              isActive: true,
            },
          ],
          count: 2,
        }));
      }

      if (url.includes('/api/projects')) {
        return Promise.resolve(createFetchResponse({
          currentProject: {
            id: 'alpha',
            name: 'alpha',
            path: '/workspace/alpha',
            repoUrl: 'https://example.com/alpha.git',
            laneCount: 4,
            isActive: true,
          },
          items: [
            {
              id: 'alpha',
              name: 'alpha',
              path: '/workspace/alpha',
              repoUrl: 'https://example.com/alpha.git',
              laneCount: 4,
              isActive: true,
            },
            {
              id: 'beta',
              name: 'beta',
              path: '/workspace/beta',
              repoUrl: 'https://example.com/beta.git',
              laneCount: 6,
              isActive: false,
            },
          ],
          count: 2,
        }));
      }

      return Promise.resolve(createFetchResponse({}));
    });

    await startLiveSession();

    await waitFor(() => {
      expect(screen.getByText(/Repo alpha/)).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '프로젝트 전환 패널 토글' }));
    });

    await waitFor(() => {
      expect(screen.getByText('Workspace Repo')).toBeInTheDocument();
      expect(screen.getAllByText('/workspace/alpha').length).toBeGreaterThan(0);
    });

    await act(async () => {
      fireEvent.change(screen.getByLabelText('연결할 프로젝트'), { target: { value: 'beta' } });
      fireEvent.click(screen.getByRole('button', { name: '적용' }));
    });

    await waitFor(() => {
      expect(screen.getByText(/Repo beta/)).toBeInTheDocument();
      expect(screen.getAllByText('/workspace/beta').length).toBeGreaterThan(0);
    });
  });

  test('project registry panel retries with bearer token after unauthorized response', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      const url = String(input);
      const authorization = init?.headers?.Authorization;

      if (url.includes('/api/history')) {
        return Promise.resolve(createFetchResponse({ items: [], count: 0 }));
      }

      if (url.includes('/api/projects')) {
        if (authorization !== 'Bearer dev-token') {
          return Promise.resolve(createFetchResponse({ error: 'Unauthorized' }, 401));
        }

        return Promise.resolve(createFetchResponse({
          currentProject: {
            id: 'alpha',
            name: 'alpha',
            path: '/workspace/alpha',
            repoUrl: '',
            laneCount: 4,
            isActive: true,
          },
          items: [
            {
              id: 'alpha',
              name: 'alpha',
              path: '/workspace/alpha',
              repoUrl: '',
              laneCount: 4,
              isActive: true,
            },
          ],
          count: 1,
        }));
      }

      return Promise.resolve(createFetchResponse({}));
    });

    await startLiveSession();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '프로젝트 전환 패널 토글' }));
    });

    await waitFor(() => {
      expect(screen.getByText('프로젝트 전환 API 인증이 필요합니다. 서버 토큰을 입력해주세요.')).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.change(screen.getByLabelText('프로젝트 API 토큰'), { target: { value: 'dev-token' } });
      fireEvent.click(screen.getByRole('button', { name: '저장' }));
    });

    await waitFor(() => {
      expect(screen.getAllByText('/workspace/alpha').length).toBeGreaterThan(0);
    });

    expect(
      fetchSpy.mock.calls.some(([, init]) => init?.headers?.Authorization === 'Bearer dev-token'),
    ).toBe(true);
  });

  test('project registry panel registers a new repo and applies it immediately', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      const url = String(input);

      if (url.includes('/api/history')) {
        return Promise.resolve(createFetchResponse({ items: [], count: 0 }));
      }

      if (url.includes('/api/projects/register') && init?.method === 'POST') {
        return Promise.resolve(createFetchResponse({
          success: true,
          didActivate: true,
          savedProject: {
            id: 'gamma',
            name: 'gamma',
            path: '/workspace/gamma',
            repoUrl: 'https://example.com/gamma.git',
            laneCount: 6,
            isActive: true,
          },
          currentProject: {
            id: 'gamma',
            name: 'gamma',
            path: '/workspace/gamma',
            repoUrl: 'https://example.com/gamma.git',
            laneCount: 6,
            isActive: true,
          },
          items: [
            {
              id: 'alpha',
              name: 'alpha',
              path: '/workspace/alpha',
              repoUrl: 'https://example.com/alpha.git',
              laneCount: 4,
              isActive: false,
            },
            {
              id: 'gamma',
              name: 'gamma',
              path: '/workspace/gamma',
              repoUrl: 'https://example.com/gamma.git',
              laneCount: 6,
              isActive: true,
            },
          ],
          count: 2,
        }));
      }

      if (url.includes('/api/projects')) {
        return Promise.resolve(createFetchResponse({
          currentProject: {
            id: 'alpha',
            name: 'alpha',
            path: '/workspace/alpha',
            repoUrl: 'https://example.com/alpha.git',
            laneCount: 4,
            isActive: true,
          },
          items: [
            {
              id: 'alpha',
              name: 'alpha',
              path: '/workspace/alpha',
              repoUrl: 'https://example.com/alpha.git',
              laneCount: 4,
              isActive: true,
            },
          ],
          count: 1,
        }));
      }

      return Promise.resolve(createFetchResponse({}));
    });

    await startLiveSession();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '프로젝트 전환 패널 토글' }));
    });

    await act(async () => {
      fireEvent.change(screen.getByLabelText('새 프로젝트 폴더 경로'), { target: { value: '/workspace/gamma' } });
      fireEvent.change(screen.getByLabelText('새 프로젝트 별칭'), { target: { value: 'gamma' } });
      fireEvent.change(screen.getByLabelText('새 프로젝트 링크'), { target: { value: 'https://example.com/gamma.git' } });
      fireEvent.change(screen.getByLabelText('새 프로젝트 레인 수'), { target: { value: '6' } });
      fireEvent.click(screen.getByRole('button', { name: '등록 후 적용' }));
    });

    await waitFor(() => {
      expect(screen.getByText(/Repo gamma/)).toBeInTheDocument();
      expect(screen.getAllByText('/workspace/gamma').length).toBeGreaterThan(0);
      expect(screen.getAllByText(/lanes 6/i).length).toBeGreaterThan(0);
    });
  });
});
