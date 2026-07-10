# Maestro Player Chrome Extension Strategy

## 현재 상태

- `player/extension/` 아래에 MV3 scaffold를 둔다.
- `popup + background + player page + public repo URL handoff`를 포함한다.
- `player.html`에는 기존 React player 셸을 마운트하고, 저장된 public launch session은 자동 로드한다.
- extension 전용 화면은 Public Repo URL과 golden autoplay demo로 한정한다. Local Repo와 Connected Account는 browser shell에만 남긴다.

## 현재 extension flow

1. popup이 현재 public GitHub/GitLab 저장소를 감지하거나, 사용자가 공개 URL을 붙여넣는다.
2. player tab이 저장된 public URL과 branch를 읽고 바로 replay를 로드한다.
3. forge 요청 없이 동작하는 golden demo도 compact autoplay action으로 즉시 실행할 수 있다.

## 결론

`Maestro Player`를 크롬 익스텐션 형태로 빠르게 시험하는 것은 타당하다.
다만 빠른 시도 범위는 명확히 줄여야 한다.

가장 빠른 형태:

- `Public Repo URL Mode`
- `Connected Account Mode`
- `Golden Listening Demo`
- `Autoplay Preview`

초기 제외:

- `Local Repo Mode`
- 데스크톱 Git bridge
- OAuth 정식 연결
- 웹스토어 정식 공개 전 심사 대응 항목

## 왜 익스텐션이 맞는가

- 설치 후 바로 진입할 수 있다.
- GitHub/GitLab 저장소 페이지와 인접한 경험을 만들기 쉽다.
- `read-only replay` 제품 성격과 잘 맞는다.
- 별도 백엔드 없이도 공개 레포 URL과 토큰 기반 계정 모드를 빨리 검증할 수 있다.

## 왜 범위를 줄여야 하는가

현재 `Maestro Player` 구현은 브라우저 셸 기준으로는 이미 충분히 진척됐지만,
익스텐션은 브라우저 권한/패키징/스토리지 제약이 추가된다.

특히 `Local Repo Mode`는 빠른 익스텐션 MVP와 맞지 않는다.

이유:

- 크롬 익스텐션은 로컬 `git log`를 직접 실행할 수 없다.
- 현재 로컬 경로는 `desktop/server bridge`가 있어야 한다.
- 익스텐션으로 빠르게 서비스 검증하려면 public/account 모드 위주가 맞다.

## 현재 상태 기준 이식 가능 자산

이미 있는 것:

- GitHub/GitLab public replay adapter
- GitHub/GitLab connected account adapter
- collaboration overlay adapter
- deterministic music mapping layer
- chart 생성
- autoplay/manual play panel
- score history
- bilingual copy
- golden listening pack

즉, 익스텐션에서 다시 만들어야 하는 핵심은 `음악 엔진`이 아니라 아래다:

- 익스텐션 entrypoint
- manifest
- storage policy
- 권한/host permissions
- 페이지 컨텍스트 진입 UX

## 권장 MVP 형태

### 1. Action popup은 최소화

popup 안에 전체 플레이어를 넣지 않는다.

popup 역할:

- 현재 페이지 감지
- `Open Maestro Player`
- `Play This Repo`

실제 플레이어는 아래 둘 중 하나로 연다.

- `side panel`
- extension page tab

빠른 MVP는 `extension page tab`이 가장 단순하다.

## 2. Extension page를 메인 플레이어로 사용

권장 URL 예:

- `chrome-extension://<id>/player.html`

여기서 기존 `player` React 앱을 거의 그대로 재사용한다.

추가되는 것은:

- extension source bootstrap
- `chrome.storage.local` 연동
- 현재 탭의 GitHub/GitLab URL을 초기값으로 주입

## 3. 첫 진입 UX

가장 빠른 진입 흐름:

1. 사용자가 GitHub/GitLab 저장소 페이지에서 익스텐션 아이콘 클릭
2. popup이 현재 탭 URL을 읽음
3. `Play This Repo` 클릭
4. extension page가 열리며 해당 URL이 `Public Repo URL Mode`에 자동 주입됨
5. autoplay preview 또는 manual play 시작

## 기술 구조

권장 구조:

```text
player/
  extension/
    manifest.json
    background.js
    popup.html
    popup.js
    player.html
```

또는 더 분리해서:

```text
player-extension/
  manifest.json
  src/
```

빠른 MVP는 `player/extension/`이 낫다.

이유:

- 기존 `player/src` 자산을 바로 참조하기 쉽다.
- 배포 단위만 분리하고 도메인 모델은 공유할 수 있다.

## Manifest V3 권장안

필수:

- `manifest_version: 3`
- `action`
- `tabs`
- `storage`
- `host_permissions`

초기 `host_permissions`:

- `https://github.com/*`
- `https://api.github.com/*`
- `https://gitlab.com/*`

필요 시 확장:

- self-hosted GitLab
- GitHub Enterprise

## 인증 전략

빠른 MVP:

- OAuth 하지 않는다.
- 사용자가 토큰을 직접 입력한다.
- 토큰은 `chrome.storage.local` 또는 세션 스토리지에 저장한다.

권장 초기 정책:

- 기본은 저장하지 않음
- 사용자가 명시적으로 `remember token`을 켰을 때만 저장

정식화 이후:

- GitHub OAuth App 또는 GitHub App
- GitLab OAuth

## 기능 우선순위

### Phase 1

- Public Repo URL autoplay
- 현재 탭 URL 자동 주입
- Golden Listening Demo
- Account token 수동 입력

### Phase 2

- score history를 `chrome.storage.local`로 이전
- side panel 모드
- GitHub/GitLab 페이지에서 `Play in Maestro Player` 컨텍스트 액션

### Phase 3

- OAuth
- self-hosted forge
- richer page integration

## 제품상 장점

익스텐션 MVP는 본체보다 오히려 플레이어에 더 잘 맞는다.

이유:

- 사용자는 저장소를 보고 있다가 바로 재생으로 넘어갈 수 있다.
- read-only라 권한 설득이 비교적 쉽다.
- “Git 이력을 게임처럼 듣고 본다”는 컨셉 전달이 빠르다.

## 제품상 리스크

- 로컬 Git 모드는 초기에 빠진다.
- 토큰 UX가 조악하면 이탈이 생긴다.
- Web Store 공개 전엔 private distribution 위주로 검증해야 한다.
- forge API rate limit 영향을 직접 받는다.

## 추천 실행 순서

1. extension MVP를 `Public Repo URL Mode` 전용으로 먼저 만든다.
2. GitHub/GitLab 저장소 페이지 URL auto-fill을 붙인다.
3. autoplay preview만 먼저 안정화한다.
4. 그 뒤 account mode를 넣는다.
5. 마지막에 side panel/OAuth를 검토한다.

## 최종 판단

`Maestro Player`를 크롬 익스텐션으로 빠르게 시도하는 것은 좋다.
하지만 첫 시도는 `웹 셸 전체 이식`이 아니라
`공개 레포를 바로 플레이하는 read-only extension MVP`로 잘라야 한다.
