# iOS 2단계 — Capacitor WKWebView 네이티브 랩

- 날짜: 2026-07-21
- 상태: 구현 진행
- 선행: `2026-07-21-ios-launch-track-design.md` (0단계 서버 주소 런타임 설정 + 1단계 PWA, PR #26 머지 완료)
- 전제: Apple 개발자 계정 보유 확인(2026-07-21). 앱스토어/TestFlight 배포까지 정식 범위.

## 1. 배경과 목표

PWA(1단계)로 iPad Safari standalone 실행은 확보했지만, 다음 세 가지는 네이티브 랩이 필요하다.

1. **앱스토어/TestFlight 배포**: 설치·업데이트 배포 채널.
2. **네이티브 햅틱**: iOS Safari는 `navigator.vibrate` 미지원 — 현재 `vibrate()`가 조용히 무시된다. Capacitor Haptics로 실제 진동 제공.
3. **Bonjour 서버 발견**: PC의 maestro-server를 mDNS로 찾아 주소 무입력 연결.

**비범위 (Out of scope)**
- Android 플랫폼 (요청 시 별도).
- CI에서의 서명/배포 자동화(fastlane 등) — 서명·업로드는 로컬 Xcode 수동 절차로 문서화.
- 오프라인 모드 — 네이티브 랩에서도 라이브 서버 연결 필수(0~1단계와 동일).
- 서버 기능 변경 — mDNS 광고 추가(§5.1)는 허용하되 기존 프로토콜/API는 불변.

**불변 조건**
- 웹 배포(dev/Pages/PWA) 동작 불변: `npm run qa` + e2e 그대로 통과.
- 기존 `dist` 웹 빌드(base `/maestro-coding/`)는 그대로. 네이티브용 빌드는 별도 모드.

## 2. 검증 환경 (이 작업 환경에서 확인 가능한 것)

- Capacitor 8.4.2 (core/cli/ios), @capacitor/haptics 8.0.2, capacitor-zeroconf 4.0.0(peer: core >=7 → 8 호환), bonjour-service 1.4.3 — npm 레지스트리 확인 완료.
- Xcode 26.6 + iPad 시뮬레이터(iPad Pro 11/13-inch M5, iPad mini) 사용 가능.
- CocoaPods 미설치 → **SPM(Swift Package Manager) 통합** 사용 (`cap add ios --packagemanager SPM`).
- 자동 검증 라인: `npm run qa` + `npm run test:e2e`(웹 회귀) + `xcodebuild ... -sdk iphonesimulator build`(네이티브 컴파일). 실기기 햅틱·Bonjour·TestFlight는 수동 체크리스트(§7).

## 3. 아키텍처 결정

| 항목 | 결정 | 근거 |
|---|---|---|
| appId / appName | `kr.selim.maestro` / `Maestro` | 사용자 도메인(selim.kr) 역순 |
| 패키지 매니저 | SPM | CocoaPods 미설치, Capacitor 8 공식 지원 |
| `ios/` 디렉터리 | 커밋 | Capacitor 표준. 재현 가능한 빌드 |
| 네이티브 웹 빌드 | `CAPACITOR_BUILD=1 vite build` → `base: './'` | 네이티브는 `capacitor://localhost/` 루트에서 로드 — `/maestro-coding/` base면 자산 404 |
| webDir | `dist` | 기존 빌드 산출물 재사용, 모드만 분기 |
| ATS/권한 | `NSAllowsLocalNetworking` + `NSLocalNetworkUsageDescription` + `NSBonjourServices: _maestro._tcp` | LAN `ws://` cleartext + iOS 14+ 로컬 네트워크 권한 + mDNS 브라우징 |
| 네이티브 감지 | `isNativeShell()` = `window.Capacitor?.isNativePlatform?.() === true` | 플러그인 import 없이 감지 — 웹 번들 오염 없음 |

## 4. 네이티브 셸에서의 서버 주소 동작 (0단계 접점 보정)

네이티브에서 `location.hostname`은 `localhost`(capacitor 스킴)다. 0단계 로직을 그대로 두면 두 가지가 깨진다:

1. `getDefaultWsUrl()` → `ws://localhost:8080` = 아이패드 자신 → 항상 실패.
2. `shouldAutoOpenServerSetup()` → localhost는 dev 예외라 자동 오픈 안 됨 → 사용자가 진입점을 못 찾음.

**보정 규칙 (server-address.js)**
- `isNativeShell()`이 참이면:
  - `shouldAutoOpenServerSetup`: 저장 주소 없으면 **무조건 true** (localhost 예외 무시).
  - `getDefaultWsUrl`: 스마트 추측 없음 — env/페이지 호스트 대신 `ws://192.168.0.10:8080` 형태의 placeholder를 반환하지 않고 기존 체인을 유지하되, 자동 오픈이 보장되므로 사용자가 입력/발견으로 결정한다.
- 웹(비-네이티브) 경로는 코드 경로가 완전히 동일 — 기존 단위/UI/e2e 회귀로 보장.

## 5. Bonjour 서버 발견

### 5.1 서버 광고 (bonjour-service)
- `maestro-server.js` 기동 시 `_maestro._tcp.local` 서비스(포트=PORT, name=`Maestro (<hostname>)`) 광고.
- 기본 켜짐, `MAESTRO_MDNS=off`로 비활성. 광고 실패(방화벽 등)는 try/catch로 조용히 무시하고 서버 기동에 영향 없음. 종료 시 unpublish.
- 신규 dependency: `bonjour-service` (순수 JS, 네이티브 애드온 없음).

### 5.2 클라이언트 발견 (capacitor-zeroconf, 네이티브 전용)
- ServerAddressPanel에 **`주변 서버 찾기`** 버튼 — `isNativeShell()`일 때만 렌더.
- 탭 → `ZeroConf.watch({ type: '_maestro._tcp.', domain: 'local.' })` 로 스캔(8초), 발견 목록(name, `ws://ip:port`)을 패널에 표시 → 항목 탭 = 주소 입력칸에 채움(저장은 기존 저장 버튼 — 단일 저장 경로 유지).
- 플러그인 로드는 dynamic import — 웹 경로에서 평가되지 않게 하고, 실패 시(플러그인 미탑재/권한 거부) 에러 문구 + 수동 입력 폴백.
- **리스크 폴백**: capacitor-zeroconf가 Cap 8에서 네이티브 빌드를 깨면 이 서브페이즈만 드롭하고 수동 입력 유지(0단계 UX가 이미 폴백).

## 6. 네이티브 햅틱 브릿지

- 현재 `HAPTIC_PATTERNS`는 ms 배열(진동/휴지 교대): PERFECT `[15]`, LATE `[40,30,40]` 등.
- **순수 매핑 함수** `mapPatternToNativePlan(pattern)` (haptics.js 내): 배열 → `[{ kind: 'impact', style: 'LIGHT'|'MEDIUM'|'HEAVY' }, { kind: 'delay', ms }, ...]`
  - 진동 세그먼트 ≤10ms → LIGHT, ≤25ms → MEDIUM, 그 외 → HEAVY. 휴지 세그먼트 → delay.
- `vibrate(pattern)` 분기: `isNativeShell()`이면 `@capacitor/haptics`를 dynamic import해 plan 실행(impact + setTimeout 체인), 아니면 기존 `navigator.vibrate` 경로 그대로.
- 토글(`maestro.haptics`)·시그니처·호출부는 불변. 매핑 함수는 vitest로 단위 테스트.
- `@capacitor/haptics`는 dependencies에 추가하되 dynamic import라 웹 초기 번들에 실리지 않음.

## 7. 배포 (문서화 + 스크립트)

- npm 스크립트: `ios:build`(네이티브 모드 빌드 + `cap sync ios`), `ios:open`(`cap open ios`), `ios:run`(시뮬레이터 실행).
- USER_GUIDE.md에 "iPad 네이티브 앱" 섹션: 요구사항(Xcode), 시뮬레이터 실행, 실기기 서명(Team 선택), TestFlight 업로드 절차, 로컬 네트워크 권한 팝업 안내.
- 수동 검증 체크리스트: 실기기 설치 → 로컬 네트워크 권한 허용 → 주변 서버 찾기 → 연결 → 승인 플로우 → 햅틱 체감.

## 8. 테스트 전략

| 레이어 | 내용 |
|---|---|
| 단위(vitest) | `isNativeShell` 게이트/기본값 보정(§4), `mapPatternToNativePlan` 매핑 표(§6) |
| UI(RTL) | 네이티브 모킹(`window.Capacitor`) 시 패널 자동 오픈 + `주변 서버 찾기` 노출, 웹에서는 미노출 |
| e2e(playwright) | 기존 시나리오 회귀 + 웹에서 `주변 서버 찾기` 버튼 부재 어서션 (e2e 동시 갱신 원칙) |
| 네이티브 컴파일 | `xcodebuild -project ios/App/App.xcodeproj -scheme App -sdk iphonesimulator build` |
| 서버 | 기존 `npm run test:server` 회귀(mDNS는 광고 실패해도 기동 무영향임을 테스트) |

## 9. 리스크순 로드맵

| 순서 | 작업 | 리스크 | 이유 |
|---|---|---|---|
| 1 | Capacitor 스캐폴드(SPM) + 네이티브 빌드 모드(base './') + ATS/권한 plist + xcodebuild 검증 | **고** | 전체의 기반. SPM/Cap8/Xcode26 조합 검증이 최우선 |
| 2 | `isNativeShell()` + 서버 주소 게이트/기본값 보정 + 테스트 | 중 | 0단계 접점 — 웹 회귀 위험 |
| 3 | 네이티브 햅틱 브릿지 + 매핑 단위 테스트 | 중 | 독립적, 매핑은 순수함수 |
| 4 | Bonjour 서버 광고 + 클라 발견 + 패널 통합 | 중~고 | 플러그인 호환 리스크 — 폴백 정의됨 |
| 5 | 배포 스크립트/문서 + 수동 체크리스트 | 저 | 정적 산출물 |

## 10. 자율 진행 중 내린 결정 (사용자 확인 포인트)

1. appId `kr.selim.maestro` — 변경 원하면 Xcode/config 한 곳 수정.
2. CocoaPods 대신 SPM — 로컬 환경에 CocoaPods 미설치, Capacitor 8 공식 지원.
3. 서버 mDNS 광고 기본 켜짐(`MAESTRO_MDNS=off`로 끔) — 발견 UX를 기본 제공, 실패는 무해.
4. Bonjour 발견 결과는 입력칸 채움까지만(자동 저장 안 함) — 저장 경로 단일화.
5. Android는 이번 범위에서 제외.
