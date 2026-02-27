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


### 🎹 마에스트로 백엔드 서버 (`maestro-server.js`)

Node.js 환경에서 기본 내장 모듈인 `child_process`를 이용해 Git을 제어하고, 가벼운 통신을 위해 `ws` 라이브러리를 사용합니다. (실행 전 `npm install ws` 필요)

```javascript
const { WebSocketServer } = require('ws');
const { exec } = require('child_process');
const util = require('util');

// 비동기 Git 명령어 실행을 위한 프로미스화
const execPromise = util.promisify(exec);

// 웹소켓 서버 포트 설정 (마에스트로의 포디움)
const wss = new WebSocketServer({ port: 8080 });

console.log("🎼 Maestro Backend Server is listening on ws://localhost:8080");

// 1. Git 제어 유틸리티
const gitOps = {
    // 특정 Worktree의 커밋 내용 요약을 위해 diff 추출
    getDiff: async (worktreePath) => {
        try {
            const { stdout } = await execPromise(`git -C ${worktreePath} log -1 -p`);
            return stdout;
        } catch (error) {
            console.error(`Diff 추출 실패 (${worktreePath}):`, error);
            return null;
        }
    },
    // 승인 시 메인 브랜치로 병합
    mergeAgentBranch: async (mainPath, branchName) => {
        try {
            await execPromise(`git -C ${mainPath} merge ${branchName}`);
            return true;
        } catch (error) {
            console.error(`Merge 실패 (${branchName}):`, error);
            return false;
        }
    },
    // 실수로 승인했을 때 (Ctrl+Z) 롤백
    undoLastMerge: async (mainPath) => {
        try {
            await execPromise(`git -C ${mainPath} reset --hard HEAD~1`);
            return true;
        } catch (error) {
            console.error("Undo 롤백 실패:", error);
            return false;
        }
    }
};

// 2. 로컬 LLM 연동부 (Mock) - Diff를 3줄로 요약하여 리듬감을 살림
async function summarizeDiffWithLocalLLM(rawDiff) {
    // 실제 환경에서는 여기에 Local LLM (예: Ollama, LM Studio API) 호출 로직이 들어갑니다.
    return {
        title: "JWT 검증 로직 최적화",
        impact: "Medium",
        shortDescription: "auth.js의 토큰 파싱 속도 개선 및 예외 처리 추가"
    };
}

// 3. 웹소켓 이벤트 통신부
wss.on('connection', function connection(ws) {
    console.log("🎻 Frontend Dashboard (Conductor) connected!");

    // 클라이언트(프론트엔드)로부터 마에스트로의 액션 수신
    ws.on('message', async function message(data) {
        const payload = JSON.parse(data);
        const mainRepoPath = '/path/to/main/repo'; // 메인 레포지토리 경로

        switch (payload.action) {
            case 'APPROVE':
                console.log(`[승인 타격!] 레인 ${payload.laneIndex} - ${payload.branchName} 병합 중...`);
                const mergeSuccess = await gitOps.mergeAgentBranch(mainRepoPath, payload.branchName);
                
                if (mergeSuccess) {
                    ws.send(JSON.stringify({ event: 'MERGE_SUCCESS', requestId: payload.requestId }));
                    console.log(`✔ 병합 완료: ${payload.branchName}`);
                }
                break;

            case 'REJECT':
                console.log(`[반려] ${payload.branchName} - 피드백: ${payload.feedback}`);
                // 여기에 에이전트에게 피드백을 전달하여 다시 작업하게 하는 로직 추가
                ws.send(JSON.stringify({ event: 'AGENT_RESTARTED', requestId: payload.requestId }));
                break;

            case 'UNDO':
                console.log(`[리와인드!] 직전 병합 취소 중...`);
                const undoSuccess = await gitOps.undoLastMerge(mainRepoPath);
                if (undoSuccess) {
                    ws.send(JSON.stringify({ event: 'UNDO_SUCCESS' }));
                    console.log(`↺ 롤백 완료`);
                }
                break;
        }
    });
});

// 4. 에이전트 작업 완료 시뮬레이터 (파일 Watcher 대체)
// 실제 환경에서는 Worktree의 파일 변경을 감지하거나 에이전트의 완료 웹훅을 받습니다.
setInterval(async () => {
    // 가상의 에이전트 작업 데이터
    const mockWorktreePath = '/path/to/agent1/worktree';
    const rawDiff = "dummy diff data"; // await gitOps.getDiff(mockWorktreePath);
    
    // 로컬 LLM을 통한 3줄 요약 생성
    const diffSummary = await summarizeDiffWithLocalLLM(rawDiff);

    const approvalRequest = {
        event: 'AGENT_TASK_READY',
        requestId: `req_${Date.now()}`,
        agentId: 'agent_backend_01',
        branchName: 'feature/auth-update',
        laneIndex: Math.floor(Math.random() * 4) + 1, // 1~4번 건반 레인에 랜덤 배정
        timestamp: new Date().toISOString(),
        diffSummary: diffSummary
    };

    // 연결된 프론트엔드 대시보드로 노트(음표) 발송
    wss.clients.forEach(function each(client) {
        if (client.readyState === 1) { // WebSocket.OPEN
            client.send(JSON.stringify(approvalRequest));
            console.log(`🎵 새로운 노트 발송: 레인 ${approvalRequest.laneIndex}`);
        }
    });
}, 8000); // 8초마다 새로운 승인 요청이 리드미컬하게 떨어짐

```

---

### 💡 구현 포인트

1. **비동기 흐름 제어 (`util.promisify`):** Git 명령어 처럼 외부 프로세스를 호출하는 작업은 시스템을 블로킹하지 않도록 철저히 비동기로 처리했습니다.
2. **이벤트 드리븐 (Event-Driven):** `setInterval`로 구현된 시뮬레이터 부분은 추후 에이전트의 작업이 완료되었을 때 트리거되는 Webhook 엔드포인트나 파일 시스템 `Watcher` 로직으로 교체하면 됩니다.
3. **요약(Summarization) 병목 방지:** `summarizeDiffWithLocalLLM` 함수가 로컬 LLM을 호출할 때 시간이 걸릴 수 있으므로, 이 작업 역시 큐를 통해 백그라운드에서 처리되고 요약이 완료된 시점에만 소켓으로 전송되도록 설계하는 것이 좋습니다.

