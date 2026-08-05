# Maestro Workflow 체인 시각화 설계 (대시보드)

- 날짜: 2026-08-05
- 상태: 확정 (이메일 유스케이스 잔여 — 운영자가 이전 단계를 보고 결정)
- 범위: `workflow/src/` 하위만 (서버 무변경 — 기존 chain API 사용)

## 1. 동작

- **ChannelBoard 카드**: `parentRequestId`가 있는 요청에 "🔗 체인" 배지 표시.
- **DecisionSheet**: 선택한 요청이 체인에 속하면(App이 `chain` prop 전달)
  상단에 컴팩트 타임라인 표시 — 체인의 각 요청을 순서대로
  `subjectType · title · 상태(결정됨/대기)`로, 현재 요청은 강조.
  체인 로드 실패 시 조용히 생략(기존 "체인 이전 요청: id" 라인 유지).
- **App**: 요청 선택 시 `parentRequestId`가 있으면 `fetchRequestChain`으로
  체인을 불러 sheet에 전달. 없으면 즉시 열림(로딩 블로킹 없음 — 체인은
  도착하는 대로 표시).

## 2. api.js

`fetchRequestChain(requestId)` → `GET /api/decision-requests/:id/chain`
(기존 토큰 상태 재사용 — 운영자/서버 토큰).

## 3. 테스트

- ChannelBoard: parentRequestId 카드에 배지, 없는 카드엔 없음.
- DecisionSheet: chain prop 타임라인 렌더(순서·현재 강조·상태 라벨).
- App: 체인 요청 선택 시 fetchRequestChain 호출 + sheet에 표시 (mock).

## 4. 비범위

레인 자체를 체인으로 묶는 보드 재배치, 서버 변경, 체인 내 결정 코멘트
전문 표시(타이틀·상태만).
