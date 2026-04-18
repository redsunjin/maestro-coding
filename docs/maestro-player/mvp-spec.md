# Maestro Player MVP Spec

## 1. 제품 정의

`Maestro Player`는 완료된 Git 활동과 Maestro 이력을
리듬게임/악보 형태로 재생하는 read-only 개발 게임이다.

이 MVP는 실제 `git merge`나 `git push`를 수행하지 않는다.
완료된 데이터를 게임 재료로 변환하는 데만 집중한다.

## 2. 대상 사용자

- 이미 Git 기반 개발 흐름을 사용하는 개발자
- `MaestroWorks` 데모/컨셉에 흥미를 느끼는 사용자
- 완료된 작업 이력을 재미있게 보고 싶어 하는 오픈소스 사용자

## 3. 핵심 사용자 흐름

1. 사용자가 입력 소스를 선택한다.
2. 입력 소스는 로컬 레포, 연결된 Git 계정의 레포 목록, 공개 레포 URL 중 하나일 수 있다.
3. 앱이 완료된 commit/merge/history를 읽는다.
4. 이벤트를 레인/타이밍/난이도로 변환해 차트를 만든다.
5. 사용자가 차트를 플레이한다.
6. 기본 플레이어는 play/pause/retry와 manual input 또는 autoplay preview를 지원한다.
6. 결과를 점수, 콤보, 악보, 리플레이 요약으로 본다.

## 4. 입력 접근 모델

### A. Local Repo Mode

- 사용자가 로컬 Git 폴더를 직접 선택한다.
- 가장 빠른 개발/디버그 경로다.
- read-only Git 명령만 사용한다.
- 브라우저 셸에서는 desktop/server bridge를 통해 read-only replay를 주입한다.

### B. Connected Account Mode

- 사용자가 GitHub/GitLab 같은 계정을 연결한다.
- 연결 후 접근 가능한 레포 목록을 프로젝트별로 선택할 수 있어야 한다.
- 본체 `MaestroWorks`에 이미 있는 프로젝트 선택/등록 UX는 이 모드의 참고 모델로 재사용할 수 있다.

### C. Public Repo URL Mode

- 사용자가 공개 퍼블릭 레포 URL을 직접 등록한다.
- 예: `https://github.com/owner/repo`
- 계정 연결 없이도 공개 이력을 읽어 replay를 만들 수 있어야 한다.
- 이 모드는 플레이어의 공유/데모/바이럴 진입점으로 중요하다.

## 5. MVP 입력 소스

### A. Git Replay Source

- 로컬 Git 레포
- 연결된 계정의 원격 레포
- 공개 퍼블릭 레포 URL
- 브랜치 또는 기간 지정
- `commit sha`, `timestamp`, `author`, `branch`, `message`, `changed files` 사용

### B. Maestro History Source

- 기존 Maestro history API 또는 export
- `requestId`, `branchName`, `laneIndex`, `result`, `timestamp`, `agentId` 사용

### C. Collaboration Overlay Source

- GitHub/GitLab 같은 forge 이벤트 export 또는 API
- `pr-open`, `review-comment`, `review-request-changes`, `review-approve`, `push`, `pull`
- 없으면 곡은 Git Core Layer만으로도 성립해야 한다

## 6. MVP 핵심 엔티티

### `ReplaySource`

- `sourceType`: `git-local` | `git-account` | `git-public-url` | `maestro-history`
- `sourceLabel`
- `targetPathOrId`
- `provider`: `github` | `gitlab` | `local` | `unknown`
- `visibility`: `private` | `public`

### `ReplayEvent`

- `eventId`
- `sourceType`
- `timestamp`
- `actor`
- `branchName`
- `commitSha`
- `eventType`: `commit` | `merge` | `revert` | `pr-open` | `review-comment` | `review-request-changes` | `review-approve` | `history-approved`
- `weight`

### `ReplayChart`

- `chartId`
- `laneCount`
- `tempo`
- `difficulty`
- `notes`

### `MusicIntent`

- `intentId`
- `eventRef`
- `structuralRole`
- `motifId`
- `energy`
- `tension`
- `brightness`
- `density`
- `accentLevel`
- `registerBand`
- `harmonyAction`
- `rhythmPattern`
- `orchestrationHint`
- `laneBias`

### `ReplayNote`

- `noteId`
- `laneIndex`
- `beatOffset`
- `durationBeats`
- `noteType`: `tap` | `hold` | `accent`
- `eventRef`

### `PerformanceRecord`

- `runId`
- `chartId`
- `score`
- `maxCombo`
- `accuracy`
- `finishedAt`

## 7. MVP 포함 범위

- Git replay source 1종 이상 연결
- 공개 퍼블릭 레포 URL 등록 후 replay 생성 가능
- Git 이벤트를 음악 의도로 번역하는 deterministic mapping layer
- 차트 생성
- 기본 플레이 화면
- 레인/노트 시각화
- manual input 또는 autoplay preview 기반 run loop
- 점수/콤보/판정
- 악보 또는 score history 뷰
- replay summary

## 8. 명시적 비범위

- 실제 `merge`, `push`, `undo` 실행
- 멀티플레이어
- 서버 동기화
- 상점, 결제, 배지 경제
- 복잡한 3D 시각화

주의:

- "계정 연결"은 플레이어 접근을 위한 source authorization 범위로만 다룬다.
- 일반 소셜 계정 시스템이나 프로필 플랫폼으로 확장하지 않는다.

## 9. MVP 성공 기준

- 사용자가 로컬 Git 이력을 읽어 실제 플레이 가능한 차트를 만들 수 있다.
- 로컬 모드에서 bridge가 연결되면 read-only replay를 실제 차트로 변환할 수 있다.
- 사용자가 공개 퍼블릭 레포 URL만으로도 replay를 시작할 수 있다.
- 사용자가 연결된 Git 계정에서 레포를 선택해 replay를 만들 수 있다.
- GitHub PR/review overlay가 있으면 commit 흐름 위에 review 긴장/해결 패턴이 추가된다.
- 플레이 결과를 점수와 악보로 다시 확인할 수 있다.
- 기존 `MaestroWorks` 업무 경로를 전혀 건드리지 않는다.
- 앱 전체가 read-only 모드로 동작한다.

## 10. 다음 코딩 단계

첫 코딩 단계는 `player/` 서브프로젝트 셸을 만들고,
`git log` 기반 `ReplayEvent` adapter와 `MusicIntent` mapping layer를 붙이는 것이다.

핵심 작곡 규칙은 [Music Mapping Spec](./music-mapping-spec.md)를 기준으로 한다.

그 다음 입력 단계 우선순위는 아래 순서가 적절하다.

1. Local Repo Mode
2. Public Repo URL Mode
3. Connected Account Mode
