<p align="center">
  <a href="https://redsunjin.github.io/maestro-coding/">
    <img src="https://img.shields.io/badge/🎹%20데모%20바로가기-Maestro%20Coding-blueviolet?style=for-the-badge&logo=github-pages&logoColor=white" alt="Demo">
  </a>
</p>

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

# Maestro Coding

코딩을 지휘하다 — AI 에이전트와 함께하는 코드 심포니 🎼

## 컨셉 (Concept)

Maestro는 AI 에이전트가 생성하거나 수정한 코드 변경을 "승인 노트" 형태로 제시하고, 사람이 빠르게 승인/반려하여 안전하게 병합하도록 돕는 개발 보조 도구입니다.

## 만든 목적 (Purpose)

- AI 에이전트 자동 생성 코드를 인간이 빠르게 확인하고 승인할 수 있도록 가시화
- 승인(merge) 워크플로우를 단순화하여 생산성 향상
- 로컬 개발 환경에서 안전하게 에이전트와 협업할 수 있는 도구 제공

## 주요 기능 (At a glance)

- 에이전트가 `POST /api/request`로 승인 요청 전송
- Maestro 서버는 WebSocket으로 대시보드에 알림 브로드캐스트
- 사용자가 대시보드에서 APPROVE / REJECT / UNDO 조작 가능
- 승인 시 서버에서 로컬 `git merge`를 수행
- `MAESTRO_SERVER_TOKEN` 설정 시 `Authorization: Bearer` 인증 적용

## 현재 개발 현황 (2026-02-27 기준)

- 단계: 실행 가능한 MVP
- 확인된 동작: `npm run build` 성공, 서버 `/health` 응답 확인
- 완료된 기반 작업
  - React + Vite + Tailwind 기반 대시보드
  - WebSocket 기반 승인 요청 수신 및 표시
  - 승인(`APPROVE`) / 롤백(`UNDO`) 이벤트 처리 및 Git 연동
  - 에이전트 연동용 훅 스크립트(`hooks/notify-maestro.sh`) 제공
- 확인된 개선 필요 항목
  - 서버 노출 기본정책(CORS/바인딩) 강화 필요 (`WP-004`)
  - 프론트엔드 이벤트 정합성 엣지 케이스 검증 확대 필요 (`WP-002`)
  - `REJECT` UX의 수동 QA 시나리오 보강 필요 (`WP-003`)
  - 회귀 테스트 범위를 UI/E2E까지 확장 필요 (`WP-005`)

## 변경 필요 항목 및 작업계획

우선순위 중심의 상세 실행 계획은 [`docs/WORK_PLAN.md`](docs/WORK_PLAN.md)에 정리되어 있습니다.

즉시 진행할 핵심 3가지:

1. P1 보안 정합성: 서버에 `Authorization: Bearer` 검증 로직 추가 + 문서/스크립트 동기화
2. P1 상태 정합성: 승인 시 서버 응답(`MERGE_SUCCESS`) 확인 후 UI 상태 반영하도록 프론트 로직 개선
3. P2 사용자 플로우 보강: `REJECT` 입력/전송/피드백 UX 구현

## 빠른 시작 (Quick Start)

```bash
# 1. 레포지토리 클론
git clone https://github.com/redsunjin/maestro-coding.git
cd maestro-coding

# 2. 의존성 설치
npm install

# 3. 설정 파일(.env) 준비 — 대화형 설정 사용
npm run configure
# 또는 직접 .env.example을 복사해 편집
cp .env.example .env

# 4. 서버 실행
npm run server

# 5. 프론트엔드 개발 서버 실행 (별도 터미널)
npm run dev
```

에이전트(또는 훅)에서 승인 요청 전송 예시:

```bash
curl -X POST http://localhost:8080/api/request \
  -H 'Content-Type: application/json' \
  -d '{"agentId":"local_agent","branchName":"feature/x","diffSummary":{"title":"작업 완료","shortDescription":"변경요약"}}'
```

토큰 인증을 활성화했다면 `Authorization` 헤더를 함께 보내야 합니다.

```bash
curl -X POST http://localhost:8080/api/request \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <MAESTRO_SERVER_TOKEN>' \
  -d '{"agentId":"local_agent","branchName":"feature/x","diffSummary":{"title":"작업 완료","shortDescription":"변경요약"}}'
```

## 설치 가이드 (Installation)

자세한 설치/사용법은 [USER_GUIDE.md](USER_GUIDE.md)를 참고하세요.

## QA Agent / 품질 게이트

변경 후 품질 검증은 프로젝트 QA 에이전트 커맨드로 수행합니다.

```bash
npm run qa
```

QA 범위와 수동 체크리스트는 [`docs/QA_AGENT.md`](docs/QA_AGENT.md)를 참고하세요.

## 기획 문서 / 아키텍처

기획 및 아키텍처 문서는 [`docs/PLAN.md`](docs/PLAN.md)에 보관되어 있습니다.
진행 현황 기반 작업계획은 [`docs/WORK_PLAN.md`](docs/WORK_PLAN.md)를 참고하세요.
QA 실행 가이드는 [`docs/QA_AGENT.md`](docs/QA_AGENT.md)를 참고하세요.

## 기여 방법 (Contributing)

- 이 레포는 오픈 실험용입니다. 기여하려면 이슈를 남기고 PR을 보내주세요.
- 민감 정보(토큰 등)는 절대 커밋하지 마세요. `.env`를 사용하세요.
