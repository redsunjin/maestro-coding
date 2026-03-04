# WP-008 3차 상세계획: 조건부 자동승인 운영 가시성

기준일: 2026-03-04
대상: Maestro Coding `WP-008` 3차

## 1) 목표

- 자동승인 정책 판정과 실행 결과를 운영자가 API만으로 추적할 수 있게 한다.
- 기존 승인/반려/롤백/히스토리/function bach UX를 손상하지 않는다.
- 보안 기준(`MAESTRO_SERVER_TOKEN`)과 동일한 접근제어를 유지한다.

## 2) 전문가 검토 요약

### A. Product/Ops 전문가

- 필요 최소 정보:
  - 현재 정책(활성화 여부, dry-run, cooldown, explicit)
  - 현재 런타임 상태(in-flight, 최근 성공/실패 시각, 요청 상태 분포)
  - 최근 이벤트 로그(왜 승인/차단됐는지 reason)
- 결론: `status` + `events` 2개 API면 운영 추적 가능.

### B. Backend 전문가

- 메모리 링버퍼가 MVP+ 단계에서 가장 안전하고 빠름.
- 이벤트 생성 지점:
  1. `/api/request` 정책 판정 직후
  2. `runConditionalAutoApprove` 실행 시작/스킵/성공/실패
- 환경변수:
  - `MAESTRO_AUTO_APPROVE_LOG_MAX_ITEMS` (기본 500)

### C. Security 전문가

- 운영 API는 상태/정책 정보를 포함하므로 token 모드에서는 인증 필수.
- 민감값(토큰, 절대 경로)은 응답에서 제외.
- allowlist 필드로만 로그 저장.

### D. QA 전문가

- 서버 회귀 필수 케이스:
  - `GET /api/auto-approve/status` 응답 구조 검증
  - `GET /api/auto-approve/events` limit/filter 검증
  - token 설정 시 운영 API 401 검증
  - cooldown/dry-run 케이스 reason 로그 검증

## 3) 구현 범위

포함:
- `GET /api/auto-approve/status`
- `GET /api/auto-approve/events`
- 자동승인 이벤트 링버퍼 및 append 로직
- `.env.example`, README/가이드/워크플랜/QA 문서 동기화
- 서버 회귀 테스트 보강

제외:
- DB 영속 저장
- 외부 로그 수집기 연동
- 프론트 운영 대시보드 UI 추가

## 4) API 스펙

### GET `/api/auto-approve/status`

응답 예시:

```json
{
  "config": {
    "enabled": true,
    "dryRun": false,
    "requireExplicit": true,
    "cooldownMs": 60000,
    "maxDescriptionLength": 180,
    "branchPrefix": "feature/",
    "trustedAgents": ["qa_agent"],
    "trustedAgentsCount": 1
  },
  "runtime": {
    "inFlightCount": 0,
    "trackedRequestCount": 3,
    "requestStateSummary": {
      "ready": 1,
      "approving": 0,
      "merged": 1,
      "rejected": 1
    },
    "lastAutoApproveAt": "2026-03-04T13:01:00.000Z",
    "autoApproveEventCount": 12
  },
  "recentEvents": [],
  "count": 12
}
```

쿼리:
- `eventsLimit` (기본 40, 최대 300)

### GET `/api/auto-approve/events`

쿼리:
- `limit` (기본 40, 최대 300)
- `requestId` (선택)
- `decision` (선택: `ELIGIBLE|BLOCKED|EXECUTING|SKIPPED|MERGED|FAILED`)
- `reason` (선택)

응답:

```json
{
  "items": [],
  "count": 0,
  "maxItems": 500
}
```

## 5) 검증 게이트

1. `npm run test:server`
2. `npm run qa`
3. `npm run test:e2e`
4. `npm run smoke:integration`

## 6) 완료 기준

- 운영 API가 정책/실행 가시성을 제공한다.
- 보안/회귀 테스트가 모두 통과한다.
- 문서와 `.env.example`가 실제 코드와 일치한다.
