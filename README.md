# Maestro Coding

<p align="center">
  <a href="https://redsunjin.github.io/maestro-coding/">
    <img src="https://img.shields.io/badge/🎹%20데모%20바로가기-Maestro%20Coding-blueviolet?style=for-the-badge&logo=github-pages&logoColor=white" alt="Demo">
  </a>
</p>

## 🎼 '마에스트로 코딩(Maestro Coding)' 

### 1. 핵심 메시지 (Core Message)

* **Before:** 여러 에이전트와 창을 띄워놓고 쏟아지는 PR과 커밋 알림에 쫓기며 클릭질하는 스트레스 넘치는 개발자.
* **After:** 바흐의 선율 속에서, 투명하게 오버레이된 건반형 대시보드를 통해 리드미컬하게 다수의 에이전트를 지휘하는 우아한 개발자.
* **Slogan:** "코딩을 지휘하다, AI 에이전트와 함께하는 코드 심포니."

### 2. 단계별 콘텐츠 전개 전략

#### Phase 1: 시각적 쾌감을 극대화한 숏폼 (YouTube Shorts / Reels)

바흐의 음악과 UI의 타격감을 동기화하여 개발자들의 로망을 자극하는 30~60초 분량의 영상입니다.

* **오디오:** 바흐의 인벤션(Invention)이나 평균율 클라비어 곡집처럼 규칙적이고 경쾌한 피아노/하프시코드 연주곡.
* **화면 구성 (분할 화면):**
  * **상단/배경:** 다크 모드의 세련된 개발 환경. 투명한 '건반형 대시보드' 위로 에이전트들의 코드 리뷰 요청(Diff 요약본)이 위에서 아래로 리듬 게임의 노트처럼 떨어집니다.
  * **하단/실사:** 여유롭게 커피를 마시며, 키보드 특정 키(예: A, S, D, F)를 음악 비트에 맞춰 가볍게 탭(Tap)하는 손.


* **포인트:** 키를 누를 때마다 화면의 코드 노드가 경쾌한 파동을 일으키며 'Merged(승인)' 상태로 변하고, 브랜치들이 메인 트리에 깔끔하게 합쳐지는 애니메이션을 연출합니다.

#### Phase 2: 기술 블로그 아티클 (The Architecture of Flow)

영상을 보고 "저거 어떻게 세팅한 거지?"라고 궁금해할 개발자들을 위한 딥다이브 콘텐츠입니다.

* **주제:** Git Worktree와 다중 AI 에이전트를 활용한 병렬 개발 워크플로우 구축기.
* **내용:**
  * 왜 디렉토리를 복사하지 않고 Git Worktree를 사용하여 여러 에이전트를 독립적으로 띄웠는지에 대한 기술적 이점 설명.
  * 에이전트들의 승인 대기 상태를 가로채서(Intercept) 하나의 중앙 대시보드(건반 패널)로 모으는 이벤트 루프 아키텍처.
  * 알림의 파편화를 막고 컨텍스트 스위칭을 최소화한 UX 설계 철학.



#### Phase 3: 인터랙티브 웹 데모 및 오픈소스/컴포넌트 공개

단순한 영상 콘텐츠로 끝내는 것이 아니라, 직접 경험해 볼 수 있는 미니 데모를 제공하여 기술력을 증명합니다.

* 웹 브라우저에서 바흐 음악과 함께 가짜(Mock) 에이전트 커밋들이 내려오고, 사용자가 직접 키보드로 승인해 보는 리듬 게임 형태의 랜딩 페이지 제작.
* 이 '건반형 승인 대시보드'를 AI 보조 코딩을 위해 설계된 전체 풀스택 프레임워크 내에서 언제든 꺼내 쓸 수 있는 핵심 **재사용 UI/UX 컴포넌트**로 패키징하여 소개합니다.

---

## 🔌 `maestro-server.js` 동작 원리

프론트엔드 데모만으로는 실제 에이전트 승인 요청을 받을 수 없습니다.  
`maestro-server.js`는 **에이전트 ↔ 대시보드** 사이를 연결하는 경량 Node.js 서버입니다.

### 전체 아키텍처 흐름

```
┌─────────────────────────────────────────────────────────────────────┐
│                       Maestro 시스템 전체 흐름                         │
│                                                                     │
│  AI 에이전트                                                          │
│  (Codex / Claude /                                                  │
│   터미널 스크립트 등)                                                   │
│         │                                                           │
│         │  ① 작업 완료 후                                             │
│         │  POST /api/request                                        │
│         ▼                                                           │
│  ┌─────────────────────────────────────────────────┐               │
│  │          maestro-server.js  (포트 8080)           │               │
│  │                                                 │               │
│  │  HTTP 서버                WebSocket 서버          │               │
│  │  ┌──────────────┐        ┌──────────────────┐  │               │
│  │  │POST /api/req │──②──▶ │broadcast()       │  │               │
│  │  │GET  /health  │        │AGENT_TASK_READY  │  │               │
│  │  └──────────────┘        └────────┬─────────┘  │               │
│  │                                   │             │               │
│  │  Git 실행 (execFile)  ◀──⑤──────  │             │               │
│  │  git merge / reset                │             │               │
│  └───────────────────────────────────┼─────────────┘               │
│                                      │ ③ WebSocket                 │
│                                      ▼   ws://localhost:8080        │
│                         ┌────────────────────────┐                 │
│                         │  브라우저 대시보드          │                 │
│                         │  (React / App.jsx)      │                 │
│                         │                         │                 │
│                         │  노트가 레인으로 떨어짐 🎵  │                 │
│                         │                         │                 │
│                         │  키보드 D/F/J/K 입력 ④   │                 │
│                         └────────────────────────┘                 │
└─────────────────────────────────────────────────────────────────────┘
```

### 단계별 이벤트 흐름

| 단계 | 주체 | 동작 |
|------|------|------|
| ① | AI 에이전트 | 작업(커밋) 완료 후 `POST /api/request` 로 승인 요청 전송 |
| ② | 서버 | JSON 파싱 → `AGENT_TASK_READY` 이벤트를 연결된 모든 대시보드로 브로드캐스트 |
| ③ | 대시보드 | WebSocket 메시지 수신 → 해당 레인에 노트(음표)가 화면 위에서 아래로 낙하 |
| ④ | 사용자 | 키보드(`D` `F` `J` `K`)로 노트 승인 → `APPROVE` 이벤트를 서버로 전송 |
| ⑤ | 서버 | `git merge <branchName>` 실행 → 성공 시 `MERGE_SUCCESS` 응답 |

> **`Ctrl+Z` 롤백 흐름:** 사용자가 `Ctrl+Z`를 누르면 `UNDO` 이벤트가 서버로 전송되고, 서버는 `git reset --hard HEAD~1`을 실행합니다.

---

### 실행 방법

```bash
# 1. 의존성 설치 (ws 패키지 포함)
npm install

# 2. 서버 시작
npm run server
# 또는
node maestro-server.js

# 3. 프론트엔드 개발 서버 (별도 터미널)
npm run dev
```

서버가 시작되면 대시보드에서 "지휘 시작" 버튼을 눌렀을 때 자동으로 `ws://localhost:8080`에 연결을 시도합니다.  
연결에 성공하면 헤더에 **🔴 LIVE** 배지가 표시됩니다. 연결 실패 시에는 자동으로 Mock 모드로 동작합니다.

#### 환경 변수

| 변수 | 기본값 | 설명 |
|------|--------|------|
| `PORT` | `8080` | 서버 리스닝 포트 |
| `MAIN_REPO_PATH` | `process.cwd()` | `git merge`/`git reset` 을 실행할 메인 레포지토리 경로 |
| `VITE_WS_URL` | `ws://localhost:8080` | 프론트엔드가 연결할 WebSocket 주소 (`.env` 파일에 설정) |

예시:
```bash
MAIN_REPO_PATH=/home/user/my-project PORT=9090 node maestro-server.js
```

---

### HTTP API 레퍼런스

#### `POST /api/request` — 에이전트 승인 요청

에이전트(또는 완료 훅 스크립트)가 작업 완료 시 이 엔드포인트로 요청을 보냅니다.

**요청 본문 (`application/json`)**

```json
{
  "requestId":  "req_abc123",
  "agentId":    "agent_backend_01",
  "branchName": "feature/jwt-optimization",
  "projectId":  "proj_b2c",
  "laneIndex":  2,
  "diffSummary": {
    "title":            "JWT 검증 로직 최적화",
    "impact":           "Medium",
    "shortDescription": "auth.js 45-60 라인 수정. 예외 처리 추가."
  }
}
```

| 필드 | 필수 | 설명 |
|------|------|------|
| `agentId` | 권장 | 에이전트 식별자 |
| `branchName` | 권장 | 실제 git merge 대상 브랜치 이름 |
| `projectId` | 선택 | 프론트엔드 탭 선택에 사용 (`proj_b2c`, `proj_admin`, `proj_api`) |
| `laneIndex` | 선택 | UI 레인 번호 1~4. 생략 시 서버가 랜덤 배정 |
| `diffSummary` | 선택 | 생략 시 `title` / `description` 최상위 필드를 대체 사용 |

**curl 예시**

```bash
curl -X POST http://localhost:8080/api/request \
  -H 'Content-Type: application/json' \
  -d '{
    "agentId": "my_agent",
    "branchName": "feature/my-branch",
    "laneIndex": 1,
    "diffSummary": {
      "title": "작업 완료",
      "shortDescription": "변경 내용 요약"
    }
  }'
```

**응답**

```json
{ "success": true, "requestId": "req_1748392839201" }
```

#### `GET /health` — 서버 상태 확인

```bash
curl http://localhost:8080/health
# {"status":"ok","clients":1}
```

---

### WebSocket 이벤트 목록

#### 서버 → 대시보드 (수신 이벤트)

| 이벤트 | 설명 |
|--------|------|
| `AGENT_TASK_READY` | 에이전트 승인 요청. 이 이벤트의 페이로드가 노트(음표)로 화면에 표시됩니다. |
| `MERGE_SUCCESS` | `git merge` 성공. 노트가 화면에서 사라집니다. |
| `MERGE_FAILED` | `git merge` 실패. 서버 로그를 확인하세요. |
| `UNDO_SUCCESS` | `git reset --hard HEAD~1` 성공. |
| `UNDO_FAILED` | 롤백 실패. |
| `AGENT_RESTARTED` | 반려(REJECT) 처리 완료 확인. |

#### 대시보드 → 서버 (송신 이벤트)

| 액션 | 설명 |
|------|------|
| `APPROVE` | 노트 승인. `branchName`이 있으면 `git merge` 실행. |
| `REJECT` | 노트 반려. `feedback` 필드로 에이전트에 수정 지시 전달 가능. |
| `UNDO` | 직전 병합 롤백 (`git reset --hard HEAD~1`). |

---

### 3. 성공적인 연출을 위한 UX 디테일

* **Diff 하이라이트의 추상화:** 승인 화면에서 코드를 한 줄 한 줄 읽게 하면 리듬이 깨집니다. 에이전트가 "어떤 의도"로 "어느 로직"을 건드렸는지만 3줄 이내의 자연어나 미니 맵 형태로 보여주어 직관적인 판단을 돕습니다.
* **되감기(Undo) 기능:** 리듬에 맞춰 빠르게 승인하다 실수했을 때, 음악의 리와인드 효과음과 함께 방금 병합한 커밋을 취소하는 단축키(`Ctrl+Z` 등)를 지원하여 심리적 안정감을 제공합니다.
