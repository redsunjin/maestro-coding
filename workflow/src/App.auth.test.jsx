import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const fetchPendingRequests = vi.fn();
const setServerToken = vi.fn();
vi.mock('./lib/api.js', () => ({
  WS_URL: 'ws://test',
  fetchPendingRequests: (...args) => fetchPendingRequests(...args),
  fetchHistory: vi.fn().mockResolvedValue([]),
  decideRequest: vi.fn(),
  loadServerToken: vi.fn().mockReturnValue(''),
  getServerToken: vi.fn().mockReturnValue(''),
  setServerToken: (...args) => setServerToken(...args),
}));

import App from './App.jsx';

class FakeWebSocket {
  constructor() {
    FakeWebSocket.instance = this;
  }
  send() {}
  close() {}
}

describe('App 토큰 게이트', () => {
  beforeEach(() => {
    vi.stubGlobal('WebSocket', FakeWebSocket);
    fetchPendingRequests.mockReset();
    setServerToken.mockReset();
  });

  it('UNAUTHORIZED 조회 실패 시 게이트를 띄우고 제출하면 토큰 저장 후 재조회한다', async () => {
    fetchPendingRequests.mockRejectedValue(Object.assign(new Error('Unauthorized'), { code: 'UNAUTHORIZED' }));
    render(<App />);
    await screen.findByText('서버 토큰 필요');

    fetchPendingRequests.mockResolvedValue([]);
    await userEvent.type(screen.getByLabelText('서버 토큰'), 'wf-secret');
    await userEvent.click(screen.getByRole('button', { name: '연결' }));
    expect(setServerToken).toHaveBeenCalledWith('wf-secret');
    expect(screen.queryByText('서버 토큰 필요')).not.toBeInTheDocument();
    expect(fetchPendingRequests.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('WS가 4401로 닫히면 게이트를 띄운다', async () => {
    fetchPendingRequests.mockResolvedValue([]);
    render(<App />);
    await screen.findByText('🎼 Maestro Workflow');
    FakeWebSocket.instance.onclose({ code: 4401 });
    await screen.findByText('서버 토큰 필요');
  });
});
