// Workflow 서버 API 클라이언트. 로컬 dev는 open 모드(토큰 없음)를 기본으로 한다.
export const SERVER_URL = import.meta.env.VITE_WORKFLOW_SERVER_URL || 'http://127.0.0.1:8090';
export const WS_URL = SERVER_URL.replace(/^http/, 'ws');

export const TOKEN_STORAGE_KEY = 'maestro-workflow-server-token';
let serverToken = '';

// localStorage 불가 환경(사파리 프라이빗 등)은 메모리 토큰만 사용한다.
export function loadServerToken() {
  try {
    serverToken = window.localStorage.getItem(TOKEN_STORAGE_KEY) || '';
  } catch {
    serverToken = '';
  }
  return serverToken;
}

export function setServerToken(token) {
  serverToken = (token || '').trim();
  try {
    if (serverToken) window.localStorage.setItem(TOKEN_STORAGE_KEY, serverToken);
    else window.localStorage.removeItem(TOKEN_STORAGE_KEY);
  } catch {
    // 저장 실패 무시
  }
}

export function getServerToken() {
  return serverToken;
}

async function requestJson(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (serverToken) headers.Authorization = `Bearer ${serverToken}`;
  const res = await fetch(`${SERVER_URL}${path}`, { ...options, headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const error = new Error(body.error || `HTTP ${res.status}`);
    if (res.status === 401) error.code = 'UNAUTHORIZED';
    throw error;
  }
  return res.json();
}

export async function fetchPendingRequests() {
  const body = await requestJson('/api/decision-requests?status=pending_decision');
  return body.items || [];
}

export function decideRequest(requestId, { decision, comment = '' }) {
  return requestJson(`/api/decision-requests/${encodeURIComponent(requestId)}/decide`, {
    method: 'POST',
    body: JSON.stringify({ decision, comment }),
  });
}

// 체인 시각화 (스펙 2026-08-05): 선택 요청의 결정 체인 전체 조회 (운영자/서버 토큰)
export async function fetchRequestChain(requestId) {
  const body = await requestJson(`/api/decision-requests/${encodeURIComponent(requestId)}/chain`);
  return body.items || [];
}

export async function fetchHistory(limit = 40) {
  const body = await requestJson(`/api/history?limit=${limit}`);
  return body.items || [];
}
