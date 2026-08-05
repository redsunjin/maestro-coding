# Maestro Workflow 이메일 프리셋 + 요청 체인 설계

- 날짜: 2026-08-04
- 상태: 확정 (비전 §4(d) 채널 에이전트 구상의 Workflow측 토대 2건)
- 범위: `workflow/` 하위만 (경계 규칙 준수)

## 1. 프리셋 subjectType 2종 (표시 전용 — 서버는 유형을 모름)

`presets.js` `formatPresetHighlight` 확장:

- `email-reply`: payload `{ to, subject, draft }` — label `↩ {to}`,
  detail은 subject(없으면 draft 앞부분). `to` 없으면 null(프리셋 미적용).
- `email-triage`: payload `{ from, subject, proposedAction }` — label
  `✉ {from}`, detail은 proposedAction(없으면 subject). `from` 없으면 null.

## 2. 요청 체인 (`parentRequestId`)

- `createDecisionRequest`가 선택 필드 `parentRequestId`를 받는다.
  존재하지 않는 부모면 `PARENT_REQUEST_NOT_FOUND` (라우트에선 404).
  저장 필드는 항상 존재(`null` 기본).
- `listRequestChain(requestId)`: 루트까지 조상 추적 후 자손 BFS —
  createdAt 오름차순 정렬로 반환. 미존재 요청은 null.
- 라우트 `GET /api/decision-requests/:id/chain` (운영자 토큰):
  `{ items }`. 404 = 요청 없음.
- `REQUEST_CREATED` 이력 엔트리에 `parentRequestId` 포함(체인 감사 추적).
- 영속화는 기존 스토어 직렬화로 자동 포함.

## 3. 대시보드 최소 표시

DecisionSheet에 `parentRequestId`가 있으면 "체인 이전 요청: <id>" 라인 표시.
체인 시각화(레인 묶음)는 후속.

## 4. 테스트

- presets 단위: 2종 하이라이트 + 필수 필드 누락 시 null.
- 서버: 체인 생성(A→B→C) 후 chain 조회가 3건 오름차순, 미존재 부모 404,
  엄격 모드에서 chain 401.
- UI: DecisionSheet 부모 라인 렌더.

## 5. 비범위

커넥터/발송(에이전트 몫), 체인 레인 시각화, actor의 chain 조회(운영자 전용 시작).
