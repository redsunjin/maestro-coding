# Maestro Workflow 문서

Maestro Harmony 제품군의 범용 승인·결정·이력 앱. 구현은 [`workflow/`](../../workflow/)에서만 진행한다.

- 설계 스펙: [`../superpowers/specs/2026-07-31-maestro-workflow-subapp-design.md`](../superpowers/specs/2026-07-31-maestro-workflow-subapp-design.md)
- 상위 비전: [`../vision/2026-07-21-universal-approval-record-service.md`](../vision/2026-07-21-universal-approval-record-service.md)
- 구현 계획: [`../superpowers/plans/2026-07-31-maestro-workflow-subapp.md`](../superpowers/plans/2026-07-31-maestro-workflow-subapp.md)

## MVP 범위 요약

- Actor 등록 + per-actor 토큰 (sha256 해시 저장, 엄격 모드 전용)
- `subjectType` 자유 문자열의 DecisionRequest + record-only Decision (`executorAction=none`)
- Pull + ack 전달, append-only 이력, 파일 영속화(재시작 복구)
- 레인(결정 채널) 대시보드: 승인/반려 시트, 프리셋(spend/publish) 표시, 이력 뷰
- 엄격 모드 대시보드: 토큰 게이트 + WS 첫 메시지 인증 + 자동 재연결 (2026-08-03 스펙)
- actor 토큰 WS 구독: 자기 결정만 스코프 수신, revoke 시 소켓 종료 (2026-08-04 스펙)
- 범위 밖: Policy/자동승인, Delegation, 에이전트 decider, executor 실행, 다중 운영자
