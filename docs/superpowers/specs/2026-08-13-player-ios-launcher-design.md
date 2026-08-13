# Player iOS 런처 설계 (Coding/Player 단일 앱 진입점)

- 날짜: 2026-08-13
- 상태: 확정 (브레인스토밍 승인 완료, 구현 대기)
- 범위: `ios/App/App/public/` 배치 구조, 루트 앱(`src/`)·`player/` 각자의
  빌드 산출물, 새 빌드 스크립트, 두 서브앱 헤더의 "전환" 버튼. `src/`,
  `player/src/`의 핵심 로직은 변경하지 않는다.

## 0. 배경

Maestro Player는 현재 웹(브라우저 셸)과 Chrome 확장으로만 배포된다.
Coding 앱(`kr.selim.maestro`)은 이미 Capacitor로 iOS에 배포돼 실기기
설치까지 검증됐다(2026-08-13 세션, 아이패드 실기기 설치 확인). Player를
"별도 앱"으로 iOS에도 내놓기로 했으나, 완전히 분리된 Bundle
ID/App Store 등록 대신 **하나의 앱 설치 안에 진입 화면(런처)을 두고
Coding/Player를 완전히 분리된 화면 트리로 제공**하는 방향으로 확정했다
(브레인스토밍 세션에서 사용자 승인).

기존 웹 배포(루트 `npm run dev`)와 Chrome 확장(`player/extension/`)은
이 작업과 무관하게 그대로 유지된다 — iOS 런처는 새 배포 채널 추가일
뿐, 기존 채널을 대체하지 않는다.

## 1. 경계 원칙 (기존 결정 계승)

- `player/`는 자체 `package.json`/빌드/테스트를 유지하고 루트 앱
  (`src/`, `tests/`, `maestro-server.js`)을 import하지 않는다.
- 루트 앱도 `player/` 코드를 import하지 않는다.
- 두 서브앱은 **빌드 산출물(정적 파일)** 레벨에서만 하나의 iOS 셸 안에
  나란히 배치된다 — 소스 레벨 결합은 없다.
- 이 경계는 `workflow/README.md`/`player/README.md`에 명시된 "본체
  불가침 경계" 관례를 그대로 따른다.

## 2. iOS 웹뷰 디렉토리 구조

```
ios/App/App/public/
  index.html          ← 런처(신규, 정적 HTML/CSS/JS, React 미사용)
  coding/              ← 루트 앱(src/) vite build 결과물
  player/              ← player/ vite build 결과물 (공개 URL 모드만)
```

- Capacitor 웹뷰는 `capacitor://localhost` 단일 origin으로 이 전체를
  서빙하므로, `coding/`과 `player/`는 origin이 같아 `localStorage`를
  공유한다 (런처의 "마지막 선택" 저장에 사용).
- `player/` 서브트리는 확장/웹 배포와 동일한 빌드(공개 URL 모드만
  노출)를 그대로 재사용한다 — iOS 전용 빌드 변형을 만들지 않는다.

## 3. 빌드 파이프라인

새 스크립트 `scripts/build-ios-shell.mjs`를 추가하고, 루트
`package.json`의 `ios:build`가 이를 호출하도록 바꾼다.

```
CAPACITOR_BUILD=1 vite build --outDir dist/coding-tmp
(cd player && vite build --outDir ../dist/player-tmp)
# dist/coding-tmp → ios/App/App/public/coding/
# dist/player-tmp → ios/App/App/public/player/
# public/launcher/index.html (신규 정적 파일) → ios/App/App/public/index.html
cap sync ios
```

- 런처의 정적 파일은 `public/launcher/`(신규 디렉토리)에 소스로 두고,
  빌드 스크립트가 그대로 복사한다 (별도 빌드 단계 불필요 — 순수
  HTML/CSS/inline JS).
- `player/vite.config.js`의 base path 설정이 `/player/` 서브경로에서도
  정상 동작하는지 확인 필요(현재 확장/웹 배포 base와 다를 수 있음 —
  구현 시 점검).

## 4. 런처 화면 동작

- **첫 진입:** 앱을 콜드 스타트하면 항상 런처(`index.html`)가 먼저
  뜬다. "Coding" / "Player" 두 버튼 — 다크 배경 + 퍼플(Coding 강조)/
  시안(Player 강조) 팔레트, 기존 헤더 CI 색상 재사용.
- **마지막 선택 기억:** `localStorage`에 마지막으로 고른 항목을 저장해
  해당 버튼에 "마지막 사용" 표시만 붙인다. **자동 진입은 하지 않는다**
  — 매번 사용자가 명시적으로 눌러야 진입.
- **진입:** 버튼 클릭 시 `window.location.href = 'coding/index.html'`
  또는 `'player/index.html'`로 풀 페이지 이동.
- **전환:** 각 서브앱 헤더 우측 끝에 "⇄ 전환" 버튼을 추가 — 클릭 시
  `window.location.href = '../index.html'`(런처)로 풀 리로드.
- **상태 손실:** 전환은 풀 리로드이므로 서브앱 내부 상태(Coding의 서버
  연결, Player가 로드해둔 리플레이)는 초기화된다 — 접근 A 선택 시
  감수하기로 한 트레이드오프.

## 5. 아이콘 & 브랜딩

- 홈 화면 앱 아이콘(`AppIcon.appiconset`)은 **신규 제작 없이 현재 것을
  유지**한다 (2026-08-13 세션에서 만든 CI 모티프 — 다크 인디고 배경 +
  퍼플 판정선 + 화이트 8분음표 + 시안/앰버 포인트). 이미 Coding/Player
  헤더 색상과 일치하고 제품 정체성을 포괄적으로 표현한다.
- `Info.plist`의 `CFBundleDisplayName`은 "Maestro"로 유지 — 런처가
  내부에서 이미 구분해주므로 앱 이름을 바꿀 필요는 없다.
- 런처 화면 안에서만 두 버튼을 색으로 구분(Coding=퍼플, Player=시안)
  한다.

## 6. Player iOS 모드의 기능 범위

- **공개 URL 모드만** 지원한다 (Chrome 확장과 동일 범위).
  - Local Repo 모드: 데스크톱/서버 브리지가 필요해 iOS에 의미 없음 —
    비범위.
  - Connected Account 모드: OAuth 등 전제조건이 제품 전체 범위에서
    이미 deferred(G4) — 비범위.
- 공개 URL 모드는 GitHub/GitLab public API를 클라이언트에서 직접 호출
  하므로 Maestro 서버 연결이 필요 없다 (Coding과 달리 "서버 주소" 설정
  불필요).

## 7. 테스트 & 검증 계획

- **자동:** `scripts/build-ios-shell.mjs`에 대한 단위 테스트 —
  루트/player 빌드 산출물이 올바른 하위 경로(`coding/`, `player/`)에
  배치되는지, 런처 정적 파일이 복사되는지 확인.
- 기존 루트 앱 테스트(`npm test`)와 player 테스트
  (`cd player && npm run qa`)는 이 작업으로 변경되지 않으며 그대로
  유지된다.
- **수동(실기기):**
  1. 확장된 `npm run ios:build` 실행 → Xcode 빌드 → 아이패드 재설치.
  2. 런처 → "Coding" 선택 → 서버 연결·헤더 등 기존 기능 정상 동작
     확인.
  3. 전환 버튼 → 런처 → "Player" 선택 → 공개 GitHub URL 입력 → 리플레이
     재생까지 확인.
  4. 전환 왕복 시 상태 초기화가 예상대로 되는지 확인.

## 8. 비범위

- Player의 Local Repo / Connected Account 모드를 iOS로 확장하는 것.
- Chrome 확장·웹 배포 변경 (그대로 유지).
- 앱 아이콘 재제작.
- SPA 라우팅 기반 무리로드 전환(접근 B) — 별도 스펙으로 재검토 가능.
- Workflow(`workflow/`)를 같은 런처에 포함하는 것 — 이번 스펙은 Coding/
  Player 2개로 한정.
