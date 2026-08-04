# Maestro Workflow actor 토큰 WS 구독 설계

- 날짜: 2026-08-04
- 상태: 확정 (사용자 브레인스토밍 승인)
- 선행: [`2026-08-03-workflow-strict-dashboard-design.md`](2026-08-03-workflow-strict-dashboard-design.md)

## 0. 배경과 목표

엄격 모드 대시보드(PR #40)로 운영자 WS 인증이 도입됐다. 남은 예약 항목 중
**actor 토큰 WS 구독**을 구현한다: actor(에이전트)가 자기 결정 요청의 결과를
폴링 없이 실시간으로 받는다.

- WS는 **알림용**이다. 스냅샷과 전달 보장은 기존 폴링(`GET
  /api/decision-requests/:id/decision`) + ack 체계가 계속 담당한다.
  재연결/늦은 구독 시 밀린 결정의 catch-up 푸시는 하지 않는다(재연결 후
  폴링 1회 권장 — 클라이언트 관례).
- 비범위: 다중 운영자/권한 분리(별도 스펙), catch-up 푸시, 대시보드 UI 변경.

## 1. 프로토콜 (기존 WORKFLOW_AUTH 확장)

첫 메시지 `{"type":"WORKFLOW_AUTH","token":"…"}` 의 토큰을 서버가 판별한다.

| 토큰 | 소켓 스코프 | 수신 범위 |
| --- | --- | --- |
| 서버 토큰 | `operator` | 전체 스트림 (현행 유지) |
| actor 토큰 (레지스트리 매칭) | `actor` | `WORKFLOW_DECIDED` 중 자기 요청만 |
| 불일치 | — | 엄격 모드: close 4401 (현행 유지) |

- 판별 순서: 서버 토큰 → actor 토큰. (서버 토큰과 동일한 문자열의 actor
  토큰은 만들 수 없다고 가정하지 않는다 — 서버 토큰 우선.)
- `WORKFLOW_AUTH_OK` 응답에 스코프를 명시한다:
  `{"type":"WORKFLOW_AUTH_OK","scope":"operator"}` 또는
  `{"type":"WORKFLOW_AUTH_OK","scope":"actor","actorId":"agent_a"}`.
  대시보드는 scope 필드를 무시하므로 하위 호환이다.
- **open 모드**(서버 토큰 미설정): 무인증 소켓은 현행대로 전체 스트림(하위
  호환). 단 actor 토큰으로 인증하면 open 모드에서도 `actor` 스코프를
  적용한다(모드와 무관하게 클라이언트 동작 일관). open 모드에서 빈
  토큰/불일치 토큰의 `WORKFLOW_AUTH`는 현행대로 `operator` 스코프의
  AUTH_OK를 준다.
- 인증 타임아웃(엄격 모드, `MAESTRO_WORKFLOW_WS_AUTH_TIMEOUT_MS`)은 현행 유지.

## 2. 브로드캐스트 스코프 필터

- `broadcast(data, { targetActorId } = {})` 로 확장한다.
  - `WORKFLOW_DECIDED` 브로드캐스트 시 `targetActorId = request.actorId` 를 넘긴다.
  - 그 외 이벤트(`WORKFLOW_REQUEST_CREATED`, `WORKFLOW_HISTORY_APPEND` 등)는
    `targetActorId` 없음.
- 소켓별 수신 규칙:
  - `operator` 스코프(및 open 모드 무인증): 모든 이벤트 수신.
  - `actor` 스코프: `targetActorId === socket.actorId` 인 이벤트만 수신.
    (즉 자기 요청의 `WORKFLOW_DECIDED`만. REQUEST_CREATED/HISTORY는 미수신 —
    다른 actor의 payload가 노출되지 않는다.)

## 3. revoke 시 소켓 정리

`POST /api/actors/:id/revoke` 성공 시 해당 `actorId` 스코프의 WS 소켓을
`close(4401, 'ACTOR_REVOKED')` 로 즉시 닫는다. 폐기된 토큰이 기존 연결로
계속 수신하는 구멍을 막는다.

## 4. 구현 범위

- `workflow/server.js`만 수정: connection 핸들러(토큰 판별 분기 —
  `findActorByToken` 재사용), `broadcast` 필터, revoke 라우트에 소켓 정리 추가.
- `workflow/server/auth.js`, actors.js는 기존 함수 재사용(변경 없음 예상).
- 대시보드(`workflow/src/`)는 변경 없음 (AUTH_OK의 scope 필드는 무시됨).

## 5. 테스트 전략 (`workflow/tests/ws-auth.test.mjs` 확장)

1. actor 토큰 AUTH → `AUTH_OK(scope:'actor', actorId)` 수신.
2. actor 소켓은 자기 요청의 `WORKFLOW_DECIDED`를 받는다.
3. actor 소켓은 남의 `WORKFLOW_DECIDED`·자기 요청의 `WORKFLOW_REQUEST_CREATED`·
   `WORKFLOW_HISTORY_APPEND`를 받지 않는다.
4. revoke 시 해당 actor 소켓이 4401로 닫힌다 (운영자 소켓은 유지).
5. open 모드에서 actor 토큰 인증 시에도 스코프 필터가 적용된다.
6. 서버 토큰 AUTH_OK에 `scope:'operator'`가 포함된다 (기존 테스트 보강).

## 6. 문서

- `workflow/README.md` 엄격 모드 절에 actor 구독 프로토콜 한 단락 추가,
  "알려진 한계"에서 actor WS 구독 항목 제거(다중 운영자만 남김).
- `docs/maestro-workflow/README.md` 범위 요약 한 줄 추가.
