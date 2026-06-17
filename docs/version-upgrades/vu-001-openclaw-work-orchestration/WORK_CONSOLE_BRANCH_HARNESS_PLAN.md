# Work Console Branch Harness Plan

기준일: 2026-06-14
대상 트랙: `VU-001`
상태: 실행 기준 초안 / Agent Approval Protocol goal 하네스 반영

## 1. 목적

이 문서는 `Work Console` 개발을 두 개의 브랜치로 운영할 때 필요한 하네스 기준을 고정한다.

- `codex/work-console-shell-mockup`
  - 목적: UI 목업, 레이아웃 검증, 상호작용 탐색, 빠른 시각 확인
- `codex/work-console-feature`
  - 목적: 실제 제품 반영용 구현, 테스트, 문서 동기화

중요:

- 이 작업은 `1.5` 공식 버전 작업으로 취급하지 않는다.
- 현재 범주는 `VU-001 OpenClaw Work Orchestration` 안의 `Work Console` 준비/구현 트랙이다.
- 새 브랜치를 만든다고 공식 active loop가 자동 변경되지는 않는다.

## 2. Branch Roles

### A. `codex/work-console-shell-mockup`

허용 범위:

- 패널 레이아웃 실험
- 도킹 위치 UX 실험
- 빈 상태 문구 검토
- 컴포넌트 시각 구조 확인
- 버튼 배치, 폭, 정보 계층 탐색

금지 범위:

- 서버 API 계약 추가
- 이벤트 프로토콜 확정
- 영속 저장 구조 변경
- 기존 승인/반려/UNDO 흐름 수정
- 리뷰 없이 `feature` 브랜치에 직접 병합 판단

산출물:

- UI 캡처 또는 동작 메모
- 채택/폐기할 UX 결정 사항
- `feature` 브랜치에 넘길 구현 메모

### B. `codex/work-console-feature`

허용 범위:

- `PHASE_B0_WORK_CONSOLE_SHELL_PLAN` 구현
- 훅/컴포넌트 추가
- localStorage 상태 복원
- 접근성 속성 추가
- UI 회귀 테스트 추가
- 문서 동기화

후속 확장 가능 범위:

- 이후 `Session Core`, `Structured Cards`, `Approval Bridge`는 별도 승인 후 순차 진행

금지 범위:

- MVP 밖의 일반 메신저 기능
- merge 실행을 Work Console에서 직접 수행하는 흐름
- OpenClaw 연동 전체를 한 번에 밀어넣는 확장

## 3. Harness Worksheet

## 3-1. Work Identity

- version_track: `VU-001 / Work Console`
- branch_scope:
  - 탐색 브랜치: `codex/work-console-shell-mockup`
  - 구현 브랜치: `codex/work-console-feature`
- official_active_loop: 현행 운영 기준은 기존 `WORK_PLAN`을 유지하고, Work Console은 브랜치 기반 후속 작업으로 관리
- user_visible_change: 헤더 `Work` 토글, 도킹 가능한 패널 쉘, 빈 상태 세션 뷰, 명령 입력창 placeholder

## 3-2. Scope

in:

- `Stage 1 / Phase B-0 Shell UI`
- 패널 open/close
- left/right dock
- localStorage 복원
- 세션 리스트 placeholder
- 현재 세션 placeholder
- 입력창 shell
- 접근성 속성
- UI 회귀 테스트

out:

- 실제 `WorkSession` API
- slash command 실행
- `Plan Card`, `Commit Proposal Card`, `Delivery Card`
- OpenClaw connector
- 최종 승인 레인 승격 로직

assumptions:

- 기존 `History/Repo/AutoOps` 패널은 유지한다.
- 좁은 화면 자동 닫기 규칙은 1차 구현에서 강제하지 않는다.
- 단축키는 보류하거나 reserved 상태로 둔다.

## 3-3. Record System

- source_of_truth_docs:
  - `docs/version-upgrades/README.md`
  - `docs/version-upgrades/vu-001-openclaw-work-orchestration/README.md`
  - `docs/version-upgrades/vu-001-openclaw-work-orchestration/PHASE_B0_WORK_CONSOLE_SHELL_PLAN.md`
  - `docs/version-upgrades/vu-001-openclaw-work-orchestration/WORK_CONSOLE_PRODUCT_PLAN.md`
  - `docs/version-upgrades/vu-001-openclaw-work-orchestration/WORK_CONSOLE_UI_PLAN.md`
  - `docs/version-upgrades/vu-001-openclaw-work-orchestration/WORK_CONSOLE_BRANCH_HARNESS_PLAN.md`
- execution_doc:
  - 브랜치별 세부 진행은 커밋과 PR 설명에 남긴다.
- handoff_doc_updates:
  - 구현 완료 시 `WORK_PLAN` 또는 별도 `WP-*` 문서로 승격 검토

## 3-4. Evaluators

static_checks:

- 설계 범위가 `Phase B-0`를 넘지 않았는지 문서 기준 확인
- `App` 상태 과대 집중 없이 훅 분리가 유지되는지 확인

targeted_tests:

- `src/App.work-console.ui.test.jsx`
- `src/App.history.ui.test.jsx`
- `src/App.project-registry.ui.test.jsx`
- `src/App.auto-approve.ui.test.jsx`

regression_gate:

- 최소: `npm run test:ui`
- 권장: `npm run qa`

runtime_signals:

- Work 패널 열기/닫기 정상 동작
- 좌우 도킹 전환 정상 동작
- 새로고침 후 open/dock 상태 복원
- `History/Repo/AutoOps`와 동시 오픈 시 레이아웃 붕괴 없음

## 3-5. Guardrails

- do_not_expand_into:
  - 채팅 제품화
  - 세션 엔진 전체 구현
  - 승인 레인 대체
  - OpenClaw 전체 연동
- escalation_conditions:
  - 기존 승인/반려/UNDO 회귀 발생
  - `App.jsx` 비대화가 훅 분리 기준을 깨는 수준으로 증가
  - 기존 패널과 레이아웃 충돌을 간단한 CSS 수정으로 해결할 수 없음
  - 상태 모델이 `Phase B-0` 범위를 넘어 서버 계약 변경을 요구함
- rollback_or_recovery_path:
  - `Work` 토글과 패널 렌더만 독립적으로 제거 가능해야 한다.
  - localStorage 키는 `maestro.work-console.*` 네임스페이스로 격리한다.

## 3-6. Drift / Hygiene

- likely_drift_points:
  - 목업 브랜치와 feature 브랜치의 UI 차이 확대
  - 문서의 허용 범위보다 구현이 먼저 확장되는 드리프트
  - placeholder 단계인데 실제 동작처럼 보이는 UX 오해
- scheduled_cleanup_rule:
  - mockup에서 채택되지 않은 실험 코드는 feature로 가져오지 않는다.
  - feature 브랜치 반영 전, 채택 UX를 짧은 체크리스트로 재정리한다.
  - 구현 완료 시 문서와 테스트 명령을 다시 맞춘다.
- candidate_future_automation:
  - 향후 문서-테스트-파일 존재 여부를 검사하는 작은 harness check 추가 검토

## 4. Execution Sequence

### Step 0. Agent Approval Protocol Roadmap

브랜치: `codex/work-console-feature`

목표:

- hook adapter 중심 문서를 `Agent Registry + ApprovalDecision Pull` 계약으로 현행화한다.
- 기존 `/api/request`를 legacy ingress로 정의한다.
- `git merge`를 decision 이후 executor action으로 분리하는 기준을 고정한다.
- goal 단위 실행 계획을 만들어 후속 구현이 순서대로 진행되게 한다.

하네스 파일:

- `.agent/orchestration-contract.md`
- `.agent/orchestration-status.md`
- `.agent/orchestration-log.md`
- `.agent/prompts/continue-to-goal.md`
- `.agent/prompts/run-validation-loop.md`
- `.agent/prompts/fix-failing-harness.md`
- `.agent/prompts/tdd-hardening.md`
- `.agent/prompts/final-review.md`

기준 문서:

- `docs/MAESTRO_AGENT_ADAPTERS_PLAN.md`
- `docs/superpowers/plans/2026-06-14-agent-approval-protocol-roadmap.md`
- `docs/version-upgrades/vu-001-openclaw-work-orchestration/README.md`

검증 명령:

- 문서/하네스 현행화만 수행한 경우: `npm run test:server`
- 구현 goal 수행 후: `npm run test`, `npm run build`
- 브라우저/통합 경로 변경 후: `npm run test:e2e` 또는 `npm run qa`

완료 기준:

- 사용자 결정값이 기준 문서에 반영됨
- Goal 0~6 실행 순서가 문서화됨
- 후속 구현은 Goal 단위로 커밋 가능함

### Step 1. Mockup Branch

브랜치: `codex/work-console-shell-mockup`

목표:

- 패널 위치, 폭, 헤더 액션, 빈 상태, 입력창 배치 결론 내기

완료 기준:

- 채택할 UI 구조가 정해짐
- 폐기할 안도 명시됨
- `feature` 브랜치로 넘길 변경 포인트가 정리됨

### Step 2. Feature Branch Phase B-0

브랜치: `codex/work-console-feature`

목표:

1. `useWorkConsoleShell` 추가
2. `WorkConsolePanel` 추가
3. `MaestroHeader`에 `Work` 토글 추가
4. `App.jsx` 연결
5. localStorage 복원/저장 연결
6. 회귀 테스트 추가

완료 기준:

- `PHASE_B0_WORK_CONSOLE_SHELL_PLAN`의 성공 기준 충족

### Step 3. Review Gate

판단 항목:

- 기존 승인 흐름 회귀 여부
- 패널 공존성
- 접근성 최소 기준 충족 여부
- 목업과 구현의 차이가 문서화되었는지

통과 시:

- 다음 단계 후보인 `Session Core`를 별도 계획으로 승격

## 5. Working Agreement

- 목업 판단은 `mockup` 브랜치에서 끝내고, 실제 제품 반영은 `feature` 브랜치에서만 한다.
- `feature` 브랜치의 목표는 `Stage 1 / Phase B-0 Shell UI` 완료까지다.
- `Session Core` 이상 단계는 같은 브랜치에서 계속 밀지 말고, 별도 계획 승인 후 이어간다.
- 모든 구현 판단은 “기존 승인 시스템을 대체하지 않는다”는 원칙 아래 둔다.
