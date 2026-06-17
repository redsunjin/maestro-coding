# Maestro Agent Adapters and Approval Protocol Plan

기준일: 2026-06-14
상태: Goal 4 구현 반영

## 1. 목적

Maestro가 특정 CLI의 수동 훅 설정에만 묶이지 않도록, `에이전트 완료 -> Maestro 승인 요청` 연결을 어댑터 계층으로 일반화한다.

목표:

- 사용자는 1회 설치 명령만으로 Maestro 연동을 켤 수 있어야 한다.
- CLI마다 다른 hook / plugin / wrapper 방식을 같은 제품 언어로 설명할 수 있어야 한다.
- 핵심 계약은 항상 동일해야 한다.
  - 등록된 `Agent`
  - 에이전트가 생성하는 `ApprovalRequest`
  - Maestro가 저장하는 `ApprovalDecision`
  - 승인 결정 이후 실행되는 `Executor`

핵심 방향:

- `hook`은 입력 어댑터일 뿐 중심 계약이 아니다.
- `POST /api/request`는 유지하지만 legacy ingress로 격하한다.
- 새 계약의 중심은 `Agent Registry + Approval Request Store + Approval Decision Store`다.
- 승인 결과 전달은 `Pull-first`로 한다.
- `git merge`는 decision 자체가 아니라 decision 이후 executor action이다.

## 2. 현재 구현 상태

현재 제공되는 연결 방식:

- `hooks/notify-maestro.sh`
- `Claude Code Stop Hook`
- `git post-commit hook`
- `POST /api/agents/register`, `POST /api/agents/:agentId/heartbeat`
- `POST /api/approval-requests`
- legacy ingress `POST /api/request`
- `GET /api/approval-requests/:requestId/decision`
- `POST /api/approval-decisions/:decisionId/ack`

현재 한계:

- CLI별 설치 절차가 사용자에게 분산되어 있다.
- 완전한 “플러그인 마켓” 경험은 아니다.
- 다른 에이전트 CLI에 대한 표준 어댑터 명세가 아직 없다.
- 에이전트가 Maestro의 결정을 안정적으로 회수하는 API 계약이 없다.
- 승인 결과가 `ApprovalDecision`으로 저장되기보다 서버의 merge 실행 결과로 보인다.

## 3. 어댑터 계층 정의

### Adapter Contract

모든 어댑터는 아래 단계 중 하나를 자동화한다.

1. 에이전트 등록 또는 식별
2. 작업 완료 이벤트 감지
3. 브랜치/제목/요약 수집
4. `ApprovalRequest` 생성
5. `ApprovalDecision` 조회
6. 결정 전달 완료 `ack` 기록

### Adapter Types

- `hook adapter`
  - 예: Claude Stop Hook, git post-commit
- `wrapper adapter`
  - 예: 특정 CLI 실행 후 결과를 읽고 Maestro로 전송
- `native plugin adapter`
  - 예: 대상 CLI가 공식 plugin/hook SDK를 제공할 때

## 4. 확정 계약 결정

### 4-1. Agent 등록 모델

추천 모델을 채택한다.

```json
{
  "agentId": "claude_code_local",
  "adapterType": "claude-stop",
  "repoRoot": "/Users/Agent/ps-workspace/maestro",
  "displayName": "Claude Code Local",
  "capabilities": ["approval-request", "decision-polling"],
  "tokenId": "optional-local-token-id",
  "lastHeartbeatAt": "2026-06-14T00:00:00.000Z",
  "metadata": {
    "cli": "claude-code",
    "installTarget": "claude-stop"
  }
}
```

필수 필드:

- `agentId`
- `adapterType`
- `repoRoot`
- `capabilities`
- `lastHeartbeatAt`

MVP에서는 토큰을 선택 필드로 두고, 기존 `MAESTRO_SERVER_TOKEN` 인증 경계를 재사용한다.

### 4-2. ApprovalRequest

새 API의 기본 생성 엔드포인트는 `POST /api/approval-requests`다.

```json
{
  "requestId": "apr_1710400000000",
  "agentId": "claude_code_local",
  "projectId": "runtime_default",
  "repoRoot": "/Users/Agent/ps-workspace/maestro",
  "branchName": "feature/history-export",
  "diffSummary": {
    "title": "승인 이력 export 설계",
    "impact": "Medium",
    "shortDescription": "CSV/JSON export 계약 문서 추가"
  },
  "source": "agent",
  "legacyRequestId": "req_1710400000000",
  "status": "pending_decision",
  "createdAt": "2026-06-14T00:00:00.000Z",
  "updatedAt": "2026-06-14T00:00:00.000Z"
}
```

호환 규칙:

- 기존 `POST /api/request`는 유지한다.
- 내부적으로는 가능한 한 같은 request meta와 상태 모델을 쓰되, 새 구현부터는 `ApprovalRequest` 생성 경로로 브리지한다.
- 기존 `AGENT_TASK_READY` 이벤트는 계속 브로드캐스트한다.

### 4-3. ApprovalDecision

```json
{
  "decisionId": "apd_1710400100000",
  "requestId": "apr_1710400000000",
  "agentId": "claude_code_local",
  "decision": "approve",
  "comment": "승인합니다. 기존 merge executor로 진행합니다.",
  "executorAction": "merge",
  "delivery": {
    "mode": "pull",
    "status": "available",
    "acknowledgedAt": null
  },
  "decidedBy": "operator",
  "createdAt": "2026-06-14T00:00:00.000Z"
}
```

허용 decision:

- `approve`
- `reject`
- `revise`
- `ask`
- `cancel`

허용 `executorAction`:

- `none`
- `merge`

원칙:

- `ApprovalDecision.decision`은 사람 또는 정책의 판단이다.
- `executorAction`은 판단 이후 Maestro가 실행할 수 있는 동작이다.
- `git merge`는 `approve + executorAction=merge`일 때만 기존 executor를 통해 실행된다.

### 4-4. Pull-first 전달 모델

기본 API:

- `POST /api/agents/register`
- `POST /api/agents/:agentId/heartbeat`
- `POST /api/approval-requests`
- `GET /api/approval-requests/:requestId/decision`
- `POST /api/approval-decisions/:decisionId/ack`

보조 채널:

- Dashboard 실시간 표시에는 기존 WebSocket을 유지한다.
- Agent callback, SSE, WebSocket push는 MVP 이후 확장으로 둔다.

## 5. Goal 단위 로드맵

### Goal 0. Hook 자동화 변경 분리

목표:

- 현재 미커밋된 `install:hook` 변경을 단기 운영성 개선으로 분리한다.

주요 산출물:

- `scripts/install-maestro-hook.mjs`
- `tests/install-hook.test.mjs`
- `package.json`의 `install:hook`
- `README.md`, `USER_GUIDE.md` 설치 안내

완료 기준:

- `npm run test:server` 통과
- 가능하면 `npm run qa` 통과
- 아키텍처 변경과 별도 커밋으로 정리

### Goal 1. 계약 문서 및 하네스 기준 현행화

목표:

- 본 문서를 Agent Registry + Approval Protocol 기준 문서로 승격한다.
- `.agent/orchestration-*` 하네스가 이 계약을 기준으로 다음 작업을 안내하게 한다.

주요 산출물:

- `docs/MAESTRO_AGENT_ADAPTERS_PLAN.md`
- `docs/version-upgrades/vu-001-openclaw-work-orchestration/README.md`
- `docs/version-upgrades/vu-001-openclaw-work-orchestration/WORK_CONSOLE_BRANCH_HARNESS_PLAN.md`
- `.agent/orchestration-contract.md`
- `.agent/orchestration-status.md`
- `docs/superpowers/plans/2026-06-14-agent-approval-protocol-roadmap.md`

완료 기준:

- 사용자 결정값 1~6이 문서에 반영됨
- 이후 구현 goal의 순서와 검증 명령이 문서에서 추적 가능함

### Goal 2. Agent Registry MVP

목표:

- 등록된 에이전트와 heartbeat 상태를 저장/조회한다.

권장 API:

- `POST /api/agents/register`
- `POST /api/agents/:agentId/heartbeat`
- `GET /api/agents`
- `GET /api/agents/:agentId`

완료 기준:

- 서버 테스트로 등록, 중복 등록 upsert, heartbeat 갱신, 인증 분기를 검증
- Work Console 또는 운영 패널에서 연결 상태를 표시할 준비가 됨

### Goal 3. ApprovalRequest Store와 legacy ingress 브리지

목표:

- 새 `POST /api/approval-requests`를 추가하고 기존 `/api/request`를 호환 ingress로 유지한다.

완료 기준:

- 새 API가 `ApprovalRequest`를 생성함
- 기존 `/api/request`가 회귀 없이 `AGENT_TASK_READY`를 발생시킴
- 새 request 상태가 decision을 기다리는 상태로 남음

현재 구현:

- `POST /api/approval-requests`는 `ApprovalRequest`를 생성하고 `status=pending_decision`으로 저장한다.
- 생성된 request는 기존 `AGENT_TASK_READY` WebSocket 이벤트와 `REQUESTED / AGENT_TASK_READY` history entry를 계속 발생시킨다.
- 기존 `POST /api/request`는 `source=legacy`, `legacyRequestId=<requestId>`로 같은 request store에 브리지하며, 기존 `success: true`, `requestId`, `autoApprove` 응답을 유지하고 `item`을 추가로 반환한다.
- 기존 `requestStateById`는 executor 분리가 끝날 때까지 유지한다.

### Goal 4. ApprovalDecision Pull API

목표:

- Maestro가 승인/반려/수정요청을 decision으로 저장하고 에이전트가 polling으로 회수한다.

권장 API:

- `GET /api/approval-requests/:requestId/decision`
- `POST /api/approval-decisions/:decisionId/ack`

완료 기준:

- decision 없음은 `204` 또는 명확한 `pending` 응답으로 표현
- decision 있음은 안정적으로 반환
- ack 후 `delivery.status=acknowledged`로 상태 갱신

현재 구현:

- `GET /api/approval-requests/:requestId/decision`은 저장된 request에 decision이 없으면 `status=pending`, `item=null`을 반환한다.
- 알 수 없는 request는 `404 APPROVAL_REQUEST_NOT_FOUND`를 반환한다.
- manual `APPROVE`는 `decision=approve`, `executorAction=merge`, `delivery.mode=pull` decision을 저장한다.
- manual `REJECT`는 `decision=reject`, `executorAction=none`, feedback comment를 포함한 decision을 저장한다.
- `POST /api/approval-decisions/:decisionId/ack`는 `delivery.status=acknowledged`와 `acknowledgedAt`을 기록하며 반복 ack는 같은 값을 유지한다.

### Goal 5. Executor 분리

목표:

- `approve` 판단과 `git merge` 실행을 분리한다.

완료 기준:

- `ApprovalDecision` 생성이 먼저 일어남
- `executorAction=merge`일 때만 기존 `gitOps.mergeAgentBranch()`가 호출됨
- 실패 시 decision은 남고 executor result만 실패로 기록됨
- 기존 manual approve/auto approve 회귀 없음

### Goal 6. Work Console 신뢰 표시

목표:

- 사용자가 어떤 에이전트가 연결돼 있고, 마지막 요청/결정/ack 상태가 무엇인지 볼 수 있게 한다.

완료 기준:

- Work Console 또는 별도 운영 패널에 agent connection summary 표시
- 마지막 heartbeat, 마지막 request, 마지막 decision, ack 상태 표시
- 화면 표시는 운영 가시성에 한정하고 adapter marketplace UI는 보류

## 6. 우선순위

### Stage 1. 1회 설치 자동화

### Stage 1. 1회 설치 자동화

- `scripts/install-maestro-hook.mjs`
- 지원 대상:
  - `git-post-commit`
  - `claude-stop`
- 목적:
  - 사용자가 긴 가이드를 따라 수동 편집하지 않게 한다.

### Stage 2. 다중 CLI 어댑터 카탈로그

- 문서로 지원 매트릭스 제공
- CLI별:
  - 설치 위치
  - 완료 이벤트 시점
  - payload 소스
  - 제약 조건

예시 후보:

- Claude Code
- git-only workflow
- generic shell wrapper
- 향후 공식 hook API를 가진 에이전트 CLI

### Stage 3. 플러그인형 배포

조건:

- 대상 CLI가 공식 plugin 또는 extension 배포 모델을 제공해야 한다.

후보:

- CLI별 settings 템플릿 생성기
- 단일 `maestro adapter install <target>` 명령
- 상태 점검 `maestro adapter doctor`

## 7. 제품 관점 결론

사용자에게 다가가기 위해 필요한 것은 단순한 hook 스크립트 자체가 아니라:

- 1회 설치 경험
- 대상 CLI별 어댑터 패키지화
- 진단 가능한 상태 확인 명령
- 등록된 에이전트의 연결 상태
- 유실되지 않는 승인 결정 전달
- decision과 executor를 분리한 감사 가능한 흐름

따라서 단기 해법은 `설치 스크립트`, 중기 해법은 `Agent Registry + Pull-first ApprovalDecision`, 장기 해법은 `네이티브 플러그인`이다.
