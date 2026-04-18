# Maestro Player

상태: planning

`Maestro Player`는 `MaestroWorks` 본체와 분리된 별도 제품이 아니라,
같은 `maestro` 레포 안에서 시작하는 read-only 스핀오프 서브프로젝트다.

핵심 전제:

- `MaestroWorks`는 실제 승인/반려/병합/롤백을 수행하는 업무 도구다.
- `Maestro Player`는 이미 완료된 Git 활동과 Maestro 이력을 읽어
  리듬게임과 악보로 재생하는 게임 레이어다.
- 플레이어는 로컬 레포만이 아니라, 연결된 Git 계정의 레포 선택과
  공개 퍼블릭 레포 URL 등록을 통해서도 replay를 시작할 수 있어야 한다.
- 초기에는 레포를 나누지 않는다.
- 초기에는 `player/` 하위 폴더로 시작하고, 본체 루트 구조는 그대로 둔다.

왜 같은 레포로 가는가:

- 기존 `demo`, `lane`, `score`, `history`, `BGM`, 악보 컨셉을 바로 재사용할 수 있다.
- 실제 업무 경로와 게임 경로의 시각 언어를 자연스럽게 공유할 수 있다.
- 현재 본체가 단일 앱 구조라서 지금 별도 레포 분리는 이동 비용이 크다.
- 게임은 read-only 입력이므로 서버/운영 리스크 없이 빠르게 실험할 수 있다.

왜 아직 레포를 나누지 않는가:

- 지금 필요한 것은 독립 배포보다 빠른 MVP 검증이다.
- `Maestro Player`는 당분간 `MaestroWorks`의 자산을 많이 공유한다.
- 분리 시점은 `release cadence`, 독립 사용자층, 별도 배포/문서/테스트 체계가
  충분히 분화된 뒤가 적절하다.

권장 폴더 결정:

- 문서: `docs/maestro-player/`
- 앱 시작점: `player/`

작업 규칙:

- 플레이어 구현 변경은 `player/` 아래에서만 진행한다.
- 플레이어 기획/설계/테스트 문서는 `docs/maestro-player/` 아래에서만 관리한다.
- 본체 `src/`, `tests/`, `maestro-server.js`는 플레이어 작업에서 수정하지 않는다.
- 플레이어 전용 구현은 별도 브랜치 `codex/maestro-player-foundation`에서 진행한다.

문서 세트:

- [MVP Spec](./mvp-spec.md)
- [Music Mapping Spec](./music-mapping-spec.md)
- [Branch Harness Plan](./PLAYER_BRANCH_HARNESS_PLAN.md)
- [Bootstrap Plan](./bootstrap-plan.md)
- [Test Plan](./test-plan.md)

후속 분리 조건:

- `player/`가 독립 도메인 모델과 별도 release cycle을 갖게 될 때
- `maestro` 본체와 공유 코드보다 독자 코드가 더 많아질 때
- 공개 배포, 라이선스, 커뮤니티 운영을 별도 관리해야 할 때

현재 결론:

`Maestro Player`는 별도 레포가 아니라 `maestro` 레포 내부의 하위 서브프로젝트로
시작하는 것이 가장 빠르고 안전하다.

제품 입력 방향:

- `MaestroWorks`에 이미 있는 프로젝트 선택/등록 경험은 플레이어 입력 UX의 참고 모델로 재사용한다.
- 플레이어는 최소 3가지 입력 경로를 가져야 한다.
  1. 로컬 Git 레포 선택
  2. 연결된 Git 계정의 레포 목록에서 선택
  3. 공개 퍼블릭 레포 URL 직접 등록
