# iOS 로컬 ZeroConf 플러그인 설계 (실기기 Bonjour 활성화)

- 날짜: 2026-08-05
- 상태: 확정 (2026-07 잔여 리스크 항목 — capacitor-zeroconf SPM 미지원 대응)
- 범위: `ios/App/App/`(Swift 2파일 + storyboard 클래스 변경) + docs. JS 무변경.

## 0. 문제

capacitor-zeroconf 4.0.0은 Package.swift가 없어 SPM 빌드에 네이티브가
미탑재 → 실기기에서 `Capacitor.isPluginAvailable('ZeroConf')`가 false,
주변 서버 검색 버튼이 숨겨진다(수동 입력 폴백). 서버 광고(§5.1)와 JS
게이트는 이미 준비되어 있어 네이티브만 채우면 된다.

## 1. 해법 — 앱 타깃 로컬 플러그인 (외부 의존성 0)

- `MaestroZeroConfPlugin.swift`: `CAPPlugin + CAPBridgedPlugin`,
  **jsName "ZeroConf"** — 기존 JS(`registerPlugin('ZeroConf')` 프록시)와
  패널 게이트가 무변경으로 동작.
  - `watch` (CAPPluginReturnCallback, keepAlive): NetServiceBrowser로
    `type`/`domain` 검색, resolve 완료마다
    `{action:'resolved', service:{domain,type,name,port,hostname,ipv4Addresses,ipv6Addresses,txtRecord}}`
    콜백 — 참조 플러그인의 payload 형태를 미러링(패널은 name/port/ipv4만 사용).
    `added/removed` 액션도 동일 형태로 전달.
  - `unwatch` (Promise): 해당 type+domain 브라우저 중지·콜백 해제.
  - 미사용 메서드(register 등)는 구현하지 않는다 — 패널 사용 범위만 (YAGNI).
- `MaestroViewController.swift`: `CAPBridgeViewController` 서브클래스의
  `capacitorDidLoad()`에서 `bridge?.registerPluginInstance(...)` — SPM
  환경에서 앱 타깃 플러그인을 등록하는 표준 경로.
- `Main.storyboard`: 브리지 VC customClass를 MaestroViewController로.
- Info.plist의 `NSBonjourServices(_maestro._tcp)`/로컬 네트워크 문구는 기존
  그대로 사용.

## 2. 검증

- `xcodebuild build` (시뮬레이터 SDK) 통과 — 신규 Swift 컴파일 확인.
- 시뮬레이터 런타임 증명: Mac에서 `MAESTRO_MDNS=on` 서버 실행 → 앱의
  서버 주소 패널에 "주변 서버 (Bonjour)" 버튼이 **나타나고**(게이트 오픈)
  검색 시 호스트 서버가 목록에 잡히는지 스크린샷 기록.
- 실기기 최종 확인은 TestFlight 트랙(앱 레코드 생성 후)과 묶는다.

## 3. 비범위

capacitor-zeroconf 패키지 제거(의존은 JS 프록시용으로 유지), Android,
서비스 광고(서버 쪽은 bonjour-service로 이미 동작).
