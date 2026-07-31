import { describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';

const fetchPendingRequests = vi.fn();
vi.mock('./lib/api.js', () => ({
  WS_URL: 'ws://test',
  fetchPendingRequests: (...args) => fetchPendingRequests(...args),
  decideRequest: vi.fn(),
}));

import App from './App.jsx';

class FakeWebSocket {
  constructor() {
    FakeWebSocket.instance = this;
  }
  close() {}
}

describe('App reload resilience', () => {
  it('keeps last known requests when a later fetch fails', async () => {
    vi.stubGlobal('WebSocket', FakeWebSocket);
    const request = {
      requestId: 'dcr_1',
      subjectType: 'spend',
      actorId: 'agent_a',
      subject: { title: '지출 요청', summary: '', payload: {} },
    };
    fetchPendingRequests.mockResolvedValue([request]);
    render(<App />);
    await screen.findByText('지출 요청');

    fetchPendingRequests.mockRejectedValue(new Error('server down'));
    await act(async () => {
      FakeWebSocket.instance.onmessage({ data: JSON.stringify({ type: 'WORKFLOW_DECIDED' }) });
    });
    expect(screen.getByText('지출 요청')).toBeInTheDocument();
  });
});
