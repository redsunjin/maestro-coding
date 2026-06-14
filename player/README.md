# Maestro Player

`Maestro Player`는 `maestro` 레포 안에서 시작하는 하위 서브프로젝트다.

역할:

- 완료된 Git 활동과 Maestro history를 읽는다.
- 이를 리듬게임과 악보 형태로 재생한다.
- 실제 `merge`, `push`, `undo`는 수행하지 않는다.

현재 상태:

- planning only
- 구현 전 문서 기준은 `docs/maestro-player/`를 본다.

작업 경계:

- 이 서브프로젝트 구현은 `player/` 아래에서만 진행한다.
- 문서와 기획은 `docs/maestro-player/` 아래에서만 관리한다.
- 본체 경로인 `src/`, `tests/`, `maestro-server.js`는 플레이어 작업 범위에 포함하지 않는다.
- 플레이어 전용 작업은 별도 브랜치 `codex/maestro-player-foundation`에서 진행한다.

문서:

- [Project Overview](../docs/maestro-player/README.md)
- [MVP Spec](../docs/maestro-player/mvp-spec.md)
- [Music Mapping Spec](../docs/maestro-player/music-mapping-spec.md)
- [Chrome Extension Strategy](../docs/maestro-player/chrome-extension-strategy.md)
- [Branch Harness Plan](../docs/maestro-player/PLAYER_BRANCH_HARNESS_PLAN.md)
- [Bootstrap Plan](../docs/maestro-player/bootstrap-plan.md)
- [Test Plan](../docs/maestro-player/test-plan.md)

예정 구조:

```text
player/
  package.json
  index.html
  src/
  public/
  tests/
```
