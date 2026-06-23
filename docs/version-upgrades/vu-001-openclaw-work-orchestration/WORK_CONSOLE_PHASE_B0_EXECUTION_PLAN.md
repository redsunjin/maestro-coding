# Work Console Phase B-0 Execution Plan

기준일: 2026-03-29
대상 브랜치: `codex/work-console-feature`
상태: 실행 계약 초안

## 1. Work Identity

- version_track: `VU-001 / Work Console`
- branch_scope: `codex/work-console-feature`
- official_active_loop: 기존 `WORK_PLAN` 유지, 본 문서는 브랜치 실행 계약으로 사용
- user_visible_change:
  - 헤더 `Work` 토글
  - 도킹 가능한 `Work Console` 패널
  - 세션/타임라인/입력창 placeholder

## 2. Scope

in:

- `useWorkConsoleShell` 추가
- `WorkConsolePanel` 추가
- `App.jsx` 연결
- `MaestroHeader.jsx` 토글 추가
- localStorage open/dock 상태 복원
- 접근성 속성
- UI 회귀 테스트

out:

- 실제 `WorkSession` API
- 메시지 저장/전송
- 구조화 카드 렌더러
- OpenClaw connector
- 승인 레인 승격

## 3. File Ownership

신규 파일:

- `src/hooks/useWorkConsoleShell.js`
- `src/components/maestro/WorkConsolePanel.jsx`
- `src/App.work-console.ui.test.jsx`

수정 파일:

- `src/App.jsx`
- `src/components/maestro/MaestroHeader.jsx`
- `src/test/appUiHarness.jsx`

보류 파일:

- `src/hooks/useMaestroKeyboardControls.js`
  - 단축키는 이번 단계에서 기본 미도입

## 4. Build Sequence

1. 상태 훅 추가
2. 정적 패널 컴포넌트 추가
3. 헤더 토글 연결
4. `App.jsx`에 패널 렌더 연결
5. localStorage 복원/저장 연결
6. 기존 패널 공존 레이아웃 조정
7. UI 회귀 테스트 추가

## 5. Evaluators

static_checks:

- App에 Work Console 세부 상태가 과도하게 직접 들어가지 않았는지 확인
- localStorage 키가 `maestro.work-console.*`로 격리됐는지 확인

targeted_tests:

- `src/App.work-console.ui.test.jsx`
- `src/App.history.ui.test.jsx`
- `src/App.project-registry.ui.test.jsx`
- `src/App.auto-approve.ui.test.jsx`

regression_gate:

- 최소: `npm run test:ui`
- 권장: `npm run qa`

runtime_checks:

- Work 버튼 클릭 시 패널 open/close
- left/right 이동 시 위치 변경
- 새로고침 후 상태 복원
- `History/Repo/AutoOps` 동시 오픈 시 화면 붕괴 없음

## 6. Guardrails

- 채팅 제품처럼 보이는 UI로 확장하지 않는다.
- `Phase B-0` 범위를 넘는 서버 계약 추가를 하지 않는다.
- 기존 승인/반려/UNDO 흐름을 건드리지 않는다.
- 패널 실패가 메인 승인 화면을 막지 않게 독립 렌더 경계를 유지한다.

## 7. Done Criteria

- [PHASE_B0_WORK_CONSOLE_SHELL_PLAN.md](/Users/Agent/ps-workspace/maestro/docs/version-upgrades/vu-001-openclaw-work-orchestration/PHASE_B0_WORK_CONSOLE_SHELL_PLAN.md)의 성공 기준을 충족한다.
- mockup 브랜치에서 채택한 UI 판단이 반영된다.
- 테스트와 문서가 같이 갱신된다.
- 다음 단계인 `Session Core` 착수 없이 여기서 멈출 수 있다.
