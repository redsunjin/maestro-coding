// Workflow 서버 API 클라이언트. 로컬 dev는 open 모드(토큰 없음)를 기본으로 한다.
export const SERVER_URL = import.meta.env.VITE_WORKFLOW_SERVER_URL || 'http://127.0.0.1:8090';
export const WS_URL = SERVER_URL.replace(/^http/, 'ws');

async function requestJson(path, options = {}) {
  const res = await fetch(`${SERVER_URL}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${res.status}`);
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

export async function fetchHistory(limit = 40) {
  const body = await requestJson(`/api/history?limit=${limit}`);
  return body.items || [];
}
