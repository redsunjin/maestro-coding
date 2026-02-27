// maestro-server.js
// 마에스트로 백엔드 서버: 에이전트 승인 요청을 수신하여 프론트엔드 대시보드로 전달합니다.
//
// 실행 방법: node maestro-server.js
// 의존성:   npm install ws  (devDependencies 에 포함됨)
//
// API:
//   WebSocket  ws://localhost:8080      — 프론트엔드 대시보드 연결
//   POST       /api/request             — 에이전트가 승인 요청을 보내는 엔드포인트
//   GET        /health                  — 서버 상태 확인

import http from 'http';
import { WebSocketServer, WebSocket as WSWebSocket } from 'ws';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFilePromise = promisify(execFile);

// 유효한 git 브랜치명만 허용 (보안: 쉘 인젝션 방지)
const VALID_BRANCH_RE = /^[a-zA-Z0-9._\-/]+$/;

function isValidBranchName(name) {
  return typeof name === 'string' && VALID_BRANCH_RE.test(name) && !name.includes('..');
}

const PORT = process.env.PORT || 8080;
const SERVER_TOKEN = process.env.MAESTRO_SERVER_TOKEN || '';

function extractBearerToken(headerValue) {
  if (typeof headerValue !== 'string') return null;
  const prefix = 'Bearer ';
  if (!headerValue.startsWith(prefix)) return null;
  const token = headerValue.slice(prefix.length).trim();
  return token || null;
}

function isRequestAuthorized(req) {
  if (!SERVER_TOKEN) return true;
  const token = extractBearerToken(req.headers.authorization);
  return token === SERVER_TOKEN;
}

// ── HTTP 서버 ────────────────────────────────────────────────────────────────

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // 서버 상태 확인
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', clients: wss.clients.size }));
    return;
  }

  // 에이전트 승인 요청 수신 엔드포인트
  // 에이전트는 작업 완료 후 이 엔드포인트로 POST 요청을 보냅니다.
  //
  // 요청 본문 형식 (ApprovalRequest):
  // {
  //   "requestId": "req_abc123",       // 고유 요청 ID (없으면 자동 생성)
  //   "agentId": "agent_backend_01",   // 에이전트 식별자
  //   "branchName": "feature/auth",    // 병합할 브랜치 이름
  //   "projectId": "proj_b2c",         // 대상 프로젝트 ID (선택)
  //   "laneIndex": 2,                  // UI 레인 번호 1~4 (없으면 자동 배정)
  //   "diffSummary": {                 // LLM이 생성한 변경 요약
  //     "title": "JWT 검증 로직 최적화",
  //     "impact": "Medium",
  //     "shortDescription": "auth.js 45-60 라인 수정"
  //   }
  // }
  if (req.method === 'POST' && req.url === '/api/request') {
    if (!isRequestAuthorized(req)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return;
    }

    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      try {
        const data = JSON.parse(body);

        // 필수 필드 기본값 채우기
        const approvalRequest = {
          requestId: data.requestId || `req_${Date.now()}`,
          agentId: data.agentId || 'unknown_agent',
          branchName: data.branchName || null,
          projectId: data.projectId || null,
          laneIndex: data.laneIndex || (Math.floor(Math.random() * 4) + 1),
          timestamp: new Date().toISOString(),
          diffSummary: data.diffSummary || {
            title: data.title || '에이전트 작업 완료',
            impact: 'Medium',
            shortDescription: data.description || '',
          },
        };

        broadcastToClients({ event: 'AGENT_TASK_READY', ...approvalRequest });
        console.log(`📨 승인 요청 수신: [${approvalRequest.agentId}] ${approvalRequest.diffSummary.title}`);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, requestId: approvalRequest.requestId }));
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON body' }));
      }
    });
    return;
  }

  res.writeHead(404);
  res.end();
});

// ── WebSocket 서버 ────────────────────────────────────────────────────────────

const wss = new WebSocketServer({ server });

function broadcastToClients(data) {
  const message = JSON.stringify(data);
  wss.clients.forEach((client) => {
    if (client.readyState === WSWebSocket.OPEN) {
      client.send(message);
    }
  });
}

// ── Git 유틸리티 ──────────────────────────────────────────────────────────────

const gitOps = {
  // 승인 시 메인 브랜치로 병합
  mergeAgentBranch: async (mainPath, branchName) => {
    const { stdout } = await execFilePromise('git', ['-C', mainPath, 'merge', branchName]);
    return stdout;
  },
  // 실수로 승인했을 때 (Ctrl+Z) 직전 병합 롤백
  undoLastMerge: async (mainPath) => {
    const { stdout } = await execFilePromise('git', ['-C', mainPath, 'reset', '--hard', 'HEAD~1']);
    return stdout;
  },
};

// ── 프론트엔드 메시지 처리 ─────────────────────────────────────────────────────

wss.on('connection', (ws) => {
  console.log('🎻 프론트엔드 대시보드 연결됨');

  ws.on('message', async (data) => {
    let payload;
    try {
      payload = JSON.parse(data);
    } catch {
      return;
    }

    // 메인 레포지토리 경로는 환경변수로 설정합니다.
    // 예) MAIN_REPO_PATH=/home/user/myproject node maestro-server.js
    const mainRepoPath = process.env.MAIN_REPO_PATH || process.cwd();

    switch (payload.action) {
      case 'APPROVE': {
        console.log(`✅ 승인 타격! requestId=${payload.requestId}, branch=${payload.branchName}`);
        if (payload.branchName && isValidBranchName(payload.branchName)) {
          const ok = await gitOps
            .mergeAgentBranch(mainRepoPath, payload.branchName)
            .then(() => true)
            .catch((err) => { console.error('Merge 실패:', err.message); return false; });

          ws.send(JSON.stringify({
            event: ok ? 'MERGE_SUCCESS' : 'MERGE_FAILED',
            requestId: payload.requestId,
          }));
        } else {
          // 브랜치 정보 없이도 UI 응답은 반환
          ws.send(JSON.stringify({ event: 'MERGE_SUCCESS', requestId: payload.requestId }));
        }
        break;
      }

      case 'REJECT': {
        console.log(`❌ 반려: requestId=${payload.requestId}, feedback="${payload.feedback}"`);
        ws.send(JSON.stringify({ event: 'AGENT_RESTARTED', requestId: payload.requestId }));
        break;
      }

      case 'UNDO': {
        console.log('⏪ 롤백 요청!');
        const ok = await gitOps
          .undoLastMerge(mainRepoPath)
          .then(() => true)
          .catch((err) => { console.error('Undo 실패:', err.message); return false; });

        ws.send(JSON.stringify({ event: ok ? 'UNDO_SUCCESS' : 'UNDO_FAILED' }));
        break;
      }

      default:
        break;
    }
  });

  ws.on('close', () => console.log('🔌 프론트엔드 대시보드 연결 종료'));
});

// ── 서버 시작 ─────────────────────────────────────────────────────────────────

server.listen(PORT, () => {
  console.log(`\n🎼 Maestro Backend Server 시작됨`);
  console.log(`   WebSocket   : ws://localhost:${PORT}`);
  console.log(`   에이전트 API : POST http://localhost:${PORT}/api/request`);
  console.log(`   상태 확인   : GET  http://localhost:${PORT}/health`);
  console.log(`   인증 모드   : ${SERVER_TOKEN ? 'Bearer token required' : 'disabled'}`);
  console.log(`\n에이전트에서 승인 요청을 보내는 예시:`);
  console.log(`  curl -X POST http://localhost:${PORT}/api/request \\`);
  console.log(`    -H 'Content-Type: application/json' \\`);
  if (SERVER_TOKEN) {
    console.log(`    -H 'Authorization: Bearer <MAESTRO_SERVER_TOKEN>' \\`);
  }
  console.log(`    -d '{"agentId":"my_agent","branchName":"feature/my-branch","laneIndex":1,"diffSummary":{"title":"작업 완료","shortDescription":"변경 내용"}}'`);
  console.log();
});
