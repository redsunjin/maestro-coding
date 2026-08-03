import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  TOKEN_STORAGE_KEY,
  fetchPendingRequests,
  getServerToken,
  loadServerToken,
  setServerToken,
} from './api.js';

describe('서버 토큰 상태', () => {
  beforeEach(() => {
    window.localStorage.clear();
    setServerToken('');
  });

  it('setServerToken은 localStorage에 저장하고 loadServerToken이 복원한다', () => {
    setServerToken('wf-secret');
    expect(window.localStorage.getItem(TOKEN_STORAGE_KEY)).toBe('wf-secret');
    setServerToken('');
    expect(window.localStorage.getItem(TOKEN_STORAGE_KEY)).toBeNull();
    window.localStorage.setItem(TOKEN_STORAGE_KEY, 'restored');
    expect(loadServerToken()).toBe('restored');
    expect(getServerToken()).toBe('restored');
  });

  it('토큰이 있으면 Authorization 헤더를 붙인다', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ items: [] }) });
    vi.stubGlobal('fetch', fetchMock);
    setServerToken('wf-secret');
    await fetchPendingRequests();
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer wf-secret');
  });

  it('401 실패는 code UNAUTHORIZED로 식별된다', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: 'Unauthorized' }),
    }));
    await expect(fetchPendingRequests()).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });
});
