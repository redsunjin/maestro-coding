# 사용자 가이드 (User Guide)

이 문서는 로컬에서 Maestro를 설치하고, 에이전트(예: VS Code, 훅 스크립트)와 연동해 승인 플로우를 테스트하는 방법을 단계별로 안내합니다.

**목차**
- [요구사항 (Prerequisites)](#요구사항-prerequisites)
- [빠른 설치 & 실행](#빠른-설치--실행)
- [실행 트러블슈팅](#실행-트러블슈팅)
- [환경변수(.env) 설정 방법](#환경변수env-설정-방법)
- [에이전트 연동 예제](#에이전트-연동-예제)
- [승인(Approve) 시나리오 테스트](#승인approve-시나리오-테스트)
- [롤백(UNDO) 사용법](#롤백undo-사용법)
- [승인 이력(History) 사용법](#승인-이력history-사용법)
- [배경음악(function bach) 사용법](#배경음악function-bach-사용법)
- [QA / 회귀 테스트](#qa--회귀-테스트)
- [보안 권장사항](#보안-권장사항)

---

## 요구사항 (Prerequisites)

- Node.js (v16+ 권장)
- Git (로컬에 병합 가능한 레포가 있어야 함)

---

## 빠른 설치 & 실행

**1. 소스 클론**

```bash
git clone https://github.com/redsunjin/maestro-coding.git
cd maestro-coding
```

**2. 의존성 설치**

```bash
npm install
```

**3. 환경 설정**

대화형 설정 스크립트를 실행하거나, 직접 `.env` 파일을 만들 수 있습니다.

```bash
# 대화형 설정 (권장)
npm run configure

# 또는 셸 스크립트로 설정
npm run setup
# Windows PowerShell 사용자
# scripts/setup_env.ps1
```

**4. 원클릭 실행 (권장)**

```bash
npm run start:app
```

`start:app`은 실행 전에 `check:env`를 자동 수행하며, 서버와 프론트를 함께 시작합니다.
종료할 때는 `Ctrl+C`를 누르면 두 프로세스가 함께 종료됩니다.
정상 기동 시 `health / ws / dashboard(Local URL)` 경로를 함께 출력합니다.

**(대안) 수동 실행**

```bash
# 터미널 1
npm run server

# 터미널 2
npm run dev
```

브라우저에서 대시보드를 열고 **"지휘 시작"** 버튼을 클릭하면 `ws://localhost:8080`에 자동 연결됩니다.

---

## 실행 트러블슈팅

- `npm run start:app`에서 `.env 파일이 없습니다` 오류가 나면: `npm run configure`를 먼저 실행하세요.
- `의존성이 설치되어 있지 않습니다 (node_modules 없음)` 오류가 나면: `npm install` 후 재시도하세요.
- `PORT ... 이미 사용 중` 오류가 나면: 기존 서버를 종료하거나 `.env`의 `PORT`를 변경하세요.
- `MAIN_REPO_PATH가 git 레포가 아닙니다` 오류가 나면: `.env`에서 `MAIN_REPO_PATH`를 실제 git 레포 경로로 수정하세요.
- `VITE_WS_URL` 연결 실패가 반복되면: `PORT`, `HOST`, `VITE_WS_URL` 값을 서로 일치시키고 다시 실행하세요.
- 원인 분리가 필요하면: `npm run check:env` -> `npm run server` -> `npm run dev` 순서로 단독 실행하여 실패 지점을 확인하세요.

---

## 환경변수(.env) 설정 방법

프로젝트 루트에 `.env` 파일을 생성하고 다음 변수를 설정합니다.  
`.env.example`을 복사하여 시작할 수 있습니다:

```bash
cp .env.example .env
```

| 변수 | 기본값 | 설명 |
|------|--------|------|
| `MAIN_REPO_PATH` | `process.cwd()` | `git merge`/`git reset`을 실행할 메인 레포지토리 경로 (필수 권장) |
| `PORT` | `8080` | 서버 리스닝 포트 |
| `HOST` | `127.0.0.1` | 서버 바인딩 호스트 (기본값 유지 권장) |
| `ALLOWED_ORIGINS` | 로컬 Vite Origin들 | 허용 Origin 화이트리스트 (쉼표 구분) |
| `MAESTRO_SERVER_TOKEN` | (없음) | 인증 토큰 (설정 시 요청에 `Authorization: Bearer <token>` 헤더 필요) |
| `VITE_WS_URL` | `ws://localhost:8080` | 프론트엔드가 연결할 WebSocket 주소 |
| `MAESTRO_AUTO_APPROVE_ENABLED` | `false` | 조건부 자동승인 활성화 여부 (`true/false`) |
| `MAESTRO_AUTO_APPROVE_TRUSTED_AGENTS` | (빈 값) | 자동승인 허용 `agentId` 목록 (쉼표 구분) |
| `MAESTRO_AUTO_APPROVE_BRANCH_PREFIX` | (빈 값) | 자동승인 허용 브랜치 접두사 |
| `MAESTRO_AUTO_APPROVE_MAX_DESC_LENGTH` | `180` | 자동승인 허용 `shortDescription` 최대 길이 |
| `MAESTRO_AUTO_APPROVE_REQUIRE_EXPLICIT` | `false` | `autoApprove=true` 명시 요청만 자동승인할지 여부 |
| `MAESTRO_AUTO_APPROVE_COOLDOWN_MS` | `0` | 자동승인 시도 간 최소 간격(ms) |
| `MAESTRO_AUTO_APPROVE_DRY_RUN` | `false` | 정책 매칭만 수행하고 실제 merge는 건너뜀 |
| `MAESTRO_HISTORY_MAX_ITEMS` | `300` | 승인 이력 링버퍼 최대 저장 개수 (40~2000) |

예시 `.env`:

```
MAIN_REPO_PATH=/home/user/projects/my-main-repo
PORT=8080
HOST=127.0.0.1
ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173,http://127.0.0.1:4173
MAESTRO_SERVER_TOKEN=very-secret-token
VITE_WS_URL=ws://localhost:8080
MAESTRO_AUTO_APPROVE_ENABLED=false
MAESTRO_AUTO_APPROVE_TRUSTED_AGENTS=
MAESTRO_AUTO_APPROVE_BRANCH_PREFIX=
MAESTRO_AUTO_APPROVE_MAX_DESC_LENGTH=180
MAESTRO_AUTO_APPROVE_REQUIRE_EXPLICIT=false
MAESTRO_AUTO_APPROVE_COOLDOWN_MS=0
MAESTRO_AUTO_APPROVE_DRY_RUN=false
MAESTRO_HISTORY_MAX_ITEMS=300
```

> ⚠️ `.env` 파일에는 실제 토큰이나 경로 등 민감 정보가 포함될 수 있습니다.  
> **절대로 `.env`를 Git에 커밋하지 마세요.** `.gitignore`에 이미 포함되어 있습니다.
> `MAESTRO_SERVER_TOKEN`이 설정된 상태에서 인증 헤더가 없거나 토큰이 다르면 서버는 `401 Unauthorized`를 반환합니다.
> `ALLOWED_ORIGINS`에 없는 Origin에서 오는 브라우저 요청은 `403 Origin not allowed`로 차단됩니다.

---

## 에이전트 연동 예제

### 방법 1 — curl로 승인 요청 직접 전송

```bash
curl -X POST http://localhost:8080/api/request \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <MAESTRO_SERVER_TOKEN>' \
  -d '{
    "agentId": "local_agent",
    "branchName": "feature/my-feature",
    "autoApprove": true,
    "laneIndex": 1,
    "diffSummary": {
      "title": "작업 완료",
      "shortDescription": "변경 내용 요약"
    }
  }'
```

토큰 인증을 사용하지 않는다면 `Authorization` 헤더를 생략하세요.
토큰 인증을 사용하는 경우 헤더가 누락되면 요청은 거절됩니다.

### 방법 2 — Claude Code 훅 (Stop Hook)

Claude Code가 작업을 마칠 때 자동으로 승인 요청을 보내도록 설정합니다.

```bash
mkdir -p .claude
cp hooks/claude-settings-example.json .claude/settings.json
```

이후 Claude Code에서 작업이 완료될 때마다 대시보드에 승인 요청이 자동으로 나타납니다.

### 방법 3 — 훅 스크립트 직접 실행

```bash
# 기본 실행 (브랜치·커밋 메시지 자동 감지)
sh hooks/notify-maestro.sh

# 명시적 정보 전달
sh hooks/notify-maestro.sh feature/auth "JWT 검증 로직 추가" "auth.js 45-60 수정"

# 환경변수로 제어
AGENT_ID=my_agent LANE_INDEX=2 sh hooks/notify-maestro.sh

# 토큰 인증 사용 시
MAESTRO_SERVER_TOKEN=very-secret-token sh hooks/notify-maestro.sh
```

### 방법 4 — git post-commit 훅

```bash
echo '#!/bin/sh' > .git/hooks/post-commit
echo 'sh "$(git rev-parse --show-toplevel)/hooks/notify-maestro.sh"' >> .git/hooks/post-commit
chmod +x .git/hooks/post-commit
```

---

## 승인(Approve) 시나리오 테스트

**30초 빠른 테스트:**

```bash
# 터미널 1: 서버 시작
npm run server

# 터미널 2: 프론트엔드 개발 서버 시작, 브라우저에서 "지휘 시작" 클릭
npm run dev

# 터미널 3: 승인 요청 전송 — 대시보드에 노트가 나타나는지 확인!
sh hooks/notify-maestro.sh feature/test-branch "테스트 커밋" "실제 통신 확인"
```

브라우저 대시보드에 노트가 나타나면 `D` `F` `J` `K` 키로 승인할 수 있고,  
`Shift + D/F/J/K`로 반려할 수 있습니다(피드백 입력 가능, 취소 가능).  
승인 시 서버가 `git merge <branchName>`을 실행합니다.

조건부 자동승인을 켠 경우(`MAESTRO_AUTO_APPROVE_ENABLED=true`), 정책에 일치하는 요청은 대시보드 수동 입력 없이 자동 병합 시도가 수행됩니다.
`MAESTRO_AUTO_APPROVE_REQUIRE_EXPLICIT=true`를 함께 사용하면 요청 본문에 `"autoApprove": true`를 넣은 요청만 자동승인 대상으로 처리됩니다.

---

## 롤백(UNDO) 사용법

대시보드에서 잘못 승인한 경우 **`Ctrl+Z`** 를 눌러 직전 병합을 취소할 수 있습니다.

- 서버는 `git reset --hard HEAD~1`을 실행합니다.
- 성공 시 `UNDO_SUCCESS`, 실패 시 `UNDO_FAILED` 이벤트가 대시보드로 전달됩니다.

> ⚠️ `git reset --hard`는 복구가 어렵습니다. 중요한 작업 전에는 반드시 백업 브랜치를 만들어두세요.

---

## 승인 이력(History) 사용법

- 위치: 상단 헤더 `History` 버튼 또는 `H` 단축키
- 기본 동작:
  - 서버 `GET /api/history`로 최근 이력 로드
  - 실시간 `HISTORY_APPEND` 이벤트를 패널에 즉시 추가
- 제공 필터:
  - 프로젝트(`projectId`)
  - 결과(`REQUESTED/APPROVED/REJECTED/...`)
  - 소스(`manual/auto/system`)
- 참고 API:
  - `GET /api/history?limit=40`
  - `GET /api/history?limit=40&projectId=proj_b2c`
  - `GET /api/history?limit=40&result=APPROVED`

---

## 배경음악(function bach) 사용법

- 위치: 대시보드 상단 헤더의 작은 `function bach` 미니 플레이어
- 기본 채널: 밝은 분위기의 바흐 채널 URL이 기본값으로 등록되어 있습니다.
- 제공 기능
  - 재생/일시정지
  - 볼륨 조절(0~100)
  - 유튜브 채널 경로(URL) 등록/저장

채널 등록 절차:

1. 상단 `function bach`에서 `채널` 버튼 클릭
2. `유튜브 채널 경로` 입력
3. `저장` 클릭

권장 URL 형식:

- `https://www.youtube.com/channel/UC...` (권장)
- `https://www.youtube.com/playlist?list=...`
- `https://www.youtube.com/watch?v=...`

> 참고: `@handle` 형식 채널 주소는 직접 재생 대상 해석이 제한될 수 있어 `channel/UC...` 형식을 권장합니다.

---

## QA / 회귀 테스트

변경 후 다음 단계로 넘어가기 전 아래 커맨드로 품질 게이트를 실행합니다.

```bash
npm run qa
```

실행 항목:

- 서버/프론트 회귀 테스트(`npm test`)
- 프론트 빌드 검증(`npm run build`)

E2E 최소 시나리오는 별도로 실행합니다.

```bash
npm run test:e2e
```

상세 QA 체크리스트는 [`docs/QA_AGENT.md`](docs/QA_AGENT.md)를 참고하세요.

---

## 보안 권장사항

1. **토큰 사용:** `MAESTRO_SERVER_TOKEN` 환경변수를 설정하면 인증되지 않은 요청을 차단합니다. 로컬 전용이더라도 설정을 권장합니다.
2. **`.env` 파일 보호:** 실제 토큰이나 경로가 포함된 `.env`는 절대 Git에 커밋하지 마세요. `.gitignore`에 이미 포함되어 있습니다.
3. **로컬 환경 한정:** 기본값 `HOST=127.0.0.1`를 유지하고, `ALLOWED_ORIGINS`는 최소 범위만 허용하세요. 외부 공개 시 방화벽 설정과 HTTPS/WSS를 반드시 적용하세요.
4. **git 명령어 경로 검증:** `MAIN_REPO_PATH`에 신뢰할 수 있는 경로만 설정하세요. 악의적인 브랜치 이름으로 인한 명령어 인젝션을 방지하기 위해 서버는 입력값을 검증합니다.
5. **의존성 관리:** `npm audit`로 취약점을 주기적으로 점검하세요.
