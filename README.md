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
- 기본 `HOST=127.0.0.1` + `ALLOWED_ORIGINS` 화이트리스트 기반 CORS 적용
- `function bach`: 상단 미니 플레이어에서 YouTube 기반 BGM 재생/일시정지/볼륨/채널 URL 등록

## 현재 개발 현황 (2026-02-28 기준)

- 단계: 실행 가능한 MVP
- 확인된 동작: `npm run build` 성공, 서버 `/health` 응답 확인
- 완료된 기반 작업
  - React + Vite + Tailwind 기반 대시보드
  - WebSocket 기반 승인 요청 수신 및 표시
  - 승인(`APPROVE`) / 반려(`REJECT`) / 롤백(`UNDO`) 이벤트 처리 및 Git 연동
  - 에이전트 연동용 훅 스크립트(`hooks/notify-maestro.sh`) 제공
  - CI 품질 게이트(`npm run qa`, E2E), 통합 스모크(`npm run smoke:integration`) 구축
  - 터치스크린 조작(레인 승인/반려, 롤백 버튼) 지원
  - 원클릭 실행 경로(`npm run start:app`, `npm run check:env`) 제공
- 확인된 개선 필요 항목
  - `start:app` 운영 피드백 기반 preflight/가이드 고도화 필요
  - `src/App.jsx` 단일 파일 집중도 완화 및 모듈 분해 필요 (`WP-007`)

## 변경 필요 항목 및 작업계획

우선순위 중심의 상세 실행 계획은 [`docs/WORK_PLAN.md`](docs/WORK_PLAN.md)에 정리되어 있습니다.

즉시 진행할 핵심 3가지:

1. P1 구조 최적화: `src/App.jsx` 기능별 모듈 분해 (`WP-007`)
2. P2 설치경로 안정화: `start:app` 운영 피드백 기반 preflight/가이드 개선
3. P2 문서/운영 동기화: 실행 표준 경로와 장애 대응 가이드 지속 업데이트

설치 단순화 1차 상세 계획은 [`docs/INSTALL_SIMPLIFICATION_PHASE1.md`](docs/INSTALL_SIMPLIFICATION_PHASE1.md)를 참고하세요.

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

# 4. 원클릭 실행 (권장)
npm run start:app

# (대안) 수동 실행
# 터미널 A: npm run server
# 터미널 B: npm run dev

# 환경 점검만 먼저 하려면
npm run check:env
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
기본 테스트 구성은 `npm test` (server regression + UI regression)입니다.
E2E 최소 시나리오는 `npm run test:e2e`로 실행합니다.

## 기획 문서 / 아키텍처

기획 및 아키텍처 문서는 [`docs/PLAN.md`](docs/PLAN.md)에 보관되어 있습니다.
진행 현황 기반 작업계획은 [`docs/WORK_PLAN.md`](docs/WORK_PLAN.md)를 참고하세요.
QA 실행 가이드는 [`docs/QA_AGENT.md`](docs/QA_AGENT.md)를 참고하세요.

## 기여 방법 (Contributing)

- 이 레포는 오픈 실험용입니다. 기여하려면 이슈를 남기고 PR을 보내주세요.
- 민감 정보(토큰 등)는 절대 커밋하지 마세요. `.env`를 사용하세요.
