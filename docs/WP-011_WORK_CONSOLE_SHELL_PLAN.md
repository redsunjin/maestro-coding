# WP-011 Work Console Shell Plan

기준일: 2026-03-31
대상: Maestro Coding `VU-001` 후속 UI 브랜치 작업

## 1) 목표

- `Work Console`의 1차 Shell UI를 대시보드에 안전하게 도입한다.
- 기존 승인/반려/UNDO/History/Repo/AutoOps/function bach 흐름을 손상하지 않는다.
- 실제 세션/명령/카드 로직 없이도 패널 구조, 도킹, 접근성, 회귀 게이트를 먼저 고정한다.

## 2) 구현 범위

포함:

- 헤더 `Work` 토글 버튼
- `Work Console` 패널 쉘
- 좌/우 도킹 전환
- localStorage 기반 열림/도킹 상태 복원
- 세션 리스트 placeholder
- 현재 세션 타임라인 placeholder
- 명령 입력창 shell
- 접근성 속성(`dialog`, `aria-controls`, 포커스 이동)
- UI 회귀 테스트

제외:

- 실제 `WorkSession` API
- 메시지 전송/저장
- `Plan Card` / `Commit Proposal Card` / `Delivery Card`
- OpenClaw connector
- 승인 레인 승격 브리지

## 3) 구현 파일

신규:

- `src/hooks/useWorkConsoleShell.js`
- `src/components/maestro/WorkConsolePanel.jsx`
- `src/App.work-console.ui.test.jsx`

수정:

- `src/App.jsx`
- `src/components/maestro/MaestroHeader.jsx`

## 4) 구현 결과

- `Work` 버튼으로 패널 open/close 가능
- 좌/우 도킹 위치 전환 가능
- 새로고침 후 `maestro.work-console.open`, `maestro.work-console.dock-side` 복원
- `History` 패널과 동시 오픈 가능
- 닫기 버튼에 포커스 이동
- 패널은 `shell` 상태를 명시해 실제 기능으로 오해되지 않게 표시

## 5) 검증 게이트

- `npm run test:ui -- src/App.work-console.ui.test.jsx src/App.history.ui.test.jsx src/App.project-registry.ui.test.jsx src/App.auto-approve.ui.test.jsx`
- `npm run build`
- `npm run qa`

결과:

- 2026-03-31 기준 전부 통과

## 6) 가드레일 확인

- `Work Console`은 기존 승인 시스템을 대체하지 않는다.
- `Phase B-0` 범위를 넘는 서버 계약은 추가하지 않았다.
- 단축키는 보류했다.
- 실패 시 패널 토글/렌더만 제거하면 복구 가능한 구조를 유지한다.

## 7) 다음 단계

후속은 `Session Core` 별도 계획으로 분리한다.

후속 후보:

1. `WorkSession` 목록/상세 조회
2. 텍스트 메시지 저장
3. 명령 히스토리 저장
4. 장애/재시도 표기

중요:

- 이 문서는 `Phase B-0 Shell UI` 구현 승격 문서다.
- 상세 설계 원문은 계속 [`docs/version-upgrades/vu-001-openclaw-work-orchestration/PHASE_B0_WORK_CONSOLE_SHELL_PLAN.md`](./version-upgrades/vu-001-openclaw-work-orchestration/PHASE_B0_WORK_CONSOLE_SHELL_PLAN.md)를 기준으로 본다.
