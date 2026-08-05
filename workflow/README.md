# Maestro Workflow

Maestro Harmony 제품군의 범용 승인·결정·이력(system of record) 앱.
코드가 아닌 모든 결정(지출, 외부 발송, …)을 요청받아 사람이 승인/반려하고,
결정을 record-only로 기록·전달한다. **아무것도 실행하지 않는다** (`executorAction`은 항상 `none`).

- 스펙: [`docs/superpowers/specs/2026-07-31-maestro-workflow-subapp-design.md`](../docs/superpowers/specs/2026-07-31-maestro-workflow-subapp-design.md)
- 비전: [`docs/vision/2026-07-21-universal-approval-record-service.md`](../docs/vision/2026-07-21-universal-approval-record-service.md)

## 작업 경계 (player/ 선례 계승)

- 구현은 `workflow/` 아래에서만, 문서는 `docs/maestro-workflow/` 아래에서만.
- 본체 경로(`src/`, `tests/`, `maestro-server.js`, `hooks/`)는 수정하지 않는다.
- 본체 코드를 import하지 않는다 (필요 로직은 복사·일반화).
- 전용 브랜치 `feat/maestro-workflow-foundation`에서 작업한다.

## 실행

    npm install          # workflow/ 안에서
    npm run server       # 결정 서버 (기본 http://127.0.0.1:8090)
    npm run dev          # 대시보드 (기본 http://localhost:5273)
    npm test             # 서버 회귀 + UI 테스트

## 엄격 모드 (서버 토큰)

`MAESTRO_WORKFLOW_SERVER_TOKEN`을 설정하면 운영자 API와 WebSocket 모두 토큰을 요구한다.
대시보드는 401/WS 4401을 만나면 토큰 입력 게이트를 띄우고, 입력값을
localStorage(`maestro-workflow-server-token`)에 저장한 뒤 재연결한다.
WebSocket은 접속 직후 `{"type":"WORKFLOW_AUTH","token":"…"}` 첫 메시지로 인증하며
(`WORKFLOW_AUTH_OK` 응답), 미인가 소켓은 브로드캐스트를 받지 못하고
`MAESTRO_WORKFLOW_WS_AUTH_TIMEOUT_MS`(기본 5000ms) 후 4401로 닫힌다.
끊긴 WS는 1s→2s→4s…(최대 15s) 백오프로 자동 재연결한다 (4401 제외).

actor도 자신의 actorToken으로 같은 `WORKFLOW_AUTH` 핸드셰이크를 쓸 수 있다
(`WORKFLOW_AUTH_OK`에 `scope:"actor"`). actor 소켓은 자기 요청의
`WORKFLOW_DECIDED`만 수신하며(REQUEST_CREATED/HISTORY 미수신), revoke 시
즉시 4401로 닫힌다. WS는 알림용이다 — 스냅샷·전달 보장은 폴링
(`GET /api/decision-requests/:id/decision`) + ack가 담당하므로 재연결 후
폴링 1회를 권장한다.

- 스펙: [`docs/superpowers/specs/2026-08-03-workflow-strict-dashboard-design.md`](../docs/superpowers/specs/2026-08-03-workflow-strict-dashboard-design.md)

## 알려진 한계 (MVP)

- 토큰은 localStorage에 평문 저장된다 — 로컬 신뢰 기기 전제. TLS 없음, 기본
  `HOST=127.0.0.1` 로컬 전용 전제를 유지하라.
- 다중 운영자/권한 분리는 후속 스펙으로 예약한다.
- 채널 에이전트 연동의 Workflow측 토대는 구현됨(2026-08-04): 프리셋
  `email-triage`/`email-reply` 표시, `parentRequestId` 요청 체인 +
  `GET /api/decision-requests/:id/chain`(운영자 토큰). 커넥터(IMAP/발송)
  에이전트 자체는 비범위 — 비전 문서 §4(d) 참조.
