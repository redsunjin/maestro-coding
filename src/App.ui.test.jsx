import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App.jsx';

class MockWebSocket {
  static instances = [];
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  constructor(url) {
    this.url = url;
    this.readyState = MockWebSocket.CONNECTING;
    this.sent = [];
    this._opened = false;
    this._onopen = null;
    this.onclose = null;
    this.onmessage = null;
    MockWebSocket.instances.push(this);
  }

  set onopen(handler) {
    this._onopen = handler;
    if (!this._opened && this._onopen) {
      this._opened = true;
      this.readyState = MockWebSocket.OPEN;
      this._onopen();
    }
  }

  get onopen() {
    return this._onopen;
  }

  send(payload) {
    this.sent.push(payload);
  }

  close() {
    this.readyState = MockWebSocket.CLOSED;
    if (this.onclose) this.onclose();
  }

  emitMessage(data) {
    if (this.onmessage) this.onmessage({ data: JSON.stringify(data) });
  }
}

describe('App UI regression', () => {
  const originalWebSocket = globalThis.WebSocket;
  const originalPrompt = window.prompt;

  beforeEach(() => {
    MockWebSocket.instances = [];
    globalThis.WebSocket = MockWebSocket;
    window.prompt = originalPrompt;
  });

  afterEach(() => {
    globalThis.WebSocket = originalWebSocket;
    window.prompt = originalPrompt;
  });

  async function startLiveSession() {
    render(<App />);
    await userEvent.click(screen.getByRole('button', { name: '지휘 시작' }));
    await waitFor(() => {
      expect(MockWebSocket.instances.length).toBe(1);
      expect(MockWebSocket.instances[0].readyState).toBe(MockWebSocket.OPEN);
    });
    return MockWebSocket.instances[0];
  }

  test('approval is finalized only after MERGE_SUCCESS', async () => {
    const socket = await startLiveSession();

    await act(async () => {
      socket.emitMessage({
        event: 'AGENT_TASK_READY',
        requestId: 'req_approve_1',
        laneIndex: 1,
        diffSummary: {
          title: 'Approval Note',
          shortDescription: 'approval flow regression',
        },
      });
    });

    expect(await screen.findByText('Approval Note')).toBeInTheDocument();

    await act(async () => {
      fireEvent.keyDown(window, { key: 'd' });
    });

    await waitFor(() => {
      expect(screen.getByText('Merge pending...')).toBeInTheDocument();
      expect(socket.sent.length).toBe(1);
    });

    const approvePayload = JSON.parse(socket.sent[0]);
    expect(approvePayload.action).toBe('APPROVE');
    expect(approvePayload.requestId).toBe('req_approve_1');

    await act(async () => {
      socket.emitMessage({ event: 'MERGE_SUCCESS', requestId: 'req_approve_1' });
    });

    await waitFor(() => {
      expect(screen.queryByText('Approval Note')).not.toBeInTheDocument();
    });
  });

  test('reject sends typed feedback to websocket payload', async () => {
    const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue('Need boundary checks');
    const socket = await startLiveSession();

    await act(async () => {
      socket.emitMessage({
        event: 'AGENT_TASK_READY',
        requestId: 'req_reject_1',
        laneIndex: 1,
        diffSummary: {
          title: 'Reject Note',
          shortDescription: 'reject flow regression',
        },
      });
    });

    expect(await screen.findByText('Reject Note')).toBeInTheDocument();

    await act(async () => {
      fireEvent.keyDown(window, { key: 'd', shiftKey: true });
    });

    await waitFor(() => {
      expect(promptSpy).toHaveBeenCalled();
      expect(socket.sent.length).toBe(1);
    });

    const rejectPayload = JSON.parse(socket.sent[0]);
    expect(rejectPayload.action).toBe('REJECT');
    expect(rejectPayload.feedback).toBe('Need boundary checks');

    await act(async () => {
      socket.emitMessage({ event: 'AGENT_RESTARTED', requestId: 'req_reject_1' });
    });

    await waitFor(() => {
      expect(screen.queryByText('Reject Note')).not.toBeInTheDocument();
    });
  });

  test('reject can be canceled from prompt without sending websocket event', async () => {
    vi.spyOn(window, 'prompt').mockReturnValue(null);
    const socket = await startLiveSession();

    await act(async () => {
      socket.emitMessage({
        event: 'AGENT_TASK_READY',
        requestId: 'req_reject_cancel_1',
        laneIndex: 1,
        diffSummary: {
          title: 'Reject Cancel Note',
          shortDescription: 'reject cancel regression',
        },
      });
    });

    expect(await screen.findByText('Reject Cancel Note')).toBeInTheDocument();

    await act(async () => {
      fireEvent.keyDown(window, { key: 'd', shiftKey: true });
    });

    await waitFor(() => {
      expect(screen.getByText('REJECT CANCELED')).toBeInTheDocument();
    });
    expect(socket.sent.length).toBe(0);
  });
});
