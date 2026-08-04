# Maestro Player

`Maestro Player`는 `maestro` 레포 안에서 시작하는 하위 서브프로젝트다.

역할:

- 완료된 Git 활동과 Maestro history를 읽는다.
- 이를 리듬게임과 악보 형태로 재생한다.
- 실제 `merge`, `push`, `undo`는 수행하지 않는다.

현재 상태:

- browser shell core와 public/account replay adapter, golden demo, run screen, bilingual copy가 구현되어 있다.
- Chrome extension은 `player/extension/`에서 public URL launch와 golden autoplay를 검증하는 단계다.
- 현재 실행 Goal과 완료 evidence는 `docs/maestro-player/goal-roadmap.md`를 기준으로 한다.

작업 경계:

- 이 서브프로젝트 구현은 `player/` 아래에서만 진행한다.
- 문서와 기획은 `docs/maestro-player/` 아래에서만 관리한다.
- 본체 경로인 `src/`, `tests/`, `maestro-server.js`는 플레이어 작업 범위에 포함하지 않는다.
- 플레이어 전용 작업은 별도 브랜치 `codex/maestro-player-foundation`에서 진행한다.

문서:

- [Project Overview](../docs/maestro-player/README.md)
- [Goal Roadmap](../docs/maestro-player/goal-roadmap.md)
- [MVP Spec](../docs/maestro-player/mvp-spec.md)
- [Music Mapping Spec](../docs/maestro-player/music-mapping-spec.md)
- [Chrome Extension Strategy](../docs/maestro-player/chrome-extension-strategy.md)
- [Branch Harness Plan](../docs/maestro-player/PLAYER_BRANCH_HARNESS_PLAN.md)
- [Bootstrap Plan](../docs/maestro-player/bootstrap-plan.md)
- [Test Plan](../docs/maestro-player/test-plan.md)

예정 구조:

```text
player/
  extension/
  package.json
  index.html
  src/
  public/
  tests/
```

## 저장 정책 (G2)

- **점수 기록**: localStorage(`maestro-player-performance-history-v1`)에 소스별
  최근 50건 + 전체 200건 상한, 초과분은 오래된 순 삭제.
- **확장 launch 세션**: `chrome.storage.local` 단일 키에 마지막 1건만 유지.

## 공개 리플레이 오류 UX (G2)

로드 실패는 원인별 코드(INVALID_URL / UNSUPPORTED_HOST / RATE_LIMITED /
NOT_FOUND / API_ERROR / NETWORK / EMPTY_HISTORY)로 분류되어 덱 탭 아래
전역 배너에 ko/en 문구 + "다시 시도" 버튼으로 표시된다. 이벤트 0건
(EMPTY_HISTORY)은 플레이 탭 자동 전환을 하지 않는다.

## 배포 패키징 (G3)

    npm run package:extension   # build 후 output/maestro-player-extension-v<버전>.zip 생성

아이콘 재생성은 `node scripts/renderExtensionIcons.mjs` (public/favicon.svg 기준).
제출 절차·권한 문구는 [release-checklist](../docs/maestro-player/release-checklist.md) 참고.
