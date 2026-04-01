# Work Console Session Core Plan

기준일: 2026-04-01
대상 트랙: `VU-001`
상태: 구현 계획 초안

## 0. 전문가 검토 요약

### Product / Ops

- `Session Core`는 `실제 대화와 명령 기록`까지만 다루고, 카드/승인 브리지는 뒤로 미루는 것이 맞다.
- 첫 단계에서 꼭 필요한 것은 `세션 생성`, `상세 조회`, `최소 명령`, `재시작 복구`다.
- 세션이 비어 있는 상태에서도 운영자가 직접 `새 작업 시작`을 할 수 있어야 한다.

### Backend

- 현재 서버 구조와 가장 잘 맞는 방식은 `메모리 맵 + JSON snapshot`이다.
- `WORK_*` / `COMMAND_*` 네임스페이스를 유지해 기존 승인 이벤트와 섞이지 않게 해야 한다.
- `/status`, `/ask`, `/close`만 먼저 연결하고 나머지 명령은 보류하는 것이 안전하다.

### Security

- 신규 API도 기존 서버 토큰 정책과 같은 인증 경계를 유지해야 한다.
- 본 단계에서는 `/merge`, `/undo`, 직접 git 실행 계열 명령을 금지한다.
- 메시지/명령 본문은 길이 제한과 텍스트 정규화를 거쳐 저장해야 한다.

### QA

- 서버 검증은 `세션 생성/조회`, `명령 결과`, `재시작 복구` 세 축으로 고정한다.
- UI 검증은 `목록 로드`, `세션 선택`, `메시지 전송`, `명령 결과 표시`, `기존 패널 공존`을 본다.

검토 반영 결과:

- 본 계획은 `Session Core = 세션/메시지/최소 명령/복구`로 범위를 고정한다.
- `Structured Cards`와 `Approval Bridge`는 이번 범위에서 제외를 유지한다.

## 1. 목적

이 단계의 목적은 `Work Console`을 단순 shell UI에서 실제 세션 조회/기록이 가능한 상태로 올리는 것이다.

이번 단계에서 반드시 해결해야 하는 문제:

- `WorkSession` 목록과 현재 세션 상세를 실제 데이터로 렌더링해야 한다.
- 운영자와 에이전트 메시지를 세션 이력으로 남겨야 한다.
- slash command 실행 기록과 결과를 남겨야 한다.
- 서버 재시작 후 열린 세션과 최근 메시지를 복구할 수 있어야 한다.

중요:

- 이 단계는 `Structured Cards`와 `Approval Bridge` 이전 단계다.
- `Plan Card`, `Commit Proposal Card`, `Delivery Card`는 아직 넣지 않는다.
- 기존 승인 레인과 머지 엔진은 그대로 유지한다.

## 2. 범위

### 포함

- `WorkSession` 목록 조회
- 단일 세션 상세 조회
- 일반 메시지 저장/조회
- 명령 입력 수신 및 `command_result` 저장
- 최소 명령 세트 일부 연결
  - `/status`
  - `/ask`
  - `/close`
- `WORK_*` / `COMMAND_*` WebSocket 브로드캐스트
- 경량 파일 기반 영속화
- `Work Console` 패널에 실제 세션/타임라인 렌더 연결
- 서버/UI 회귀 테스트

### 제외

- `Plan Card`
- `Commit Proposal Card`
- `Delivery Card`
- OpenClaw 실제 외부 커넥터 연결
- 기존 승인 레인 승격 로직
- 검색/필터/아카이브

## 3. 성공 기준

- 적어도 한 개의 `WorkSession`을 생성하고 목록에서 선택할 수 있어야 한다.
- 운영자 메시지를 보내면 세션 타임라인에 즉시 반영되어야 한다.
- `/status`는 현재 세션 상태를 `command_result`로 남겨야 한다.
- `/close`는 조건이 허용될 때 세션을 종료하고 상태를 갱신해야 한다.
- 서버 재시작 후 열린 세션과 최근 메시지가 복구되어야 한다.
- 기존 승인/반려/UNDO/History/Repo/AutoOps 회귀가 없어야 한다.

## 4. 핵심 엔티티 범위

이번 단계에서 실제로 다룰 엔티티:

- `WorkSession`
- `WorkMessage`
- `CommandResult`

이번 단계에서 참조만 하고 본격 구현하지 않을 엔티티:

- `WorkRequest`
- `WorkPlan`
- `WorkDelivery`
- `WorkDecision`

권장 이유:

- Session Core는 `대화/명령 이력`을 먼저 안정화해야 한다.
- 계획/전달물 카드는 이후 단계에서 구조화 엔티티로 올리는 편이 안전하다.

## 5. 상태 모델

### WorkSession

권장 필드:

| 필드 | 타입 | 설명 |
|---|---|---|
| `workSessionId` | string | `wsn_*` |
| `projectId` | string | 현재 Maestro 프로젝트 ID |
| `title` | string | 세션 제목 |
| `status` | string | `queued`, `active`, `blocked`, `completed`, `failed`, `cancelled` |
| `agentId` | string | 기본값 `openclaw` 또는 `mock` |
| `source` | string | `dashboard`, `api`, `mock` |
| `createdAt` | string | ISO datetime |
| `updatedAt` | string | ISO datetime |
| `lastMessageAt` | string \| null | 최근 메시지 시각 |
| `pendingOperatorDecision` | boolean | 운영자 판단 대기 여부 |
| `metadata` | object | 확장 상태 |

### WorkMessage

권장 필드:

| 필드 | 타입 | 설명 |
|---|---|---|
| `workMessageId` | string | `wmsg_*` |
| `workSessionId` | string | 상위 세션 |
| `role` | string | `operator`, `agent`, `system` |
| `kind` | string | `message`, `command`, `command_result`, `status`, `warning` |
| `body` | string | 본문 |
| `command` | string \| null | 원본 slash command |
| `status` | string \| null | `accepted`, `rejected`, `completed`, `failed` |
| `createdAt` | string | ISO datetime |

## 6. 저장 전략

### 런타임 저장소

- `Map<workSessionId, WorkSession>`
- `Map<workSessionId, WorkMessage[]>`
- 최근 세션 목록 정렬용 보조 배열 또는 derived selector

### 영속화 파일

권장 파일:

- `MAESTRO_WORKFLOW_STORE_PATH`
  - 기본값: `.maestro-workflows.json`

권장 저장 범위:

- 열린 세션 전체
- 닫힌 세션 최근 N개
- 세션별 최근 메시지 M개

권장 기본값:

- 최근 닫힌 세션: 30개
- 세션별 메시지: 100개

이유:

- MVP에서 외부 DB 없이 복구 가능
- 현재 서버 구조와 충돌이 적음
- 이후 `WorkRequest`, `WorkPlan`, `WorkDelivery` 추가 시 확장 가능

## 7. API 제안

### `GET /api/work-sessions`

목적:

- 세션 목록 조회

쿼리:

- `projectId`
- `status`
- `limit`

응답:

```json
{
  "items": [],
  "count": 0
}
```

### `POST /api/work-sessions`

목적:

- 새 세션 생성

요청 예시:

```json
{
  "projectId": "runtime_default",
  "title": "승인 이력 export 설계",
  "agentId": "openclaw",
  "source": "dashboard"
}
```

브로드캐스트:

- `WORK_SESSION_CREATED`

### `GET /api/work-sessions/:workSessionId`

목적:

- 단일 세션 상세 + 최근 메시지 조회

### `POST /api/work-sessions/:workSessionId/messages`

목적:

- 일반 메시지 또는 명령 입력 추가

입력 규칙:

- `/`로 시작하면 명령
- 아니면 일반 메시지

브로드캐스트:

- `WORK_MESSAGE_CREATED`
- `COMMAND_ACCEPTED`
- `COMMAND_RESULT`

### `POST /api/work-sessions/:workSessionId/close`

목적:

- 세션 종료

제약:

- pending delivery 같은 후속 단계는 아직 없으므로 이번 단계는 단순 종료만 처리

브로드캐스트:

- `WORK_SESSION_UPDATED`

## 8. 명령 처리 범위

이번 단계에서 실제 연결할 명령:

### `/status`

- 현재 세션 상태
- 최근 메시지 시각
- pending decision 여부
- 마지막 명령 결과 요약

### `/ask`

- 일반 메시지보다 명시적인 질문으로 저장
- `kind = question` 대신 이번 단계는 `message` 또는 `command`로 단순화 가능

### `/close`

- 세션 상태를 `completed` 또는 `cancelled`로 바꾸는 최소 동작

이번 단계에서 보류할 명령:

- `/plan`
- `/diff`
- `/commit`
- `/deliver`
- `/return`

## 9. WebSocket 이벤트 제안

최소 이벤트:

- `WORK_SESSION_CREATED`
- `WORK_SESSION_UPDATED`
- `WORK_MESSAGE_CREATED`
- `COMMAND_ACCEPTED`
- `COMMAND_REJECTED`
- `COMMAND_RESULT`

권장 payload 예시:

```json
{
  "event": "WORK_MESSAGE_CREATED",
  "session": {},
  "message": {}
}
```

## 10. UI 연결 계획

### Session List

- 실제 세션 제목
- 프로젝트 이름
- 상태 배지
- 마지막 활동 시각

### Timeline

- `message`
- `command`
- `command_result`
- `status`

카드 렌더러는 아직 넣지 않는다.

### Input

- Enter 전송
- Shift+Enter 줄바꿈
- 명령/일반 메시지 동일 입력창 사용
- 명령 전송 후 입력창 초기화

## 11. 권장 파일 구조

### 신규 파일

- `src/hooks/useWorkSessions.js`
- `src/components/maestro/WorkSessionTimeline.jsx`
- `src/components/maestro/WorkSessionList.jsx`
- `src/App.work-session-core.ui.test.jsx`

### 수정 파일

- `maestro-server.js`
- `src/App.jsx`
- `src/components/maestro/WorkConsolePanel.jsx`
- `src/test/appUiHarness.jsx`

## 12. 구현 순서

1. 서버 메모리 저장소 + 파일 영속화 추가
2. `GET/POST /api/work-sessions` 추가
3. 메시지/명령 입력 엔드포인트 추가
4. WebSocket `WORK_*` / `COMMAND_*` 브로드캐스트 추가
5. `useWorkSessions` 훅 추가
6. 패널에 실제 세션 목록/타임라인 연결
7. `/status`, `/ask`, `/close` 최소 명령 연결
8. 회귀 테스트와 QA 통과

## 13. 테스트 계획

### 서버 회귀

- 세션 생성/목록/상세 조회
- 메시지 저장
- slash command 처리
- 파일 기반 복구

### UI 회귀

- 세션 목록 로드
- 세션 선택 시 타임라인 렌더
- 일반 메시지 전송
- `/status` 결과 렌더
- 기존 `History` / `Repo` / `AutoOps` 공존

### 게이트

- `npm run test:server`
- `npm run test:ui`
- `npm run qa`

## 14. 주요 리스크

### R1. 세션 저장소 비대화

- 메시지 누적이 많아지면 메모리와 파일이 빠르게 커질 수 있다.
- 대응: 최근 N개 저장, append-only보다 snapshot 우선

### R2. shell 단계와의 UI 불일치

- placeholder 구조와 실제 데이터 구조가 달라지면 재작업이 생긴다.
- 대응: Session List / Timeline / Input 영역 분리를 유지

### R3. 명령과 일반 메시지 경계 혼선

- 너무 많은 명령을 한 번에 연결하면 상태 규칙이 흐려진다.
- 대응: `/status`, `/ask`, `/close`만 먼저 연결

### R4. 기존 승인 흐름 회귀

- Work Session API 추가가 기존 WebSocket/UI 흐름을 건드릴 수 있다.
- 대응: 신규 이벤트를 `WORK_*`, `COMMAND_*`로 격리

## 15. 완료 기준

- 실제 세션 데이터가 `Work Console`에 연결된다.
- 최소 명령 세트와 명령 결과 기록이 동작한다.
- 재시작 복구가 된다.
- `Structured Cards` 없이도 세션 운영이 가능하다.
- 기존 Maestro 승인 시스템 회귀 없이 `npm run qa`를 통과한다.
