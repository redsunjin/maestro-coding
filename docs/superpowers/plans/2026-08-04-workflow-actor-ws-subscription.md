# Maestro Workflow actor 토큰 WS 구독 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** actor가 actorToken으로 WS 인증하면 자기 요청의 `WORKFLOW_DECIDED`만 실시간 수신한다.

**Architecture:** 기존 `WORKFLOW_AUTH` 첫 메시지 인증을 확장해 토큰을 서버 토큰 → actor 토큰 순으로 판별하고 소켓에 `scope`/`actorId`를 남긴다. `broadcast`가 `targetActorId` 옵션으로 actor 소켓을 필터링하고, revoke 시 해당 actor 소켓을 4401로 닫는다. 대시보드 변경 없음.

**Tech Stack:** Node http + ws, node:test.

**스펙:** `docs/superpowers/specs/2026-08-04-workflow-actor-ws-subscription-design.md`

## Global Constraints

- 수정 범위: `workflow/server.js`, `workflow/tests/ws-auth.test.mjs`, README 2종, `docs/` 하위만. 본체 불가침.
- AUTH_OK 형식: 운영자 `{type:'WORKFLOW_AUTH_OK', scope:'operator'}`, actor `{type:'WORKFLOW_AUTH_OK', scope:'actor', actorId}`.
- 판별 순서: 서버 토큰 우선, 그다음 actor 토큰. open 모드의 빈/불일치 토큰은 operator 스코프 AUTH_OK(현행 유지).
- actor 소켓은 `targetActorId === socket.actorId`인 이벤트만 수신. 그 외 이벤트는 `targetActorId` 없음(null) → actor 소켓 미수신.
- revoke 성공 시 해당 actor 소켓 `close(4401, 'ACTOR_REVOKED')`.
- 커밋 메시지 한국어 본문 + `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

---

### Task 1: WS actor 스코프 + broadcast 필터 + revoke 소켓 종료

**Files:**
- Modify: `workflow/tests/ws-auth.test.mjs` (테스트 4건 추가)
- Modify: `workflow/server.js`

**Interfaces:**
- Consumes: `findActorByToken(token)` (`workflow/server/actors.js`, 기존).
- Produces: WS 스코프 프로토콜(위 Global Constraints), `broadcast(data, {targetActorId})`.

- [ ] **Step 1: 실패하는 테스트 추가 (`ws-auth.test.mjs` 하단에)**

파일 상단에 헬퍼 추가:

```js
async function authAs(ws, token) {
  ws.send(JSON.stringify({ type: 'WORKFLOW_AUTH', token }));
  return waitForType(ws, 'WORKFLOW_AUTH_OK');
}

async function decideRequestHttp(port, serverToken, requestId) {
  const res = await fetch(`http://127.0.0.1:${port}/api/decision-requests/${encodeURIComponent(requestId)}/decide`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(serverToken) },
    body: JSON.stringify({ decision: 'approve' }),
  });
  assert.equal(res.status, 200);
}
```

`createRequest`가 requestId를 반환하도록 수정(기존 호출부 영향 없음):

```js
async function createRequest(port, token = '', actorId = 'agent_ws', title = 'WS 인증 테스트') {
  const res = await fetch(`http://127.0.0.1:${port}/api/decision-requests`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
    body: JSON.stringify({ actorId, subjectType: 'spend', subject: { title } }),
  });
  assert.equal(res.status, 200);
  return (await res.json()).item.requestId;
}
```

registerActor도 actorId 파라미터를 받도록:

```js
async function registerActor(port, serverToken, actorId = 'agent_ws') {
  const res = await fetch(`http://127.0.0.1:${port}/api/actors/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(serverToken) },
    body: JSON.stringify({ actorId }),
  });
  assert.equal(res.status, 200);
  return (await res.json()).actorToken;
}
```

테스트 4건:

```js
test('actor 토큰 AUTH는 scope actor의 AUTH_OK를 받는다', async () => {
  const server = await startServer({ serverToken: 'wf-secret' });
  const ws = await openSocket(server.port);
  try {
    const actorToken = await registerActor(server.port, 'wf-secret', 'agent_a');
    const ok = await authAs(ws, actorToken);
    assert.equal(ok.scope, 'actor');
    assert.equal(ok.actorId, 'agent_a');
  } finally {
    ws.close();
    await server.stop();
    cleanupDataDir(server.dataDir);
  }
});

test('actor 소켓은 자기 WORKFLOW_DECIDED만 받고 다른 이벤트는 받지 않는다', async () => {
  const server = await startServer({ serverToken: 'wf-secret' });
  const wsA = await openSocket(server.port);
  const wsB = await openSocket(server.port);
  const wsOp = await openSocket(server.port);
  try {
    const tokenA = await registerActor(server.port, 'wf-secret', 'agent_a');
    const tokenB = await registerActor(server.port, 'wf-secret', 'agent_b');
    await authAs(wsA, tokenA);
    await authAs(wsB, tokenB);
    const okOp = await authAs(wsOp, 'wf-secret');
    assert.equal(okOp.scope, 'operator');

    const receivedA = [];
    const receivedB = [];
    wsA.on('message', (raw) => receivedA.push(JSON.parse(raw.toString()).type));
    wsB.on('message', (raw) => receivedB.push(JSON.parse(raw.toString()).type));

    const requestId = await createRequest(server.port, tokenA, 'agent_a', 'A의 요청');
    const opDecided = waitForType(wsOp, 'WORKFLOW_DECIDED');
    const aDecided = waitForType(wsA, 'WORKFLOW_DECIDED');
    await decideRequestHttp(server.port, 'wf-secret', requestId);
    const event = await aDecided;
    assert.equal(event.request.actorId, 'agent_a');
    await opDecided; // 운영자는 여전히 전체 수신

    // actor A는 DECIDED만, B는 아무것도 못 받았다 (REQUEST_CREATED/HISTORY 미노출)
    assert.deepEqual(receivedA, ['WORKFLOW_DECIDED']);
    assert.deepEqual(receivedB, []);
  } finally {
    wsA.close();
    wsB.close();
    wsOp.close();
    await server.stop();
    cleanupDataDir(server.dataDir);
  }
});

test('revoke는 해당 actor 소켓을 4401로 닫고 운영자 소켓은 유지한다', async () => {
  const server = await startServer({ serverToken: 'wf-secret' });
  const wsA = await openSocket(server.port);
  const wsOp = await openSocket(server.port);
  try {
    const tokenA = await registerActor(server.port, 'wf-secret', 'agent_a');
    await authAs(wsA, tokenA);
    await authAs(wsOp, 'wf-secret');
    const closed = waitForClose(wsA);
    const res = await fetch(`http://127.0.0.1:${server.port}/api/actors/agent_a/revoke`, {
      method: 'POST',
      headers: authHeaders('wf-secret'),
    });
    assert.equal(res.status, 200);
    assert.equal(await closed, 4401);
    assert.equal(wsOp.readyState, WebSocket.OPEN);
  } finally {
    wsOp.close();
    await server.stop();
    cleanupDataDir(server.dataDir);
  }
});

test('open 모드에서도 actor 토큰 인증 소켓은 자기 결정만 받는다', async () => {
  const server = await startServer();
  const ws = await openSocket(server.port);
  try {
    const tokenA = await registerActor(server.port, '', 'agent_a');
    const ok = await authAs(ws, tokenA);
    assert.equal(ok.scope, 'actor');
    const received = [];
    ws.on('message', (raw) => received.push(JSON.parse(raw.toString()).type));
    const otherId = await createRequest(server.port, '', 'agent_other', '남의 요청');
    const mine = await createRequest(server.port, '', 'agent_a', '내 요청');
    const decided = waitForType(ws, 'WORKFLOW_DECIDED');
    await decideRequestHttp(server.port, '', otherId);
    await decideRequestHttp(server.port, '', mine);
    const event = await decided;
    assert.equal(event.request.actorId, 'agent_a');
    assert.deepEqual(received, ['WORKFLOW_DECIDED']);
  } finally {
    ws.close();
    await server.stop();
    cleanupDataDir(server.dataDir);
  }
});
```

- [ ] **Step 2: 실패 확인** — `cd workflow && node --test tests/ws-auth.test.mjs` → 신규 4건 FAIL (scope 필드 없음/필터 없음), 기존 4건 PASS.

- [ ] **Step 3: server.js 구현**

import에 `findActorByToken` 추가 (`./server/actors.js`).

connection 핸들러 교체:

```js
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
```

broadcast 교체 + actor 소켓 종료 헬퍼:

```js
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
```

decide 라우트의 브로드캐스트에 target 지정:

```js
broadcast({ type: 'WORKFLOW_DECIDED', item: result.item, request: result.request }, { targetActorId: result.request.actorId });
```

revoke 라우트의 `recordHistory({ event: 'ACTOR_REVOKED', actorId });` 아래에:

```js
closeActorSockets(actorId);
```

- [ ] **Step 4: 통과 확인** — `node --test tests/ws-auth.test.mjs` 8건 PASS 후 `npm run test:server` 전체 무회귀.
- [ ] **Step 5: 커밋** — `feat(workflow): actor 토큰 WS 구독 — 자기 결정만 스코프 수신 + revoke 소켓 종료`

---

### Task 2: 문서 갱신 + 최종 게이트 + PR

**Files:**
- Modify: `workflow/README.md`
- Modify: `docs/maestro-workflow/README.md`

- [ ] **Step 1: workflow/README.md 엄격 모드 절 끝에 추가**

```markdown
actor도 자신의 actorToken으로 같은 `WORKFLOW_AUTH` 핸드셰이크를 쓸 수 있다
(`WORKFLOW_AUTH_OK`에 `scope:'actor'`). actor 소켓은 자기 요청의
`WORKFLOW_DECIDED`만 수신하며(REQUEST_CREATED/HISTORY 미수신), revoke 시
즉시 4401로 닫힌다. WS는 알림용이다 — 스냅샷·전달 보장은 폴링
(`GET /api/decision-requests/:id/decision`) + ack가 담당하므로 재연결 후
폴링 1회를 권장한다.
```

"알려진 한계 (MVP)"의 `- WS 구독은 운영자(서버 토큰) 전용이다. actor 토큰의 WS 구독, 다중 운영자/권한 분리는 후속 스펙으로 예약한다.` 를 `- 다중 운영자/권한 분리는 후속 스펙으로 예약한다.` 로 교체.

- [ ] **Step 2: docs/maestro-workflow/README.md 범위 요약에 추가**

`- actor 토큰 WS 구독: 자기 결정만 스코프 수신, revoke 시 소켓 종료 (2026-08-04 스펙)`

- [ ] **Step 3: 최종 게이트** — `cd workflow && npm test` 전체 PASS, `git status`로 본체 무변경 확인.
- [ ] **Step 4: 커밋 + PR** — `docs(workflow): actor WS 구독 문서화`, PR 생성 후 CI 확인.
