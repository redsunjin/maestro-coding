# Maestro Player Bootstrap Plan

> Historical setup record. 현재 구현 순서와 완료 조건은 [Goal Roadmap](./goal-roadmap.md)을 따른다.

## 1. 구조 결정

초기 구조는 `같은 레포 + 하위 서브프로젝트`로 고정한다.

권장 경로:

```text
maestro/
  docs/
    maestro-player/
      README.md
      mvp-spec.md
      music-mapping-spec.md
      PLAYER_BRANCH_HARNESS_PLAN.md
      bootstrap-plan.md
      test-plan.md
  player/
    README.md
    package.json
    index.html
    src/
    public/
    tests/
```

## 2. 왜 이 구조가 맞는가

- 현재 `maestro`는 단일 Vite 앱이라 지금 monorepo refactor를 먼저 하면 위험하다.
- `player/`만 별도 하위 앱으로 두면 본체를 건드리지 않고 실험할 수 있다.
- 공유 자산이 필요하면 `shared/` 또는 추후 `packages/`로 단계적으로 옮기면 된다.

## 3. 지금 하지 않는 것

- 기존 본체를 `apps/works`로 대이동
- 레포 분리
- npm workspace 전면 도입
- 공용 패키지 조기 추출

## 4. 1차 생성 파일

### 문서

- `docs/maestro-player/README.md`
- `docs/maestro-player/mvp-spec.md`
- `docs/maestro-player/music-mapping-spec.md`
- `docs/maestro-player/PLAYER_BRANCH_HARNESS_PLAN.md`
- `docs/maestro-player/bootstrap-plan.md`
- `docs/maestro-player/test-plan.md`

### 앱 셸

- `player/README.md`
- `player/package.json`
- `player/index.html`
- `player/src/main.jsx`
- `player/src/App.jsx`
- `player/src/components/PlayerRunPanel.jsx`
- `player/src/lib/sourceRegistry.js`
- `player/src/lib/browserLocalRepoBridge.js`
- `player/src/lib/localRepoBridge.js`
- `player/src/lib/publicRepoAdapter.js`
- `player/src/lib/accountRepoAdapter.js`

### 도메인 로직

- `player/src/lib/gitReplayAdapter.js`
- `player/src/lib/collaborationOverlayAdapter.js`
- `player/src/lib/maestroHistoryAdapter.js`
- `player/src/lib/musicIntentMapper.js`
- `player/src/lib/motifCatalog.js`
- `player/src/lib/harmonyEngine.js`
- `player/src/lib/chartMapper.js`
- `player/src/lib/types.js`

### 테스트

- `player/tests/gitReplayAdapter.test.mjs`
- `player/tests/localReplayBridge.test.mjs`
- `player/tests/localReplayBridgePlugin.test.mjs`
- `player/tests/chartMapper.test.mjs`
- `player/tests/playerHarness.test.mjs`
- `player/src/App.ui.test.jsx`
- `player/src/components/PlayerRunPanel.test.jsx`
- `player/src/lib/browserLocalRepoBridge.test.jsx`

## 5. 구현 순서

1. `player/` 앱 셸 생성
2. Git replay adapter 작성
3. Local repo bridge adapter 작성
4. Public repo URL adapter 작성
5. Music intent mapper 작성
6. 차트 매퍼 작성
7. local replay bridge endpoint 연결
8. Connected account repo selector 추가
9. Collaboration overlay adapter 작성
10. 기본 플레이 화면 연결
11. manual play/pause/retry/result loop 추가
12. 레인/노트 시각화 추가
13. 악보/결과 요약 추가
14. 테스트/샘플 데이터/문서 보강

## 6. 1차 실행 명령 목표

```bash
cd player
npm install
npm run dev
```

## 7. 분리 시점 재평가 기준

아래 중 2개 이상 만족하면 레포 분리를 다시 검토한다.

- `player/`가 별도 배포 파이프라인을 요구한다.
- `player/` 전용 이슈/커뮤니티 흐름이 생긴다.
- 공유 코드보다 독자 코드가 더 많아진다.
- `MaestroWorks`와 릴리즈 주기가 명확히 갈라진다.

## 8. 작업 범위 규칙

- 플레이어 구현은 `player/` 아래에서만 작업한다.
- 플레이어 문서는 `docs/maestro-player/` 아래에서만 작업한다.
- 본체 `src/`, `tests/`, `maestro-server.js`는 플레이어 브랜치에서 수정하지 않는다.
- 플레이어 브랜치는 `main`에서 분기한 전용 브랜치로 유지한다.

입력 전략 규칙:

- 로컬 레포 모드는 개발과 하네스 기준 경로다.
- 브라우저 플레이어 셸에서 로컬 레포는 desktop/server bridge를 통해 읽는다.
- Public Repo URL 모드는 플레이어의 가장 중요한 외부 진입 경로다.
- Connected Account Mode는 private repo 선택과 사용성 향상을 위한 후속 단계다.
- Collaboration overlay는 commit 흐름 위에 PR/review 이벤트를 얹는 후속 강화 경로다.

## 9. 다음 코딩 단계

`player/README.md`와 `player/package.json`부터 만들고,
`Git replay -> music intent -> note chart` 경로를 먼저 통과시키는 것이 가장 좋은 시작점이다.

그 다음 제품 입력 완성 순서는 `local -> public repo url -> connected account`가 적절하다.
