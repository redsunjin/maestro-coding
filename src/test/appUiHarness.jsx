import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, vi } from 'vitest';
import App from '../App.jsx';

export class MockWebSocket {
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

const originalWebSocket = globalThis.WebSocket;
const originalPrompt = window.prompt;
const originalYT = window.YT;
const originalAudioContext = window.AudioContext;
const originalWebkitAudioContext = window.webkitAudioContext;

export function setupAppUiEnvironment() {
  MockWebSocket.instances = [];
  globalThis.WebSocket = MockWebSocket;
  window.prompt = originalPrompt;
  window.localStorage.clear();
  delete window.YT;
}

export function teardownAppUiEnvironment() {
  vi.restoreAllMocks();
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
}

export async function startLiveSession() {
  render(<App />);
  await userEvent.click(screen.getByRole('button', { name: '지휘 시작' }));
  await waitFor(() => {
    expect(MockWebSocket.instances.length).toBe(1);
    expect(MockWebSocket.instances[0].readyState).toBe(MockWebSocket.OPEN);
  });
  return MockWebSocket.instances[0];
}
