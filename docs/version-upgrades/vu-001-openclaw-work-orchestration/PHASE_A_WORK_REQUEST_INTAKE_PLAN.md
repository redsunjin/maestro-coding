# Phase A Work Request Intake Plan

기준일: 2026-03-15
대상 트랙: `VU-001`
상태: 구현 완료 (2026-07-15)

## 0. 구현 결과 요약 (2026-07-15)

- 기능 플래그 `MAESTRO_WORKFLOW_ENABLED`(기본 OFF) 뒤에서 Work Request Intake 도입.
- 저장 전략은 계획의 별도 `shared` 모듈 대신, Session Core가 이미 사용하는 `.maestro-workflows.json`(`MAESTRO_WORKFLOW_STORE_PATH`)에 `workRequests` 배열을 통합하고 `maestro-server.js` 인라인 스토어로 구현(계획 대비 조정, 파일 충돌 회피).
- API: `GET/POST /api/work-requests`, `GET /api/work-requests/:id`, `POST /api/work-requests/:id/decision`. 플래그 OFF 시 404 `WORKFLOW_DISABLED`.
- 검증: `title`/`goal` 필수, `projectId`는 활성/등록 프로젝트만 허용, `laneIndex`는 프로젝트 레인 범위 내. 오류 코드는 계획의 표를 따름.
- 결정: `approve/reject/cancel` → `request_approved/request_rejected/cancelled`, 중복 결정 409.
- 브로드캐스트: `WORK_REQUEST_CREATED`, `WORK_REQUEST_DECIDED`.
- UI: 헤더 토글 라벨은 기존 `Work`(Work Console)와 충돌을 피해 **`Requests`**로 도입(플래그 ON일 때만 노출, `/health.workflow.enabled`로 감지). `WorkRequestPanel`에 생성 폼 + 요청 카드 목록 + 승인/반려/취소 액션.
- 프로젝트 선택 UI는 1차 단일 프로젝트 롤아웃 기준으로 활성 프로젝트 기본값으로 단순화(계획의 프로젝트 선택 드롭다운은 다중 프로젝트 단계에서 재도입).
- 테스트: 서버 회귀 5종(`tests/server-regression.test.mjs`), UI 회귀 2종(`src/App.work-request.ui.test.jsx`). `npm run qa` + `npm run smoke:lanes` 통과.

원 계획(아래)은 설계 기준으로 보존한다.

## 1. 목적

`VU-001`의 첫 구현 단계는 OpenClaw 전체 연동이 아니라 `Work Request 생성/승인`을 Maestro 안에 안전하게 도입하는 것이다.

이번 단계의 목표는 3가지다.

1. 운영자가 대시보드 안에서 작업 요청을 등록할 수 있어야 한다.
2. 등록된 요청을 사람 기준으로 승인/반려할 수 있어야 한다.
3. 기존 `POST /api/request` 기반 머지 승인 흐름에는 회귀가 없어야 한다.

## 2. 범위

### 포함

- `MAESTRO_WORKFLOW_ENABLED` 플래그 기반 기능 노출
- `WorkRequest` 저장/조회/결정 API
- 최소 영속화 파일 저장
- 대시보드 `Work` 패널
- 요청 생성 폼
- 요청 목록/상세 요약
- `approve / reject / cancel` 결정 액션
- `WORK_*` WebSocket 브로드캐스트
- 서버/UI 회귀 테스트

### 제외

- OpenClaw 실제 호출
- Work Plan 제출/승인
- Session 메시지 스트림
- Delivery 브리지
- 다중 운영자 충돌 제어
- 역할 기반 권한 제어

## 3. 성공 기준

- 기능 플래그 OFF 시 기존 UI/API 동작이 완전히 동일해야 한다.
- 기능 플래그 ON 시 새 Work 패널이 표시되고, 작업 요청 생성/조회/승인/반려가 가능해야 한다.
- `projectId`, `laneIndex`, `priority`, `title`, `goal`이 유효성 검사를 통과해야 한다.
- 서버 재시작 후 열린 Work Request가 복구되어야 한다.
- `npm run qa` 재통과가 기본 게이트다.

## 4. 최소 데이터 범위

Phase A에서는 `WorkRequest`만 먼저 구현한다. `WorkPlan`, `WorkSession`, `WorkDelivery`는 저장 구조만 확장 가능한 여지만 남기고 실제 엔티티는 만들지 않는다.

권장 필드:

| 필드 | 필수 | 설명 |
|---|---|---|
| `workRequestId` | yes | `wrk_*` 식별자 |
| `projectId` | yes | 등록 프로젝트 ID |
| `laneIndex` | no | `1..8`, 없으면 프로젝트 레인 범위 안에서 자동 |
| `requestedBy` | yes | 기본값 `operator` |
| `preferredAgent` | no | 기본값 `openclaw` |
| `title` | yes | 1~120자 |
| `goal` | yes | 1~1000자 |
| `constraints` | no | 문자열 배열 |
| `acceptanceCriteria` | no | 문자열 배열 |
| `priority` | yes | `low`, `normal`, `high`, `urgent` |
| `targetBranch` | no | 기본값 `main` |
| `workflowState` | yes | `submitted`, `request_approved`, `request_rejected`, `cancelled` |
| `createdAt` | yes | ISO datetime |
| `updatedAt` | yes | ISO datetime |

## 5. 설정 및 저장 전략

### 환경 변수

- `MAESTRO_WORKFLOW_ENABLED=false` 기본값
- `MAESTRO_WORKFLOW_STORE_PATH=.maestro-workflows.json` 기본값

### 저장 방식

- 런타임: 서버 메모리 맵
- 영속화: JSON 파일 1개

권장 파일 구조:

```json
{
  "version": 1,
  "workRequests": []
}
```

이 단계에서는 append-only 로그보다 단순 스냅샷 JSON이 낫다. 데이터량이 작고, 구현 복잡도를 낮출 수 있기 때문이다.

## 6. 서버 구현 계획

### 6-1. 신규 모듈

권장 신규 파일:

- `shared/workflow-config.mjs`
- `shared/work-request-store.mjs`

역할:

- 기능 플래그/저장 경로 파싱
- 요청 ID 생성
- 요청 검증/정규화
- JSON 파일 로드/저장
- 목록/상세/결정 로직 제공

### 6-2. 서버 엔드포인트

#### `GET /api/work-requests`

- 기능 플래그 OFF: `404`
- 기능 플래그 ON: 목록 반환
- 필터:
  - `projectId`
  - `workflowState`
  - `limit`

#### `GET /api/work-requests/:workRequestId`

- 단건 조회
- 없으면 `404`

#### `POST /api/work-requests`

- 인증 규칙은 기존 token 모드와 동일
- 유효성 검사:
  - `projectId`는 등록 프로젝트에 있어야 함
  - `laneIndex`는 해당 프로젝트의 레인 수 범위 안이어야 함
  - `title`, `goal` 필수
- 생성 성공 시 `WORK_REQUEST_CREATED` 브로드캐스트

#### `POST /api/work-requests/:workRequestId/decision`

- 허용 결정:
  - `approve`
  - `reject`
  - `cancel`
- 상태 전이:
  - `submitted -> request_approved`
  - `submitted -> request_rejected`
  - `submitted -> cancelled`
  - 이미 결정된 항목은 중복 결정 차단
- 성공 시 `WORK_REQUEST_DECIDED` 브로드캐스트

### 6-3. 서버 내 가드레일

- 기존 `/api/request`, `/api/history`, `/api/projects`, `/api/auto-approve/*` 라우트는 변경하지 않는다.
- 신규 상태는 별도 맵/스토어에 저장하고 기존 request state와 섞지 않는다.
- WebSocket action(`APPROVE`, `REJECT`, `UNDO`)은 이번 단계에서 수정하지 않는다.

### 6-4. 권장 오류 코드

| 상황 | 코드 | 에러 |
|---|---|---|
| 기능 플래그 OFF | `404` | `WORKFLOW_DISABLED` |
| 인증 실패 | `401` | `Unauthorized` |
| projectId 없음/미등록 | `400` | `PROJECT_ID_INVALID` |
| laneIndex 범위 오류 | `400` | `LANE_INDEX_INVALID` |
| title/goal 누락 | `400` | `WORK_REQUEST_INVALID` |
| 대상 요청 없음 | `404` | `WORK_REQUEST_NOT_FOUND` |
| 이미 결정됨 | `409` | `WORK_REQUEST_ALREADY_DECIDED` |

## 7. 최소 UI 계획

### 7-1. 진입점

- 헤더에 `Work` 토글 추가
- 플래그 OFF 시 버튼 미노출
- 플래그 ON 시 우측 패널 또는 기존 토글 패턴과 동일한 드로어 사용

권장 신규 파일:

- `src/hooks/useWorkRequests.js`
- `src/components/maestro/WorkRequestPanel.jsx`

### 7-2. 생성 폼

최소 입력 필드:

- 프로젝트 선택
- 레인 선택(`Auto` 포함)
- 우선순위
- 제목
- 목표
- 제약사항(줄바꿈 입력 -> 배열 정규화)
- 완료 기준(줄바꿈 입력 -> 배열 정규화)

동작 규칙:

- 저장 중 버튼 비활성화
- 성공 시 폼 초기화
- 새 요청을 목록 상단으로 반영
- 오류는 패널 내 인라인 메시지로 표시

### 7-3. 목록/상세

카드당 표시 항목:

- 제목
- 프로젝트 이름
- 레인
- 상태
- 우선순위
- 요청자
- 생성 시각
- 목표 요약

선택 카드 상세:

- 전체 목표
- 제약사항
- 완료 기준
- 승인/반려/취소 버튼

### 7-4. 접근성

- 패널은 기존 `History`/`Repo`와 동일하게 `aria-expanded`, `aria-controls`, 포커스 이동 적용
- 상태 변경 결과는 `aria-live`로 요약
- 버튼 라벨은 결정 결과가 분명해야 함

## 8. WebSocket 이벤트 계획

Phase A에서 필요한 이벤트:

- `WORK_REQUEST_CREATED`
- `WORK_REQUEST_DECIDED`

권장 payload:

```json
{
  "event": "WORK_REQUEST_CREATED",
  "item": {
    "workRequestId": "wrk_1710480000000",
    "projectId": "alpha",
    "laneIndex": 2,
    "title": "UI 패널 설계",
    "workflowState": "submitted"
  }
}
```

## 9. 구현 순서

1. `shared/workflow-config.mjs`와 `shared/work-request-store.mjs` 추가
2. `maestro-server.js`에 기능 플래그/로드/저장/API/브로드캐스트 연결
3. `GET /api/work-requests`, `POST /api/work-requests`, `POST /api/work-requests/:id/decision` 테스트 추가
4. 프런트 `useWorkRequests` 훅 추가
5. `WorkRequestPanel`과 헤더 토글 추가
6. UI 회귀 테스트 추가
7. 문서 동기화

이 순서를 지키면 서버 계약을 먼저 고정하고, 그 위에 UI를 안전하게 얹을 수 있다.

## 10. 테스트 계획

### 서버 회귀

추가 권장 파일:

- `tests/server-regression.test.mjs`

검증 항목:

- 플래그 OFF 시 신규 API 비노출
- 생성 성공
- 잘못된 `projectId` 거부
- 잘못된 `laneIndex` 거부
- 결정 성공
- 중복 결정 차단
- 재시작 후 JSON 파일 복구

### UI 회귀

추가 권장 파일:

- `src/App.work-request.ui.test.jsx`

검증 항목:

- 플래그 ON 시 `Work` 토글 표시
- 생성 폼 제출 성공
- 생성 후 카드 렌더
- 승인/반려 버튼 동작
- 접근성 속성(`aria-expanded`, 포커스 이동, live region`) 확인

### 전체 게이트

- `npm run qa`
- 기존 `npm run smoke:lanes`

## 11. 롤아웃 계획

### 1차

- 로컬 개발 환경
- 플래그 ON
- 프로젝트 1개
- 수동 생성/승인만 사용

### 2차

- 실제 파일럿 프로젝트 1개
- 운영자 1명
- 기존 머지 승인과 병행 운용

### 3차

- OpenClaw connector 초안 연결 전, 생성/승인 기록과 운영 피드백 정리

## 12. 롤백 계획

- `MAESTRO_WORKFLOW_ENABLED=false`로 즉시 비활성화
- UI에서 `Work` 패널 숨김
- 신규 `/api/work-*` 라우트 미노출
- 저장 파일은 삭제하지 않고 보존
- 기존 승인/반려/UNDO/Repo/History 기능은 그대로 유지

## 13. 완료 정의

- 문서에 정의한 API와 UI가 실제 구현과 일치해야 한다.
- `Work` 패널이 기존 대시보드 경험을 해치지 않아야 한다.
- QA 게이트 통과 상태를 기준점으로 남길 수 있어야 한다.
- 다음 단계인 `Phase B Plan Review`로 넘어갈 준비가 되어 있어야 한다.
