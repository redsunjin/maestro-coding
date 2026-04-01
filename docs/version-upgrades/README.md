# Version Upgrade Plans

기준일: 2026-03-14

이 폴더는 현재 운영 중인 `WORK_PLAN`과 분리된 버전업 설계 트랙을 관리한다.

- 목적: 운영 유지보수와 구조 업그레이드 검토를 분리해, 실서비스 회귀 없이 상위 아키텍처 전환안을 관리한다.
- 원칙: 기존 승인/반려/롤백/프로젝트 전환/동적 레인 흐름은 문서 단계에서 먼저 검토하고, 구현은 별도 승인 후 착수한다.
- 범위: 구조 업그레이드 초안, 단계별 도입 계획, 데이터 모델, API 설계, 리스크/가드레일.

## 현재 활성 트랙

### `VU-001` OpenClaw Work Orchestration

- 위치: [`vu-001-openclaw-work-orchestration/README.md`](./vu-001-openclaw-work-orchestration/README.md)
- 목적: Maestro를 단순 `결과 승인기`에서 `작업 요청 + 계획 승인 + 결과 승인` 관제 계층으로 확장하는 설계
- 산출물:
  - 검토 요약/버전업 계획
  - Phase A 구현 계획
  - Phase B-0 Work Console Shell UI 계획
  - Work Console 제품/도킹 UI/명령 프로토콜 설계
  - Work Console 리스크 검토
  - OpenClaw 연동용 MVP 아키텍처 초안
  - Work Request / Work Approval 데이터 모델과 API 설계

## 관리 규칙

1. 버전업 트랙 문서는 현행 제품 동작과 분리해 관리한다.
2. 버전업 트랙에는 구현 완료 상태를 기록하지 않는다. 구현 완료 시에는 `WORK_PLAN` 또는 별도 `WP-*` 문서로 승격한다.
3. 현행 API를 대체하는 설계는 반드시 호환성, 마이그레이션, 롤백 경로를 함께 문서화한다.
