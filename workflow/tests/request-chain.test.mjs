// 요청 체인 (스펙 2026-08-04 §2): parentRequestId 연결과 chain 조회.
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, cleanupDataDir, authHeaders } from './helpers.mjs';

const SERVER_TOKEN = 'wf-server-secret';

async function setupActor(server, actorId) {
  const res = await fetch(`http://127.0.0.1:${server.port}/api/actors/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(SERVER_TOKEN) },
    body: JSON.stringify({ actorId }),
  });
  return (await res.json()).actorToken;
}

async function postRequest(server, token, payload) {
  const res = await fetch(`http://127.0.0.1:${server.port}/api/decision-requests`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
    body: JSON.stringify(payload),
  });
  return res;
}

test('parentRequestId로 체인을 만들고 chain 조회가 오름차순 전체를 돌려준다', async () => {
  const server = await startServer({ serverToken: SERVER_TOKEN });
  try {
    const token = await setupActor(server, 'agent_mail');
    const first = await (await postRequest(server, token, {
      subjectType: 'email-triage',
      subject: { title: '메일 분류: 계약 검토', payload: { from: 'boss@corp.com' } },
    })).json();
    const second = await (await postRequest(server, token, {
      subjectType: 'email-reply',
      subject: { title: '답장 초안 v1' },
      parentRequestId: first.item.requestId,
    })).json();
    const third = await (await postRequest(server, token, {
      subjectType: 'email-reply',
      subject: { title: '답장 초안 v2 (반려 반영)' },
      parentRequestId: second.item.requestId,
    })).json();

    assert.equal(second.item.parentRequestId, first.item.requestId);
    assert.equal(first.item.parentRequestId, null);

    // 체인 조회는 중간 노드 기준으로도 전체를 돌려준다
    const chainRes = await fetch(
      `http://127.0.0.1:${server.port}/api/decision-requests/${second.item.requestId}/chain`,
      { headers: authHeaders(SERVER_TOKEN) },
    );
    assert.equal(chainRes.status, 200);
    const chain = (await chainRes.json()).items;
    assert.deepEqual(
      chain.map((item) => item.requestId),
      [first.item.requestId, second.item.requestId, third.item.requestId],
    );
  } finally {
    await server.stop();
    cleanupDataDir(server.dataDir);
  }
});

test('존재하지 않는 부모는 404 PARENT_REQUEST_NOT_FOUND', async () => {
  const server = await startServer({ serverToken: SERVER_TOKEN });
  try {
    const token = await setupActor(server, 'agent_mail');
    const res = await postRequest(server, token, {
      subjectType: 'email-reply',
      subject: { title: '고아 요청' },
      parentRequestId: 'dcr_missing',
    });
    assert.equal(res.status, 404);
    assert.equal((await res.json()).error, 'PARENT_REQUEST_NOT_FOUND');
  } finally {
    await server.stop();
    cleanupDataDir(server.dataDir);
  }
});

test('엄격 모드에서 chain 조회는 운영자 토큰을 요구한다', async () => {
  const server = await startServer({ serverToken: SERVER_TOKEN });
  try {
    const res = await fetch(`http://127.0.0.1:${server.port}/api/decision-requests/dcr_x/chain`);
    assert.equal(res.status, 401);
  } finally {
    await server.stop();
    cleanupDataDir(server.dataDir);
  }
});
