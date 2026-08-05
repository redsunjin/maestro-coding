// 이메일 커넥터 참조 클라이언트 (스펙 2026-08-04 데모 §1).
// Workflow 공개 계약만 사용한다: actor 등록 → 요청 생성(체인) → WS 구독(1차)/폴링(보조) → ack.
// 발송 실행은 드라이버 몫 — Workflow는 record-only 그대로다.
import WebSocket from 'ws';

export async function runEmailConnector({
  serverUrl,
  serverToken,
  actorId = 'agent_email',
  driver,
  log = () => {},
  decisionTimeoutMs = 60000,
}) {
  if (!driver) {
    throw new Error('driver가 필요합니다 (listUnprocessed/send/markProcessed)');
  }

  const httpJson = async (path, { method = 'GET', token = '', body = null } = {}) => {
    const res = await fetch(`${serverUrl}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const parsed = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(parsed.error || `HTTP ${res.status} ${path}`);
    }
    return parsed;
  };

  // 1. actor 등록 (서버 토큰) → actor 토큰 확보
  const registration = await httpJson('/api/actors/register', {
    method: 'POST',
    token: serverToken,
    body: { actorId },
  });
  const actorToken = registration.actorToken;

  // 2. WS 구독 — 자기 결정(WORKFLOW_DECIDED)만 수신 (actor 스코프)
  const decisionWaiters = new Map(); // requestId → resolve
  const receivedDecisions = new Map(); // requestId → { item, request }
  const ws = new WebSocket(serverUrl.replace(/^http/, 'ws'));
  await new Promise((resolve, reject) => {
    ws.on('open', () => {
      ws.send(JSON.stringify({ type: 'WORKFLOW_AUTH', token: actorToken }));
    });
    ws.on('message', (raw) => {
      const data = JSON.parse(raw.toString());
      if (data.type === 'WORKFLOW_AUTH_OK') {
        resolve();
        return;
      }
      if (data.type === 'WORKFLOW_DECIDED' && data.request) {
        receivedDecisions.set(data.request.requestId, { item: data.item, request: data.request });
        const waiter = decisionWaiters.get(data.request.requestId);
        if (waiter) waiter({ item: data.item, request: data.request });
      }
    });
    ws.on('error', reject);
  });

  // WS가 1차, 폴링이 보장 (재연결·놓침 복구용 보조 경로)
  const awaitDecision = async (requestId) => {
    if (receivedDecisions.has(requestId)) {
      return receivedDecisions.get(requestId);
    }
    return new Promise((resolve, reject) => {
      const deadline = setTimeout(() => {
        clearInterval(poller);
        decisionWaiters.delete(requestId);
        reject(new Error(`결정 대기 시간 초과: ${requestId}`));
      }, decisionTimeoutMs);
      const settle = (decision) => {
        clearTimeout(deadline);
        clearInterval(poller);
        decisionWaiters.delete(requestId);
        resolve(decision);
      };
      decisionWaiters.set(requestId, settle);
      const poller = setInterval(async () => {
        try {
          const status = await httpJson(`/api/decision-requests/${encodeURIComponent(requestId)}/decision`, { token: actorToken });
          if (status.item) {
            settle({ item: status.item, request: { requestId } });
          }
        } catch {
          // 폴링 실패는 다음 주기에 재시도
        }
      }, 1500);
    });
  };

  const createRequest = (payload) => httpJson('/api/decision-requests', {
    method: 'POST',
    token: actorToken,
    body: payload,
  });

  const ackDecision = (decisionId) => httpJson(`/api/decisions/${encodeURIComponent(decisionId)}/ack`, {
    method: 'POST',
    token: actorToken,
  });

  // 3. 메일별 체인 처리: triage(루트) → 승인 시 reply(체인) → 승인 시 발송
  const summary = { chains: [], sent: [], skipped: [] };

  try {
    for (const mail of driver.listUnprocessed()) {
      log(`📥 처리 시작: ${mail.subject} (${mail.from})`);
      const triage = await createRequest({
        subjectType: 'email-triage',
        subject: {
          title: `메일 분류: ${mail.subject}`,
          summary: mail.body,
          payload: { from: mail.from, subject: mail.subject, proposedAction: mail.proposedAction },
        },
      });
      const triageDecision = await awaitDecision(triage.item.requestId);
      await ackDecision(triageDecision.item.decisionId);

      if (triageDecision.item.decision !== 'approve') {
        summary.skipped.push({ mailId: mail.id, stage: 'triage', decision: triageDecision.item.decision });
        driver.markProcessed(mail.id);
        log(`⏭ 분류 단계에서 중단(${triageDecision.item.decision}): ${mail.subject}`);
        continue;
      }

      const reply = await createRequest({
        subjectType: 'email-reply',
        parentRequestId: triage.item.requestId,
        subject: {
          title: `답장 승인: ${mail.subject}`,
          summary: mail.draftReply,
          payload: { to: mail.from, subject: `Re: ${mail.subject}`, draft: mail.draftReply },
        },
      });
      const replyDecision = await awaitDecision(reply.item.requestId);
      await ackDecision(replyDecision.item.decisionId);

      if (replyDecision.item.decision === 'approve') {
        driver.send({ to: mail.from, subject: `Re: ${mail.subject}`, body: mail.draftReply });
        summary.sent.push({ mailId: mail.id, to: mail.from });
        log(`📤 발송 완료: Re: ${mail.subject} → ${mail.from}`);
      } else {
        summary.skipped.push({ mailId: mail.id, stage: 'reply', decision: replyDecision.item.decision });
        log(`⏭ 답장 반려(${replyDecision.item.decision}): ${mail.subject}`);
      }

      driver.markProcessed(mail.id);
      summary.chains.push({
        mailId: mail.id,
        triageRequestId: triage.item.requestId,
        replyRequestId: reply.item.requestId,
      });
    }
  } finally {
    ws.close();
  }

  return summary;
}
