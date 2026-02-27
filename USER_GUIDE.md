# 사용자 가이드 (User Guide)

이 문서는 로컬에서 Maestro를 설치하고, 에이전트(예: VS Code, 훅 스크립트)와 연동해 승인 플로우를 테스트하는 방법을 단계별로 안내합니다.

목차
- 요구사항(Prerequisites)
- 빠른 설치(Quick install & run)
- 환경변수(.env) 설정 방법
- 에이전트 연동 예제 (curl / 훅 / VS Code)
- 승인(Approve) 시나리오 테스트
- 롤백(UNDO) 사용법
- 보안 권장사항

---

## 요구사항
- Node.js (v16+ 권장)
- Git (로컬에 병합 가능한 레포가 있어야 함)

## 빠른 설치 & 실행
1. 소스 클론
   git clone https://github.com/redsunjin/maestro-coding.git
   cd maestro-coding

2. (선택) 의존성 설치
   npm install

3. .env 준비
   - 루트에 `.env` 파일을 생성하거나 환경변수로 설정.
   - 최소값:
     - MAIN_REPO_PATH: 병합을 수행할 메인 레포지토리의 로컬 경로
     - PORT (선택, 기본 8080)
     - MAESTRO_SERVER_TOKEN (선택, 인증을 사용할 경우)
   예시 `.env`:
   ```
   MAIN_REPO_PATH=/home/user/projects/my-main-repo
   PORT=8080
   MAESTRO_SERVER_TOKEN=very-secret-token
   ```

4. 서버 실행
   - 환경변수 방식:
     MAIN_REPO_PATH=/path/to/main/repo node maestro-server.js
   - 또는 dotenv 사용:
     node -r dotenv/config maestro-server.js

## 에이전트 연동 예제
1) curl로 승인 요청 보내기
```
curl -X POST http://localhost:8080/api/request \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer ${MAESTRO_SERVER_TOKEN}' \
  -d '{
    "agentId": "my_agent",
    "branchName": "feature/my-branch",
    "diffSummary": {
      "title": "작업 완료",
      "shortDescription": "변경 내용 요약"
    }
  }'
```

2) 훅 스크립트로 자동 알림 (Claude Code 등)
   - `hooks/notify-maestro.sh` 를 작업 완료 훅에 등록
   - 예: `.claude/settings.json` 의 Stop 훅에 `sh hooks/notify-maestro.sh` 추가

3) VS Code 태스크로 호출
   `.vscode/tasks.json` 에 아래와 같이 추가:
   ```json
   {
     "label": "Notify Maestro",
     "type": "shell",
     "command": "sh hooks/notify-maestro.sh"
   }
   ```

## 승인(Approve) 시나리오 테스트
1. `npm run server` 로 서버 시작
2. `npm run dev` 로 대시보드 실행 후 브라우저 오픈
3. 대시보드에서 "지휘 시작" 클릭 → `🔴 LIVE` 배지 확인
4. 별도 터미널에서 `sh hooks/notify-maestro.sh feature/test "테스트"` 실행
5. 대시보드 레인에 노트 출현 확인 → D/F/J/K 키로 승인

## 롤백(UNDO) 사용법
- 승인 직후 실수한 경우: `Ctrl+Z` 를 누르면 서버에서 `git reset --hard HEAD~1` 실행
- 대시보드 UNDO 버튼으로도 동일 동작 가능
- 주의: 롤백 후에는 해당 브랜치의 커밋이 메인에서 제거됩니다

## 보안 권장사항
- `.env` 파일을 절대 커밋하지 마세요 (`.gitignore` 에 이미 포함되어 있습니다)
- `MAESTRO_SERVER_TOKEN` 을 설정하면 `/api/request` 엔드포인트에 Bearer 인증이 활성화됩니다
- 로컬 개발용 도구이므로 외부 네트워크에 노출하지 않도록 주의하세요
- 외부 접근이 필요한 경우 ngrok 등 터널링 도구 사용 시 토큰 인증을 반드시 설정하세요
- `.env.example` 을 참고하여 환경변수 구성을 확인하고 실제 값은 `.env` 에만 입력하세요
