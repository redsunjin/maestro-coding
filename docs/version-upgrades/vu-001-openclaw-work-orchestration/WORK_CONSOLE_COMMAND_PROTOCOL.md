# Work Console Command Protocol

기준일: 2026-03-28
대상 트랙: `VU-001`
상태: 설계 초안

## 1. 목적

Work Console 명령은 일반 채팅을 작업 상태 전이와 연결해 주는 최소 계약이다.

명령 설계 목표:

- 사람이 기억하기 쉬울 것
- 상태 전이가 명확할 것
- 자유 대화와 구조화 명령이 충돌하지 않을 것

## 2. 명령 입력 원칙

- `/`로 시작하면 명령
- 그 외는 일반 메시지
- 명령은 항상 `sessionId` 문맥 안에서 실행
- 명령 결과는 반드시 `command_result` 이벤트로 남긴다.

## 3. MVP 명령 세트

### `/work`

목적:

- 새 작업 지시 생성

예시:

```text
/work 승인 이력 export 설계해줘
```

효과:

- 새 `WorkRequest`
- 새 `WorkSession`
- `WORK_REQUEST_CREATED`

### `/plan`

목적:

- 현재 세션의 계획 제출 또는 계획 재요청

예시:

```text
/plan
```

효과:

- OpenClaw에 계획 요청
- `plan_requested` 상태 기록

### `/status`

목적:

- 현재 세션 요약 조회

응답:

- 현재 상태
- 마지막 명령
- pending decision
- 마지막 delivery 유무

### `/ask`

목적:

- 에이전트에 명시적 질문 전송

예시:

```text
/ask CSV를 기본으로 하고 JSON은 후순위로 잡아줘
```

### `/diff`

목적:

- 현재 작업 변경 요약 요청

응답:

- 변경 파일
- diff summary
- 위험 지점

### `/commit`

목적:

- 커밋 제안 생성

예시:

```text
/commit feat: add history export api
```

효과:

- 즉시 `git commit`를 보장하지 않는다.
- 기본 동작은 `Commit Proposal Card` 생성이다.

필수 출력:

- 제안 메시지
- 변경 파일
- 테스트 결과
- branch

### `/deliver`

목적:

- 현재 작업 결과물을 delivery로 제출

효과:

- `Delivery Card` 생성
- 운영자는 `Promote to Approval Lane` 또는 `Return` 판단

### `/return`

목적:

- 현재 세션 또는 카드에 수정 요청

예시:

```text
/return 테스트 결과가 빠졌습니다. qa 결과 포함해서 다시 올려주세요.
```

### `/close`

목적:

- 세션 종료 요청

제약:

- pending delivery가 있으면 바로 종료하지 않고 확인 단계 필요

## 4. 명령 결과 규약

모든 명령은 아래 중 하나를 반환해야 한다.

- `accepted`
- `rejected`
- `needs_input`
- `completed`
- `failed`

권장 payload:

```json
{
  "status": "completed",
  "command": "/status",
  "sessionId": "wsn_123",
  "summary": "현재 plan review 대기 중",
  "data": {}
}
```

## 5. 채팅과 명령의 경계

### 일반 메시지로 처리할 것

- 설명
- 질문
- 맥락 공유
- 짧은 피드백

### 명령으로만 처리할 것

- 계획 요청
- 상태 조회
- 커밋 제안 생성
- delivery 제출
- 세션 종료

이 경계를 지켜야 나중에 감사 로그와 자동화가 가능하다.

## 6. 권한 및 금지 규칙

### 허용

- 계획 요청
- 상태 조회
- 수정 요청
- 커밋 제안 생성
- delivery 제출

### 금지

- `/merge`
- `/undo`를 통해 직접 git reset 실행
- 승인 레인 우회

이 둘은 기존 Maestro 승인 모델을 깨므로 금지한다.

## 7. 커밋 제안 규칙

`/commit`은 아래 두 모드 중 하나로 해석 가능하지만, MVP 기본값은 proposal-only다.

### Proposal-only

- 카드만 생성
- 운영자가 메시지/범위를 검토
- 이후 delivery로 연결

### Proposal+Prepared

- 향후 선택적 확장
- 로컬 브랜치에 준비된 커밋까지 만들 수 있으나, MVP에서는 제외 권장

## 8. 에러 처리

### 잘못된 명령

- `Unknown command`
- 추천 명령 2~3개 표시

### 상태상 불가능한 명령

예:

- plan review 이전의 `/deliver`
- delivery 없이 `/close`

응답:

- 왜 거부됐는지
- 현재 허용 명령이 무엇인지

## 9. 서버 이벤트 맵

권장 이벤트:

- `COMMAND_ACCEPTED`
- `COMMAND_REJECTED`
- `COMMAND_RESULT`
- `PLAN_REQUESTED`
- `COMMIT_PROPOSAL_CREATED`
- `DELIVERY_SUBMITTED`

## 10. 향후 확장 가능 명령

- `/test`
- `/files`
- `/branch`
- `/reconnect`
- `/handoff`

하지만 MVP에서는 명령 수를 적게 유지하는 편이 안전하다.
