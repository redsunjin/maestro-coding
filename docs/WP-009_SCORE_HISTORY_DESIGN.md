# WP-009 상세 설계: 승인 이력 악보뷰

기준일: 2026-03-04
대상: Maestro Coding `WP-009`

## 1) 목표

- 승인/반려/롤백/자동승인 관련 이벤트를 시간순 이력으로 보존한다.
- 이력을 “악보(Score)” 컨셉 UI로 시각화해 현재 UX를 해치지 않고 빠르게 상태를 파악할 수 있게 한다.
- 기존 핵심 기능(승인/반려/롤백/`function bach`/터치 입력) 동작은 그대로 유지한다.

## 2) 범위

포함:

- 서버 이력 저장(메모리 링버퍼)
- 이력 조회 API(`GET /api/history`)
- WebSocket 이력 append 이벤트(`HISTORY_APPEND`)
- 프론트 악보뷰 패널 UI(기본 접힘, 상단/핫키 토글)
- 필터(프로젝트/결과/소스), 최대 항목 제한
- 회귀 테스트(서버/UI/E2E)

제외:

- DB 영속 저장(1차 제외)
- 사용자 권한별 이력 접근 제어(1차 제외)
- PDF/이미지 export (후속 단계)

## 3) 전문가 검토 (설계 검증)

### A. Product/UX 전문가

- 결론: “항상 노출” 대신 “기본 접힘 패널 + 빠른 토글”이 기존 리듬 UX를 가장 덜 손상한다.
- 검증 포인트:
  - 메인 레인 보드의 가시 영역을 줄이지 않는다.
  - 모바일에서는 바텀시트 형태로 열고 닫는다.
  - 악보뷰 기본 표시 항목은 최근 40개, 더보기로 확장한다.

### B. Frontend 아키텍처 전문가

- 결론: 기존 App 분해 전략을 유지해 `hooks + components`로 분리 구현한다.
- 제안 구조:
  - `src/hooks/useApprovalHistory.js`
  - `src/components/maestro/HistoryScorePanel.jsx`
  - `src/components/maestro/HistoryScoreLegend.jsx`
- 검증 포인트:
  - `App.jsx`는 orchestration만 담당
  - 기존 `useMaestroRealtime` 이벤트 흐름과 충돌 없음

### C. Backend/도메인 전문가

- 결론: 서버 메모리 링버퍼 기반 이력 저장이 MVP+ 단계에서 가장 안전하고 빠르다.
- 검증 포인트:
  - 이벤트 발생 지점에서 일관된 이력 append
  - API 응답은 정렬/limit/filter를 서버에서 처리
  - 최대 항목 수 환경변수로 제어(`MAESTRO_HISTORY_MAX_ITEMS`)

### D. 보안 전문가

- 결론: 이력에 민감정보를 남기지 않는 스키마 제한이 필수다.
- 검증 포인트:
  - 저장 필드 allowlist 방식 적용
  - 자유 텍스트(feedback)는 길이 제한 및 제어문자 정리
  - 토큰/경로/개인정보 로그 저장 금지

### E. QA 전문가

- 결론: 이벤트 맵핑 정합성 + 비회귀를 분리 검증해야 한다.
- 검증 포인트:
  - 서버: 이벤트별 이력 타입 매핑 테스트
  - UI: 악보뷰 렌더/필터/접힘 토글 테스트
  - E2E: 승인->롤백->반려 시나리오가 이력에 순서대로 반영

## 4) 데이터 모델 (이력 엔트리)

```json
{
  "id": "hist_1741060000000_x7a1",
  "timestamp": "2026-03-04T12:00:00.000Z",
  "projectId": "proj_b2c",
  "requestId": "req_123",
  "laneIndex": 1,
  "agentId": "backend_agent",
  "branchName": "feature/auth-guard",
  "title": "JWT 검증 개선",
  "result": "APPROVED",
  "source": "manual",
  "reason": "MERGE_SUCCESS",
  "autoApproved": false
}
```

필드 규칙:

- `result`: `REQUESTED|APPROVED|APPROVE_FAILED|APPROVE_SKIPPED|REJECTED|ROLLBACK|ROLLBACK_FAILED|AUTO_APPROVE_SKIPPED`
- `source`: `manual|auto|system`
- `title`/`branchName`/`agentId`는 길이 제한(예: 120/120/64)

## 5) 이벤트 매핑 규칙

- `AGENT_TASK_READY` -> `REQUESTED`
- `MERGE_SUCCESS` -> `APPROVED`
- `MERGE_FAILED` -> `APPROVE_FAILED`
- `MERGE_SKIPPED` -> `APPROVE_SKIPPED`
- `AGENT_RESTARTED` -> `REJECTED`
- `UNDO_SUCCESS` -> `ROLLBACK`
- `UNDO_FAILED` -> `ROLLBACK_FAILED`
- `AUTO_APPROVE_SKIPPED` -> `AUTO_APPROVE_SKIPPED`

## 6) API/프로토콜 설계

### GET `/api/history`

쿼리:

- `limit` (기본 40, 최대 300)
- `projectId` (선택)
- `result` (선택)

응답:

```json
{
  "items": [],
  "count": 40
}
```

### WebSocket `HISTORY_APPEND`

- 서버가 이력 엔트리 생성 시 기존 이벤트와 별도로 `HISTORY_APPEND` 브로드캐스트
- 프론트는 실시간 append 후 로컬 필터 적용

## 7) UI 설계 (악보 컨셉)

- 위치:
  - Desktop: 우측 슬라이드 패널(기본 닫힘)
  - Mobile: 하단 바텀시트
- 토글:
  - 헤더 버튼 `History`
  - 키보드 `H` (입력 포커스 아닐 때)
- 시각화:
  - 4개 레인을 오선 유사 트랙으로 표시
  - 결과 타입별 색/아이콘 통일
  - 최신 이벤트는 우측, 오래된 이벤트는 좌측
- 성능:
  - 렌더 기본 40개
  - 더보기 클릭 시 40개 단위 증가

## 8) 단계별 구현 순서 (WP-009)

1. 서버 이력 버퍼 + `/api/history` + `HISTORY_APPEND`
2. 프론트 `useApprovalHistory` 훅 + 기본 리스트 패널
3. 악보 시각화 컴포넌트 적용
4. 필터/토글/접근성 마무리
5. 회귀 테스트 + 문서 동기화

## 9) 검증 게이트

- 서버 회귀:
  - 이력 append/limit/filter/API 응답 검증
- UI 회귀:
  - 패널 토글/필터/실시간 append 검증
- E2E:
  - 승인->롤백->반려 흐름의 이력 순서 검증
- 최종:
  - `npm run qa`
  - `npm run smoke:integration`
  - `npm run test:e2e`

## 10) 리스크와 대응

- 리스크: 이벤트 중복 기록
  - 대응: `requestId + reason + timestamp window` 중복 차단
- 리스크: UI 혼잡으로 메인 UX 저하
  - 대응: 기본 접힘 + 모바일 바텀시트
- 리스크: 메모리 증가
  - 대응: 링버퍼 최대치(기본 300) 강제

## 11) 승인 기준 (전문가 합의)

- 기존 플로우 비손상
- 이력 가시성 향상
- 테스트 게이트 전부 통과
- 운영 설정이 `.env.example`/문서와 일치
