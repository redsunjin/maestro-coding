// 이메일 커넥터 e2e (스펙 2026-08-04 데모 §2): 실서버 + 커넥터 + 스크립트 운영자로 전체 루프 검증.
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, cleanupDataDir, authHeaders } from './helpers.mjs';
import { runEmailConnector } from '../examples/email-connector/lib.mjs';
import { createMockInboxDriver } from '../examples/email-connector/mockInbox.mjs';

const SERVER_TOKEN = 'wf-server-secret';

// 운영자 역할: pending 요청을 폴링해 decide 함수로 결정한다. done()이 true가 되면 즉시 종료.
async function operateUntil(server, decide, { timeoutMs = 20000, done = () => false } = {}) {
  const deadline = Date.now() + timeoutMs;
  const decided = new Set();
  while (Date.now() < deadline && !done()) {
    const res = await fetch(`http://127.0.0.1:${server.port}/api/decision-requests?status=pending_decision`, {
      headers: authHeaders(SERVER_TOKEN),
    });
    const { items } = await res.json();
    for (const request of items) {
      if (decided.has(request.requestId)) continue;
      const decision = decide(request);
      if (!decision) continue;
      await fetch(`http://127.0.0.1:${server.port}/api/decision-requests/${request.requestId}/decide`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders(SERVER_TOKEN) },
        body: JSON.stringify(decision),
      });
      decided.add(request.requestId);
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
}

test('전체 루프: 메일 2통이 triage→reply 체인으로 승인되어 발송·ack까지 완결된다', async () => {
  const server = await startServer({ serverToken: SERVER_TOKEN });
  const driver = createMockInboxDriver();
  try {
    let connectorDone = false;
    const operator = operateUntil(server, () => ({ decision: 'approve', comment: '' }), {
      timeoutMs: 15000,
      done: () => connectorDone,
    });
    const summary = await runEmailConnector({
      serverUrl: `http://127.0.0.1:${server.port}`,
      serverToken: SERVER_TOKEN,
      driver,
      decisionTimeoutMs: 15000,
    });
    connectorDone = true;

    assert.equal(summary.chains.length, 2);
    assert.equal(summary.sent.length, 2);
    assert.equal(summary.skipped.length, 0);
    assert.deepEqual(driver.sent.map((mail) => mail.to), ['client@corp.com', 'partner@vendor.io']);
    assert.ok(driver.sent[0].subject.startsWith('Re: '));

    // 체인 API로 triage→reply 연결 검증
    for (const chain of summary.chains) {
      const chainRes = await fetch(
        `http://127.0.0.1:${server.port}/api/decision-requests/${chain.replyRequestId}/chain`,
        { headers: authHeaders(SERVER_TOKEN) },
      );
      const { items } = await chainRes.json();
      assert.deepEqual(
        items.map((item) => item.requestId),
        [chain.triageRequestId, chain.replyRequestId],
      );
      assert.deepEqual(items.map((item) => item.subjectType), ['email-triage', 'email-reply']);
    }

    // 결정 4건 모두 ack로 종결됐는지 (actor 폴링 관점)
    const historyRes = await fetch(`http://127.0.0.1:${server.port}/api/history?limit=60`, {
      headers: authHeaders(SERVER_TOKEN),
    });
    const historyItems = (await historyRes.json()).items;
    const ackCount = historyItems.filter((entry) => entry.event === 'ACKNOWLEDGED').length;
    assert.equal(ackCount, 4);

    await operator;
  } finally {
    await server.stop();
    cleanupDataDir(server.dataDir);
  }
});

test('반려 루프: triage 반려 시 reply를 만들지 않고 발송 0건으로 기록한다', async () => {
  const server = await startServer({ serverToken: SERVER_TOKEN });
  const driver = createMockInboxDriver([
    {
      id: 'mail-spam',
      from: 'spam@junk.io',
      subject: '광고: 무제한 크레딧',
      body: '지금 바로 구매하세요!',
      proposedAction: '무시 또는 스팸 처리',
      draftReply: '(초안 없음)',
    },
  ]);
  try {
    let connectorDone = false;
    const operator = operateUntil(server, () => ({ decision: 'reject', comment: '스팸 — 회신 불필요' }), {
      timeoutMs: 10000,
      done: () => connectorDone,
    });
    const summary = await runEmailConnector({
      serverUrl: `http://127.0.0.1:${server.port}`,
      serverToken: SERVER_TOKEN,
      driver,
      decisionTimeoutMs: 10000,
    });
    connectorDone = true;

    assert.equal(summary.sent.length, 0);
    assert.equal(summary.chains.length, 0);
    assert.deepEqual(summary.skipped, [{ mailId: 'mail-spam', stage: 'triage', decision: 'reject' }]);
    assert.equal(driver.sent.length, 0);
    assert.equal(driver.listUnprocessed().length, 0); // 반려도 처리 완료로 표시

    await operator;
  } finally {
    await server.stop();
    cleanupDataDir(server.dataDir);
  }
});
