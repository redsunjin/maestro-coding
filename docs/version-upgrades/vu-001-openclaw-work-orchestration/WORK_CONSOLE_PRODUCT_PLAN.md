# Work Console Product Plan

기준일: 2026-03-28
대상 트랙: `VU-001`
상태: 설계 초안

## 1. 문제 정의

현재 Maestro는 결과 승인에는 강하지만, OpenClaw 같은 비서형 시스템과의 실제 협업 과정은 담지 못한다.

지금 빠진 단계는 아래와 같다.

- 운영자가 작업을 어떻게 지시했는지
- 에이전트가 어떤 계획으로 응답했는지
- 중간 질문/응답/명령이 어떻게 오갔는지
- 커밋 제안과 전달물이 어떤 판단을 거쳐 올라왔는지

이 공백 때문에 `채팅창` 요구가 생긴다. 하지만 단순 메신저를 넣으면 Maestro의 강점인 승인 구조를 해칠 수 있다.

## 2. 제품 정의

Work Console은 메신저가 아니다. 다음 2가지를 결합한 관제 패널이다.

1. 대화형 작업 세션 UI
2. 구조화된 작업 상태 전이 UI

즉:

- 채팅은 자유 텍스트를 담는다.
- 중요한 상태 변경은 구조화 카드와 명령 결과로 남긴다.
- 최종 merge 승인은 기존 레인 승인 흐름이 계속 담당한다.

한 줄 정의:

`Work Console = 대화/명령/계획/커밋 제안/전달물을 관리하는 작업 관제 패널`

## 3. 절대 원칙

1. 채팅이 승인 시스템을 대체하면 안 된다.
2. `/commit`은 곧바로 merge를 의미하지 않는다.
3. `/deliver` 이후에도 기존 승인 레인에서 최종 확인을 한 번 더 거친다.
4. 자유 대화보다 상태 추적 가능성이 우선이다.
5. OpenClaw 장애는 기존 Maestro 승인 기능에 영향을 주면 안 된다.

## 4. 사용자 시나리오

### 시나리오 A. 운영자가 작업을 지시한다

- 운영자가 `Work Console`을 연다.
- `/work 히스토리 export 설계해줘` 같은 요청을 보낸다.
- Maestro는 이를 `WorkRequest`와 `WorkSession`으로 기록한다.

### 시나리오 B. 에이전트가 계획을 보낸다

- OpenClaw가 `/plan` 응답에 해당하는 계획 카드를 올린다.
- 운영자는 `approve / revise / reject`로 판단한다.

### 시나리오 C. 작업 중 질의응답이 일어난다

- OpenClaw가 질문 카드를 올린다.
- 운영자는 답변을 텍스트 또는 명령으로 보낸다.

### 시나리오 D. 커밋/전달물이 올라온다

- OpenClaw가 `commit proposal` 카드 또는 `delivery` 카드를 올린다.
- 운영자는 이를 보고 승인 레인으로 승격시킨다.
- 최종 merge는 기존 승인 타격에서만 일어난다.

## 5. Work Console이 다뤄야 하는 5개 객체

- `Conversation Message`
- `Command Result`
- `Plan Card`
- `Commit Proposal Card`
- `Delivery Card`

텍스트만 있으면 추적이 안 되고, 카드만 있으면 협업이 경직된다. 둘을 같이 가져가야 한다.

## 6. 기능 범위

### 포함

- 도킹 가능한 사이드 패널
- 좌/우 이동
- 열기/닫기
- 세션 리스트
- 대화 스레드
- 명령 입력창
- 구조화 카드 렌더링
- 명령 실행 결과 로그
- 기존 승인 흐름과의 브리지

### 제외

- 일반 메신저 수준의 파일 첨부 체계
- 읽음 표시/이모지/소셜 기능
- 다중 운영자 동시 커서 협업
- 최종 merge를 채팅창 안에서 직접 실행하는 흐름

## 7. 성공 기준

- 운영자가 레인 승인 화면을 떠나지 않고도 작업 지시와 질의응답을 관리할 수 있어야 한다.
- 각 세션에서 `누가 어떤 명령을 내렸고 어떤 결과가 나왔는지` 복기 가능해야 한다.
- `commit proposal`과 `delivery`는 최종 승인 전에 반드시 구조화된 카드로 노출되어야 한다.
- 기존 승인/반려/UNDO/History/Repo/AutoOps 회귀가 없어야 한다.

## 8. 비기능 요구사항

### 감사 가능성

- 모든 명령은 `명령 텍스트`, `실행 주체`, `결과`, `시각`, `세션 ID`와 함께 남아야 한다.

### 복구 가능성

- 열린 세션과 최근 메시지는 서버 재시작 후 복구되어야 한다.

### 격리성

- Work Console 실패가 레인 승인 기능을 막으면 안 된다.

### 성능

- 기본 패널 렌더는 최근 메시지/카드 기준으로 제한한다.
- 장기 세션은 페이지네이션 또는 최근 N개 로딩으로 제한한다.

## 9. 단계별 도입 계획

### Stage 1. Shell UI

- 도킹 패널 뼈대
- 좌/우 이동
- 열기/닫기
- 세션 리스트 + 현재 세션 뷰
- 더미 명령 입력창

### Stage 2. Session Core

- 실제 `WorkSession` 목록/상세 조회
- 텍스트 메시지 저장
- 명령 히스토리 저장

### Stage 3. Structured Cards

- `Plan Card`
- `Commit Proposal Card`
- `Delivery Card`
- 카드 단위 결정 버튼

### Stage 4. Approval Bridge

- `Delivery`를 기존 승인 레인으로 승격
- 최종 merge는 기존 레인에서만 수행

### Stage 5. Operability

- 세션 검색
- 필터
- 재시도
- reconnect
- 장애 표시

## 10. 기존 시스템과의 관계

### 유지할 것

- `Repo`
- `History`
- `AutoOps`
- 기존 레인 승인 UX
- `POST /api/request`

### 추가할 것

- `Work Console`
- `WORK_SESSION_*` 이벤트
- `COMMAND_*` 이벤트
- `COMMIT_PROPOSAL_*` 이벤트

## 11. 운영상의 가장 중요한 판단

Work Console은 “대화가 가능한 승인 도구”가 아니라 “작업 계약을 관리하는 콘솔”이어야 한다.

즉, 목표는 채팅 경험이 아니라 아래 세 가지다.

- 작업 지시가 분실되지 않을 것
- 상태 전이가 추적 가능할 것
- 최종 승인 체계가 유지될 것

## 12. 다음 문서

- UI 설계: [`WORK_CONSOLE_UI_PLAN.md`](./WORK_CONSOLE_UI_PLAN.md)
- 명령 프로토콜: [`WORK_CONSOLE_COMMAND_PROTOCOL.md`](./WORK_CONSOLE_COMMAND_PROTOCOL.md)
- 리스크 검토: [`WORK_CONSOLE_RISK_REVIEW.md`](./WORK_CONSOLE_RISK_REVIEW.md)
