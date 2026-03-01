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
const HOST = process.env.HOST || '127.0.0.1';
const SERVER_TOKEN = process.env.MAESTRO_SERVER_TOKEN || '';
const DEFAULT_ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
];
const ALLOWED_ORIGINS = parseAllowedOrigins(process.env.ALLOWED_ORIGINS);
const AUTO_APPROVE_CONFIG = parseAutoApproveConfig(process.env);

function parseBoolean(value, defaultValue = false) {
  if (typeof value !== 'string') return defaultValue;
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return defaultValue;
}

function parsePositiveInt(value, fallback) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return fallback;
  return parsed;
}

function parseNonNegativeInt(value, fallback) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) return fallback;
  return parsed;
}

function parseCsv(rawValue) {
  if (!rawValue || !rawValue.trim()) return [];
  return rawValue
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseAutoApproveConfig(env) {
  return {
    enabled: parseBoolean(env.MAESTRO_AUTO_APPROVE_ENABLED, false),
    trustedAgents: parseCsv(env.MAESTRO_AUTO_APPROVE_TRUSTED_AGENTS),
    branchPrefix: (env.MAESTRO_AUTO_APPROVE_BRANCH_PREFIX || '').trim(),
    maxDescriptionLength: parsePositiveInt(env.MAESTRO_AUTO_APPROVE_MAX_DESC_LENGTH, 180),
    requireExplicit: parseBoolean(env.MAESTRO_AUTO_APPROVE_REQUIRE_EXPLICIT, false),
    cooldownMs: parseNonNegativeInt(env.MAESTRO_AUTO_APPROVE_COOLDOWN_MS, 0),
    dryRun: parseBoolean(env.MAESTRO_AUTO_APPROVE_DRY_RUN, false),
  };
}

function evaluateAutoApproveEligibility(approvalRequest, config, runtimeState = {}) {
  if (!config.enabled) {
    return { eligible: false, reason: 'AUTO_APPROVE_DISABLED' };
  }

  if (!approvalRequest.branchName || !isValidBranchName(approvalRequest.branchName)) {
    return { eligible: false, reason: 'INVALID_BRANCH' };
  }

  if (config.trustedAgents.length > 0 && !config.trustedAgents.includes(approvalRequest.agentId)) {
    return { eligible: false, reason: 'UNTRUSTED_AGENT' };
  }

  if (config.branchPrefix && !approvalRequest.branchName.startsWith(config.branchPrefix)) {
    return { eligible: false, reason: 'BRANCH_PREFIX_MISMATCH' };
  }

  if (config.requireExplicit && approvalRequest.autoApprove !== true) {
    return { eligible: false, reason: 'EXPLICIT_FLAG_REQUIRED' };
  }

  const shortDescription = approvalRequest.diffSummary?.shortDescription || '';
  if (shortDescription.length > config.maxDescriptionLength) {
    return { eligible: false, reason: 'DESCRIPTION_TOO_LONG' };
  }

  const now = runtimeState.now || Date.now();
  const lastAutoApproveAt = runtimeState.lastAutoApproveAt || 0;
  if (config.cooldownMs > 0 && lastAutoApproveAt > 0 && (now - lastAutoApproveAt) < config.cooldownMs) {
    return {
      eligible: false,
      reason: 'COOLDOWN_ACTIVE',
      retryAfterMs: config.cooldownMs - (now - lastAutoApproveAt),
    };
  }

  return { eligible: true, reason: config.dryRun ? 'DRY_RUN_READY' : 'POLICY_MATCHED' };
}

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

function parseAllowedOrigins(rawValue) {
  if (!rawValue || !rawValue.trim()) return DEFAULT_ALLOWED_ORIGINS;
  if (rawValue.trim() === '*') return ['*'];
  return rawValue
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function getCorsAllowedOrigin(req) {
  const requestOrigin = req.headers.origin;
  if (!requestOrigin) return null;
  if (ALLOWED_ORIGINS.includes('*')) return '*';
  return ALLOWED_ORIGINS.includes(requestOrigin) ? requestOrigin : null;
}

function applyCorsHeaders(req, res) {
  const allowedOrigin = getCorsAllowedOrigin(req);
  if (allowedOrigin) {
    res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

// ── HTTP 서버 ────────────────────────────────────────────────────────────────

const server = http.createServer((req, res) => {
  applyCorsHeaders(req, res);

  if (req.method === 'OPTIONS') {
    if (req.headers.origin && !getCorsAllowedOrigin(req)) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Origin not allowed' }));
      return;
    }
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.headers.origin && !getCorsAllowedOrigin(req)) {
    res.writeHead(403, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Origin not allowed' }));
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
          autoApprove: data.autoApprove === true,
          timestamp: new Date().toISOString(),
          diffSummary: data.diffSummary || {
            title: data.title || '에이전트 작업 완료',
            impact: 'Medium',
            shortDescription: data.description || '',
          },
        };

        setRequestState(approvalRequest.requestId, REQUEST_STATUS.READY, 'request');
        const autoApprove = evaluateAutoApproveEligibility(approvalRequest, AUTO_APPROVE_CONFIG, {
          now: Date.now(),
          lastAutoApproveAt,
        });

        broadcastToClients({ event: 'AGENT_TASK_READY', ...approvalRequest });
        console.log(`📨 승인 요청 수신: [${approvalRequest.agentId}] ${approvalRequest.diffSummary.title}`);

        if (autoApprove.eligible) {
          void runConditionalAutoApprove(approvalRequest);
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          requestId: approvalRequest.requestId,
          autoApprove,
        }));
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

const REQUEST_STATUS = {
  READY: 'ready',
  APPROVING: 'approving',
  MERGED: 'merged',
  REJECTED: 'rejected',
};

const requestStateById = new Map();
const autoApproveInFlight = new Set();
let lastAutoApproveAt = 0;

function setRequestState(requestId, status, source = 'system') {
  if (!requestId) return;
  requestStateById.set(requestId, {
    status,
    source,
    updatedAt: Date.now(),
  });
}

function getRequestStatus(requestId) {
  if (!requestId) return REQUEST_STATUS.READY;
  return requestStateById.get(requestId)?.status || REQUEST_STATUS.READY;
}

function getApproveSkipReason(requestId) {
  const status = getRequestStatus(requestId);
  if (status === REQUEST_STATUS.APPROVING) return 'APPROVAL_IN_PROGRESS';
  if (status === REQUEST_STATUS.MERGED) return 'REQUEST_ALREADY_MERGED';
  if (status === REQUEST_STATUS.REJECTED) return 'REQUEST_ALREADY_REJECTED';
  return null;
}

function markApproveFinished({ requestId, ok, source }) {
  if (!requestId) return;
  if (ok) {
    setRequestState(requestId, REQUEST_STATUS.MERGED, source);
  } else {
    // 실패 후 재시도 가능해야 하므로 READY로 복귀
    setRequestState(requestId, REQUEST_STATUS.READY, source);
  }
}

async function runConditionalAutoApprove(approvalRequest) {
  if (autoApproveInFlight.has(approvalRequest.requestId)) return;
  if (getApproveSkipReason(approvalRequest.requestId)) return;

  autoApproveInFlight.add(approvalRequest.requestId);
  setRequestState(approvalRequest.requestId, REQUEST_STATUS.APPROVING, 'auto');

  if (AUTO_APPROVE_CONFIG.dryRun) {
    broadcastToClients({
      event: 'AUTO_APPROVE_SKIPPED',
      requestId: approvalRequest.requestId,
      reason: 'DRY_RUN',
    });
    setRequestState(approvalRequest.requestId, REQUEST_STATUS.READY, 'auto');
    autoApproveInFlight.delete(approvalRequest.requestId);
    return;
  }

  lastAutoApproveAt = Date.now();
  const mainRepoPath = process.env.MAIN_REPO_PATH || process.cwd();
  console.log(`🤖 조건부 자동승인 시작: requestId=${approvalRequest.requestId}, branch=${approvalRequest.branchName}`);

  const ok = await gitOps
    .mergeAgentBranch(mainRepoPath, approvalRequest.branchName)
    .then(() => true)
    .catch((err) => {
      console.error('조건부 자동승인 Merge 실패:', err.message);
      return false;
    });

  markApproveFinished({
    requestId: approvalRequest.requestId,
    ok,
    source: 'auto',
  });
  broadcastToClients({
    event: ok ? 'MERGE_SUCCESS' : 'MERGE_FAILED',
    requestId: approvalRequest.requestId,
    autoApproved: true,
  });

  autoApproveInFlight.delete(approvalRequest.requestId);
}

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
        const skipReason = getApproveSkipReason(payload.requestId);
        if (skipReason) {
          ws.send(JSON.stringify({
            event: 'MERGE_SKIPPED',
            requestId: payload.requestId,
            reason: skipReason,
          }));
          break;
        }

        setRequestState(payload.requestId, REQUEST_STATUS.APPROVING, 'manual');
        if (payload.branchName && isValidBranchName(payload.branchName)) {
          const ok = await gitOps
            .mergeAgentBranch(mainRepoPath, payload.branchName)
            .then(() => true)
            .catch((err) => { console.error('Merge 실패:', err.message); return false; });

          markApproveFinished({
            requestId: payload.requestId,
            ok,
            source: 'manual',
          });

          ws.send(JSON.stringify({
            event: ok ? 'MERGE_SUCCESS' : 'MERGE_FAILED',
            requestId: payload.requestId,
          }));
        } else {
          // 브랜치 정보 없이도 UI 응답은 반환
          markApproveFinished({
            requestId: payload.requestId,
            ok: true,
            source: 'manual',
          });
          ws.send(JSON.stringify({ event: 'MERGE_SUCCESS', requestId: payload.requestId }));
        }
        break;
      }

      case 'REJECT': {
        console.log(`❌ 반려: requestId=${payload.requestId}, feedback="${payload.feedback}"`);
        setRequestState(payload.requestId, REQUEST_STATUS.REJECTED, 'manual');
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

server.listen(PORT, HOST, () => {
  console.log(`\n🎼 Maestro Backend Server 시작됨`);
  console.log(`   Host/Port   : ${HOST}:${PORT}`);
  console.log(`   WebSocket   : ws://${HOST}:${PORT}`);
  console.log(`   에이전트 API : POST http://${HOST}:${PORT}/api/request`);
  console.log(`   상태 확인   : GET  http://${HOST}:${PORT}/health`);
  console.log(`   허용 Origin : ${ALLOWED_ORIGINS.join(', ')}`);
  console.log(`   인증 모드   : ${SERVER_TOKEN ? 'Bearer token required' : 'disabled'}`);
  console.log(`   자동승인    : ${AUTO_APPROVE_CONFIG.enabled ? 'enabled' : 'disabled'}`);
  if (AUTO_APPROVE_CONFIG.enabled) {
    console.log(`     - trusted agents : ${AUTO_APPROVE_CONFIG.trustedAgents.length > 0 ? AUTO_APPROVE_CONFIG.trustedAgents.join(', ') : '(all)'}`);
    console.log(`     - branch prefix  : ${AUTO_APPROVE_CONFIG.branchPrefix || '(none)'}`);
    console.log(`     - max desc len   : ${AUTO_APPROVE_CONFIG.maxDescriptionLength}`);
    console.log(`     - require explicit: ${AUTO_APPROVE_CONFIG.requireExplicit ? 'yes' : 'no'}`);
    console.log(`     - cooldown ms     : ${AUTO_APPROVE_CONFIG.cooldownMs}`);
    console.log(`     - dry run         : ${AUTO_APPROVE_CONFIG.dryRun ? 'yes' : 'no'}`);
  }
  console.log(`\n에이전트에서 승인 요청을 보내는 예시:`);
  console.log(`  curl -X POST http://${HOST}:${PORT}/api/request \\`);
  console.log(`    -H 'Content-Type: application/json' \\`);
  if (SERVER_TOKEN) {
    console.log(`    -H 'Authorization: Bearer <MAESTRO_SERVER_TOKEN>' \\`);
  }
  console.log(`    -d '{"agentId":"my_agent","branchName":"feature/my-branch","laneIndex":1,"diffSummary":{"title":"작업 완료","shortDescription":"변경 내용"}}'`);
  console.log();
});
