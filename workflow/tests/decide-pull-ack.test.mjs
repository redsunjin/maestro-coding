import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, cleanupDataDir, authHeaders } from './helpers.mjs';

const SERVER_TOKEN = 'wf-server-secret';

async function setup(server) {
  const register = async (actorId) => {
    const res = await fetch(`http://127.0.0.1:${server.port}/api/actors/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders(SERVER_TOKEN) },
      body: JSON.stringify({ actorId }),
    });
    return (await res.json()).actorToken;
  };
  const tokenA = await register('agent_a');
  const tokenB = await register('agent_b');
  const reqRes = await fetch(`http://127.0.0.1:${server.port}/api/decision-requests`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(tokenA) },
    body: JSON.stringify({ subjectType: 'spend', subject: { title: 'API 크레딧 $30 구매' } }),
  });
  const requestId = (await reqRes.json()).item.requestId;
  return { tokenA, tokenB, requestId };
}

function decide(server, requestId, body) {
  return fetch(`http://127.0.0.1:${server.port}/api/decision-requests/${requestId}/decide`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(SERVER_TOKEN) },
    body: JSON.stringify(body),
  });
}

test('operator decides, actor pulls own decision and acks; record-only', async () => {
  const server = await startServer({ serverToken: SERVER_TOKEN });
  try {
    const { tokenA, tokenB, requestId } = await setup(server);

    // 결정 전 pull → pending
    const pending = await fetch(
      `http://127.0.0.1:${server.port}/api/decision-requests/${requestId}/decision`,
      { headers: authHeaders(tokenA) },
    );
    assert.equal(pending.status, 200);
    assert.equal((await pending.json()).status, 'pending');

    // 남의 요청 pull → 403
    const foreign = await fetch(
      `http://127.0.0.1:${server.port}/api/decision-requests/${requestId}/decision`,
      { headers: authHeaders(tokenB) },
    );
    assert.equal(foreign.status, 403);

    // 운영자 결정 (record-only)
    const decided = await decide(server, requestId, { decision: 'approve', comment: '한도 내 지출' });
    assert.equal(decided.status, 200);
    const decidedBody = await decided.json();
    assert.equal(decidedBody.item.executorAction, 'none');
    assert.equal(decidedBody.item.delivery.status, 'available');
    assert.equal(decidedBody.request.status, 'decided');

    // 중복 결정 → 409, 잘못된 어휘 → 400, 없는 요청 → 404
    assert.equal((await decide(server, requestId, { decision: 'reject' })).status, 409);
    assert.equal((await decide(server, 'dcr_none', { decision: 'approve' })).status, 404);

    // actor pull → available
    const pulled = await fetch(
      `http://127.0.0.1:${server.port}/api/decision-requests/${requestId}/decision`,
      { headers: authHeaders(tokenA) },
    );
    const pulledBody = await pulled.json();
    assert.equal(pulledBody.status, 'available');
    const decisionId = pulledBody.item.decisionId;

    // 남의 결정 ack → 403, 자기 결정 ack → acknowledged (반복 ack 동일 결과)
    const foreignAck = await fetch(`http://127.0.0.1:${server.port}/api/decisions/${decisionId}/ack`, {
      method: 'POST',
      headers: authHeaders(tokenB),
    });
    assert.equal(foreignAck.status, 403);

    const ack = await fetch(`http://127.0.0.1:${server.port}/api/decisions/${decisionId}/ack`, {
      method: 'POST',
      headers: authHeaders(tokenA),
    });
    assert.equal(ack.status, 200);
    const ackBody = await ack.json();
    assert.equal(ackBody.item.delivery.status, 'acknowledged');
    assert.ok(ackBody.item.delivery.acknowledgedAt);

    const ackAgain = await fetch(`http://127.0.0.1:${server.port}/api/decisions/${decisionId}/ack`, {
      method: 'POST',
      headers: authHeaders(tokenA),
    });
    assert.equal((await ackAgain.json()).item.delivery.acknowledgedAt, ackBody.item.delivery.acknowledgedAt);
  } finally {
    await server.stop();
    cleanupDataDir(server.dataDir);
  }
});

test('invalid decision vocabulary is rejected; store survives restart', async () => {
  const first = await startServer({ serverToken: SERVER_TOKEN });
  const dataDir = first.dataDir;
  try {
    const { tokenA, requestId } = await setup(first);
    assert.equal((await decide(first, requestId, { decision: 'merge' })).status, 400);
    await decide(first, requestId, { decision: 'revise', comment: '금액 근거 추가 요망' });
    await first.stop();

    const second = await startServer({ serverToken: SERVER_TOKEN, tempDir: dataDir });
    try {
      const pulled = await fetch(
        `http://127.0.0.1:${second.port}/api/decision-requests/${requestId}/decision`,
        { headers: authHeaders(tokenA) },
      );
      const body = await pulled.json();
      assert.equal(body.status, 'available');
      assert.equal(body.item.decision, 'revise');
    } finally {
      await second.stop();
    }
  } finally {
    cleanupDataDir(dataDir);
  }
});
