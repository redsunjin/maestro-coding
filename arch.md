## 1. 핵심 데이터 구조 설계 (Data Models)

에이전트가 생성한 방대한 코드를 화면에 그대로 뿌리면 리듬이 깨집니다. 따라서 백엔드에서 변경 사항(Diff)을 3줄 이내로 요약하여 프론트엔드에 전달하는 구조가 필요합니다.

### A. 에이전트 승인 요청 객체 (`ApprovalRequest`)

프론트엔드의 '건반 레인(Lane)'에 떨어지는 노트(음표) 역할을 하는 데이터입니다.

```json
{
  "requestId": "req_1029384",
  "agentId": "agent_backend_01",
  "worktreeName": "wt-feature-auth",
  "laneIndex": 1, 
  "timestamp": "2026-02-27T16:26:19Z",
  "diffSummary": {
    "title": "JWT 토큰 검증 로직 추가",
    "impact": "Low", 
    "shortDescription": "auth.js 라인 45-60 수정. 예외 처리 로직 보강 완료."
  },
  "status": "PENDING" // PENDING, APPROVED, REJECTED, MERGED
}

```

* **`laneIndex`**: UI에서 어떤 건반(예: 1번 레인, 단축키 'D')에 매핑될지 결정합니다.
* **`diffSummary`**: 로컬 LLM이 커밋 전 변경 사항을 분석해 텍스트로 요약한 핵심 정보입니다. 사용자는 이 요약만 보고 0.5초 만에 승인 여부를 결정합니다.

### B. 사용자 액션 페이로드 (`UserAction`)

사용자가 단축키를 경쾌하게 탭했을 때 백엔드로 날아가는 이벤트 데이터입니다.

```json
{
  "requestId": "req_1029384",
  "action": "APPROVE", // APPROVE, REJECT, UNDO
  "actionTimestamp": "2026-02-27T16:26:22Z",
  "feedback": "" // REJECT 시 에이전트에게 전달할 수정 지시사항 (Shift+Tap 시 입력)
}

```

---

## 2. 이벤트 흐름 구조 (Event Architecture)

에이전트(로컬 LLM) -> 파일 시스템(Git Worktree) -> 중앙 서버(Node/Python) -> 프론트엔드 대시보드로 이어지는 파이프라인입니다.

### Step 1: 작업 감지 및 요약 (`backend`)

1. 각 에이전트가 할당된 Git Worktree에서 코드를 작성하고 로컬 커밋을 생성합니다.
2. 백엔드의 파일 시스템 Watcher(또는 에이전트의 완료 훅)가 이를 감지합니다.
3. 백엔드는 `git diff`를 추출하고, 로컬 LLM을 잠시 호출하여 `diffSummary`를 생성합니다.

### Step 2: 프론트엔드로 노트 낙하 (`WebSocket: Server -> Client`)

1. 백엔드는 프론트엔드로 `EVENT: AGENT_TASK_READY` 소켓 메시지를 발송합니다.
2. 프론트엔드는 이 메시지를 받아 `ApprovalRequest` 객체를 큐에 넣고, 화면 상단에서 아래로 부드럽게 내려오는 UI 애니메이션을 시작합니다.

### Step 3: 마에스트로의 지휘 (`WebSocket: Client -> Server`)

1. 바흐의 음악을 듣던 사용자가 화면에 내려오는 요약을 보고 리듬에 맞춰 지정된 단축키(예: `Spacebar`)를 누릅니다.
2. 프론트엔드는 타격 이펙트(파동, 색상 변화)를 렌더링하고, 즉시 `EVENT: USER_ACTION_APPROVE`를 서버로 발송합니다.

### Step 4: 자동 병합 및 롤백 (`backend`)

1. 백엔드는 이벤트를 수신하자마자 해당 Worktree의 브랜치를 메인 브랜치로 `git merge` 합니다.
2. 성공 시 `EVENT: MERGE_SUCCESS`를 보내 프론트엔드에서 음표가 깔끔하게 사라지는 이펙트를 줍니다.
3. 만약 사용자가 실수로 승인 후 `Ctrl+Z`를 누르면, `EVENT: USER_ACTION_UNDO`가 전송되어 백엔드에서 `git reset --hard HEAD~1`을 실행해 즉각 롤백합니다.

---

## 3. 핵심 아키텍처 포인트

* **Git Worktree의 독립성:** 여러 에이전트가 동시에 작업하더라도 폴더(Worktree)가 물리적으로 분리되어 있어 `git.lock` 충돌이 발생하지 않습니다.
* **비동기 큐잉(Queueing):** 에이전트 작업 속도가 사용자의 승인 속도보다 빠를 수 있습니다. 프론트엔드 상태 관리자(Zustand, Redux 등)에 대기 큐(Queue)를 두어, 사용자가 소화할 수 있는 템포로 화면에 노트를 노출해야 합니다.

이러한 데이터 구조와 이벤트 흐름을 바탕으로 백엔드 로직을 구성하면, 에이전트의 복잡한 작업을 단순하고 우아한 UI 액션으로 치환할 수 있습니다.

이 설계를 실제 코드로 구현하기 위해, **웹소켓 이벤트를 처리하고 Git 명령어를 제어하는 Node.js 기반의 백엔드 서비스(Watcher & Merger) 뼈대 코드를 먼저 작성해 드릴까요?**
