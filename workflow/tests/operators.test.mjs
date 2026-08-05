// 다중 운영자 (스펙 2026-08-04 §1-2): 운영자 레지스트리·신원 기록·권한 경계.
import test from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { startServer, cleanupDataDir, authHeaders } from './helpers.mjs';

const ROOT = 'wf-root-secret';

async function registerOperator(port, operatorId) {
  const res = await fetch(`http://127.0.0.1:${port}/api/operators/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(ROOT) },
    body: JSON.stringify({ operatorId }),
  });
  assert.equal(res.status, 200);
  return (await res.json()).operatorToken;
}

async function createPendingRequest(port) {
  const actorRes = await fetch(`http://127.0.0.1:${port}/api/actors/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(ROOT) },
    body: JSON.stringify({ actorId: 'agent_x' }),
  });
  const actorToken = (await actorRes.json()).actorToken;
  const reqRes = await fetch(`http://127.0.0.1:${port}/api/decision-requests`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(actorToken) },
    body: JSON.stringify({ subjectType: 'spend', subject: { title: '운영자 테스트' } }),
  });
  return (await reqRes.json()).item;
}

function openSocket(port) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    ws.on('open', () => resolve(ws));
    ws.on('error', reject);
  });
}

function waitForType(ws, type, timeoutMs = 2000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`no ${type}`)), timeoutMs);
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

test('운영자 토큰으로 결정하면 decidedBy에 신원이 강제 기록된다 (body 위조 무시)', async () => {
  const server = await startServer({ serverToken: ROOT });
  try {
    const token = await registerOperator(server.port, 'op_sunjin');
    const request = await createPendingRequest(server.port);

    const listRes = await fetch(`http://127.0.0.1:${server.port}/api/decision-requests?status=pending_decision`, {
      headers: authHeaders(token),
    });
    assert.equal(listRes.status, 200);
    assert.equal((await listRes.json()).items.length, 1);

    const decideRes = await fetch(`http://127.0.0.1:${server.port}/api/decision-requests/${request.requestId}/decide`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
      body: JSON.stringify({ decision: 'approve', decidedBy: 'forged-identity' }),
    });
    assert.equal(decideRes.status, 200);
    assert.equal((await decideRes.json()).item.decidedBy, 'op_sunjin');

    const historyRes = await fetch(`http://127.0.0.1:${server.port}/api/history?limit=10`, {
      headers: authHeaders(token),
    });
    const decidedEntry = (await historyRes.json()).items.find((entry) => entry.event === 'DECIDED');
    assert.equal(decidedEntry.decidedBy, 'op_sunjin');
  } finally {
    await server.stop();
    cleanupDataDir(server.dataDir);
  }
});

test('관리 라우트(운영자/actor 등록)는 root 전용 — 운영자 토큰은 401', async () => {
  const server = await startServer({ serverToken: ROOT });
  try {
    const token = await registerOperator(server.port, 'op_a');
    for (const path of ['/api/operators/register', '/api/actors/register']) {
      const res = await fetch(`http://127.0.0.1:${server.port}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
        body: JSON.stringify({ operatorId: 'x', actorId: 'x' }),
      });
      assert.equal(res.status, 401, path);
    }
    const listRes = await fetch(`http://127.0.0.1:${server.port}/api/operators`, { headers: authHeaders(token) });
    assert.equal(listRes.status, 401);
  } finally {
    await server.stop();
    cleanupDataDir(server.dataDir);
  }
});

test('운영자 WS는 전체 스트림을 받고, revoke 시 소켓 4401 + HTTP 401 (root 소켓 유지)', async () => {
  const server = await startServer({ serverToken: ROOT });
  const wsOp = await openSocket(server.port);
  const wsRoot = await openSocket(server.port);
  try {
    const token = await registerOperator(server.port, 'op_b');
    wsOp.send(JSON.stringify({ type: 'WORKFLOW_AUTH', token }));
    const ok = await waitForType(wsOp, 'WORKFLOW_AUTH_OK');
    assert.equal(ok.scope, 'operator');
    assert.equal(ok.operatorId, 'op_b');
    wsRoot.send(JSON.stringify({ type: 'WORKFLOW_AUTH', token: ROOT }));
    await waitForType(wsRoot, 'WORKFLOW_AUTH_OK');

    const received = waitForType(wsOp, 'WORKFLOW_REQUEST_CREATED');
    await createPendingRequest(server.port);
    assert.ok(await received);

    const closed = new Promise((resolve) => wsOp.on('close', (code) => resolve(code)));
    const revokeRes = await fetch(`http://127.0.0.1:${server.port}/api/operators/op_b/revoke`, {
      method: 'POST',
      headers: authHeaders(ROOT),
    });
    assert.equal(revokeRes.status, 200);
    assert.equal(await closed, 4401);
    assert.equal(wsRoot.readyState, WebSocket.OPEN);

    const listRes = await fetch(`http://127.0.0.1:${server.port}/api/decision-requests?status=pending_decision`, {
      headers: authHeaders(token),
    });
    assert.equal(listRes.status, 401);
  } finally {
    wsRoot.close();
    await server.stop();
    cleanupDataDir(server.dataDir);
  }
});

test('운영자 토큰은 재시작 후에도 유효하다 (영속화)', async () => {
  const first = await startServer({ serverToken: ROOT });
  let token;
  try {
    token = await registerOperator(first.port, 'op_persist');
  } finally {
    await first.stop();
  }
  const second = await startServer({ serverToken: ROOT, tempDir: first.dataDir });
  try {
    const res = await fetch(`http://127.0.0.1:${second.port}/api/history?limit=5`, { headers: authHeaders(token) });
    assert.equal(res.status, 200);
  } finally {
    await second.stop();
    cleanupDataDir(first.dataDir);
  }
});
