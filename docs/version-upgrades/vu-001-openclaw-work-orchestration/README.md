# VU-001 OpenClaw Work Orchestration

기준일: 2026-03-14
상태: 설계 초안

## 1. 배경

현재 Maestro는 `결과 승인` 중심 도구다.

- 에이전트가 작업을 끝낸 뒤 `POST /api/request`로 승인 요청을 보낸다.
- 대시보드는 해당 요청을 레인에 띄우고 사람이 `APPROVE / REJECT / UNDO`를 수행한다.
- 승인 시 활성 프로젝트 기준으로 `git merge <branchName>`가 실행된다.

이 구조는 로컬 단일 운영자 기준의 승인 관제에는 충분하지만, OpenClaw와의 대화형 협업까지 확장하기에는 단계가 부족하다.

## 2. 현재 구조 검토 요약

### 강점

- 프로젝트 등록/전환, 레인 수(`1~8`) 관리, 히스토리, 자동승인, 토큰 인증, WebSocket 브로드캐스트가 이미 존재한다.
- 현재 `APPROVE / REJECT / UNDO` 흐름은 실프로젝트 스모크와 QA 게이트로 검증된 상태다.
- 대시보드가 이미 운영자 중심 UI를 갖고 있어, 추가 워크플로우 패널을 붙일 수 있는 기반이 있다.

### 한계

- 승인 단위가 `브랜치 머지 여부` 하나로 수렴되어 있다.
- 작업 시작 전 승인, 계획 검토, 중간 질의응답, 재지시 요청을 표현할 모델이 없다.
- 현재 `REJECT`는 사실상 결과물 반려와 에이전트 재시작만 의미한다.
- 작업 문맥이 `requestId` 단위 메타와 히스토리 요약에 머물러 대화 세션을 유지하지 못한다.

## 3. 버전업 목표

Maestro를 다음 역할로 확장한다.

- `작업 요청 관제`
- `작업 계획 승인`
- `OpenClaw와의 대화형 세션 관리`
- `결과물 승인`을 기존 머지 승인 흐름과 안전하게 연결

즉, 목표 제품은 다음과 같다.

- Maestro: 인간 승인/정책/우선순위/기록을 관리하는 관제 레이어
- OpenClaw: 작업 수행 및 응답을 생성하는 실행 에이전트
- Work Session Protocol: 둘 사이의 표준 계약

## 4. MVP 범위

이번 트랙에서 정의하는 MVP는 아래 4단계다.

1. Work Request 생성 및 승인
2. OpenClaw의 Work Plan 제출 및 승인
3. 사람-OpenClaw 간 작업 세션 메시지 교환
4. Delivery 제출 후 기존 `merge approval` 흐름으로 브리지

핵심은 기존 승인을 버리지 않는 것이다. 결과물 승인 단계는 현재 검증된 `APPROVE / REJECT / UNDO` 경로를 최대한 재사용한다.

## 5. 비목표

- 다중 운영자 동시 편집/충돌 해결
- 권한 체계 세분화(RBAC)
- 외부 DB 의존 강제
- 자유로운 레인 편집기 또는 8레인 초과 입력 설계
- 기존 `/api/request` 즉시 폐기

## 6. 단계별 권장 도입 순서

### Phase A. Work Request Intake

- 운영자가 작업 요청을 등록한다.
- OpenClaw에 작업 착수 허가를 보내기 전 사람이 요청 자체를 승인/반려한다.
- 이 단계에서는 기존 머지 승인 기능을 손대지 않는다.

### Phase B. Plan Review

- OpenClaw가 작업 계획을 제출한다.
- 운영자가 `approve / revise / reject`로 응답한다.
- 계획 승인 후에만 실제 구현 세션이 열린다.

### Phase C. Session + Delivery Bridge

- 작업 중 메시지 교환을 세션 이력으로 기록한다.
- 결과물이 제출되면 이를 현재 Maestro 승인 요청으로 승격(promote)한다.

### Phase D. Operability

- 이력, 검색, 필터, 장애 대응, 재시도, 세션 종료 규칙을 보강한다.
- 필요 시 자동승인 정책과도 연결하되, 기본값은 수동 승인 유지다.

## 7. 성공 기준

- 기존 `POST /api/request`와 대시보드 승인 동작에 회귀가 없어야 한다.
- Work Request 하나가 `요청 -> 계획 -> 실행 -> 결과 승인`으로 추적 가능해야 한다.
- 세션 복구 없이 서버 재시작 시 컨텍스트를 모두 잃어버리지 않도록 최소한의 경량 영속화 전략이 있어야 한다.
- OpenClaw 연결 장애가 발생해도 기존 Maestro는 독립적으로 계속 동작해야 한다.

## 8. 권장 가드레일

- `MAESTRO_WORKFLOW_ENABLED` 같은 기능 플래그 뒤에서만 도입
- 기존 대시보드 레인/히스토리와 신규 Work 패널을 분리
- 신규 API와 이벤트는 `WORK_*` 네임스페이스로 격리
- 머지 실행은 기존 승인 액션을 통해서만 최종 수행

## 9. 문서 맵

- Phase A 구현 계획: [`PHASE_A_WORK_REQUEST_INTAKE_PLAN.md`](./PHASE_A_WORK_REQUEST_INTAKE_PLAN.md)
- Phase B-0 Shell UI 계획: [`PHASE_B0_WORK_CONSOLE_SHELL_PLAN.md`](./PHASE_B0_WORK_CONSOLE_SHELL_PLAN.md)
- Branch harness 계획: [`WORK_CONSOLE_BRANCH_HARNESS_PLAN.md`](./WORK_CONSOLE_BRANCH_HARNESS_PLAN.md)
- Mockup 체크리스트: [`WORK_CONSOLE_MOCKUP_CHECKLIST.md`](./WORK_CONSOLE_MOCKUP_CHECKLIST.md)
- Phase B-0 실행 계약: [`WORK_CONSOLE_PHASE_B0_EXECUTION_PLAN.md`](./WORK_CONSOLE_PHASE_B0_EXECUTION_PLAN.md)
- Work Console 제품 계획: [`WORK_CONSOLE_PRODUCT_PLAN.md`](./WORK_CONSOLE_PRODUCT_PLAN.md)
- Work Console UI 설계: [`WORK_CONSOLE_UI_PLAN.md`](./WORK_CONSOLE_UI_PLAN.md)
- Work Console 명령 프로토콜: [`WORK_CONSOLE_COMMAND_PROTOCOL.md`](./WORK_CONSOLE_COMMAND_PROTOCOL.md)
- Work Console 리스크 검토: [`WORK_CONSOLE_RISK_REVIEW.md`](./WORK_CONSOLE_RISK_REVIEW.md)
- 아키텍처 초안: [`OPENCLAW_MVP_ARCHITECTURE.md`](./OPENCLAW_MVP_ARCHITECTURE.md)
- 데이터 모델/API 설계: [`WORK_REQUEST_WORK_APPROVAL_API.md`](./WORK_REQUEST_WORK_APPROVAL_API.md)
