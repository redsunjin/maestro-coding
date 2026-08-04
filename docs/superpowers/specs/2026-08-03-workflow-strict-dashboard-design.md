# Maestro Workflow 엄격 모드 대시보드 설계 (WS 인증 + 자동 재연결)

- 날짜: 2026-08-03
- 상태: 확정 (README "알려진 한계 (MVP)"에서 후속 스펙으로 예약된 범위)
- 선행: [`2026-07-31-maestro-workflow-subapp-design.md`](2026-07-31-maestro-workflow-subapp-design.md)

## 0. 배경과 목표

Workflow MVP(PR #36)의 문서화된 한계 3종을 해소한다.

1. **대시보드가 open 모드 전용** — `MAESTRO_WORKFLOW_SERVER_TOKEN` 설정(엄격 모드) 시
   운영자 API가 401을 반환하지만 대시보드에 토큰을 넣을 수단이 없다.
2. **WebSocket 브로드캐스트 무인증** — 엄격 모드에서도 아무나 접속해 요청 payload
   전문을 수신할 수 있다.
3. **WS 자동 재연결 없음** — 서버 재시작 시 수동 새로고침 전까지 실시간 갱신이 끊긴다.

비범위(후속 유지): actor 토큰의 WS 구독, 다중 운영자/권한 분리, TLS. 기본
`HOST=127.0.0.1` 로컬 전제는 유지하며, 이 스펙은 같은 머신/신뢰 네트워크 안에서
토큰이 곧 운영자 자격이라는 MVP 모델을 완성하는 것까지만 다룬다.

## 1. 토큰 모드 대시보드

- `workflow/src/lib/api.js`에 모듈 수준 토큰 상태를 둔다:
  - `loadServerToken()` — `localStorage['maestro-workflow-server-token']`에서 복원.
  - `setServerToken(token)` — 상태 갱신 + localStorage 저장(빈 값이면 제거).
  - `getServerToken()` — 현재 토큰 반환.
  - localStorage 접근 실패(사파리 프라이빗 등)는 조용히 무시(메모리 토큰만 사용).
- `requestJson`은 토큰이 있으면 `Authorization: Bearer <token>` 헤더를 붙인다.
- 401 응답이면 던지는 Error에 `code = 'UNAUTHORIZED'`를 부여한다.
- 새 컴포넌트 `TokenGate.jsx`: 전체 화면 오버레이. 토큰 입력(password 타입) +
  "연결" 버튼. App은 `UNAUTHORIZED`를 만나면 게이트를 띄우고, 제출 시
  `setServerToken` → 데이터 재조회 + WS 재연결.
- 저장 위치는 localStorage(iPad 새로고침 유지가 목적). 로컬 신뢰 기기 전제를
  README에 명시한다.

## 2. WS 인증 핸드셰이크 (첫 메시지 방식)

브라우저 WebSocket은 커스텀 헤더를 못 보내므로 첫 메시지 인증을 쓴다. 토큰을
URL 쿼리에 싣는 방식은 로그 유출 위험이 있어 배제한다.

- 클라이언트: 연결 직후 `{"type":"WORKFLOW_AUTH","token":"<서버 토큰|''>"}` 전송.
- 서버(open 모드, 토큰 미설정): 모든 소켓이 즉시 인가 상태. `WORKFLOW_AUTH`가
  오면 토큰 값과 무관하게 `{"type":"WORKFLOW_AUTH_OK"}`로 응답(클라 로직 단일화).
- 서버(엄격 모드):
  - 소켓은 미인가로 시작하며 **미인가 소켓에는 어떤 브로드캐스트도 보내지 않는다**.
  - 올바른 토큰의 `WORKFLOW_AUTH` → 인가 + `WORKFLOW_AUTH_OK` 응답.
  - 틀린 토큰 → `close(4401, 'UNAUTHORIZED')`.
  - `MAESTRO_WORKFLOW_WS_AUTH_TIMEOUT_MS`(기본 5000) 안에 인가되지 못하면
    `close(4401, 'AUTH_TIMEOUT')`.
  - JSON이 아니거나 `WORKFLOW_AUTH`가 아닌 첫 메시지는 무시(타임아웃이 정리).
- 클라이언트 연결 표시(`실시간 연결됨`)는 소켓 open이 아니라 `WORKFLOW_AUTH_OK`
  수신 기준으로 바꾼다.

## 3. WS 자동 재연결

- App의 WS effect를 재연결 루프로 재구성:
  - `onclose` 시 지수 백오프(1s → 2s → 4s … 최대 15s)로 재연결 예약.
  - `WORKFLOW_AUTH_OK` 수신 시 백오프 카운터 리셋 + `reload()`로 끊김 동안의
    스냅샷을 재동기화.
  - close 코드 **4401은 재연결하지 않고** 토큰 게이트를 띄운다(무한 재시도로
    서버를 두드리지 않기 위함).
  - 언마운트 시 예약 타이머 해제 + 소켓 close (정리 후 재연결 금지 플래그).
- 토큰 게이트 제출 시 effect를 재실행(`wsEpoch` state 증가)해 즉시 재접속한다.

## 4. 테스트 전략

- 서버(`workflow/tests/ws-auth.test.mjs`, node:test + ws 클라이언트):
  - open 모드: 무인증 소켓도 브로드캐스트 수신, `WORKFLOW_AUTH` → `AUTH_OK`.
  - 엄격 모드: 올바른 토큰 → `AUTH_OK` + 브로드캐스트 수신.
  - 엄격 모드: 틀린 토큰 → 4401 close.
  - 엄격 모드: 미인가 소켓은 브로드캐스트 미수신, 타임아웃(테스트는 200ms로
    단축) 후 4401 close.
  - `helpers.mjs`의 `startServer`에 `extraEnv` 파라미터 추가.
- UI(vitest):
  - `api.token.test.js` — 헤더 부착, 401 → `code==='UNAUTHORIZED'`, localStorage
    저장/복원/제거.
  - `TokenGate.test.jsx` — 입력값으로 `onSubmit` 호출, 빈 값 제출 불가.
  - `App.auth.test.jsx` — UNAUTHORIZED 조회 실패 시 게이트 표시, 제출 시
    `setServerToken` + 재조회.
  - `App.reconnect.test.jsx` — fake timers로 close → 백오프 후 재연결,
    `AUTH_OK` 기준 연결 표시, 4401은 재연결 없이 게이트 표시.
- 본체 e2e(Playwright)는 본체 UI 무변경이므로 갱신 대상 아님 (경계: `workflow/`
  하위만 수정).

## 5. 문서

- `workflow/README.md` — "알려진 한계 (MVP)"에서 해소된 3종을 제거하고, 남는
  전제(로컬 신뢰 기기 localStorage 저장, actor WS 구독 없음, TLS 없음)로 갱신.
- `workflow/.env.example` — `MAESTRO_WORKFLOW_WS_AUTH_TIMEOUT_MS` 추가.
- `docs/maestro-workflow/README.md` — MVP 범위 요약 갱신.
