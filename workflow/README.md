# Maestro Workflow

Maestro Harmony 제품군의 범용 승인·결정·이력(system of record) 앱.
코드가 아닌 모든 결정(지출, 외부 발송, …)을 요청받아 사람이 승인/반려하고,
결정을 record-only로 기록·전달한다. **아무것도 실행하지 않는다** (`executorAction`은 항상 `none`).

- 스펙: [`docs/superpowers/specs/2026-07-31-maestro-workflow-subapp-design.md`](../docs/superpowers/specs/2026-07-31-maestro-workflow-subapp-design.md)
- 비전: [`docs/vision/2026-07-21-universal-approval-record-service.md`](../docs/vision/2026-07-21-universal-approval-record-service.md)

## 작업 경계 (player/ 선례 계승)

- 구현은 `workflow/` 아래에서만, 문서는 `docs/maestro-workflow/` 아래에서만.
- 본체 경로(`src/`, `tests/`, `maestro-server.js`, `hooks/`)는 수정하지 않는다.
- 본체 코드를 import하지 않는다 (필요 로직은 복사·일반화).
- 전용 브랜치 `feat/maestro-workflow-foundation`에서 작업한다.

## 실행

    npm install          # workflow/ 안에서
    npm run server       # 결정 서버 (기본 http://127.0.0.1:8090)
    npm run dev          # 대시보드 (기본 http://localhost:5273)
    npm test             # 서버 회귀 + UI 테스트
