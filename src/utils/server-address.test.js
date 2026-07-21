import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  SERVER_WS_URL_STORAGE_KEY,
  formatWsUrlLabel,
  getDefaultWsUrl,
  normalizeWsUrlInput,
  resolveInitialWsUrl,
  shouldAutoOpenServerSetup,
  testWsConnection,
} from './server-address.js';

describe('normalizeWsUrlInput', () => {
  test.each([
    ['192.168.0.5', 'ws://192.168.0.5:8080'],
    ['192.168.0.5:9000', 'ws://192.168.0.5:9000'],
    [' ws://host:8080 ', 'ws://host:8080'],
    ['ws://host', 'ws://host:8080'],
    ['wss://host', 'wss://host'],
    ['wss://host:9443', 'wss://host:9443'],
    ['http://host:8080', 'ws://host:8080'],
    ['http://host', 'ws://host:80'],
    ['https://host', 'wss://host'],
  ])('normalizes %s → %s', (input, expected) => {
    expect(normalizeWsUrlInput(input)).toBe(expected);
  });

  test.each([
    [''],
    ['   '],
    ['ftp://host:8080'],
    ['ws://host:8080/path'],
    ['ws://host:8080?query=1'],
    ['ws://host:8080#hash'],
    ['ws://user:pw@host:8080'],
    ['ws://host:notaport'],
    ['not a url'],
  ])('rejects %s', (input) => {
    expect(normalizeWsUrlInput(input)).toBeNull();
  });

  test('rejects non-string input', () => {
    expect(normalizeWsUrlInput(undefined)).toBeNull();
    expect(normalizeWsUrlInput(null)).toBeNull();
  });
});

describe('address resolution priority', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    window.localStorage.clear();
  });

  test('stored value wins over env', () => {
    vi.stubEnv('VITE_WS_URL', 'ws://envhost:9999');
    window.localStorage.setItem(SERVER_WS_URL_STORAGE_KEY, 'ws://stored:8081');
    expect(resolveInitialWsUrl()).toBe('ws://stored:8081');
  });

  test('env wins when nothing stored', () => {
    vi.stubEnv('VITE_WS_URL', 'ws://envhost:9999');
    expect(resolveInitialWsUrl()).toBe('ws://envhost:9999');
  });

  test('falls back to page hostname with port 8080', () => {
    expect(getDefaultWsUrl()).toBe(`ws://${window.location.hostname}:8080`);
    expect(resolveInitialWsUrl()).toBe(getDefaultWsUrl());
  });

  test('invalid stored value falls back to default', () => {
    window.localStorage.setItem(SERVER_WS_URL_STORAGE_KEY, 'not a url');
    expect(resolveInitialWsUrl()).toBe(getDefaultWsUrl());
  });
});

describe('formatWsUrlLabel', () => {
  test('renders host:port', () => {
    expect(formatWsUrlLabel('ws://192.168.0.5:8080')).toBe('192.168.0.5:8080');
  });

  test('omits port when implied', () => {
    expect(formatWsUrlLabel('wss://maestro.local')).toBe('maestro.local');
  });

  test('returns raw string when unparsable', () => {
    expect(formatWsUrlLabel('broken')).toBe('broken');
  });
});

describe('shouldAutoOpenServerSetup', () => {
  test('never opens when an address is stored', () => {
    expect(shouldAutoOpenServerSetup({ hasStoredWsUrl: true, hostname: '192.168.0.9' })).toBe(false);
  });

  test.each([['localhost'], ['127.0.0.1'], ['::1'], ['[::1]'], ['']])(
    'never opens on dev host %s',
    (hostname) => {
      expect(shouldAutoOpenServerSetup({ hasStoredWsUrl: false, hostname })).toBe(false);
    },
  );

  test('opens on LAN host without stored address', () => {
    expect(shouldAutoOpenServerSetup({ hasStoredWsUrl: false, hostname: '192.168.0.9' })).toBe(true);
  });
});

class FakeWebSocket {
  static instances = [];

  constructor(url) {
    this.url = url;
    this.closed = false;
    this.onopen = null;
    this.onerror = null;
    this.onclose = null;
    FakeWebSocket.instances.push(this);
  }

  close() {
    this.closed = true;
  }
}

describe('testWsConnection', () => {
  beforeEach(() => {
    FakeWebSocket.instances = [];
    vi.stubGlobal('WebSocket', FakeWebSocket);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  test('resolves ok when the socket opens, then closes it', async () => {
    const promise = testWsConnection('ws://host:8080');
    FakeWebSocket.instances[0].onopen();
    await expect(promise).resolves.toEqual({ ok: true, error: null });
    expect(FakeWebSocket.instances[0].closed).toBe(true);
  });

  test('resolves failure on socket error', async () => {
    const promise = testWsConnection('ws://host:8080');
    FakeWebSocket.instances[0].onerror();
    await expect(promise).resolves.toEqual({ ok: false, error: 'error' });
  });

  test('resolves failure on timeout', async () => {
    vi.useFakeTimers();
    const promise = testWsConnection('ws://host:8080', { timeoutMs: 1000 });
    vi.advanceTimersByTime(1001);
    await expect(promise).resolves.toEqual({ ok: false, error: 'timeout' });
  });
});
