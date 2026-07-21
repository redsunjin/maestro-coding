import { getStoredString } from './storage.js';

export const SERVER_WS_URL_STORAGE_KEY = 'maestro.server.ws-url';
export const DEFAULT_WS_PORT = 8080;

const PROTOCOL_MAP = {
  'ws:': 'ws:',
  'wss:': 'wss:',
  'http:': 'ws:',
  'https:': 'wss:',
};

// 로컬 dev 흐름에서는 설정 화면을 자동으로 띄우지 않는다.
const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1', '[::1]', '']);

// 사용자 입력을 ws(s)://host[:port] origin 문자열로 정규화한다. 실패 시 null.
export const normalizeWsUrlInput = (input) => {
  if (typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  const withScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed) ? trimmed : `ws://${trimmed}`;

  let parsed;
  try {
    parsed = new URL(withScheme);
  } catch {
    return null;
  }

  const protocol = PROTOCOL_MAP[parsed.protocol];
  if (!protocol) return null;
  if (!parsed.hostname) return null;
  if (parsed.username || parsed.password) return null;
  if ((parsed.pathname && parsed.pathname !== '/') || parsed.search || parsed.hash) return null;

  let port = parsed.port;
  if (!port) {
    if (parsed.protocol === 'http:') {
      port = '80';
    } else if (protocol === 'ws:') {
      port = String(DEFAULT_WS_PORT);
    }
    // wss:/https: 는 443이 암시되므로 포트를 붙이지 않는다.
  }

  return `${protocol}//${parsed.hostname}${port ? `:${port}` : ''}`;
};

// 기본 주소: 빌드타임 env → 페이지 호스트(:8080). 대시보드는 보통 서버와 같은 PC에서 서빙된다.
export const getDefaultWsUrl = () => {
  const envUrl = import.meta.env?.VITE_WS_URL;
  if (envUrl) return envUrl;
  if (typeof window !== 'undefined' && window.location?.hostname) {
    return `ws://${window.location.hostname}:${DEFAULT_WS_PORT}`;
  }
  return `ws://localhost:${DEFAULT_WS_PORT}`;
};

export const getStoredWsUrl = () => {
  const stored = getStoredString(SERVER_WS_URL_STORAGE_KEY, '');
  return stored ? normalizeWsUrlInput(stored) : null;
};

export const resolveInitialWsUrl = () => getStoredWsUrl() || getDefaultWsUrl();

export const formatWsUrlLabel = (wsUrl) => {
  try {
    const parsed = new URL(wsUrl);
    return `${parsed.hostname}${parsed.port ? `:${parsed.port}` : ''}`;
  } catch {
    return wsUrl;
  }
};

export const shouldAutoOpenServerSetup = ({ hasStoredWsUrl, hostname }) => {
  if (hasStoredWsUrl) return false;
  return !LOCAL_HOSTNAMES.has(String(hostname ?? '').toLowerCase());
};

// 연결 수립 여부만 확인한다(프로토콜 메시지 없음). 항상 resolve하며 reject하지 않는다.
export const testWsConnection = (wsUrl, { timeoutMs = 4000 } = {}) => new Promise((resolve) => {
  if (typeof WebSocket === 'undefined') {
    resolve({ ok: false, error: 'unsupported' });
    return;
  }

  let socket;
  try {
    socket = new WebSocket(wsUrl);
  } catch {
    resolve({ ok: false, error: 'invalid-url' });
    return;
  }

  let settled = false;
  let timer;
  const finish = (ok, error = null) => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    try {
      socket.close();
    } catch {
      // close 실패는 결과에 영향 없음
    }
    resolve({ ok, error });
  };

  timer = setTimeout(() => finish(false, 'timeout'), timeoutMs);
  socket.onopen = () => finish(true);
  socket.onerror = () => finish(false, 'error');
  socket.onclose = () => finish(false, 'closed');
});
