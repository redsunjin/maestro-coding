# iOS 런칭 트랙 — 서버 주소 런타임 설정 + PWA 설치 지원

- 날짜: 2026-07-21
- 상태: 승인 대기 → 구현
- 범위: 0단계(서버 주소 런타임 설정), 1단계(PWA). 2단계(Capacitor 랩)는 **별도 스펙**으로 분리하며 본 문서에서는 확장점만 명시한다.

## 1. 배경과 목표

Maestro 대시보드를 아이패드(Safari)에서 보조 컨트롤 데크로 쓰려면 두 가지가 필요하다.

1. **서버 주소 런타임 설정**: 현재 WS 주소는 `src/constants/maestro.js`의 `WS_URL`이 빌드타임(`VITE_WS_URL`)에 고정된다. 아이패드는 PC와 다른 기기이므로 `ws://<PC-IP>:8080`을 런타임에 입력/저장/변경할 수 있어야 한다.
2. **PWA 설치**: iPad Safari '홈 화면에 추가' 시 전체화면 standalone으로 뜨도록 manifest + apple 메타태그 + 아이콘을 추가한다.

**비범위 (Out of scope)**
- 서비스워커/오프라인: 서버는 로컬 git merge 실행자라 라이브 연결이 필수이고, LAN http에서는 서비스워커가 동작하지 않는다.
- Capacitor WKWebView 랩(앱스토어, 네이티브 햅틱, Bonjour): 별도 스펙.
- 서버 측 변경: 앱은 클라이언트 전용. `maestro-server.js`는 손대지 않는다.

**불변 조건**
- 기존 로컬 dev 흐름(localhost 기본값, `npm run dev`, Mock 모드)은 그대로 동작한다.
- e2e가 쓰는 `VITE_WS_URL` env 주입(playwright.config.js)은 계속 유효하다.

## 2. 0단계 — 서버 주소 런타임 설정

### 2.1 주소 해석 우선순위

```
localStorage('maestro.server.ws-url')   ← 사용자가 저장한 값 (최우선)
  → import.meta.env.VITE_WS_URL         ← 빌드타임/dev 주입 (기존 동작)
  → ws://<location.hostname>:8080       ← 스마트 기본값
```

스마트 기본값 근거: 대시보드는 서버와 같은 PC에서 서빙되는 게 표준 구성(`maestro-server.js`가 `.env`에 자기 호스트를 쓴다)이므로, 아이패드가 `http://192.168.x.x:5173`으로 접속하면 `ws://192.168.x.x:8080`이 대부분 정답이다. localhost dev에서는 `location.hostname`이 `localhost`라 기존 기본값과 동일하다.

### 2.2 입력 정규화 규칙 (`normalizeWsUrlInput`)

| 입력 | 결과 |
|---|---|
| `192.168.0.5` | `ws://192.168.0.5:8080` (포트 생략 시 8080) |
| `192.168.0.5:9000` | `ws://192.168.0.5:9000` |
| `ws://host:8080` / `wss://host` | 그대로 (wss는 포트 생략 시 443 유지, 명시 안 함) |
| `http://host:8080` | `ws://host:8080` (https→wss) |
| 공백/경로/쿼리 포함, 잘못된 형식 | `null` (에러 메시지 표시) |

정규화 결과는 항상 `ws(s)://host[:port]` 형태의 origin 문자열이며, 기존 훅들의 `new URL(wsUrl)` 기반 HTTP API 파생 로직과 호환된다.

### 2.3 연결 테스트 (`testWsConnection`)

- `WebSocket`을 열어 `open` 이벤트 수신 시 성공(즉시 close), `error`/`close`/타임아웃(4초) 시 실패를 반환하는 Promise 유틸.
- 서버 프로토콜 메시지는 보내지 않는다(연결 수립 여부만 확인 — 현재 서버는 무토큰 대시보드 연결을 허용).

### 2.4 UI

**ServerAddressPanel (모달 오버레이)**
- 필드: 서버 주소 입력(placeholder `ws://192.168.0.10:8080`, 현재 적용 주소로 prefill), 힌트 텍스트.
- 버튼: `연결 테스트`(결과를 성공/실패/진행중으로 인라인 표시), `저장`(정규화 실패 시 에러, 성공 시 localStorage 저장 + 패널 닫기), `기본값 복원`(저장값 삭제 → 우선순위 기본값으로 복귀), `닫기`.
- 저장 시 연결 테스트를 강제하지 않는다(서버가 꺼져 있어도 주소는 저장 가능). 테스트는 명시적 버튼으로만.

**헤더 진입점**
- `MaestroHeader`에 `서버 <host:port>` 버튼 추가(패널 컨트롤 그룹과 함께 배치, 1480px 미만에서는 기존 Panels 오버플로 메뉴 규칙을 따르지 않고 항상 노출 — 연결 문제 시 첫 진입점이므로). `wsStatus`에 따라 색상(connected=green, connecting=yellow, disconnected=gray).

**첫 실행 자동 오픈 게이트**
- 조건: (a) 저장된 주소 없음 **그리고** (b) 페이지 호스트가 localhost/127.0.0.1이 아님 **그리고** (c) 마운트 시 해석된 기본 주소의 silent 연결 테스트 실패.
- localhost(개발 흐름)에서는 어떤 경우에도 자동 오픈하지 않는다 → dev/Mock 흐름 불변.
- 자동 오픈은 세션당 1회(닫으면 다시 뜨지 않음).

### 2.5 반응성(리액티브 주소) 아키텍처

- 새 훅 `useServerAddress()`: `{ wsUrl, saveWsUrl(input), resetWsUrl(), lastSaveError }` 반환. `wsUrl`은 React state.
- `App.jsx`: 정적 `WS_URL` import를 제거하고 `useServerAddress()`의 `wsUrl`을 기존 7개 훅(`useApprovalHistory`, `useProjectRegistryOps`, `useWorkSessions`, `useWorkRequests`, `useAgentRegistry`, `useAutoApproveOps`, `useMaestroRealtime`)에 그대로 전달. 각 훅은 이미 `wsUrl`을 파라미터+의존성으로 받으므로 값 변경 시 자연스럽게 재계산된다.
- 주소 변경 시 재연결: `wsUrl`이 바뀌면 App의 effect가 `disconnectWebSocket()` 후, 연주 중(`isPlaying`)이면 `connectWebSocket()`을 재호출한다.
- `src/constants/maestro.js`의 `WS_URL` export는 제거하고 해석 로직을 `src/utils/server-address.js`로 이동(사용처는 App.jsx뿐임을 확인).

### 2.6 새 파일

| 파일 | 역할 |
|---|---|
| `src/utils/server-address.js` | 스토리지 키, `normalizeWsUrlInput`, `getDefaultWsUrl`, `resolveInitialWsUrl`, `testWsConnection` |
| `src/utils/server-address.test.js` | 정규화/우선순위/연결 테스트 단위 테스트 |
| `src/hooks/useServerAddress.js` | 리액티브 주소 상태 + 저장/복원 |
| `src/components/maestro/ServerAddressPanel.jsx` | 설정 모달 |
| `src/App.server-address.ui.test.jsx` | 패널 열기/저장/테스트/자동 오픈 게이트 UI 테스트 |

## 3. 1단계 — PWA

### 3.1 산출물

- `public/manifest.webmanifest`: `name: "Maestro Workspace"`, `short_name: "Maestro"`, `start_url`/`scope`: `/maestro-coding/`(vite base 고정값), `display: standalone`, `orientation: landscape`(iOS는 무시하지만 안드로이드 대비), `background_color`/`theme_color`: `#111827`(gray-900), icons 192/512 + maskable 512.
- `public/icons/`: `apple-touch-icon.png`(180), `icon-192.png`, `icon-512.png`, `icon-512-maskable.png`. 생성은 `scripts/generate-pwa-icons.mjs`(기존 devDependency인 Playwright chromium으로 SVG 렌더 → 스크린샷) 1회 실행 후 PNG를 커밋. 스크립트도 커밋해 재생성 가능하게 유지.
- `index.html` head 추가:
  - `<link rel="manifest" href="./manifest.webmanifest">` — 상대 경로 사용. (`%BASE_URL%`는 dev 서버가 base를 중복 접두해 `/maestro-coding/maestro-coding/...`이 되는 것을 구현 중 확인. 상대 경로는 dev에서 base 절대경로로 재작성되고 빌드에서는 그대로 유지되어 양쪽 모두 정상)
  - `<link rel="apple-touch-icon" href="...180png">`
  - `<meta name="apple-mobile-web-app-capable" content="yes">`, `apple-mobile-web-app-status-bar-style: black-translucent`, `apple-mobile-web-app-title: Maestro`, `theme-color: #111827`
  - viewport에 `viewport-fit=cover` 추가
- `src/index.css`: `@media (display-mode: standalone)`에서 `env(safe-area-inset-*)` 패딩(홈 인디케이터/노치 영역 침범 방지). 기존 레이아웃에는 영향 없음.

### 3.2 서비스워커 없음의 의미

manifest만으로 iOS '홈 화면에 추가' + standalone 전체화면은 동작한다(iOS는 SW 없이도 A2HS 가능). 오프라인 캐시는 요구사항이 아니며 LAN http에서는 SW 등록 자체가 불가하므로 등록 코드를 넣지 않는다.

## 4. 테스트 전략 (TDD)

- **단위(vitest)**: `server-address.test.js` — 정규화 표, 우선순위(`vi.stubEnv` + localStorage), `testWsConnection`(모의 WebSocket으로 open/error/timeout 3경로).
- **UI(vitest + RTL)**: `App.server-address.ui.test.jsx` — 헤더 버튼 → 패널 오픈, 잘못된 입력 에러, 저장 시 localStorage 기록 + 이후 훅에 새 주소 전파(모의 WebSocket 생성 URL 검증), 기본값 복원, localhost에서 자동 오픈 안 함.
- **e2e(playwright, 기존 스펙 갱신 필수)**: `tests/e2e/maestro.e2e.spec.js`에
  1. 서버 패널 열기 → 현재 주소(`ws://127.0.0.1:18080`) prefill 확인 → `연결 테스트` 성공 표시 확인(테스트 하네스 WSS가 이미 떠 있음).
  2. PWA: manifest `<link>` 존재 + fetch 200 + `display: standalone` 파싱, apple 메타태그 존재 확인.
- **검증 커맨드**: `npm run qa`(test + build), `npm run test:e2e`, 태블릿 뷰포트 브라우저 확인.

## 5. 리스크순 로드맵

| 순서 | 작업 | 리스크 | 이유 |
|---|---|---|---|
| 1 | `server-address.js` 유틸 + 단위 테스트 | 중 | 정규화/우선순위가 전체 기능의 기반 |
| 2 | App/훅 리액티브 `wsUrl` 리팩터 + `useServerAddress` | **고** | 7개 훅 전파, stale closure/재연결 회귀 가능성 — 가장 먼저 검증 |
| 3 | ServerAddressPanel + 헤더 통합 + 첫 실행 게이트 + UI 테스트 | 중 | UX 신규 표면 |
| 4 | e2e 갱신 (서버 패널 플로우) | 중 | 회귀 안전망 |
| 5 | PWA(manifest/메타/아이콘/safe-area) + e2e 어서션 + USER_GUIDE 문서화 | 저 | 정적 산출물 위주 |

## 6. 2단계(Capacitor) 확장점 메모 — 별도 스펙에서 다룸

- `src/utils/haptics.js`의 `vibrate()`는 이미 미지원 환경에서 조용히 무시 → Capacitor 네이티브 햅틱 브릿지를 같은 시그니처로 주입할 수 있는 확장점.
- 본 스펙의 `useServerAddress`는 Bonjour 발견 결과를 `saveWsUrl()`로 주입하는 진입점이 된다.

## 7. 자율 진행 중 내린 결정 (사용자 확인 포인트)

1. 스마트 기본값으로 `ws://<페이지 호스트>:8080`을 채택 — iPad에서 대부분 무입력 연결 성공. (거부 시: 항상 입력 화면)
2. 첫 실행 자동 오픈은 "비-localhost + 저장값 없음 + 기본값 연결 실패"에서만 — dev 흐름 보호 우선.
3. 저장과 연결 테스트를 분리(서버 꺼짐 상태에서도 주소 저장 허용).
4. 아이콘은 Playwright 렌더 스크립트로 생성 후 PNG 커밋(신규 의존성 0).
