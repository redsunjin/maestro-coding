# Work Request / Work Approval Data Model and API

기준일: 2026-03-14
대상 트랙: `VU-001`

## 1. 설계 원칙

- 기존 `POST /api/request`는 유지한다.
- 신규 API는 `/api/work-*` 네임스페이스로 분리한다.
- 최종 `git merge`는 기존 승인 경로만 사용한다.
- MVP는 단일 운영자 + 단일 승인 주체 기준이다.
- 신규 상태 전이는 모두 WebSocket `WORK_*` 이벤트로 브로드캐스트한다.

## 2. 핵심 엔티티

### 2-1. WorkRequest

| 필드 | 타입 | 설명 |
|---|---|---|
| `workRequestId` | string | `wrk_*` 형식 식별자 |
| `projectId` | string | Maestro 등록 프로젝트 ID |
| `laneIndex` | integer | `1..8`, 없으면 프로젝트 규칙 기준 자동 배정 |
| `source` | string | `dashboard`, `api`, `external` |
| `requestedBy` | string | 운영자 또는 시스템 식별자 |
| `preferredAgent` | string | 예: `openclaw` |
| `title` | string | 작업 제목 |
| `goal` | string | 수행 목표 |
| `constraints` | string[] | 금지사항/제약 |
| `acceptanceCriteria` | string[] | 완료 기준 |
| `targetBranch` | string | 기본 대상 브랜치, 예: `main` |
| `workflowState` | string | 상위 진행 상태 |
| `priority` | string | `low`, `normal`, `high`, `urgent` |
| `createdAt` | string | ISO datetime |
| `updatedAt` | string | ISO datetime |
| `metadata` | object | 확장 필드 |

권장 `workflowState`:

- `submitted`
- `request_approved`
- `request_rejected`
- `plan_review`
- `execution`
- `delivery_review`
- `completed`
- `returned`
- `cancelled`

### 2-2. WorkPlan

| 필드 | 타입 | 설명 |
|---|---|---|
| `workPlanId` | string | `wpl_*` 식별자 |
| `workRequestId` | string | 상위 WorkRequest ID |
| `version` | integer | 계획 버전 |
| `summary` | string | 계획 요약 |
| `steps` | object[] | 단계 목록 |
| `risks` | string[] | 예상 리스크 |
| `testStrategy` | string[] | 검증 계획 |
| `branchStrategy` | string | 브랜치 운용 계획 |
| `status` | string | `submitted`, `approved`, `revise_requested`, `rejected`, `superseded` |
| `submittedBy` | string | `openclaw` 등 |
| `createdAt` | string | ISO datetime |
| `updatedAt` | string | ISO datetime |

`steps` 항목 권장 형식:

```json
{
  "id": "step_1",
  "title": "API 추가",
  "description": "work request 생성 엔드포인트 구현",
  "status": "pending"
}
```

### 2-3. WorkSession

| 필드 | 타입 | 설명 |
|---|---|---|
| `workSessionId` | string | `wsn_*` 식별자 |
| `workRequestId` | string | 상위 WorkRequest ID |
| `agentId` | string | `openclaw` 등 |
| `externalSessionId` | string | OpenClaw 쪽 세션 ID |
| `status` | string | `queued`, `active`, `blocked`, `completed`, `failed`, `cancelled` |
| `startedAt` | string | ISO datetime |
| `endedAt` | string | ISO datetime nullable |
| `lastMessageAt` | string | ISO datetime nullable |
| `metadata` | object | 커넥터별 상태 정보 |

### 2-4. WorkMessage

| 필드 | 타입 | 설명 |
|---|---|---|
| `workMessageId` | string | `wmsg_*` 식별자 |
| `workSessionId` | string | 상위 WorkSession ID |
| `role` | string | `operator`, `agent`, `system` |
| `kind` | string | `message`, `question`, `status`, `warning`, `decision` |
| `body` | string | 메시지 본문 |
| `visibility` | string | `internal`, `shared` |
| `createdAt` | string | ISO datetime |

### 2-5. WorkDelivery

| 필드 | 타입 | 설명 |
|---|---|---|
| `workDeliveryId` | string | `wdl_*` 식별자 |
| `workRequestId` | string | 상위 WorkRequest ID |
| `workSessionId` | string | 상위 WorkSession ID |
| `branchName` | string | 결과 브랜치 |
| `commitSha` | string | 대표 커밋 |
| `diffSummary` | object | 기존 approval payload와 유사한 요약 |
| `testSummary` | object | 실행 테스트/결과 |
| `artifacts` | object[] | 링크/파일 메타 |
| `status` | string | `submitted`, `promoted`, `approved`, `rejected`, `superseded` |
| `createdAt` | string | ISO datetime |
| `updatedAt` | string | ISO datetime |

### 2-6. WorkDecision

| 필드 | 타입 | 설명 |
|---|---|---|
| `decisionId` | string | `dec_*` 식별자 |
| `scopeType` | string | `request`, `plan`, `delivery` |
| `scopeId` | string | 대상 엔티티 ID |
| `workRequestId` | string | 상위 WorkRequest ID |
| `decision` | string | `approve`, `reject`, `revise`, `ask`, `cancel` |
| `comment` | string | 운영자 코멘트 |
| `decidedBy` | string | 사용자/시스템 식별자 |
| `createdAt` | string | ISO datetime |

## 3. 저장 전략

### 런타임

- `Map<workRequestId, WorkRequest>`
- `Map<workPlanId, WorkPlan>`
- `Map<workSessionId, WorkSession>`
- `Map<workDeliveryId, WorkDelivery>`
- `Map<scopeId, WorkDecision[]>`
- 최근 메시지/결정/이벤트는 링버퍼 캐시

### 경량 영속화

- 파일 예시: `.maestro-workflows.json`
- 저장 단위:
  - 열린 request 전체
  - 닫힌 request 최근 N개
  - 각 request의 최신 approved plan
  - 최근 메시지 M개

이유:

- MVP에서 외부 DB 없이 운영 가능
- 재시작 후 세션 상실을 줄일 수 있음
- 현행 Maestro 구조와 결합 비용이 낮음

## 4. REST API 제안

### 4-1. Work Request 생성

`POST /api/work-requests`

요청 예시:

```json
{
  "projectId": "alpha",
  "laneIndex": 2,
  "preferredAgent": "openclaw",
  "title": "승인 이력 export 설계",
  "goal": "승인 이력을 JSON/CSV로 내보내는 기능을 정의한다.",
  "constraints": ["기존 /api/history 호환 유지", "기본값은 수동 승인"],
  "acceptanceCriteria": ["설계 문서 1개 이상", "API 영향도 정리"],
  "priority": "normal",
  "targetBranch": "main"
}
```

응답 예시:

```json
{
  "success": true,
  "item": {
    "workRequestId": "wrk_1710400000000",
    "workflowState": "submitted"
  }
}
```

브로드캐스트:

- `WORK_REQUEST_CREATED`

### 4-2. Work Request 목록/상세

- `GET /api/work-requests?projectId=&workflowState=&limit=`
- `GET /api/work-requests/:workRequestId`

브로드캐스트 없음

### 4-3. Work Request 결정

`POST /api/work-requests/:workRequestId/decision`

요청 예시:

```json
{
  "decision": "approve",
  "comment": "계획 제출 전까지 구현 착수 금지",
  "decidedBy": "operator_1"
}
```

승인 시 효과:

- `workflowState` -> `request_approved`
- OpenClaw connector가 있으면 착수 요청 전송
- 이후 상태를 `plan_review` 또는 `execution`으로 이동

브로드캐스트:

- `WORK_REQUEST_DECIDED`

### 4-4. Work Plan 제출

`POST /api/work-requests/:workRequestId/plans`

요청 예시:

```json
{
  "submittedBy": "openclaw",
  "summary": "세 단계로 나눠 구현합니다.",
  "steps": [
    { "id": "step_1", "title": "API 정의", "description": "신규 엔드포인트 초안", "status": "pending" },
    { "id": "step_2", "title": "UI 패널", "description": "워크 요청 패널 추가", "status": "pending" }
  ],
  "risks": ["기존 승인 흐름 회귀 가능성"],
  "testStrategy": ["npm run qa", "workflow smoke"]
}
```

브로드캐스트:

- `WORK_PLAN_SUBMITTED`

### 4-5. Work Plan 결정

`POST /api/work-plans/:workPlanId/decision`

요청 예시:

```json
{
  "decision": "revise",
  "comment": "먼저 API를 고정하고 UI는 두 번째 단계로 미뤄주세요.",
  "decidedBy": "operator_1"
}
```

결정 규칙:

- `approve` -> plan `approved`, request `execution`
- `revise` -> plan `revise_requested`, request `plan_review`
- `reject` -> plan `rejected`, request `returned`

브로드캐스트:

- `WORK_PLAN_DECIDED`

### 4-6. Session Message 추가

`POST /api/work-sessions/:workSessionId/messages`

요청 예시:

```json
{
  "role": "agent",
  "kind": "question",
  "body": "기존 history export는 CSV 우선으로 보십니까?",
  "visibility": "shared"
}
```

브로드캐스트:

- `WORK_MESSAGE_APPENDED`

### 4-7. Delivery 제출

`POST /api/work-requests/:workRequestId/deliveries`

요청 예시:

```json
{
  "workSessionId": "wsn_1710400100000",
  "branchName": "feature/history-export",
  "commitSha": "abc1234",
  "diffSummary": {
    "title": "승인 이력 export 설계 및 API 초안",
    "impact": "Medium",
    "shortDescription": "CSV/JSON export 초안과 문서 반영"
  },
  "testSummary": {
    "executed": ["npm run qa"],
    "status": "passed"
  }
}
```

브로드캐스트:

- `WORK_DELIVERY_SUBMITTED`

### 4-8. Delivery 결정

`POST /api/work-deliveries/:workDeliveryId/decision`

허용 결정:

- `approve`
- `reject`
- `revise`

`approve` 시 동작:

1. Delivery 상태를 `promoted`로 변경
2. 내부적으로 기존 approval request payload 생성
3. 기존 `AGENT_TASK_READY`를 브로드캐스트
4. 이후 최종 머지는 현재 레인 승인 UI가 처리

브로드캐스트:

- `WORK_DELIVERY_DECIDED`
- `WORK_DELIVERY_PROMOTED`

## 5. 기존 Approval Flow와의 브리지 규칙

Delivery 승인 후 생성되는 내부 approval payload 권장 형식:

```json
{
  "requestId": "req_bridge_wdl_1710400200000",
  "agentId": "openclaw",
  "projectId": "alpha",
  "laneIndex": 2,
  "branchName": "feature/history-export",
  "workRequestId": "wrk_1710400000000",
  "workDeliveryId": "wdl_1710400200000",
  "diffSummary": {
    "title": "승인 이력 export 설계 및 API 초안",
    "impact": "Medium",
    "shortDescription": "CSV/JSON export 초안과 문서 반영"
  }
}
```

중요 원칙:

- Work Delivery 승인과 Git merge 승인은 같은 것이 아니다.
- Delivery 승인 후에도 기존 승인 레인에서 최종 merge 확인을 한 번 더 거친다.
- 이 구조 덕분에 기존 `UNDO`, `history`, `auto approve` 정책과의 결합을 단계적으로 조정할 수 있다.

## 6. WebSocket 이벤트 제안

| 이벤트 | 의미 |
|---|---|
| `WORK_REQUEST_CREATED` | Work Request 생성 |
| `WORK_REQUEST_DECIDED` | Work Request 승인/반려/취소 |
| `WORK_PLAN_SUBMITTED` | OpenClaw 계획 제출 |
| `WORK_PLAN_DECIDED` | 계획 승인/수정/반려 |
| `WORK_SESSION_STARTED` | 세션 시작 |
| `WORK_MESSAGE_APPENDED` | 세션 메시지 추가 |
| `WORK_DELIVERY_SUBMITTED` | 결과물 제출 |
| `WORK_DELIVERY_DECIDED` | 결과물 결정 |
| `WORK_DELIVERY_PROMOTED` | 기존 merge approval로 승격 |
| `WORK_COMPLETED` | 기존 merge 승인까지 완료 |

## 7. 호환성 및 마이그레이션

### 유지해야 할 것

- `/api/request`
- `/api/history`
- `/api/projects`
- `/api/auto-approve/*`
- WebSocket `APPROVE / REJECT / UNDO` 액션과 기존 이벤트

### 신규 기능 플래그 권장

- `MAESTRO_WORKFLOW_ENABLED`
- `MAESTRO_OPENCLAW_BASE_URL`
- `MAESTRO_OPENCLAW_TOKEN`
- `MAESTRO_WORKFLOW_STORE_PATH`

### 롤백 경로

- 기능 플래그 OFF 시 `/api/work-*`와 Work 패널만 비활성화
- 기존 승인 대시보드는 동일하게 유지
- 영속화 파일은 읽지 않거나 보존만 하고 무시 가능

## 8. 권장 1차 구현 범위

1. Work Request 생성/조회/결정 API
2. Work Plan 제출/결정 API
3. Delivery 제출/결정 API
4. Delivery -> 기존 approval 브리지
5. 최소 메시지 이력

세션 스트리밍, 다중 운영자 충돌 해결, 외부 이슈 트래커 연동은 2차 이후로 미룬다.
