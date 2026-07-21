# iOS 런칭 트랙 (서버 주소 런타임 설정 + PWA) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** iPad Safari에서 Maestro 대시보드를 쓸 수 있도록 WS 서버 주소를 런타임에 설정(저장/테스트/변경)하고, '홈 화면에 추가' 시 standalone PWA로 뜨게 한다.

**Architecture:** 주소 해석을 `src/utils/server-address.js`로 모으고(`localStorage > VITE_WS_URL > ws://<page-host>:8080`), `useServerAddress` 훅이 리액티브 `wsUrl`을 App에 공급한다. 기존 7개 훅은 이미 `wsUrl` 파라미터를 받으므로 App에서 정적 `WS_URL`을 상태로 치환하는 것이 핵심 리팩터다. PWA는 manifest + apple 메타태그 + 아이콘(정적 산출물)만으로 구성하며 서비스워커는 없다.

**Tech Stack:** React 19, Vite(base `/maestro-coding/`), vitest+RTL, Playwright.

## Global Constraints

- 기존 로컬 dev 흐름(localhost 기본값, Mock 모드) 불변. localhost에서는 설정 화면 자동 오픈 금지.
- e2e의 `VITE_WS_URL=ws://127.0.0.1:18080` env 주입은 계속 유효해야 함.
- 서버(`maestro-server.js`) 변경 금지. 신규 npm 의존성 금지.
- 스토리지 키 네임스페이스: `maestro.*` (신규 키: `maestro.server.ws-url`).
- e2e(`tests/e2e/maestro.e2e.spec.js`) 동시 갱신 필수. 검증: `npm run qa` + `npm run test:e2e`.
- 스펙: `docs/superpowers/specs/2026-07-21-ios-launch-track-design.md`

---

### Task 1: 서버 주소 유틸 (`server-address.js`) + 단위 테스트

**Files:**
- Create: `src/utils/server-address.js`, `src/utils/server-address.test.js`
- Modify: `src/utils/storage.js` (removeStoredValue 추가)

**Interfaces (Produces):**
- `SERVER_WS_URL_STORAGE_KEY = 'maestro.server.ws-url'`
- `normalizeWsUrlInput(input: string) => string|null`
- `getDefaultWsUrl() => string`
- `resolveInitialWsUrl() => string`
- `formatWsUrlLabel(wsUrl: string) => string` (예: `192.168.0.5:8080`)
- `shouldAutoOpenServerSetup({ hasStoredWsUrl, hostname }) => boolean`
- `testWsConnection(url, { timeoutMs = 4000 } = {}) => Promise<{ ok, error }>`
- `removeStoredValue(key)` (storage.js)

- [ ] **Step 1: 실패하는 테스트 작성** — `src/utils/server-address.test.js`

정규화 표(호스트만/호스트:포트/ws/wss/http/https/경로·쿼리·빈값 거부), 우선순위(localStorage > `vi.stubEnv('VITE_WS_URL')` > `ws://localhost:8080`), 라벨, 자동 오픈 게이트, `testWsConnection` 3경로(open 성공 / error 실패 / fake timer 타임아웃)를 검증한다. WebSocket은 `vi.stubGlobal('WebSocket', FakeWebSocket)`으로 대체.

- [ ] **Step 2: 실패 확인** — `npx vitest run src/utils/server-address.test.js` → FAIL (모듈 없음)
- [ ] **Step 3: 구현** — `normalizeWsUrlInput`: 스킴 없으면 `ws://` 부여, `http→ws`/`https→wss`, `new URL` 파싱, 경로/쿼리/해시 있으면 null, ws에서 포트 생략 시 `:8080` 부여. `getDefaultWsUrl`: `import.meta.env.VITE_WS_URL || ws://<location.hostname>:8080 || ws://localhost:8080`. `resolveInitialWsUrl`: 저장값 normalize 성공 시 사용. `shouldAutoOpenServerSetup`: 저장값 없음 && hostname이 localhost/127.0.0.1/::1/빈값 아님.
- [ ] **Step 4: 통과 확인** — 같은 명령 → PASS
- [ ] **Step 5: Commit** — `feat(server-address): add runtime ws url resolution utils`

### Task 2: `useServerAddress` 훅 + App 리액티브 wsUrl 리팩터

**Files:**
- Create: `src/hooks/useServerAddress.js`
- Modify: `src/App.jsx` (WS_URL import 제거 → 훅 사용, 주소 변경 시 재연결 effect), `src/constants/maestro.js` (WS_URL export 제거)

**Interfaces:**
- Consumes: Task 1 유틸 전부
- Produces: `useServerAddress() => { wsUrl, hasStoredWsUrl, saveWsUrl(input) => {ok, error?, wsUrl?}, resetWsUrl() => string }`

- [ ] **Step 1: 훅 구현 + App 치환** — App의 7개 훅 호출부 `wsUrl: WS_URL` → `wsUrl`. 재연결 effect: `prevWsUrlRef` 비교 후 변경 시 `disconnectWebSocket()`, `isPlayingRef.current`면 `connectWebSocket()`.
- [ ] **Step 2: 기존 회귀 확인** — `npm run test:ui` 전체 → PASS (기존 UI 테스트가 리팩터 안전망)
- [ ] **Step 3: Commit** — `refactor(app): make ws url reactive via useServerAddress`

### Task 3: ServerAddressPanel + 헤더 진입점 + 첫 실행 게이트 + UI 테스트

**Files:**
- Create: `src/components/maestro/ServerAddressPanel.jsx`, `src/App.server-address.ui.test.jsx`
- Modify: `src/components/maestro/MaestroHeader.jsx` (서버 버튼, `data-testid="server-address-toggle"`), `src/App.jsx` (패널 상태/렌더, 자동 오픈 effect)

**Interfaces:**
- Panel props: `{ isOpen, currentWsUrl, hasStoredWsUrl, onSave(input)=>{ok,error?}, onReset, onClose }`
- 접근성 이름: 입력 `서버 주소 입력`, 버튼 `연결 테스트`/`서버 주소 저장`/`기본 주소 복원`/`닫기`, `data-testid="server-address-panel"`, 테스트 결과 `data-testid="server-address-test-result"`
- Header props 추가: `serverAddressLabel, isServerPanelOpen, onToggleServerPanel`

- [ ] **Step 1: 실패하는 UI 테스트 작성** — appUiHarness 사용: (a) 헤더 `서버 주소 설정` 버튼 → 패널 오픈, 현재 주소 prefill (b) 잘못된 입력 저장 → 에러 노출, localStorage 미기록 (c) 유효 입력 저장 → `maestro.server.ws-url` 기록 + 패널 닫힘 + 이후 `지휘 시작` 시 MockWebSocket이 새 주소로 생성 (d) `연결 테스트` → MockWebSocket 자동 open으로 `연결 성공` 표시 (e) `기본 주소 복원` → 키 삭제.
- [ ] **Step 2: 실패 확인** — `npx vitest run src/App.server-address.ui.test.jsx` → FAIL
- [ ] **Step 3: 구현** — 패널(고정 오버레이 z-[70], 카드 스타일은 RejectSheet/Bach 패널 톤), 헤더 버튼(wsStatus 색상, 1480px 미만에서도 항상 노출), App 자동 오픈 effect(`shouldAutoOpenServerSetup` && silent `testWsConnection` 실패 시 1회 오픈).
- [ ] **Step 4: 통과 확인** — `npm run test:ui` 전체 PASS
- [ ] **Step 5: Commit** — `feat(server-address): add runtime server address panel with connection test`

### Task 4: e2e 갱신 — 서버 주소 패널 플로우

**Files:**
- Modify: `tests/e2e/maestro.e2e.spec.js`

- [ ] **Step 1: 테스트 추가** — 새 test: 패널 열기 → 입력값 `ws://127.0.0.1:18080` prefill 확인(env 우선순위 검증) → `연결 테스트` 클릭 → `server-address-test-result`에 `연결 성공` → 닫기. 하네스 WSS(포트 18080)가 이미 떠 있으므로 실제 성공 경로 검증.
- [ ] **Step 2: 실행** — `npm run test:e2e` → PASS (기존 시나리오 포함)
- [ ] **Step 3: Commit** — `test(e2e): cover server address panel flow`

### Task 5: PWA — manifest/메타태그/아이콘/safe-area + e2e + 문서

**Files:**
- Create: `public/manifest.webmanifest`, `public/icons/*.png`(180/192/512/512-maskable), `scripts/generate-pwa-icons.mjs`
- Modify: `index.html`(manifest link, apple 메타, viewport-fit=cover), `src/index.css`(standalone safe-area), `tests/e2e/maestro.e2e.spec.js`(PWA 어서션), `USER_GUIDE.md`(iPad 섹션)

- [ ] **Step 1: 아이콘 생성 스크립트** — `@playwright/test`의 chromium으로 SVG 렌더 → 4개 PNG 스크린샷. 실행: `node scripts/generate-pwa-icons.mjs` → PNG 커밋.
- [ ] **Step 2: manifest + index.html** — 스펙 3.1 값 그대로. `%BASE_URL%` 치환이 dev/build 모두 동작하는지 `npm run build` 후 `dist/index.html`과 dev 응답으로 확인, 미동작 시 리터럴 `/maestro-coding/` 사용.
- [ ] **Step 3: e2e 어서션 추가** — manifest link fetch 200 + `display: standalone`, apple-mobile-web-app-capable 메타, apple-touch-icon 존재.
- [ ] **Step 4: 검증** — `npm run qa` && `npm run test:e2e` → PASS
- [ ] **Step 5: 문서** — USER_GUIDE.md에 "iPad에서 사용하기"(주소 설정 + 홈 화면 추가) 추가.
- [ ] **Step 6: Commit** — `feat(pwa): add manifest, apple meta tags and icons for iPad standalone`

---

## Self-Review 결과

- 스펙 §2 전체 → Task 1–4, §3 → Task 5, §4 테스트 전략 → 각 Task의 TDD 스텝에 반영. 갭 없음.
- 타입/네이밍 일관성: `useServerAddress` 반환 시그니처와 Panel props를 Interfaces 블록에 고정.
