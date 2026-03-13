# WP-010 Dynamic Lane Scaling Plan

기준일: 2026-03-13

## 목표

- 프로젝트별 승인 레인 수를 고정 4개에서 가변 설정으로 전환한다.
- 기존 핵심 흐름(승인/반려/롤백/자동승인/히스토리/프로젝트 전환)을 손상 없이 유지한다.
- 변경은 작은 단계로 쪼개고, 매 단계마다 회귀 게이트를 통과한 뒤 다음 단계로 진행한다.

## 현재 진단

2026-03-13 기준 전체 `npm run qa`는 녹색이다. 현재 4레인 가정은 아래에 분산되어 있다.

- 서버 입력/이력 정규화: `maestro-server.js`
- 실시간 수신/데모 스폰: `src/hooks/useMaestroRealtime.js`, `src/hooks/useMaestroGameLoop.js`
- UI 렌더링/키보드 입력: `src/App.jsx`, `src/hooks/useMaestroKeyboardControls.js`, `src/components/maestro/LaneBoard.jsx`
- 히스토리 시각화: `src/components/maestro/HistoryScorePanel.jsx`, `src/hooks/useApprovalHistory.js`
- 프로젝트 설정/운영 UX: `scripts/project-registry.mjs`, `scripts/projects.js`, `scripts/configure.js`, `src/components/maestro/ProjectRegistryPanel.jsx`
- 문서/테스트: `README.md`, `USER_GUIDE.md`, `docs/WORK_PLAN.md`, `tests/*`, `src/*.test.jsx`

핵심 결론:

- 실제 Git worktree 수를 서버가 추적하는 구조는 아니다.
- 현재 고정된 것은 `UI 승인 레인 수`이며, 서버 입력 검증도 여기에 종속돼 있다.
- 따라서 레인 수를 프로젝트 메타데이터로 끌어올리는 것이 가장 안전한 해법이다.

## 고정 실행 순서

1. 공통 레인 설정 계층 도입
2. 프로젝트 메타/환경변수/등록 UX에 레인 수 반영
3. 서버 입력 검증/기본 배정/헬스 응답 동적화
4. 실시간/UI/히스토리 동적 레인 렌더링
5. 문서/회귀 테스트/QA 재검증

## 단계별 계획

### Phase 1. 공통 레인 설정 계층

목표:

- 서버와 프론트가 같은 레인 수 규칙을 사용하게 만든다.

작업:

- `shared/lane-config.mjs` 추가
- 기본 레인 수/최소/최대, 기본 키 매핑, 색상 팔레트, 레인 정규화 함수 정의

완료 기준:

- 4레인 프로젝트는 기존 이름/키(`D/F/J/K`)를 그대로 유지한다.
- 1~8 레인 범위를 공통 함수 한 곳에서 정규화한다.

상태:

- 완료

### Phase 2. 프로젝트 설정 계층 확장

목표:

- 프로젝트별 `laneCount`를 저장/조회/영속화한다.

작업:

- registry 포맷에 `laneCount` 추가
- `.env`에 `MAESTRO_PROJECT_LANE_COUNT` 추가
- `project:add`, `configure`, `Repo` 패널 등록 폼에서 레인 수 입력 지원

완료 기준:

- 새 프로젝트 등록 시 레인 수가 저장된다.
- 기존 등록 프로젝트는 레인 수 미설정 시 기본값 4로 동작한다.

상태:

- 완료

### Phase 3. 서버 런타임 동적화

목표:

- 활성 프로젝트의 레인 수를 기준으로 `POST /api/request`를 처리한다.

작업:

- `/health`, `/api/projects` 응답에 `laneCount` 포함
- 요청 `laneIndex` 검증 범위를 활성 프로젝트의 레인 수로 전환
- `laneIndex` 미지정 시 활성 프로젝트 레인 수 범위에서 자동 배정

완료 기준:

- 6레인 프로젝트에서 `laneIndex: 6` 요청이 정상 브로드캐스트된다.
- 프로젝트 전환 시 런타임 레인 수가 함께 갱신된다.

상태:

- 완료

### Phase 4. 대시보드/히스토리 동적화

목표:

- 활성 프로젝트 레인 수에 맞춰 보드, 키 입력, 히스토리 overview가 변한다.

작업:

- `App`에서 활성 프로젝트 레인 수 기반 `activeLanes` 생성
- 키보드 훅/실시간 훅/데모 스폰 훅에 동적 레인 수 주입
- 히스토리 미니 오선뷰를 가변 레인 수에 맞게 조정

완료 기준:

- 레인 수가 6인 프로젝트에서 보드가 6칸으로 렌더링된다.
- 레인 6 승인 버튼이 정상 동작한다.
- 히스토리의 레인 요약이 현재 레인 수와 정합성을 유지한다.

상태:

- 완료

### Phase 5. 운영 보강

목표:

- 실제 운용에서 혼란을 줄이는 보강 작업을 정리한다.

완료 항목:

- 기존 프로젝트의 레인 수 수정 UX 추가
- 4레인/6레인 프로젝트 전환 스모크 시나리오 추가 (`npm run smoke:lanes`)

후속 항목:

- 8레인 초과 요구가 생기면 키보드 전략 재설계
- 레인 이름 커스터마이즈 필요성 검토

완료 기준:

- 운영 중 설정 변경 시나리오가 문서로 정리된다.
- 다음 스프린트 범위를 따로 분리한다.

상태:

- 완료

## 회귀 게이트

- 서버 회귀: `npm run test:server`
- UI 회귀: `npm run test:ui`
- 통합 게이트: `npm run qa`

모든 단계는 아래 조건을 만족해야 한다.

- 기존 승인/반려/롤백 흐름 유지
- 자동승인 상태/이벤트 패널 유지
- Repo 전환/등록 패널 유지
- `function bach` / History / 터치 컨트롤 회귀 없음

## 위험 메모

- 레인 수와 키보드 단축키는 1:1이 아니다. 현재는 최대 8개 키까지 안전하게 지원한다.
- 4레인 이외의 프로젝트는 기본적으로 일반화된 `Lane N` 이름을 사용한다.
- 이력 데이터는 과거 4레인 데이터와 혼재될 수 있으므로, 표시 레이어에서 현재 프로젝트 레인 수 기준으로 안전하게 clamp한다.
