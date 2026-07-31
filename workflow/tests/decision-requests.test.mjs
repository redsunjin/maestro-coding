import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { WebSocket } from 'ws';
import { startServer, cleanupDataDir, authHeaders } from './helpers.mjs';

const SERVER_TOKEN = 'wf-server-secret';

async function setupActor(server, actorId) {
  const res = await fetch(`http://127.0.0.1:${server.port}/api/actors/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(SERVER_TOKEN) },
    body: JSON.stringify({ actorId }),
  });
  const body = await res.json();
  return body.actorToken;
}

function postRequest(server, token, payload) {
  return fetch(`http://127.0.0.1:${server.port}/api/decision-requests`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
    body: JSON.stringify(payload),
  });
}

test('creates generic decision request and lists it pending', async () => {
  const server = await startServer({ serverToken: SERVER_TOKEN });
  try {
    const token = await setupActor(server, 'agent_a');
    const res = await postRequest(server, token, {
      subjectType: 'Spend',
      subject: {
        title: 'API 크레딧 $30 구매',
        summary: '리서치 작업용 크레딧 충전',
        payload: { amount: 30, currency: 'USD', purpose: 'research-api' },
      },
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.match(body.item.requestId, /^dcr_/);
    assert.equal(body.item.subjectType, 'spend'); // 소문자 정규화
    assert.equal(body.item.actorId, 'agent_a'); // 토큰 주인으로 채움
    assert.equal(body.item.status, 'pending_decision');
    assert.equal(body.item.subject.payload.amount, 30);

    const listRes = await fetch(
      `http://127.0.0.1:${server.port}/api/decision-requests?status=pending_decision`,
      { headers: authHeaders(SERVER_TOKEN) },
    );
    const list = await listRes.json();
    assert.equal(list.items.length, 1);

    const health = await (await fetch(`http://127.0.0.1:${server.port}/health`)).json();
    assert.equal(health.pendingRequests, 1);
  } finally {
    await server.stop();
    cleanupDataDir(server.dataDir);
  }
});

test('validates subjectType/title and rejects actorId spoofing', async () => {
  const server = await startServer({ serverToken: SERVER_TOKEN });
  try {
    const token = await setupActor(server, 'agent_a');

    const noType = await postRequest(server, token, { subject: { title: '제목' } });
    assert.equal(noType.status, 400);
    assert.equal((await noType.json()).error, 'SUBJECT_TYPE_REQUIRED');

    const noTitle = await postRequest(server, token, { subjectType: 'spend', subject: {} });
    assert.equal(noTitle.status, 400);
    assert.equal((await noTitle.json()).error, 'SUBJECT_TITLE_REQUIRED');

    const spoofed = await postRequest(server, token, {
      actorId: 'someone_else',
      subjectType: 'spend',
      subject: { title: '제목' },
    });
    assert.equal(spoofed.status, 403);
  } finally {
    await server.stop();
    cleanupDataDir(server.dataDir);
  }
});

test('broadcasts WORKFLOW_REQUEST_CREATED over WebSocket', async () => {
  const server = await startServer({ serverToken: SERVER_TOKEN });
  try {
    const token = await setupActor(server, 'agent_a');
    const ws = new WebSocket(`ws://127.0.0.1:${server.port}`);
    await once(ws, 'open');
    const messagePromise = once(ws, 'message');
    await postRequest(server, token, { subjectType: 'publish', subject: { title: '보고서 발송' } });
    const [raw] = await messagePromise;
    const event = JSON.parse(raw.toString());
    assert.equal(event.type, 'WORKFLOW_REQUEST_CREATED');
    assert.equal(event.item.subjectType, 'publish');
    ws.close();
  } finally {
    await server.stop();
    cleanupDataDir(server.dataDir);
  }
});
