# Maestro Coding

코딩을 지휘하다 — AI 에이전트와 함께하는 코드 심포니 🎼

## 컨셉(Concept)
Maestro는 AI 에이전트가 생성하거나 수정한 코드 변경을 "승인 노트" 형태로 제시하고, 사람이 빠르게 승인/반려하여 안전하게 병합하도록 돕는 개발 보조 도구입니다.

## 만든 목적(Purpose)
- AI 에이전트 자동 생성 코드를 인간이 빠르게 확인하고 승인할 수 있도록 가시화
- 승인(merge) 워크플로우를 단순화하여 생산성 향상
- 로컬 개발 환경에서 안전하게 에이전트와 협업할 수 있는 도구 제공

## 주요 기능(At a glance)
- 에이전트가 POST /api/request 로 승인 요청 전송
- Maestro 서버는 WebSocket으로 대시보드에 알림 브로드캐스트
- 사용자가 대시보드에서 APPROVE/REJECT/UNDO 조작 가능
- 승인 시 서버에서 로컬 git 병합(merge)을 수행

## 빠른 시작(Quick Start)
1. 레포지토리 클론
   git clone https://github.com/redsunjin/maestro-coding.git
2. 의존성 설치 (필요한 경우)
   npm install
3. 설정 파일(.env) 준비
   - 루트에 `.env` 또는 환경변수로 설정.
   - 예: `MAIN_REPO_PATH=/path/to/your/main/repo`
4. 서버 실행
   MAIN_REPO_PATH=/path/to/your/main/repo node maestro-server.js
5. 에이전트(또는 훅)에서 승인 요청 전송 (예시)
   curl -X POST http://localhost:8080/api/request \
     -H 'Content-Type: application/json' \
     -d '{"agentId":"local_agent","branchName":"feature/x","diffSummary":{"title":"작업 완료","shortDescription":"변경요약"}}'

## 설치 가이드(Installation)
자세한 설치/사용법은 USER_GUIDE.md를 참고하세요.

## 기획 문서 / 아키텍처
기획 및 아키텍처 문서는 `docs/PLAN.md`로 분리되어 있습니다.

## 기여 방법(Contributing)
- 이 레포는 오픈 실험용입니다. 기여하려면 이슈를 남기고 PR을 보내주세요.
- 민감 정보(토큰 등)는 절대 커밋하지 마세요. `.env`를 사용하세요.
