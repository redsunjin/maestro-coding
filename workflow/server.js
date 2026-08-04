// Maestro Workflow 결정 서버 (Maestro Harmony).
// 범용 DecisionRequest를 수신해 사람이 결정하고, record-only로 기록·전달한다.
// 실행: node server.js  (기본 http://127.0.0.1:8090)
import http from 'node:http';
import { WebSocketServer, WebSocket as WSWebSocket } from 'ws';
import { PORT, HOST, ALLOWED_ORIGINS, ACTOR_STORE_PATH, DECISION_STORE_PATH, HISTORY_STORE_PATH, SERVER_TOKEN, WS_AUTH_TIMEOUT_MS } from './server/config.js';
import {
  findActorByToken,
  heartbeatActor,
  initActorStore,
  listActors,
  registerActor,
  revokeActor,
  toPublicActor,
} from './server/actors.js';
import { authorizeActor, isServerAuthorized } from './server/auth.js';
import {
  acknowledgeDecision,
  countPendingRequests,
  createDecisionRequest,
  decideRequest,
  findRequestByDecisionId,
  getDecisionByRequestId,
  getRequest,
  initDecisionStore,
  listRequests,
} from './server/decisions.js';
import { appendHistory, initHistoryStore, listHistory } from './server/history.js';

initActorStore(ACTOR_STORE_PATH);
initDecisionStore(DECISION_STORE_PATH);
initHistoryStore(HISTORY_STORE_PATH);

export function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

const MAX_BODY_BYTES = 1024 * 1024;

function readJsonBody(req) {
  return new Promise((resolvePromise, rejectPromise) => {
    let body = '';
    let received = 0;
    let overLimit = false;
    req.on('data', (chunk) => {
      if (overLimit) return;
      received += chunk.length;
      if (received > MAX_BODY_BYTES) {
        overLimit = true;
        body = '';
        rejectPromise(Object.assign(new Error('BODY_TOO_LARGE'), { code: 'BODY_TOO_LARGE' }));
        return;
      }
      body += chunk;
    });
    req.on('end', () => {
      if (overLimit) return;
      try {
        const parsed = body.trim() ? JSON.parse(body) : {};
        resolvePromise(parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {});
      } catch {
        rejectPromise(new Error('INVALID_JSON'));
      }
    });
    req.on('error', rejectPromise);
  });
}

function applyCors(req, res) {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  }
}

async function handleRequest(req, res) {
  applyCors(req, res);
  const { pathname } = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === 'GET' && pathname === '/health') {
    sendJson(res, 200, { status: 'ok', app: 'maestro-workflow', pendingRequests: countPendingRequests() });
    return;
  }

  // ── Actor 레지스트리 (서버 토큰) ─────────────────────────────────────────
  if (req.method === 'POST' && pathname === '/api/actors/register') {
    if (!isServerAuthorized(req)) {
      sendJson(res, 401, { error: 'Unauthorized' });
      return;
    }
    let data;
    try {
      data = await readJsonBody(req);
    } catch (error) {
      if (error && error.code === 'BODY_TOO_LARGE') {
        sendJson(res, 413, { error: 'BODY_TOO_LARGE' });
      } else {
        sendJson(res, 400, { error: 'Invalid JSON body' });
      }
      return;
    }
    const registered = registerActor(data);
    if (!registered) {
      sendJson(res, 400, { error: 'ACTOR_ID_REQUIRED' });
      return;
    }
    recordHistory({ event: 'ACTOR_REGISTERED', actorId: registered.actor.actorId });
    sendJson(res, 200, {
      success: true,
      item: toPublicActor(registered.actor),
      actorToken: registered.actorToken,
    });
    return;
  }

  if (req.method === 'GET' && pathname === '/api/actors') {
    if (!isServerAuthorized(req)) {
      sendJson(res, 401, { error: 'Unauthorized' });
      return;
    }
    sendJson(res, 200, { items: listActors() });
    return;
  }

  const actorHeartbeatMatch = pathname.match(/^\/api\/actors\/([^/]+)\/heartbeat$/);
  if (req.method === 'POST' && actorHeartbeatMatch) {
    const actorId = decodeURIComponent(actorHeartbeatMatch[1]);
    const auth = authorizeActor(req, res, actorId);
    if (!auth) return;
    const actor = heartbeatActor(actorId);
    if (!actor) {
      sendJson(res, 404, { error: 'ACTOR_NOT_FOUND' });
      return;
    }
    sendJson(res, 200, { success: true, item: toPublicActor(actor) });
    return;
  }

  const actorRevokeMatch = pathname.match(/^\/api\/actors\/([^/]+)\/revoke$/);
  if (req.method === 'POST' && actorRevokeMatch) {
    if (!isServerAuthorized(req)) {
      sendJson(res, 401, { error: 'Unauthorized' });
      return;
    }
    const actorId = decodeURIComponent(actorRevokeMatch[1]);
    const actor = revokeActor(actorId);
    if (!actor) {
      sendJson(res, 404, { error: 'ACTOR_NOT_FOUND' });
      return;
    }
    recordHistory({ event: 'ACTOR_REVOKED', actorId });
    closeActorSockets(actorId);
    sendJson(res, 200, { success: true, item: toPublicActor(actor) });
    return;
  }

  // ── DecisionRequest (actor 토큰) ─────────────────────────────────────────
  if (req.method === 'POST' && pathname === '/api/decision-requests') {
    const auth = authorizeActor(req, res);
    if (!auth) return;
    let data;
    try {
      data = await readJsonBody(req);
    } catch (error) {
      if (error && error.code === 'BODY_TOO_LARGE') {
        sendJson(res, 413, { error: 'BODY_TOO_LARGE' });
      } else {
        sendJson(res, 400, { error: 'Invalid JSON body' });
      }
      return;
    }
    // actor 토큰 호출은 body.actorId가 토큰 주인과 일치해야 한다 (비어 있으면 채움)
    if (auth.mode === 'actor') {
      if (data.actorId && data.actorId !== auth.actorId) {
        sendJson(res, 403, { error: 'ACTOR_MISMATCH' });
        return;
      }
      data.actorId = auth.actorId;
    }
    try {
      const request = createDecisionRequest(data);
      console.log(`📨 결정 요청 수신: [${request.actorId}] (${request.subjectType}) ${request.subject.title}`);
      broadcast({ type: 'WORKFLOW_REQUEST_CREATED', item: request });
      recordHistory({ event: 'REQUEST_CREATED', requestId: request.requestId, actorId: request.actorId, subjectType: request.subjectType, title: request.subject.title });
      sendJson(res, 200, { success: true, item: request });
    } catch (error) {
      if (error.code === 'SUBJECT_TYPE_REQUIRED' || error.code === 'SUBJECT_TITLE_REQUIRED') {
        sendJson(res, 400, { error: error.code });
        return;
      }
      sendJson(res, 500, { error: 'INTERNAL_ERROR' });
    }
    return;
  }

  if (req.method === 'GET' && pathname === '/api/decision-requests') {
    if (!isServerAuthorized(req)) {
      sendJson(res, 401, { error: 'Unauthorized' });
      return;
    }
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    sendJson(res, 200, { items: listRequests({ status: url.searchParams.get('status') }) });
    return;
  }

  const decideMatch = pathname.match(/^\/api\/decision-requests\/([^/]+)\/decide$/);
  if (req.method === 'POST' && decideMatch) {
    if (!isServerAuthorized(req)) {
      sendJson(res, 401, { error: 'Unauthorized' });
      return;
    }
    let data;
    try {
      data = await readJsonBody(req);
    } catch (error) {
      if (error && error.code === 'BODY_TOO_LARGE') {
        sendJson(res, 413, { error: 'BODY_TOO_LARGE' });
      } else {
        sendJson(res, 400, { error: 'Invalid JSON body' });
      }
      return;
    }
    const requestId = decodeURIComponent(decideMatch[1]);
    const result = decideRequest(requestId, data);
    if (result.error) {
      sendJson(res, result.status, { error: result.error });
      return;
    }
    console.log(`🎯 결정 기록: [${result.request.subjectType}] ${result.item.decision} (${requestId})`);
    broadcast(
      { type: 'WORKFLOW_DECIDED', item: result.item, request: result.request },
      { targetActorId: result.request.actorId },
    );
    recordHistory({ event: 'DECIDED', requestId, actorId: result.request.actorId, subjectType: result.request.subjectType, title: result.request.subject.title, decision: result.item.decision, comment: result.item.comment, decidedBy: result.item.decidedBy });
    sendJson(res, 200, { success: true, item: result.item, request: result.request });
    return;
  }

  const decisionPollMatch = pathname.match(/^\/api\/decision-requests\/([^/]+)\/decision$/);
  if (req.method === 'GET' && decisionPollMatch) {
    const auth = authorizeActor(req, res);
    if (!auth) return;
    const requestId = decodeURIComponent(decisionPollMatch[1]);
    const request = getRequest(requestId);
    if (!request) {
      sendJson(res, 404, { error: 'DECISION_REQUEST_NOT_FOUND' });
      return;
    }
    // actor 토큰은 자기 요청만 폴링 가능
    if (auth.mode === 'actor' && request.actorId !== auth.actorId) {
      sendJson(res, 403, { error: 'ACTOR_MISMATCH' });
      return;
    }
    const decision = getDecisionByRequestId(requestId);
    sendJson(res, 200, {
      requestId,
      status: decision ? decision.delivery.status : 'pending',
      item: decision,
    });
    return;
  }

  const ackMatch = pathname.match(/^\/api\/decisions\/([^/]+)\/ack$/);
  if (req.method === 'POST' && ackMatch) {
    const auth = authorizeActor(req, res);
    if (!auth) return;
    const decisionId = decodeURIComponent(ackMatch[1]);
    // actor 토큰은 자기 요청의 결정만 ack 가능
    if (auth.mode === 'actor') {
      const targetRequest = findRequestByDecisionId(decisionId);
      if (targetRequest && targetRequest.actorId !== auth.actorId) {
        sendJson(res, 403, { error: 'ACTOR_MISMATCH' });
        return;
      }
    }
    const decision = acknowledgeDecision(decisionId);
    if (!decision) {
      sendJson(res, 404, { error: 'DECISION_NOT_FOUND' });
      return;
    }
    recordHistory({ event: 'ACKNOWLEDGED', requestId: decision.requestId, decision: decision.decision });
    sendJson(res, 200, { success: true, item: decision });
    return;
  }

  if (req.method === 'GET' && pathname === '/api/history') {
    if (!isServerAuthorized(req)) {
      sendJson(res, 401, { error: 'Unauthorized' });
      return;
    }
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    sendJson(res, 200, { items: listHistory(url.searchParams.get('limit') || 40) });
    return;
  }

  sendJson(res, 404, { error: 'NOT_FOUND' });
}

const server = http.createServer((req, res) => {
  handleRequest(req, res).catch((error) => {
    console.error(`요청 처리 실패: ${error.message}`);
    if (!res.headersSent) {
      sendJson(res, 500, { error: 'INTERNAL_ERROR' });
    } else {
      res.end();
    }
  });
});

const wss = new WebSocketServer({ server });

// WS 첫 메시지 인증 (스펙 2026-08-03 §2, 2026-08-04 §1):
// 서버 토큰 → operator 스코프(전체 스트림), actor 토큰 → actor 스코프(자기 결정만).
wss.on('connection', (socket) => {
  socket.isAuthorized = !SERVER_TOKEN;
  socket.scope = SERVER_TOKEN ? null : 'operator'; // open 모드 무인증 = 운영자 뷰 (하위 호환)
  socket.actorId = null;
  const authTimer = SERVER_TOKEN
    ? setTimeout(() => {
        if (!socket.isAuthorized) socket.close(4401, 'AUTH_TIMEOUT');
      }, WS_AUTH_TIMEOUT_MS)
    : null;
  socket.on('message', (raw) => {
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      return; // 비JSON은 무시 — 미인가라면 타임아웃이 정리한다
    }
    if (!data || data.type !== 'WORKFLOW_AUTH') return;
    const token = typeof data.token === 'string' ? data.token : '';
    const grant = (scope, actorId = null) => {
      socket.isAuthorized = true;
      socket.scope = scope;
      socket.actorId = actorId;
      if (authTimer) clearTimeout(authTimer);
      socket.send(JSON.stringify(
        scope === 'actor'
          ? { type: 'WORKFLOW_AUTH_OK', scope, actorId }
          : { type: 'WORKFLOW_AUTH_OK', scope },
      ));
    };
    if (SERVER_TOKEN && token === SERVER_TOKEN) {
      grant('operator');
      return;
    }
    const actor = token ? findActorByToken(token) : null;
    if (actor) {
      grant('actor', actor.actorId);
      return;
    }
    if (!SERVER_TOKEN) {
      grant('operator'); // open 모드: 빈/불일치 토큰도 운영자 뷰 (현행 유지)
      return;
    }
    socket.close(4401, 'UNAUTHORIZED');
  });
  socket.on('close', () => {
    if (authTimer) clearTimeout(authTimer);
  });
});

function broadcast(data, { targetActorId = null } = {}) {
  const message = JSON.stringify(data);
  wss.clients.forEach((client) => {
    if (client.readyState !== WSWebSocket.OPEN || !client.isAuthorized) return;
    if (client.scope === 'actor' && client.actorId !== targetActorId) return;
    client.send(message);
  });
}

function closeActorSockets(actorId) {
  wss.clients.forEach((client) => {
    if (client.scope === 'actor' && client.actorId === actorId) {
      client.close(4401, 'ACTOR_REVOKED');
    }
  });
}

function recordHistory(input) {
  const entry = appendHistory(input);
  if (entry) broadcast({ type: 'WORKFLOW_HISTORY_APPEND', item: entry });
  return entry;
}

server.listen(PORT, HOST, () => {
  console.log(`🎼 Maestro Workflow server on http://${HOST}:${PORT}`);
});
