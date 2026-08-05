# Maestro Workflow 이메일 커넥터 데모 설계 (목 드라이버)

- 날짜: 2026-08-04
- 상태: 확정 (사용자: 목 드라이버 데모 먼저 — IMAP/Gmail은 드라이버 교체로 후속)
- 범위: `workflow/examples/` + `workflow/tests/` (공개 계약만 사용하는 참조 클라이언트)

## 0. 목표

비전 §4(d)의 이메일 업무 루프 전체를 실서버로 증명한다:
받은편지함 → email-triage 요청(체인 루트) → 운영자 승인 → email-reply
요청(체인 연결, 초안 payload) → 운영자 승인 → **발송 실행(드라이버)** → ack.
Workflow 서버는 무변경 — 커넥터는 기존 계약(actor 등록·요청·WS 구독·ack)만 쓴다.

## 1. 구조

- `workflow/examples/email-connector/lib.mjs`:
  `runEmailConnector({ serverUrl, serverToken, actorId, driver, log, decisionTimeoutMs })`
  → 처리 요약 `{ chains, sent, skipped }` 반환. 드라이버 인터페이스:
  `listUnprocessed()` / `send({ to, subject, body })` / `markProcessed(id)`.
- `mockInbox.mjs`: 가짜 메일 2통 + 발송 기록(`sent[]`)을 가진 목 드라이버.
- `connector.mjs`: CLI 래퍼 (`node connector.mjs` — env로 서버/토큰 지정).
- 결정 수신: actor 토큰 WS 구독(WORKFLOW_AUTH → 자기 WORKFLOW_DECIDED)을
  1차로, 폴링(GET .../decision)을 보조로 사용 — 스펙 2026-08-04(actor WS)의
  "WS는 알림, 폴링이 보장" 원칙 그대로.
- 반려(reject/revise) 시: 해당 메일은 발송하지 않고 `skipped`로 기록(체인에
  결정 사유가 남는다). 데모 범위에서 재초안 루프는 생략.

## 2. e2e 테스트 (`workflow/tests/email-connector-demo.test.mjs`)

실서버(엄격 모드)를 띄우고 커넥터를 병행 실행, 테스트가 운영자 역할로
pending 요청을 폴링·승인한다. 단언:

- 메일 2통 → 체인 2개, 각 체인 = [email-triage, email-reply] (chain API 검증)
- 승인 완료 후 목 드라이버 `sent`에 답장 2건, 수신자/제목 일치
- 결정 2×2건 모두 ack 상태(delivery.status)로 종결
- 반려 시나리오 1건: triage 반려 → reply 미생성·발송 0건·skipped 기록

## 3. 비범위

실제 IMAP/Gmail 드라이버(후속 — 인터페이스 동일), 재초안 반복 루프,
대시보드 체인 시각화.
