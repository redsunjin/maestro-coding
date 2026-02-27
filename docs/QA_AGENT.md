# QA Agent Guide (Maestro Coding)

기준일: 2026-02-27

## 목적

`Maestro`의 핵심 플로우(요청 수신, 인증, 브로드캐스트, 빌드 가능성)를 변경마다 반복 검증하여
다음 단계 진행 전에 품질 게이트를 통과시키기 위한 프로젝트 전용 QA 에이전트 가이드입니다.

## 실행 커맨드

```bash
npm run qa
```

실행 내용:

1. `npm test` (서버 회귀 + UI 회귀 테스트)
2. `npm run build` (프론트 빌드 검증)

## 회귀 테스트 범위

- `POST /api/request` 인증 분기
  - 토큰 비활성: `200`
  - 토큰 활성 + 미인증/오인증: `401`
  - 토큰 활성 + 정인증: `200`
- CORS 정책 분기
  - 허용 Origin preflight: `204` + `Access-Control-Allow-Origin`
  - 비허용 Origin preflight/request: `403`
- UI 회귀 테스트
  - 승인: `MERGE_SUCCESS` 수신 전 확정되지 않아야 함
  - 반려: `Shift + 키` 입력 시 피드백 전송/취소 동작 보장
- WebSocket 브로드캐스트
  - 승인 요청 생성 시 `AGENT_TASK_READY` 이벤트 수신

테스트 파일:

- `tests/server-regression.test.mjs`

## 수동 QA 체크리스트 (WP-002)

라이브 모드에서 승인 상태 정합성을 확인합니다.

1. 서버 실행: `npm run server`
2. 프론트 실행: `npm run dev`
3. 승인 요청 전송: `sh hooks/notify-maestro.sh ...`
4. 대시보드에서 승인 키 입력 후 확인:
   - 즉시 점수 증가하지 않고 `APPROVING...` 상태 표시
   - `MERGE_SUCCESS` 수신 후 노트 제거 + 점수/콤보 반영
   - 실패 시 노트 복구(`MERGE FAILED` 표시)
5. 대시보드에서 `Shift + D/F/J/K` 반려 입력 후 확인:
   - 반려 사유 입력 프롬프트가 열리고, 취소 시 반려가 취소됨
   - `REJECTING...` 상태 표시
   - `AGENT_RESTARTED` 수신 후 노트 제거 + `REJECTED` 피드백 표시
6. 보안 정책 수동 확인:
   - 서버 로그에서 `Host/Port`, `허용 Origin` 설정값 확인
   - 비허용 Origin으로 preflight 시 `403` 반환 확인

## 게이트 기준

- `npm run qa` 성공
- WP 대상 수동 체크리스트 통과
- 실패 시 다음 단계 진행 금지, 원인 수정 후 재실행
