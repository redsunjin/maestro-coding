import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const fetchPendingRequests = vi.fn();
const fetchRequestChain = vi.fn();
vi.mock('./lib/api.js', () => ({
  WS_URL: 'ws://test',
  fetchPendingRequests: (...args) => fetchPendingRequests(...args),
  fetchHistory: vi.fn().mockResolvedValue([]),
  decideRequest: vi.fn(),
  fetchRequestChain: (...args) => fetchRequestChain(...args),
  loadServerToken: vi.fn().mockReturnValue(''),
  getServerToken: vi.fn().mockReturnValue(''),
  setServerToken: vi.fn(),
}));

import App from './App.jsx';

class FakeWebSocket {
  send() {}
  close() {}
}

describe('App 체인 시각화', () => {
  beforeEach(() => {
    vi.stubGlobal('WebSocket', FakeWebSocket);
    fetchPendingRequests.mockReset();
    fetchRequestChain.mockReset();
  });

  it('체인 요청 선택 시 체인을 불러 시트에 타임라인으로 보여준다', async () => {
    const reply = {
      requestId: 'dcr_2',
      parentRequestId: 'dcr_1',
      subjectType: 'email-reply',
      actorId: 'agent_mail',
      subject: { title: '답장 초안 v1', summary: '', payload: {} },
    };
    fetchPendingRequests.mockResolvedValue([reply]);
    fetchRequestChain.mockResolvedValue([
      { requestId: 'dcr_1', subjectType: 'email-triage', status: 'decided', subject: { title: '메일 분류' } },
      { ...reply, status: 'pending_decision' },
    ]);

    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByText('답장 초안 v1'));

    expect(fetchRequestChain).toHaveBeenCalledWith('dcr_2');
    const timeline = await screen.findByLabelText('결정 체인');
    expect(timeline.textContent).toContain('메일 분류');
  });

  it('체인 없는 요청은 체인 조회를 하지 않는다', async () => {
    fetchPendingRequests.mockResolvedValue([{
      requestId: 'dcr_solo',
      subjectType: 'spend',
      actorId: 'agent_a',
      subject: { title: '단독 요청', summary: '', payload: {} },
    }]);

    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByText('단독 요청'));

    expect(fetchRequestChain).not.toHaveBeenCalled();
    expect(screen.queryByLabelText('결정 체인')).not.toBeInTheDocument();
  });
});
