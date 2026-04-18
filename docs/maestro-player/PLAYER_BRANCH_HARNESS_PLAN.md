# Maestro Player Branch Harness Plan

기준일: 2026-04-17
대상 트랙: `Maestro Player`
상태: 실행 기준 초안

## 1. 목적

이 문서는 `Maestro Player`를 별도 브랜치/서브프로젝트로 운영할 때 필요한 하네스 기준을 고정한다.

- `codex/maestro-player-foundation`
  - 목적: Git/PR 이력을 음악과 리듬게임 차트로 번역하는 read-only 플레이어 코어 구현

중요:

- 이 작업은 본체 `MaestroWorks` 승인/병합/롤백 경로를 확장하는 기능이 아니다.
- 현재 범주는 `player/` 하위 서브프로젝트와 `docs/maestro-player/` 문서 세트 안에서만 관리한다.
- 플레이어 작업은 본체 `src/`, `tests/`, `maestro-server.js`와 분리된 독립 트랙으로 취급한다.

## 2. Branch Role

### `codex/maestro-player-foundation`

허용 범위:

- `player/` 앱 셸
- Git replay adapter
- Music intent mapper
- harmony/motif/chart 엔진
- 플레이어 전용 테스트와 fixture
- 플레이어 문서 동기화

금지 범위:

- 본체 승인/반려/UNDO 흐름 변경
- 본체 서버 API 변경
- `src/`, `tests/`, `maestro-server.js` 수정
- 실제 `git merge`, `git push`, `git reset` 실행 경로 추가

산출물:

- `player/` 구현 파일
- `docs/maestro-player/` 기준 문서
- deterministic fixture 기반 회귀 테스트

## 3. Harness Worksheet

### 3-1. Work Identity

- version_track: `Maestro Player / Foundation`
- branch_scope:
  - 구현 브랜치: `codex/maestro-player-foundation`
- worktree_scope:
  - `/Users/Agent/ps-workspace/maestro/.worktrees/maestro-player`
- user_visible_change:
  - Git/PR 이력이 음악적 의도와 노트 차트로 안정적으로 번역됨

### 3-2. Scope

in:

- `player/` 하위 독립 패키지
- `ReplayEvent -> MusicIntent -> ReplayNote` 파이프라인
- deterministic motif/key/tempo 규칙
- density cap
- Git-only fallback
- public repo URL replay 입력
- fixture 기반 harness 회귀 테스트

out:

- 실제 Git 쓰기 명령 실행
- 본체 UI 통합
- 멀티플레이어
- 원격 동기화/계정
- 공개 배포 파이프라인

assumptions:

- `PR`, `push`, `pull`은 Git Core가 아니라 overlay source일 수 있다.
- overlay 이벤트가 없어도 Git-only 곡은 성립해야 한다.
- 플레이어는 본체와 시각 언어를 공유할 수 있지만 write-path는 공유하지 않는다.
- public repo는 계정 연결 없이도 접근 가능해야 한다.
- connected account mode는 private/public repo 선택 UX를 위한 후속 확장이다.

### 3-3. Record System

- source_of_truth_docs:
  - `docs/maestro-player/README.md`
  - `docs/maestro-player/mvp-spec.md`
  - `docs/maestro-player/music-mapping-spec.md`
  - `docs/maestro-player/bootstrap-plan.md`
  - `docs/maestro-player/test-plan.md`
  - `docs/maestro-player/PLAYER_BRANCH_HARNESS_PLAN.md`
- execution_doc:
  - 플레이어 구현 변경은 이 브랜치 커밋과 PR 설명에 남긴다.
- handoff_doc_updates:
  - 알고리즘 규칙 변경 시 `music-mapping-spec.md`를 먼저 갱신한다.

### 3-4. Evaluators

static_checks:

- 변경 파일이 `player/`, `docs/maestro-player/` 밖으로 번지지 않았는지 확인
- `ReplayEvent -> MusicIntent -> ReplayNote` 단계 분리가 유지되는지 확인
- deterministic seed 규칙이 깨지지 않았는지 확인

targeted_tests:

- `player/tests/musicIntentMapper.test.mjs`
- `player/tests/chartMapper.test.mjs`
- `player/tests/gitReplayAdapter.test.mjs`
- `player/tests/publicRepoAdapter.test.mjs`
- `player/tests/accountRepoAdapter.test.mjs`
- `player/tests/playerHarness.test.mjs`

regression_gate:

- 최소: `cd player && npm test`
- 권장: `cd player && npm run qa`

runtime_signals:

- 같은 fixture에서 motif/key/tempo가 다시 실행해도 동일함
- `review-request-changes`는 긴장 패턴으로 반영됨
- `merge`는 accent/cadence lane으로 귀결됨
- 이벤트가 몰려도 density cap이 유지됨
- public repo URL을 등록하면 replay source가 생성됨

### 3-5. Guardrails

- do_not_expand_into:
  - 본체 UI 통합 작업
  - Git write-path 추가
  - 서버 API 확장
  - 플레이어 범위를 넘어서는 일반 작곡 툴
- escalation_conditions:
  - deterministic 결과가 깨짐
  - Git-only fallback이 성립하지 않음
  - density cap이 무너짐
  - 플레이어 구현이 본체 파일 수정 없이는 진행되지 않음
- rollback_or_recovery_path:
  - 플레이어 로직은 `player/src/lib/*`만 제거하면 되돌릴 수 있어야 한다.
  - fixture와 harness 테스트는 구현보다 먼저 깨지도록 유지한다.

### 3-6. Drift / Hygiene

- likely_drift_points:
  - 문서 규칙보다 구현이 먼저 변하는 경우
  - fixture 없이 ad-hoc 샘플만 추가되는 경우
  - overlay 이벤트를 Git Core와 혼동하는 경우
- scheduled_cleanup_rule:
  - 새 규칙을 넣으면 fixture와 테스트를 같이 추가한다.
  - 문서에 없는 이벤트 타입을 구현에 먼저 넣지 않는다.
  - 플레이어 범위를 넘어가는 요구는 별도 문서로 승격 후 진행한다.

## 4. Player Superpowers

이 프로젝트에서 `superpower`는 추상 슬로건이 아니라 아래 4개 능력으로 고정한다.

1. deterministic replay
   - 같은 이력은 항상 같은 motif/key/tempo를 낳는다.
2. musical semantics
   - `merge`, `approval`, `request changes`가 귀로 구분된다.
3. density control
   - 이벤트가 몰려도 플레이 가능한 차트로 정규화된다.
4. source resilience
   - overlay가 없어도 Git-only 곡이 성립한다.
5. public replay access
   - 공개 레포 URL만으로도 바로 게임을 시작할 수 있다.

## 5. Execution Sequence

### Step 1. Foundation

목표:

- `MusicIntent` 중심 코어와 chart mapping 구현

완료 기준:

- deterministic mapping tests green
- merge/review semantics tests green

### Step 2. Adapter Harness

목표:

- 실제 Git replay adapter와 public repo replay adapter를 fixture와 함께 연결

완료 기준:

- adapter output이 fixture snapshot 수준으로 안정화됨

### Step 3. Player Shell

목표:

- 플레이어 UI 셸, public repo URL 입력, 결과 화면 연결

완료 기준:

- fixture replay 1개 이상을 UI에서 재생 가능
