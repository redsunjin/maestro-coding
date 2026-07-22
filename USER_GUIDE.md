# 사용자 가이드 (User Guide)

이 문서는 로컬에서 Maestro를 설치하고, 에이전트(예: VS Code, 훅 스크립트)와 연동해 승인 플로우를 테스트하는 방법을 단계별로 안내합니다.

실제 프로젝트 적용 절차는 [docs/OPERATIONS_RUNBOOK.md](docs/OPERATIONS_RUNBOOK.md)를 함께 참고하세요.

**목차**
- [요구사항 (Prerequisites)](#요구사항-prerequisites)
- [빠른 설치 & 실행](#빠른-설치--실행)
- [프로젝트 등록/전환 쉽게 하기](#프로젝트-등록전환-쉽게-하기)
- [실행 트러블슈팅](#실행-트러블슈팅)
- [환경변수(.env) 설정 방법](#환경변수env-설정-방법)
- [에이전트 연동 예제](#에이전트-연동-예제)
- [승인(Approve) 시나리오 테스트](#승인approve-시나리오-테스트)
- [자동승인 운영 패널(Auto Approve Ops) 사용법](#자동승인-운영-패널auto-approve-ops-사용법)
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

## 한 줄 실행 (maestro-server CLI)

`.env` 설정 없이 관리할 git 레포 폴더에서 바로 서버를 띄울 수 있습니다:

```bash
node bin/maestro-server.mjs --repo /path/to/your-repo
```

- 현재 폴더가 git 레포면 `--repo` 생략 가능. `npm link` 후에는 어디서든 `maestro-server`로 실행됩니다.
- 주요 옵션: `--port 8080`, `--host 0.0.0.0`(iPad 등 LAN 접속 허용), `--no-mdns`, `--token <t>`, `--help`
- 같은 포트에 Maestro 서버가 이미 떠 있으면 새로 띄우지 않고 재사용을 알리고 종료합니다.
- 프로그래밍 방식 통합(플러그인/확장)은 `lib/server-embed.mjs`의 `startMaestroServer(options)`를 사용하세요.

---

## 프로젝트 등록/전환 쉽게 하기

매번 `MAIN_REPO_PATH`를 손으로 바꾸지 않도록, 자주 쓰는 프로젝트를 등록해두고 선택만 할 수 있습니다.

```bash
# 프로젝트 폴더/링크 등록
npm run project:add

# 등록 목록 확인
npm run project:list

# 현재 .env에 연결할 프로젝트 선택
npm run project:use
```

- `project:add`
  - 실제 Git 레포 폴더 경로를 저장합니다.
  - 원하면 GitHub 링크나 `origin` URL도 같이 메모로 저장할 수 있습니다.
  - 프로젝트별 승인 레인 수(1~8)도 같이 저장할 수 있습니다.
  - 저장 직후 현재 `.env`에 바로 적용할 수도 있습니다.
- `project:use`
  - 등록된 프로젝트 중 하나를 골라 `MAIN_REPO_PATH`를 즉시 바꿉니다.
  - 저장된 레인 수(`MAESTRO_PROJECT_LANE_COUNT`)도 함께 바뀝니다.
  - 기존 `HOST`, `PORT`, 토큰 등 다른 설정은 유지합니다.
- `npm run configure`
  - 등록된 프로젝트가 있으면 시작할 때 목록에서 바로 고를 수 있습니다.
- 대시보드 `Repo`
  - 실행 중에는 헤더 `Repo` 버튼으로 터미널 없이 프로젝트를 바꿀 수 있습니다.
  - 선택 즉시 다음 승인/롤백부터 새 레포 경로가 적용됩니다.
  - 변경 내용은 `.env`에도 저장되어 재시작 후 유지됩니다.
  - 같은 패널 안에서 새 Git 레포 경로와 레인 수를 입력해 등록 후 바로 활성화할 수도 있습니다.
  - 이미 등록된 프로젝트는 `선택 프로젝트 레인 수`에서 값을 바꾸고 `레인 저장`을 누르면 수정됩니다.
  - 활성 프로젝트를 수정하면 현재 런타임 레인 수와 `.env`도 함께 갱신됩니다.

> 참고: 링크만으로는 merge를 수행할 수 없습니다. 실제 승인/롤백은 로컬 폴더 기준으로 실행되므로, 등록 시에는 반드시 실제 Git 레포 경로가 필요합니다.

---

## 아이패드(iPad)에서 사용하기

서버(`maestro-server.js`)는 로컬 git merge 실행자이므로 항상 PC에서 구동하고, 아이패드는 대시보드 클라이언트로만 사용합니다.

1. PC에서 서버와 대시보드를 실행합니다: `npm run start:app` (또는 `npm run server` + `npm run dev -- --host`).
2. 아이패드 Safari에서 `http://<PC-IP>:5173/maestro-coding/`으로 접속합니다.
3. 서버 주소가 다르면 헤더의 `서버 <주소>` 버튼을 눌러 `ws://<PC-IP>:8080`을 입력하고 `연결 테스트` → `저장`합니다.
   - 주소는 브라우저(localStorage)에 저장되어 다음 접속에도 유지됩니다.
   - 우선순위: 저장된 주소 > 빌드타임 `VITE_WS_URL` > `ws://<접속한 호스트>:8080` (대부분 자동으로 맞습니다).
   - 처음 접속(주소 미저장) 시 기본 주소로 연결이 안 되면 설정 화면이 자동으로 열립니다.
4. 공유 버튼 → **홈 화면에 추가**를 누르면 전체화면(standalone) 앱처럼 실행됩니다.
   - 오프라인 모드는 지원하지 않습니다. 라이브 서버 연결이 항상 필요합니다.

---

## 아이패드 네이티브 앱 (Capacitor)

Safari/PWA 대신 네이티브 앱(WKWebView)으로 쓰면 네이티브 햅틱과 Bonjour 서버 발견을 사용할 수 있습니다. 요구사항: macOS + Xcode (서명/배포에는 Apple 개발자 계정).

### 빌드 & 실행

```bash
# 웹 자산을 네이티브 모드로 빌드하고 iOS 프로젝트에 동기화
npm run ios:build

# Xcode에서 열기 (서명 Team 선택은 여기서)
npm run ios:open

# 시뮬레이터/연결된 기기에서 바로 실행
npm run ios:run
```

- 첫 실행 시 `Signing & Capabilities`에서 본인 Team을 선택하세요 (bundle id: `kr.selim.maestro`).
- 앱이 PC 서버에 처음 연결할 때 iOS가 **로컬 네트워크 접근 권한**을 묻습니다 — 허용해야 연결됩니다.

### 서버 연결

- 저장된 주소가 없으면 실행 직후 서버 주소 설정 화면이 자동으로 열립니다.
- PC에서 서버가 실행 중이면(`npm run server`, mDNS 광고 기본 켜짐 / `MAESTRO_MDNS=off`로 끔) **주변 서버 찾기**로 자동 발견할 수 있습니다.
  - 참고: 현재 SPM 빌드에는 ZeroConf 네이티브 플러그인이 포함되지 않아 버튼이 보이지 않을 수 있습니다. 이 경우 `ws://<PC-IP>:8080`을 직접 입력하세요.
- 진동(햅틱) 토글이 켜져 있으면 판정/콤보 이벤트에 네이티브 햅틱이 재생됩니다.

### TestFlight / 앱스토어 배포

1. Xcode에서 `Product → Archive` (destination: Any iOS Device).
2. Organizer에서 `Distribute App → App Store Connect → Upload`.
3. App Store Connect에서 TestFlight 내부 테스터 배포 또는 심사 제출.
4. 버전 올릴 때: `npm run ios:build` 후 Xcode에서 `MARKETING_VERSION`/빌드 번호를 올리고 다시 Archive.

### 실기기 수동 검증 체크리스트

- [ ] 설치 후 첫 실행 → 서버 주소 설정 화면 자동 오픈
- [ ] 로컬 네트워크 권한 팝업 허용
- [ ] (플러그인 탑재 빌드) 주변 서버 찾기 → PC 발견 → 주소 채움
- [ ] 연결 테스트 성공 → 저장 → 헤더 LIVE 표시
- [ ] 승인/반려/롤백 플로우 정상 동작
- [ ] 판정(PERFECT/GREAT/LATE)·콤보 10단위에서 햅틱 체감

---

## 승인 전 리뷰 (머지 리뷰 시트)

승인은 실제 `git merge`를 실행하므로, 누르기 전에 무엇이 머지되는지 확인할 수 있습니다.

1. 떨어지는(또는 판정선에 쌓인) 노트를 **클릭/탭**하면 리뷰 시트가 열립니다.
2. 시트에는 서버가 git 원본에서 만든 데이터가 표시됩니다 — 에이전트 자가 보고가 아닙니다.
   - **머지 판정 배지**: `머지 가능`(초록) / `충돌 N개`(빨강, 충돌 파일 목록 표시) / `판정 불가`
   - 변경 파일 목록(+/− 수치, 추가/삭제/수정 상태), 파일별 실제 패치, 커밋 목록
   - 변경이 아주 크면 일부 패치가 생략되고 그 사실이 표시됩니다 (파일 50개 / 패치 32KB 상한)
3. 시트 안의 **승인/반려** 버튼으로 열람한 바로 그 노트를 결정할 수 있습니다. 반려는 사유 입력 시트로 이어집니다.
4. 서버에 연결되지 않은 경우(Mock 모드 등)에는 에이전트 요약만 표시되며, 그 사실이 안내됩니다.

> 서버에 `MAESTRO_SERVER_TOKEN`을 설정한 경우 리뷰 API도 토큰을 요구합니다.

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
| `MAESTRO_PROJECT_NAME` | (없음) | 현재 연결된 프로젝트 표시용 이름 (선택) |
| `MAESTRO_PROJECT_LANE_COUNT` | `4` | 현재 프로젝트 승인 레인 수 (1~8) |
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
| `MAESTRO_AUTO_APPROVE_LOG_MAX_ITEMS` | `500` | 자동승인 정책/실행 이벤트 로그 최대 저장 개수 (50~5000) |
| `MAESTRO_HISTORY_MAX_ITEMS` | `300` | 승인 이력 링버퍼 최대 저장 개수 (40~2000) |
| `MAESTRO_HISTORY_STORE_PATH` | `.maestro-history.json` | 승인 이력 영속 저장 파일 경로 |

예시 `.env`:

```
MAIN_REPO_PATH=/home/user/projects/my-main-repo
MAESTRO_PROJECT_LANE_COUNT=4
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
MAESTRO_AUTO_APPROVE_LOG_MAX_ITEMS=500
MAESTRO_HISTORY_MAX_ITEMS=300
MAESTRO_HISTORY_STORE_PATH=.maestro-history.json
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
# 권장: 설치 스크립트로 자동 등록
npm run install:hook -- --target=claude-stop

# 수동 등록
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
# 권장: 설치 스크립트로 자동 등록
npm run install:hook -- --target=git-post-commit

# 수동 등록
echo '#!/bin/sh' > .git/hooks/post-commit
echo 'sh "$(git rev-parse --show-toplevel)/hooks/notify-maestro.sh"' >> .git/hooks/post-commit
chmod +x .git/hooks/post-commit
```

### 방법 5 — 두 어댑터 한 번에 설치

```bash
npm run install:hook
```

기본값은 아래 둘을 함께 설치합니다.

- `.git/hooks/post-commit`
- `.claude/settings.json` 의 `Stop` hook

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
`Shift + 레인 키`로 반려할 수 있습니다(기본 4레인 프로젝트는 `D/F/J/K`, 피드백 입력 가능, 취소 가능).  
승인 시 서버가 `git merge <branchName>`을 실행합니다.

조건부 자동승인을 켠 경우(`MAESTRO_AUTO_APPROVE_ENABLED=true`), 정책에 일치하는 요청은 대시보드 수동 입력 없이 자동 병합 시도가 수행됩니다.
`MAESTRO_AUTO_APPROVE_REQUIRE_EXPLICIT=true`를 함께 사용하면 요청 본문에 `"autoApprove": true`를 넣은 요청만 자동승인 대상으로 처리됩니다.

운영 가시성 API:

```bash
# 자동승인 설정/런타임 상태 + 최근 이벤트
curl -s http://localhost:8080/api/auto-approve/status | jq

# 자동승인 이벤트 로그 조회 (필터 가능)
curl -s "http://localhost:8080/api/auto-approve/events?limit=20&decision=BLOCKED" | jq
```

`MAESTRO_SERVER_TOKEN`을 설정한 경우 위 API도 `Authorization: Bearer <token>` 헤더가 필요합니다.

---

## 자동승인 운영 패널(Auto Approve Ops) 사용법

- 위치: 상단 헤더 `AutoOps` 버튼
- 열면 바로 확인 가능한 항목
  - 정책 모드(`Disabled/Enabled/Dry Run`)
  - trusted agent 수, branch prefix, explicit requirement, cooldown
  - in-flight / tracked 요청 수, 최근 자동승인 시각
  - 최근 이벤트 로그와 결정 필터(`All/Eligible/Blocked/Executing/Skipped/Merged/Failed`)
- 패널 동작
  - 열려 있는 동안 15초 주기로 운영 API를 다시 조회합니다.
  - `AGENT_TASK_READY`, `MERGE_SUCCESS`, `MERGE_FAILED`, `AUTO_APPROVE_SKIPPED`, `AGENT_RESTARTED` 이벤트가 오면 짧은 debounce 뒤 자동 새로고침합니다.
  - 닫기 버튼 또는 `Esc`로 패널을 닫을 수 있습니다.
- 토큰 모드 서버(`MAESTRO_SERVER_TOKEN` 설정)
  - 운영 API가 `401 Unauthorized`를 반환하면 패널 안에 토큰 입력창이 나타납니다.
  - 토큰 저장 후 같은 패널에서 재조회할 수 있습니다.
  - 저장한 토큰은 브라우저 `localStorage`에 보관되며, 필요하면 `Clear`로 지울 수 있습니다.
- 대응 API
  - `GET /api/auto-approve/status`
  - `GET /api/auto-approve/events?limit=20`

---

## Work Console Agent Trust 확인

- 위치: 상단 헤더 `Work` 버튼을 눌러 Work Console을 엽니다.
- `Agent Trust` 섹션에서 등록된 agent의 운영 신호를 read-only로 확인합니다.
  - display name 또는 `agentId`
  - 연결 상태(`registered`, `connected` 등)
  - 마지막 heartbeat
  - 마지막 approval request status
  - 마지막 approval decision delivery status
  - branch / executor action 보조 정보
- Work Console이 열린 동안 15초 주기로 `GET /api/agents`를 다시 조회합니다.
- token mode 서버(`MAESTRO_SERVER_TOKEN` 설정)에서는 AutoOps와 같은 브라우저 저장 토큰을 사용합니다.
- 이 화면은 운영 가시성 전용입니다. adapter marketplace, plugin 설치, broad configuration UI는 아직 포함하지 않습니다.

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
  - 서버 재시작 후에도 `MAESTRO_HISTORY_STORE_PATH` 파일에서 최근 이력을 복구합니다.
- 시각화:
  - 최근 이력을 현재 프로젝트 레인 수 기준 악보 overview로 축약해 보여줍니다.
  - 같은 시각대 이벤트는 밀도 점으로 묶여 표시됩니다.
  - 범례와 `aria-live` 요약이 있어 필터 결과와 최신 이벤트를 함께 읽을 수 있습니다.
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
  - 상태 칩(`booting/ready/queued/playing/paused/error`)
  - 항상 보이는 `Hz` 슬롯(`standby` 또는 `~xxxHz`)

채널 등록 절차:

1. 상단 `function bach`에서 `채널` 버튼 클릭
2. `유튜브 채널 경로` 입력
3. `저장` 클릭

권장 URL 형식:

- `https://www.youtube.com/channel/UC...` (권장)
- `https://www.youtube.com/playlist?list=...`
- `https://www.youtube.com/watch?v=...`

> 참고: `@handle` 형식 채널 주소는 직접 재생 대상 해석이 제한될 수 있어 `channel/UC...` 형식을 권장합니다.
> 참고: 일부 환경에서 실제 재생 직전에는 `queued` 상태와 `standby`가 잠깐 보일 수 있습니다. 이는 플레이어 준비 단계이며, 재생이 시작되면 `playing`과 `~xxxHz`로 바뀝니다.

---

## QA / 회귀 테스트

변경 후 다음 단계로 넘어가기 전 아래 커맨드로 품질 게이트를 실행합니다.

```bash
npm run qa
npm run smoke:lanes
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
