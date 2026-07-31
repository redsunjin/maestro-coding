// Maestro Workflow 결정 서버 (Maestro Harmony).
// 범용 DecisionRequest를 수신해 사람이 결정하고, record-only로 기록·전달한다.
// 실행: node server.js  (기본 http://127.0.0.1:8090)
import http from 'node:http';
import { PORT, HOST, ALLOWED_ORIGINS, ACTOR_STORE_PATH } from './server/config.js';
import {
  heartbeatActor,
  initActorStore,
  listActors,
  registerActor,
  revokeActor,
  toPublicActor,
} from './server/actors.js';
import { authorizeActor, isServerAuthorized } from './server/auth.js';

initActorStore(ACTOR_STORE_PATH);

export function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function readJsonBody(req) {
  return new Promise((resolvePromise, rejectPromise) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
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
    sendJson(res, 200, { status: 'ok', app: 'maestro-workflow', pendingRequests: 0 });
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
    } catch {
      sendJson(res, 400, { error: 'Invalid JSON body' });
      return;
    }
    const registered = registerActor(data);
    if (!registered) {
      sendJson(res, 400, { error: 'ACTOR_ID_REQUIRED' });
      return;
    }
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
    sendJson(res, 200, { success: true, item: toPublicActor(actor) });
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

server.listen(PORT, HOST, () => {
  console.log(`🎼 Maestro Workflow server on http://${HOST}:${PORT}`);
});
