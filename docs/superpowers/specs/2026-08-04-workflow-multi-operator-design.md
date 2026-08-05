# Maestro Workflow 다중 운영자 설계 (운영자 레지스트리 + 신원 기록)

- 날짜: 2026-08-04
- 상태: 확정 (마지막 예약 스펙 — actor 레지스트리 패턴의 운영자판)
- 범위: `workflow/` 하위만

## 0. 목표

단일 서버 토큰 = 운영자 전권이던 모델을 분리한다: **root(서버 토큰)**는
관리 전용으로 물러나고, 결정은 **개별 운영자 토큰**으로 수행하며 신원이
`decidedBy`에 자동 기록된다.

## 1. 권한 모델 (엄격 모드)

| 토큰 | 신원 | 허용 |
| --- | --- | --- |
| 서버 토큰 | `root` | 전부 (관리: actor/운영자 등록·폐기·목록 + 결정·조회) |
| 운영자 토큰 | `operatorId` | 결정·조회 (pending 목록, decide, history, chain) + WS 전체 스트림 |
| actor 토큰 | `actorId` | 현행 유지 (요청 생성, 자기 결정 폴링/ack/WS) |

open 모드(토큰 미설정)는 현행 무인증 동작 유지 — `decidedBy`는 body 값
(없으면 'operator')을 그대로 쓴다.

## 2. 구성요소

- `server/operators.js`: actors.js 미러(heartbeat 없음) — 등록(upsert=토큰
  회전, sha256 해시 저장), findOperatorByToken, revoke(tokenHash null),
  목록. 스토어 `MAESTRO_WORKFLOW_OPERATOR_STORE_PATH`
  (기본 `.maestro-workflow-operators.json`).
- `auth.js` `resolveOperatorAuth(req)`: open → {mode:'open'}, 서버 토큰 →
  {mode:'root', operatorId:'root'}, 운영자 토큰 → {mode:'operator', operatorId},
  그 외 401. 관리 라우트는 기존 `isServerAuthorized`(root 전용) 유지.
- 라우트: `POST /api/operators/register`·`GET /api/operators`·
  `POST /api/operators/:id/revoke` (root 전용, 이력 기록). 운영자급 라우트
  (GET decision-requests, decide, history, chain)는 resolveOperatorAuth로 전환.
- **decidedBy**: 엄격 모드에선 토큰 신원으로 강제(body 위조 무시),
  open 모드는 현행 body 사용.
- WS: WORKFLOW_AUTH 판별 순서 서버 토큰 → **운영자 토큰**(operator 스코프,
  전체 스트림, AUTH_OK에 operatorId) → actor 토큰. 운영자 revoke 시 해당
  소켓 4401(OPERATOR_REVOKED).
- 대시보드: 무변경 — 토큰 게이트에 운영자 토큰을 넣으면 그대로 동작
  (AUTH_OK 추가 필드는 무시됨).

## 3. 테스트 (`tests/operators.test.mjs`)

등록/결정/decidedBy 기록, 위조 decidedBy 무시, 관리 라우트 root 전용,
revoke 후 HTTP 401+WS 4401(루트 소켓 유지), 운영자 WS 전체 스트림 수신,
재시작 후 토큰 유효(영속화), open 모드 무회귀(기존 스위트).

## 4. 비범위

RBAC/승인선, 운영자별 채널 필터, 대시보드 신원 표시 UI.
