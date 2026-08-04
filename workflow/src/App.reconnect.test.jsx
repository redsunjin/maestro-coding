import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';

vi.mock('./lib/api.js', () => ({
  WS_URL: 'ws://test',
  fetchPendingRequests: vi.fn().mockResolvedValue([]),
  fetchHistory: vi.fn().mockResolvedValue([]),
  decideRequest: vi.fn(),
  loadServerToken: vi.fn().mockReturnValue(''),
  getServerToken: vi.fn().mockReturnValue(''),
  setServerToken: vi.fn(),
}));

import App from './App.jsx';

class FakeWebSocket {
  static instances = [];
  constructor() {
    FakeWebSocket.instances.push(this);
    this.sent = [];
  }
  send(data) {
    this.sent.push(data);
  }
  close() {}
}

describe('App WS 재연결', () => {
  beforeEach(() => {
    FakeWebSocket.instances = [];
    vi.stubGlobal('WebSocket', FakeWebSocket);
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('AUTH_OK를 받아야 연결 표시가 되고, 이상 종료 후 백오프 재연결한다', async () => {
    render(<App />);
    const first = FakeWebSocket.instances[0];
    await act(async () => {
      first.onopen();
    });
    expect(JSON.parse(first.sent[0]).type).toBe('WORKFLOW_AUTH');
    expect(screen.getByText('연결 대기')).toBeInTheDocument();
    await act(async () => {
      first.onmessage({ data: JSON.stringify({ type: 'WORKFLOW_AUTH_OK' }) });
    });
    expect(screen.getByText('실시간 연결됨')).toBeInTheDocument();

    await act(async () => {
      first.onclose({ code: 1006 });
    });
    expect(screen.getByText('연결 대기')).toBeInTheDocument();
    expect(FakeWebSocket.instances).toHaveLength(1);
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    expect(FakeWebSocket.instances).toHaveLength(2);
  });

  it('4401 종료는 재연결을 예약하지 않는다', async () => {
    render(<App />);
    const first = FakeWebSocket.instances[0];
    await act(async () => {
      first.onclose({ code: 4401 });
    });
    await act(async () => {
      vi.advanceTimersByTime(60000);
    });
    expect(FakeWebSocket.instances).toHaveLength(1);
  });
});
