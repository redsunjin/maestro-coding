import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, cleanupDataDir, authHeaders } from './helpers.mjs';

const SERVER_TOKEN = 'wf-server-secret';

test('full flow leaves append-only audit trail that survives restart', async () => {
  const first = await startServer({ serverToken: SERVER_TOKEN });
  const dataDir = first.dataDir;
  try {
    const registerRes = await fetch(`http://127.0.0.1:${first.port}/api/actors/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders(SERVER_TOKEN) },
      body: JSON.stringify({ actorId: 'agent_a' }),
    });
    const actorToken = (await registerRes.json()).actorToken;

    const reqRes = await fetch(`http://127.0.0.1:${first.port}/api/decision-requests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders(actorToken) },
      body: JSON.stringify({ subjectType: 'spend', subject: { title: 'API 크레딧 $30 구매' } }),
    });
    const requestId = (await reqRes.json()).item.requestId;

    const decideRes = await fetch(
      `http://127.0.0.1:${first.port}/api/decision-requests/${requestId}/decide`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders(SERVER_TOKEN) },
        body: JSON.stringify({ decision: 'approve', comment: '한도 내' }),
      },
    );
    const decisionId = (await decideRes.json()).item.decisionId;

    await fetch(`http://127.0.0.1:${first.port}/api/decisions/${decisionId}/ack`, {
      method: 'POST',
      headers: authHeaders(actorToken),
    });

    const historyRes = await fetch(`http://127.0.0.1:${first.port}/api/history?limit=10`, {
      headers: authHeaders(SERVER_TOKEN),
    });
    assert.equal(historyRes.status, 200);
    const events = (await historyRes.json()).items.map((item) => item.event);
    // 최신순
    assert.deepEqual(events, ['ACKNOWLEDGED', 'DECIDED', 'REQUEST_CREATED', 'ACTOR_REGISTERED']);

    const decidedEntry = (await (await fetch(`http://127.0.0.1:${first.port}/api/history?limit=10`, {
      headers: authHeaders(SERVER_TOKEN),
    })).json()).items.find((item) => item.event === 'DECIDED');
    assert.equal(decidedEntry.decision, 'approve');
    assert.equal(decidedEntry.subjectType, 'spend');
    assert.equal(decidedEntry.decidedBy, 'operator');

    await first.stop();

    // 재시작 후에도 이력 복구
    const second = await startServer({ serverToken: SERVER_TOKEN, tempDir: dataDir });
    try {
      const recovered = await fetch(`http://127.0.0.1:${second.port}/api/history?limit=10`, {
        headers: authHeaders(SERVER_TOKEN),
      });
      assert.equal((await recovered.json()).items.length, 4);
    } finally {
      await second.stop();
    }
  } finally {
    cleanupDataDir(dataDir);
  }
});

test('history endpoint requires server token', async () => {
  const server = await startServer({ serverToken: SERVER_TOKEN });
  try {
    const res = await fetch(`http://127.0.0.1:${server.port}/api/history`);
    assert.equal(res.status, 401);
  } finally {
    await server.stop();
    cleanupDataDir(server.dataDir);
  }
});
