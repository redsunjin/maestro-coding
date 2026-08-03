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

async function registerActor(port, serverToken) {
  const res = await fetch(`http://127.0.0.1:${port}/api/actors/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(serverToken) },
    body: JSON.stringify({ actorId: 'agent_ws' }),
  });
  assert.equal(res.status, 200);
  return (await res.json()).actorToken;
}

async function createRequest(port, token = '') {
  const res = await fetch(`http://127.0.0.1:${port}/api/decision-requests`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
    body: JSON.stringify({ actorId: 'agent_ws', subjectType: 'spend', subject: { title: 'WS 인증 테스트' } }),
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
