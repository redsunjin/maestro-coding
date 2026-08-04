// WS 첫 메시지 인증 (스펙 2026-08-03 §2): WORKFLOW_AUTH / WORKFLOW_AUTH_OK / close 4401.
import test from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { startServer, cleanupDataDir, authHeaders } from './helpers.mjs';

function openSocket(port) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    ws.on('open', () => resolve(ws));
    ws.on('error', reject);
  });
}

// type이 일치하는 메시지가 올 때까지 수집 (REQUEST_CREATED 뒤 HISTORY_APPEND 등 순서 완충)
function waitForType(ws, type, timeoutMs = 2000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`no ${type} within ${timeoutMs}ms`)), timeoutMs);
    const onMessage = (raw) => {
      const data = JSON.parse(raw.toString());
      if (data.type === type) {
        clearTimeout(timer);
        ws.off('message', onMessage);
        resolve(data);
      }
    };
    ws.on('message', onMessage);
  });
}

function waitForClose(ws, timeoutMs = 2000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('close timeout')), timeoutMs);
    ws.on('close', (code) => {
      clearTimeout(timer);
      resolve(code);
    });
  });
}

async function registerActor(port, serverToken, actorId = 'agent_ws') {
  const res = await fetch(`http://127.0.0.1:${port}/api/actors/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(serverToken) },
    body: JSON.stringify({ actorId }),
  });
  assert.equal(res.status, 200);
  return (await res.json()).actorToken;
}

async function createRequest(port, token = '', actorId = 'agent_ws', title = 'WS 인증 테스트') {
  const res = await fetch(`http://127.0.0.1:${port}/api/decision-requests`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
    body: JSON.stringify({ actorId, subjectType: 'spend', subject: { title } }),
  });
  assert.equal(res.status, 200);
  return (await res.json()).item.requestId;
}

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

test('open 모드: 무인증 소켓도 브로드캐스트를 받고 WORKFLOW_AUTH에 AUTH_OK가 온다', async () => {
  const server = await startServer();
  const silent = await openSocket(server.port);
  const authed = await openSocket(server.port);
  try {
    authed.send(JSON.stringify({ type: 'WORKFLOW_AUTH', token: '' }));
    await waitForType(authed, 'WORKFLOW_AUTH_OK');
    const received = waitForType(silent, 'WORKFLOW_REQUEST_CREATED');
    await createRequest(server.port);
    assert.equal((await received).item.subject.title, 'WS 인증 테스트');
  } finally {
    silent.close();
    authed.close();
    await server.stop();
    cleanupDataDir(server.dataDir);
  }
});

test('엄격 모드: 올바른 토큰은 AUTH_OK 후 브로드캐스트를 받는다', async () => {
  const server = await startServer({ serverToken: 'wf-secret' });
  const ws = await openSocket(server.port);
  try {
    ws.send(JSON.stringify({ type: 'WORKFLOW_AUTH', token: 'wf-secret' }));
    await waitForType(ws, 'WORKFLOW_AUTH_OK');
    const actorToken = await registerActor(server.port, 'wf-secret');
    const received = waitForType(ws, 'WORKFLOW_REQUEST_CREATED');
    await createRequest(server.port, actorToken);
    assert.equal((await received).item.subject.title, 'WS 인증 테스트');
  } finally {
    ws.close();
    await server.stop();
    cleanupDataDir(server.dataDir);
  }
});

test('엄격 모드: 틀린 토큰은 4401로 닫힌다', async () => {
  const server = await startServer({ serverToken: 'wf-secret' });
  const ws = await openSocket(server.port);
  try {
    ws.send(JSON.stringify({ type: 'WORKFLOW_AUTH', token: 'wrong' }));
    assert.equal(await waitForClose(ws), 4401);
  } finally {
    await server.stop();
    cleanupDataDir(server.dataDir);
  }
});

test('엄격 모드: 미인가 소켓은 브로드캐스트를 못 받고 타임아웃 시 4401로 닫힌다', async () => {
  const server = await startServer({
    serverToken: 'wf-secret',
    extraEnv: { MAESTRO_WORKFLOW_WS_AUTH_TIMEOUT_MS: '300' },
  });
  const ws = await openSocket(server.port);
  const leaked = [];
  ws.on('message', (raw) => leaked.push(JSON.parse(raw.toString())));
  try {
    const actorToken = await registerActor(server.port, 'wf-secret');
    await createRequest(server.port, actorToken);
    assert.equal(await waitForClose(ws), 4401);
    assert.deepEqual(leaked, []);
  } finally {
    await server.stop();
    cleanupDataDir(server.dataDir);
  }
});

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
