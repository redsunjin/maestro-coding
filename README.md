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

메타포는 **오케스트레이션(지휘자)**, 작동 방식은 **"스팀덱 + 리듬게임"** 입니다. Maestro는 특정 AI 환경에 완벽하게 붙는 통합 도구를 지향하지 않습니다. 대신 태블릿/터치스크린을 메인 개발 화면 옆에 두는 **핸드헬드 보조 컨트롤 데크**로 쓰면서, 레인에 떨어지는 승인 노트를 리듬감 있게 처리하는 몰입형 바이브코딩 경험을 목표로 합니다. 게임 요소(판정 등급·콤보·점수)는 재미를 위한 것일 뿐, **실제 머지/반려를 자동 처리하는 일은 절대 없습니다.**

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
- 프로젝트 연결 간소화: 등록된 로컬 Git 레포를 대시보드 `Repo` 패널이나 `project:use` 명령으로 즉시 전환
- 프로젝트별 승인 레인 수(1~8) 저장/적용 지원
- 승인 이력 악보뷰(`WP-009`): `GET /api/history` + `HISTORY_APPEND` + 레인 overview/밀도 표현/접근성 보강 완료
- 승인 이력 영속 저장: 재시작 후 `.maestro-history.json` 또는 `MAESTRO_HISTORY_STORE_PATH` 기준으로 최근 이력 복구
- `function bach`: 상단 미니 플레이어에서 YouTube 기반 BGM 재생/일시정지/볼륨/채널 URL 등록 + 상태 칩/고정 `Hz` 슬롯 제공
- 조건부 자동승인(`WP-008`): explicit/cooldown/dry-run/중복승인 차단 + 운영 가시성 API + `AutoOps` 대시보드 패널 반영
- 에이전트 어댑터/승인 프로토콜: `Agent Registry`(`POST /api/agents/register`, heartbeat) + 1급 `ApprovalRequest`/`ApprovalDecision` 저장 + Pull-first 결정 전달(`ack`), `git merge`는 결정 이후 executor action으로 분리
- `Work Console`(Session Core): 대시보드에서 작업 세션 생성/조회, 운영자·에이전트 메시지 기록, 최소 명령(`/status`·`/ask`·`/close`), 재시작 복구
- `Work Request Intake`(VU-001 Phase A, `MAESTRO_WORKFLOW_ENABLED` 플래그): 작업 요청 등록 + `approve/reject/cancel` 결정 + `Requests` 패널 (플래그 OFF 시 기존 동작 그대로)
- 터치 우선 UX(트랙 F): 전 컨트롤 press 피드백 + 44px 탭 타깃, hover 전용 조작 제거, 터치 반려 시트(사유 칩+자유입력), 모달 백드롭 탭 닫기
- 타이밍 판정(점수전용): PERFECT/GREAT/EARLY/LATE 등급 — 판정선 근접도로 리듬 점수·콤보 차등, Merged PRs 카운트와 분리, 실제 머지/반려에는 불간섭
- 햅틱 피드백: 등급·반려·콤보 마일스톤별 진동 패턴(`navigator.vibrate`), 헤더 진동 On/Off 토글, 등급별 타격음 + 판정선 등급색 플래시

## 현재 개발 현황 (2026-07-20 기준)

- 버전: `0.95.0`
- 단계: 파일럿 운영 가능한 MVP + VU-001(작업 오케스트레이션) 진행 중
- 확인된 동작: `npm run qa` 통과, 서버 `/health` 응답 확인
- VU-001 OpenClaw Work Orchestration 진척 (상세: [`docs/version-upgrades/vu-001-openclaw-work-orchestration/README.md`](docs/version-upgrades/vu-001-openclaw-work-orchestration/README.md))
  - Phase 0 Agent Approval Protocol: ✅ 완료 (Agent Registry + ApprovalRequest/Decision 저장 + Pull-first `ack` + executor 분리)
  - Phase A Work Request Intake: ✅ 완료 (`MAESTRO_WORKFLOW_ENABLED` 플래그 뒤 `/api/work-requests` + `Requests` 패널)
  - Work Console Session Core: ✅ 완료 (세션/메시지/`/status`·`/ask`·`/close`/재시작 복구)
  - Phase B Plan Review(계획 제출/승인): ⬜ 미착수
  - Phase C Delivery Bridge(결과물→머지 승격): ◐ 세션까지 완료, 결과물 승격 미구현
  - Phase D Operability(검색/필터/재시도): ⬜ 미착수
  - 참고: 실제 외부 에이전트 커넥터는 아직 없음(어댑터 계약은 hook/wrapper/native로 일반화됨, 현 단계는 mock/운영자 기준)
- 완료된 기반 작업
  - React + Vite + Tailwind 기반 대시보드
  - WebSocket 기반 승인 요청 수신 및 표시
  - 승인(`APPROVE`) / 반려(`REJECT`) / 롤백(`UNDO`) 이벤트 처리 및 Git 연동
  - 에이전트 연동용 훅 스크립트(`hooks/notify-maestro.sh`) 제공
  - CI 품질 게이트(`npm run qa`, E2E), 통합 스모크(`npm run smoke:integration`) 구축
  - 터치스크린 조작(레인 승인/반려, 롤백 버튼) 지원
  - 터치 우선 UX 감사·개선 완료 (PR #17, 스펙: [`docs/superpowers/specs/2026-07-16-touch-ux-audit-design.md`](docs/superpowers/specs/2026-07-16-touch-ux-audit-design.md))
  - 타이밍 판정 + 햅틱 피드백 완료 (PR #20, 스펙: [`docs/superpowers/specs/2026-07-20-rhythm-judgment-haptics-design.md`](docs/superpowers/specs/2026-07-20-rhythm-judgment-haptics-design.md))
  - 승인 이력 악보뷰(`WP-009`) 1~4차 완료
    - 서버 링버퍼 + 조회 API: `GET /api/history`
    - WebSocket 실시간 이벤트: `HISTORY_APPEND`
    - 헤더 `History` 버튼/`H` 단축키 + 우측 패널 필터(프로젝트/결과/소스)
    - 레인 overview, 이벤트 밀도 표현, 범례, `dialog` 접근성, 라이브 상태 요약
    - 파일 기반 영속 저장 + 서버 재시작 복구
  - 조건부 자동승인(`WP-008`) 운영 UI 완료
    - 헤더 `AutoOps` 버튼으로 정책 상태/런타임/최근 이벤트 로그 조회
    - `401 Unauthorized` 응답 시 토큰 입력/저장 후 재조회 지원
    - 결정 필터(`Eligible/Blocked/Executing/Skipped/Merged/Failed`) 제공
  - 프로젝트 전환 UX 완료
    - 헤더 `Repo` 버튼에서 등록된 프로젝트 드롭다운 선택/적용
    - `Repo` 패널 안에서 새 Git 레포 폴더를 레인 수와 함께 바로 등록 후 즉시 적용
    - 기존 등록 프로젝트의 레인 수를 패널에서 직접 수정 가능
    - 선택 즉시 런타임 merge/undo 대상 변경 + `.env` 영속화
    - 토큰 모드에서도 같은 서버 토큰으로 목록 조회/전환 가능
  - `WP-010` 동적 레인 스케일링 1~4차 완료
    - 프로젝트 메타데이터(`laneCount`) 도입
    - 서버 요청/헬스/API 응답을 활성 프로젝트 레인 수 기준으로 정규화
    - 대시보드 보드/키입력/히스토리 요약을 가변 레인 수로 렌더링
    - UI/서버 회귀 테스트에 6레인 시나리오 추가
  - `function bach` 운용성 보강
    - `booting/ready/queued/playing/paused/error` 상태 칩 노출
    - `standby` 또는 `~xxxHz` 고정 슬롯으로 재생 상태 가시성 유지
  - `WP-007` 구조 분해 완료
    - `src/App.jsx` 422 lines로 축소
    - BGM/실시간/이력/운영 패널 로직을 훅/컴포넌트로 분리
- 원클릭 실행 경로(`npm run start:app`, `npm run check:env`) 제공
- 훅 설치 자동화(`npm run install:hook`) 제공
- `start:app` 오류 조치 메시지/대시보드 URL 자동 감지 고도화
  - `KI-001` `function bach` Hz 미노출 해결(자동재생 차단 시 재생 의도 유지, 회귀 테스트 추가) — [`docs/KNOWN_ISSUES.md`](docs/KNOWN_ISSUES.md)
  - Work Console과 Work Requests 패널 우측 도킹 겹침 해소(상호 배타 토글)
- 확인된 개선 필요 항목
  - 에이전트 레지스트리/승인 요청·결정 스토어가 메모리 기반 — 다중 에이전트 실운영을 위한 영속화 필요
  - 승인 이력 export는 아직 범위 밖이며 후속 범위로 별도 검토 예정
  - 로컬 데모 중심이라 다중 사용자 운영/원격 배포용 runbook은 추가 정리가 필요

## 변경 필요 항목 및 작업계획

우선순위 중심의 상세 실행 계획은 [`docs/WORK_PLAN.md`](docs/WORK_PLAN.md)에 정리되어 있습니다.

즉시 진행할 핵심 3가지:

1. P1 다중 에이전트 연결 방향 확정 + 에이전트 레지스트리/승인 스토어 영속화
2. P1 VU-001 Phase C Delivery Bridge: 세션 결과물을 기존 승인 요청으로 승격하는 수직 슬라이스 완성
3. P2 운영 가이드 보강: 토큰 모드/실행 표준 경로/장애 대응 runbook 지속 업데이트

설치 단순화 1차 상세 계획은 [`docs/INSTALL_SIMPLIFICATION_PHASE1.md`](docs/INSTALL_SIMPLIFICATION_PHASE1.md)를 참고하세요.
동적 레인 스케일링 계획/회귀 가드는 [`docs/WP-010_DYNAMIC_LANES_PLAN.md`](docs/WP-010_DYNAMIC_LANES_PLAN.md)를 참고하세요.
실제 적용용 운영 절차는 [`docs/OPERATIONS_RUNBOOK.md`](docs/OPERATIONS_RUNBOOK.md)를 참고하세요.

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

# 자주 쓰는 프로젝트를 등록해두려면
npm run project:add
# 등록된 프로젝트 중 하나로 바로 전환하려면
npm run project:use

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

조건부 자동승인에서 명시 플래그를 요구하도록 설정했다면(`MAESTRO_AUTO_APPROVE_REQUIRE_EXPLICIT=true`), 요청 본문에 `"autoApprove": true`를 포함해야 자동승인 대상이 됩니다.

운영 상태 확인 API 예시:

```bash
curl -s http://localhost:8080/api/auto-approve/status | jq
curl -s "http://localhost:8080/api/auto-approve/events?limit=20" | jq
```

대시보드에서는 상단 `AutoOps` 버튼으로 같은 운영 상태를 바로 확인할 수 있습니다.

## 프로젝트 연결 쉽게 하기

Maestro는 실제 `git merge`를 로컬 폴더 기준으로 수행하므로, 최종적으로는 프로젝트 폴더 경로가 필요합니다. 대신 매번 경로를 다시 입력하지 않도록 프로젝트 등록 기능을 제공합니다.

```bash
# 1) 프로젝트 폴더/링크 등록
npm run project:add

# 2) 등록된 프로젝트 목록 보기
npm run project:list

# 3) 이번 세션에서 쓸 프로젝트 선택
npm run project:use
```

- 폴더 경로는 실제 merge/undo 대상입니다.
- 링크는 식별용 메모입니다. GitHub URL이나 origin URL을 저장해 둘 수 있습니다.
- 프로젝트별 승인 레인 수(1~8)도 함께 저장할 수 있습니다.
- `npm run configure` 안에서도 등록된 프로젝트를 선택할 수 있습니다.
- 대시보드에서는 헤더 `Repo` 버튼으로 현재 활성 레포를 바로 바꿀 수 있습니다.
- 대시보드 `Repo` 패널 안에서 새 프로젝트 경로/별칭/링크/레인 수를 직접 입력해 등록 후 바로 적용할 수도 있습니다.
- 이미 등록된 프로젝트는 같은 패널에서 레인 수를 수정해 저장할 수 있습니다. 활성 프로젝트를 수정하면 런타임과 `.env`에도 즉시 반영됩니다.

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
실프로젝트 4레인/6레인 전환 스모크는 `npm run smoke:lanes`로 실행합니다.

## 기획 문서 / 아키텍처

기획 및 아키텍처 문서는 [`docs/PLAN.md`](docs/PLAN.md)에 보관되어 있습니다.
진행 현황 기반 작업계획은 [`docs/WORK_PLAN.md`](docs/WORK_PLAN.md)를 참고하세요.
VU-001 작업 오케스트레이션(에이전트 어댑터/작업 요청/세션/계획/전달) 트랙은 [`docs/version-upgrades/vu-001-openclaw-work-orchestration/README.md`](docs/version-upgrades/vu-001-openclaw-work-orchestration/README.md), 에이전트 어댑터/승인 프로토콜은 [`docs/MAESTRO_AGENT_ADAPTERS_PLAN.md`](docs/MAESTRO_AGENT_ADAPTERS_PLAN.md)를 참고하세요.
QA 실행 가이드는 [`docs/QA_AGENT.md`](docs/QA_AGENT.md)를 참고하세요.

## 기여 방법 (Contributing)

- 이 레포는 오픈 실험용입니다. 기여하려면 이슈를 남기고 PR을 보내주세요.
- 민감 정보(토큰 등)는 절대 커밋하지 마세요. `.env`를 사용하세요.
