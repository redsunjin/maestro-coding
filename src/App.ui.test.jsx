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
  const originalYT = window.YT;
  const originalAudioContext = window.AudioContext;
  const originalWebkitAudioContext = window.webkitAudioContext;

  beforeEach(() => {
    MockWebSocket.instances = [];
    globalThis.WebSocket = MockWebSocket;
    window.prompt = originalPrompt;
    window.localStorage.clear();
    delete window.YT;
  });

  afterEach(() => {
    globalThis.WebSocket = originalWebSocket;
    window.prompt = originalPrompt;
    if (typeof originalYT === 'undefined') {
      delete window.YT;
    } else {
      window.YT = originalYT;
    }

    if (typeof originalAudioContext === 'undefined') {
      delete window.AudioContext;
    } else {
      window.AudioContext = originalAudioContext;
    }

    if (typeof originalWebkitAudioContext === 'undefined') {
      delete window.webkitAudioContext;
    } else {
      window.webkitAudioContext = originalWebkitAudioContext;
    }
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

  test('touch approve button sends APPROVE payload', async () => {
    const socket = await startLiveSession();

    await act(async () => {
      socket.emitMessage({
        event: 'AGENT_TASK_READY',
        requestId: 'req_touch_approve_1',
        laneIndex: 1,
        diffSummary: {
          title: 'Touch Approve Note',
          shortDescription: 'touch approve flow regression',
        },
      });
    });

    expect(await screen.findByText('Touch Approve Note')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Frontend Agent 승인' }));

    await waitFor(() => {
      expect(socket.sent.length).toBe(1);
    });

    const approvePayload = JSON.parse(socket.sent[0]);
    expect(approvePayload.action).toBe('APPROVE');
    expect(approvePayload.requestId).toBe('req_touch_approve_1');
  });

  test('touch reject button sends REJECT payload with feedback prompt', async () => {
    const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue('Touch reject feedback');
    const socket = await startLiveSession();

    await act(async () => {
      socket.emitMessage({
        event: 'AGENT_TASK_READY',
        requestId: 'req_touch_reject_1',
        laneIndex: 1,
        diffSummary: {
          title: 'Touch Reject Note',
          shortDescription: 'touch reject flow regression',
        },
      });
    });

    expect(await screen.findByText('Touch Reject Note')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Frontend Agent 반려' }));

    await waitFor(() => {
      expect(promptSpy).toHaveBeenCalled();
      expect(socket.sent.length).toBe(1);
    });

    const rejectPayload = JSON.parse(socket.sent[0]);
    expect(rejectPayload.action).toBe('REJECT');
    expect(rejectPayload.feedback).toBe('Touch reject feedback');
  });

  test('touch undo button sends UNDO payload in live mode', async () => {
    const socket = await startLiveSession();

    await userEvent.click(screen.getByRole('button', { name: '롤백 실행' }));

    await waitFor(() => {
      expect(socket.sent.length).toBe(1);
    });

    const undoPayload = JSON.parse(socket.sent[0]);
    expect(undoPayload.action).toBe('UNDO');
  });

  test('function bach mini player keeps top compact controls and persists channel URL', async () => {
    const playerInstances = [];

    class MockYTPlayer {
      constructor(_element, options) {
        this.options = options;
        this.cuePlaylist = vi.fn();
        this.loadPlaylist = vi.fn(() => {
          this.options.events.onStateChange({ data: window.YT.PlayerState.PLAYING });
        });
        this.cueVideoById = vi.fn();
        this.loadVideoById = vi.fn(() => {
          this.options.events.onStateChange({ data: window.YT.PlayerState.PLAYING });
        });
        this.pauseVideo = vi.fn(() => {
          this.options.events.onStateChange({ data: window.YT.PlayerState.PAUSED });
        });
        this.setVolume = vi.fn();
        this.destroy = vi.fn();
        playerInstances.push(this);
        this.options.events.onReady({ target: this });
      }
    }

    window.YT = {
      Player: MockYTPlayer,
      PlayerState: {
        ENDED: 0,
        PLAYING: 1,
        PAUSED: 2,
        CUED: 5,
      },
    };

    render(<App />);

    const miniPlayer = screen.getByTestId('function-bach-mini');
    expect(miniPlayer).toBeInTheDocument();
    expect(miniPlayer.className).toContain('rounded-full');

    await userEvent.click(screen.getByRole('button', { name: '배경음악 재생' }));
    expect(playerInstances[0].loadPlaylist).toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.getByTestId('function-bach-hz')).toHaveTextContent(/Hz/);
    });

    await userEvent.click(screen.getByRole('button', { name: '배경음악 일시정지' }));
    expect(playerInstances[0].pauseVideo).toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('배경음악 볼륨'), { target: { value: '20' } });
    expect(playerInstances[0].setVolume).toHaveBeenCalledWith(20);

    await userEvent.click(screen.getByRole('button', { name: '배경음악 채널 설정' }));
    const channelInput = screen.getByLabelText('유튜브 채널 경로');
    await userEvent.clear(channelInput);
    await userEvent.type(channelInput, 'https://www.youtube.com/channel/UC2kF6qdHRTM_hDYfEmzkS9w');
    await userEvent.click(screen.getByRole('button', { name: '저장' }));

    expect(window.localStorage.getItem('maestro.function-bach.channel-url')).toBe('https://www.youtube.com/channel/UC2kF6qdHRTM_hDYfEmzkS9w');
  });

  test('key hit still triggers SFX oscillator while playing', async () => {
    const instances = [];
    const oscillators = [];

    class MockAudioContext {
      constructor() {
        this.currentTime = 0;
        this.state = 'running';
        this.destination = {};
        instances.push(this);
      }

      createOscillator() {
        const osc = {
          type: 'sine',
          frequency: { setValueAtTime: vi.fn() },
          connect: vi.fn(),
          start: vi.fn(),
          stop: vi.fn(),
        };
        oscillators.push(osc);
        return osc;
      }

      createGain() {
        return {
          gain: {
            value: 0,
            setValueAtTime: vi.fn(),
            exponentialRampToValueAtTime: vi.fn(),
          },
          connect: vi.fn(),
        };
      }

      resume() {
        return Promise.resolve();
      }
    }

    window.AudioContext = MockAudioContext;
    window.webkitAudioContext = undefined;

    await startLiveSession();

    await act(async () => {
      fireEvent.keyDown(window, { key: 'd' });
    });

    expect(instances.length).toBe(1);
    expect(oscillators.length).toBe(1);
    expect(oscillators[0].start).toHaveBeenCalled();
    expect(oscillators[0].stop).toHaveBeenCalled();
    expect(screen.getByText(/261\.63Hz/)).toBeInTheDocument();
  });
});
