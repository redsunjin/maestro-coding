# iOS 2단계 Capacitor 네이티브 랩 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Maestro 대시보드를 Capacitor WKWebView iOS 앱으로 감싸 앱스토어 배포·네이티브 햅틱·Bonjour 서버 발견을 제공한다.

**Architecture:** `ios/` 플랫폼(SPM)을 커밋하고, 네이티브용 웹 빌드는 `CAPACITOR_BUILD=1`로 base만 `./`로 분기. 네이티브 감지는 `isNativeShell()`(window.Capacitor) 하나로 통일 — 서버 주소 게이트 보정·햅틱 브릿지·발견 UI가 모두 이 게이트 뒤에 있어 웹 경로는 불변이다.

**Tech Stack:** Capacitor 8.4.2(SPM), @capacitor/haptics 8, capacitor-zeroconf 4, bonjour-service 1.4, Xcode 26.6.

## Global Constraints

- 웹 배포 불변: `npm run qa` + `npm run test:e2e` 통과 유지. e2e 동시 갱신 필수.
- 기존 웹 빌드 base `/maestro-coding/` 불변, 네이티브 빌드만 `./`.
- appId `kr.selim.maestro`, appName `Maestro`, webDir `dist`.
- CocoaPods 금지(SPM만). 서버 프로토콜/API 불변(mDNS 광고만 추가, `MAESTRO_MDNS=off` 지원).
- 스펙: `docs/superpowers/specs/2026-07-21-ios-capacitor-wrap-design.md`

---

### Task 1: Capacitor 스캐폴드(SPM) + 네이티브 빌드 모드 + 권한 plist + xcodebuild 검증

**Files:**
- Create: `capacitor.config.json`, `ios/`(생성물 커밋)
- Modify: `vite.config.js`(base 분기), `package.json`(deps + `ios:build`/`ios:open`/`ios:run` 스크립트), `ios/App/App/Info.plist`(ATS/로컬네트워크/Bonjour 키)

**Steps:**
- [ ] `npm i @capacitor/core @capacitor/ios && npm i -D @capacitor/cli`
- [ ] `capacitor.config.json`: `{ "appId": "kr.selim.maestro", "appName": "Maestro", "webDir": "dist" }`
- [ ] `vite.config.js`: `base: process.env.CAPACITOR_BUILD ? './' : '/maestro-coding/'`
- [ ] `CAPACITOR_BUILD=1 npm run build` 후 `dist/index.html`이 상대 자산 경로인지 확인
- [ ] `npx cap add ios --packagemanager SPM`
- [ ] Info.plist에 추가: `NSAppTransportSecurity.NSAllowsLocalNetworking=true`, `NSLocalNetworkUsageDescription`, `NSBonjourServices=[_maestro._tcp]`
- [ ] `npx cap sync ios`
- [ ] 검증: `xcodebuild -project ios/App/App.xcodeproj -scheme App -destination 'generic/platform=iOS Simulator' build` → BUILD SUCCEEDED
- [ ] 검증: `npm run build`(웹 모드) 산출물 base가 `/maestro-coding/` 그대로인지 + `npm run qa` PASS
- [ ] Commit: `feat(ios): scaffold Capacitor iOS app with SPM and native build mode`

### Task 2: `isNativeShell()` + 서버 주소 게이트 보정 (TDD)

**Files:**
- Modify: `src/utils/server-address.js`, `src/utils/server-address.test.js`, `src/App.server-address.ui.test.jsx`

**Interfaces:**
- Produces: `isNativeShell() => boolean` (`window.Capacitor?.isNativePlatform?.() === true`)
- `shouldAutoOpenServerSetup`: 네이티브면 저장 주소 없을 때 hostname 무관 true

**Steps:**
- [ ] 실패 테스트: `window.Capacitor` 스텁 시 `isNativeShell()===true`; 네이티브+미저장+hostname 'localhost' → auto open true; 네이티브+저장됨 → false; 웹 경로 기존 표 불변
- [ ] UI 테스트: `window.Capacitor` 모킹 시 마운트 후 패널 자동 오픈(연결 테스트 실패 유도 — MockWebSocket error 경로), 웹 기본 환경에선 자동 오픈 없음(기존 테스트로 커버)
- [ ] 구현 → 전체 `npm run test:ui` PASS
- [ ] Commit: `feat(ios): auto-open server setup in native shell`

### Task 3: 네이티브 햅틱 브릿지 (TDD)

**Files:**
- Modify: `src/utils/haptics.js`, `src/utils/haptics.test.js`
- Modify: `package.json`(`@capacitor/haptics`)

**Interfaces:**
- Produces: `mapPatternToNativePlan(pattern) => Array<{kind:'impact', style:'LIGHT'|'MEDIUM'|'HEAVY'}|{kind:'delay', ms:number}>`
- `vibrate(pattern)`: 네이티브면 plan 실행(dynamic import), 웹이면 기존 navigator.vibrate

**Steps:**
- [ ] 실패 테스트: 매핑 표 — `[15]`→[impact MEDIUM], `[10]`→[impact LIGHT], `[40,30,40]`→[HEAVY, delay 30, HEAVY], `[]`→[], 비배열→[]
- [ ] 구현(임계: ≤10 LIGHT, ≤25 MEDIUM, >25 HEAVY) + vibrate 분기 → PASS
- [ ] Commit: `feat(ios): bridge haptic patterns to native impacts`

### Task 4: Bonjour — 서버 광고 + 네이티브 발견 UI + e2e

**Files:**
- Modify: `maestro-server.js`(mDNS 광고, try/catch, MAESTRO_MDNS=off), `package.json`(`bonjour-service`, `capacitor-zeroconf`)
- Modify: `src/components/maestro/ServerAddressPanel.jsx`(주변 서버 찾기 — 네이티브 전용), `src/App.server-address.ui.test.jsx`, `tests/e2e/maestro.e2e.spec.js`(웹에서 버튼 부재 어서션)

**Steps:**
- [ ] 서버: `_maestro._tcp` 광고(name `Maestro (<hostname>)`, port=PORT), 실패 무해, 종료 시 unpublish. `npm run test:server` PASS 유지
- [ ] 패널: `isNativeShell()`일 때만 `주변 서버 찾기` 버튼 렌더 → dynamic import('capacitor-zeroconf') → 8초 watch → 결과 리스트 탭 시 입력칸 채움. 실패 시 에러 문구
- [ ] UI 테스트: 네이티브 모킹 + `vi.mock('capacitor-zeroconf')`로 발견→입력칸 채움; 웹에선 버튼 부재
- [ ] e2e: 서버 패널 열고 `주변 서버 찾기` 버튼 없음 어서션 추가
- [ ] 검증: `npm run qa` + `npm run test:e2e` + xcodebuild 재빌드(플러그인 추가 후) PASS
- [ ] Commit: `feat(ios): bonjour discovery (server advertise + native scan)`

### Task 5: 배포 스크립트·문서 + 최종 검증

**Files:**
- Modify: `USER_GUIDE.md`(iPad 네이티브 앱 섹션: 시뮬레이터/실기기/TestFlight/권한 팝업), `docs/superpowers/specs/...`(변경사항 반영 시)

**Steps:**
- [ ] USER_GUIDE에 실행·서명·TestFlight 절차 + 수동 검증 체크리스트(스펙 §7)
- [ ] 최종: `npm run qa` && `npm run test:e2e` && xcodebuild simulator build 3종 PASS
- [ ] Commit → PR → CI 확인

## Self-Review 결과
- 스펙 §3~§7 → Task 1~5 매핑 완료, 갭 없음. 네이티브 실기기 검증은 스펙 §7 수동 체크리스트로 위임(플랜 범위 밖 명시).
