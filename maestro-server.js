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
//   GET        /api/auto-approve/status — 자동승인 운영 상태 조회
//   GET        /api/auto-approve/events — 자동승인 이벤트 로그 조회

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
const AUTO_APPROVE_LOG_MAX_ITEMS = Math.min(
  5000,
  Math.max(50, parsePositiveInt(process.env.MAESTRO_AUTO_APPROVE_LOG_MAX_ITEMS, 500)),
);
const HISTORY_BUFFER_MAX_ITEMS = Math.min(
  2000,
  Math.max(40, parsePositiveInt(process.env.MAESTRO_HISTORY_MAX_ITEMS, 300)),
);
const HISTORY_DEFAULT_LIMIT = 40;
const AUTO_APPROVE_EVENTS_DEFAULT_LIMIT = 40;

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

function sanitizeHistoryText(value, maxLength = 120) {
  if (typeof value !== 'string') return '';
  const normalized = value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!normalized) return '';
  return normalized.slice(0, maxLength);
}

function normalizeHistoryResult(value) {
  const allowedResults = new Set([
    'REQUESTED',
    'APPROVED',
    'APPROVE_FAILED',
    'APPROVE_SKIPPED',
    'REJECTED',
    'ROLLBACK',
    'ROLLBACK_FAILED',
    'AUTO_APPROVE_SKIPPED',
  ]);
  if (allowedResults.has(value)) return value;
  return 'REQUESTED';
}

function normalizeHistorySource(value) {
  const allowedSources = new Set(['manual', 'auto', 'system']);
  if (allowedSources.has(value)) return value;
  return 'system';
}

function normalizeLaneIndex(value) {
  const laneIndex = Number(value);
  if (!Number.isInteger(laneIndex)) return null;
  if (laneIndex < 1 || laneIndex > 4) return null;
  return laneIndex;
}

function normalizeAutoApproveDecision(value) {
  const allowedDecisions = new Set([
    'ELIGIBLE',
    'BLOCKED',
    'EXECUTING',
    'SKIPPED',
    'MERGED',
    'FAILED',
  ]);
  if (allowedDecisions.has(value)) return value;
  return 'BLOCKED';
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
  const requestUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const pathname = requestUrl.pathname;

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
  if (req.method === 'GET' && pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', clients: wss.clients.size }));
    return;
  }

  if (req.method === 'GET' && pathname === '/api/history') {
    const limit = parseHistoryLimit(requestUrl.searchParams.get('limit'));
    const projectId = requestUrl.searchParams.get('projectId');
    const result = requestUrl.searchParams.get('result');
    const items = listHistory({
      limit,
      projectId,
      result,
    });

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      items,
      count: items.length,
      maxItems: HISTORY_BUFFER_MAX_ITEMS,
    }));
    return;
  }

  if (req.method === 'GET' && pathname === '/api/auto-approve/status') {
    if (!isRequestAuthorized(req)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return;
    }

    const eventsLimit = parseAutoApproveEventsLimit(requestUrl.searchParams.get('eventsLimit'));
    const recentEvents = listAutoApproveEvents({ limit: eventsLimit });
    const requestStateSummary = summarizeRequestStates();

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      config: {
        enabled: AUTO_APPROVE_CONFIG.enabled,
        dryRun: AUTO_APPROVE_CONFIG.dryRun,
        requireExplicit: AUTO_APPROVE_CONFIG.requireExplicit,
        cooldownMs: AUTO_APPROVE_CONFIG.cooldownMs,
        maxDescriptionLength: AUTO_APPROVE_CONFIG.maxDescriptionLength,
        branchPrefix: AUTO_APPROVE_CONFIG.branchPrefix || '',
        trustedAgents: AUTO_APPROVE_CONFIG.trustedAgents,
        trustedAgentsCount: AUTO_APPROVE_CONFIG.trustedAgents.length,
      },
      runtime: {
        inFlightCount: autoApproveInFlight.size,
        trackedRequestCount: requestStateById.size,
        requestStateSummary,
        lastAutoApproveAt: lastAutoApproveAt ? new Date(lastAutoApproveAt).toISOString() : null,
        autoApproveEventCount: autoApproveEvents.length,
      },
      recentEvents,
      count: recentEvents.length,
    }));
    return;
  }

  if (req.method === 'GET' && pathname === '/api/auto-approve/events') {
    if (!isRequestAuthorized(req)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return;
    }

    const limit = parseAutoApproveEventsLimit(requestUrl.searchParams.get('limit'));
    const requestId = requestUrl.searchParams.get('requestId');
    const decision = requestUrl.searchParams.get('decision');
    const reason = requestUrl.searchParams.get('reason');

    const items = listAutoApproveEvents({
      limit,
      requestId,
      decision,
      reason,
    });

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      items,
      count: items.length,
      maxItems: AUTO_APPROVE_LOG_MAX_ITEMS,
    }));
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
  if (req.method === 'POST' && pathname === '/api/request') {
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

        setRequestMeta(approvalRequest.requestId, {
          requestId: approvalRequest.requestId,
          projectId: approvalRequest.projectId,
          laneIndex: approvalRequest.laneIndex,
          agentId: approvalRequest.agentId,
          branchName: approvalRequest.branchName,
          title: approvalRequest.diffSummary?.title,
        });

        setRequestState(approvalRequest.requestId, REQUEST_STATUS.READY, 'request');
        const autoApprove = evaluateAutoApproveEligibility(approvalRequest, AUTO_APPROVE_CONFIG, {
          now: Date.now(),
          lastAutoApproveAt,
        });
        appendAutoApproveEvent({
          phase: 'policy',
          requestId: approvalRequest.requestId,
          agentId: approvalRequest.agentId,
          projectId: approvalRequest.projectId,
          branchName: approvalRequest.branchName,
          decision: autoApprove.eligible ? 'ELIGIBLE' : 'BLOCKED',
          reason: autoApprove.reason,
          retryAfterMs: autoApprove.retryAfterMs,
          dryRun: AUTO_APPROVE_CONFIG.dryRun,
        });

        broadcastToClients({ event: 'AGENT_TASK_READY', ...approvalRequest });
        appendHistory({
          requestId: approvalRequest.requestId,
          projectId: approvalRequest.projectId,
          laneIndex: approvalRequest.laneIndex,
          agentId: approvalRequest.agentId,
          branchName: approvalRequest.branchName,
          title: approvalRequest.diffSummary?.title,
          source: 'system',
          result: 'REQUESTED',
          reason: 'AGENT_TASK_READY',
        });
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
const requestMetaById = new Map();
const autoApproveInFlight = new Set();
const autoApproveEvents = [];
const approvalHistory = [];
const historyDedupByKey = new Map();
let lastAutoApproveAt = 0;

function setRequestMeta(requestId, meta = {}) {
  if (!requestId) return;
  const existing = requestMetaById.get(requestId) || {};
  requestMetaById.set(requestId, {
    ...existing,
    requestId,
    projectId: meta.projectId ?? existing.projectId ?? null,
    laneIndex: normalizeLaneIndex(meta.laneIndex ?? existing.laneIndex),
    agentId: sanitizeHistoryText(meta.agentId ?? existing.agentId ?? '', 64),
    branchName: sanitizeHistoryText(meta.branchName ?? existing.branchName ?? '', 120),
    title: sanitizeHistoryText(meta.title ?? existing.title ?? '', 120),
  });
}

function getRequestMeta(requestId) {
  if (!requestId) return null;
  return requestMetaById.get(requestId) || null;
}

function appendAutoApproveEvent(input = {}) {
  const entry = {
    id: `auto_evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    phase: sanitizeHistoryText(input.phase || 'policy', 16) || 'policy',
    requestId: sanitizeHistoryText(input.requestId || '', 80) || null,
    agentId: sanitizeHistoryText(input.agentId || '', 64) || null,
    projectId: sanitizeHistoryText(input.projectId || '', 64) || null,
    branchName: sanitizeHistoryText(input.branchName || '', 120) || null,
    decision: normalizeAutoApproveDecision(input.decision),
    reason: sanitizeHistoryText(input.reason || 'UNKNOWN_REASON', 80) || 'UNKNOWN_REASON',
    retryAfterMs: Number.isFinite(Number(input.retryAfterMs)) ? Math.max(0, Number(input.retryAfterMs)) : null,
    dryRun: input.dryRun === true,
  };

  autoApproveEvents.push(entry);
  while (autoApproveEvents.length > AUTO_APPROVE_LOG_MAX_ITEMS) {
    autoApproveEvents.shift();
  }

  return entry;
}

function parseAutoApproveEventsLimit(value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return AUTO_APPROVE_EVENTS_DEFAULT_LIMIT;
  return Math.min(parsed, Math.min(300, AUTO_APPROVE_LOG_MAX_ITEMS));
}

function listAutoApproveEvents({ limit = AUTO_APPROVE_EVENTS_DEFAULT_LIMIT, requestId = null, decision = null, reason = null } = {}) {
  const normalizedLimit = parseAutoApproveEventsLimit(limit);
  const normalizedRequestId = sanitizeHistoryText(requestId || '', 80) || null;
  const normalizedDecision = decision ? normalizeAutoApproveDecision(String(decision).trim().toUpperCase()) : null;
  const normalizedReason = sanitizeHistoryText(reason || '', 80) || null;

  const filtered = autoApproveEvents
    .slice()
    .reverse()
    .filter((event) => {
      if (normalizedRequestId && event.requestId !== normalizedRequestId) return false;
      if (normalizedDecision && event.decision !== normalizedDecision) return false;
      if (normalizedReason && event.reason !== normalizedReason) return false;
      return true;
    });

  return filtered.slice(0, normalizedLimit);
}

function summarizeRequestStates() {
  const summary = {
    ready: 0,
    approving: 0,
    merged: 0,
    rejected: 0,
  };

  for (const state of requestStateById.values()) {
    if (state?.status === REQUEST_STATUS.READY) summary.ready += 1;
    if (state?.status === REQUEST_STATUS.APPROVING) summary.approving += 1;
    if (state?.status === REQUEST_STATUS.MERGED) summary.merged += 1;
    if (state?.status === REQUEST_STATUS.REJECTED) summary.rejected += 1;
  }

  return summary;
}

function shouldSkipHistoryByDedup({ requestId, result, reason, source }) {
  const now = Date.now();
  const dedupKey = `${requestId || 'none'}|${result}|${reason || 'none'}|${source}`;
  const prevTs = historyDedupByKey.get(dedupKey) || 0;
  historyDedupByKey.set(dedupKey, now);

  // 동일 이벤트가 매우 짧은 시간에 반복되는 경우만 중복으로 간주.
  return now - prevTs < 300;
}

function appendHistory(input = {}) {
  const meta = getRequestMeta(input.requestId);
  const result = normalizeHistoryResult(input.result);
  const source = normalizeHistorySource(input.source);
  const reason = sanitizeHistoryText(input.reason || '', 64);

  if (shouldSkipHistoryByDedup({
    requestId: input.requestId,
    result,
    reason,
    source,
  })) {
    return null;
  }

  const entry = {
    id: `hist_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    requestId: sanitizeHistoryText(input.requestId || meta?.requestId || '', 80) || null,
    projectId: sanitizeHistoryText(input.projectId || meta?.projectId || '', 64) || null,
    laneIndex: normalizeLaneIndex(input.laneIndex ?? meta?.laneIndex),
    agentId: sanitizeHistoryText(input.agentId || meta?.agentId || '', 64) || null,
    branchName: sanitizeHistoryText(input.branchName || meta?.branchName || '', 120) || null,
    title: sanitizeHistoryText(input.title || meta?.title || '', 120) || null,
    result,
    source,
    reason: reason || null,
    autoApproved: input.autoApproved === true,
  };

  approvalHistory.push(entry);
  while (approvalHistory.length > HISTORY_BUFFER_MAX_ITEMS) {
    approvalHistory.shift();
  }

  broadcastToClients({
    event: 'HISTORY_APPEND',
    item: entry,
  });

  return entry;
}

function parseHistoryLimit(value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return HISTORY_DEFAULT_LIMIT;
  return Math.min(parsed, Math.min(300, HISTORY_BUFFER_MAX_ITEMS));
}

function listHistory({ limit = HISTORY_DEFAULT_LIMIT, projectId = null, result = null } = {}) {
  const normalizedLimit = parseHistoryLimit(limit);
  const normalizedProjectId = sanitizeHistoryText(projectId || '', 64) || null;
  const normalizedResult = result ? normalizeHistoryResult(result) : null;

  const filtered = approvalHistory
    .slice()
    .reverse()
    .filter((item) => {
      if (normalizedProjectId && item.projectId !== normalizedProjectId) return false;
      if (normalizedResult && item.result !== normalizedResult) return false;
      return true;
    });

  return filtered.slice(0, normalizedLimit);
}

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
  if (autoApproveInFlight.has(approvalRequest.requestId)) {
    appendAutoApproveEvent({
      phase: 'execution',
      requestId: approvalRequest.requestId,
      agentId: approvalRequest.agentId,
      projectId: approvalRequest.projectId,
      branchName: approvalRequest.branchName,
      decision: 'SKIPPED',
      reason: 'IN_FLIGHT_DUPLICATE',
      dryRun: AUTO_APPROVE_CONFIG.dryRun,
    });
    return;
  }

  const precheckSkipReason = getApproveSkipReason(approvalRequest.requestId);
  if (precheckSkipReason) {
    appendAutoApproveEvent({
      phase: 'execution',
      requestId: approvalRequest.requestId,
      agentId: approvalRequest.agentId,
      projectId: approvalRequest.projectId,
      branchName: approvalRequest.branchName,
      decision: 'SKIPPED',
      reason: precheckSkipReason,
      dryRun: AUTO_APPROVE_CONFIG.dryRun,
    });
    return;
  }

  autoApproveInFlight.add(approvalRequest.requestId);
  setRequestState(approvalRequest.requestId, REQUEST_STATUS.APPROVING, 'auto');
  appendAutoApproveEvent({
    phase: 'execution',
    requestId: approvalRequest.requestId,
    agentId: approvalRequest.agentId,
    projectId: approvalRequest.projectId,
    branchName: approvalRequest.branchName,
    decision: 'EXECUTING',
    reason: 'AUTO_APPROVE_START',
    dryRun: AUTO_APPROVE_CONFIG.dryRun,
  });

  if (AUTO_APPROVE_CONFIG.dryRun) {
    broadcastToClients({
      event: 'AUTO_APPROVE_SKIPPED',
      requestId: approvalRequest.requestId,
      reason: 'DRY_RUN',
    });
    appendAutoApproveEvent({
      phase: 'execution',
      requestId: approvalRequest.requestId,
      agentId: approvalRequest.agentId,
      projectId: approvalRequest.projectId,
      branchName: approvalRequest.branchName,
      decision: 'SKIPPED',
      reason: 'DRY_RUN',
      dryRun: true,
    });
    appendHistory({
      requestId: approvalRequest.requestId,
      projectId: approvalRequest.projectId,
      laneIndex: approvalRequest.laneIndex,
      agentId: approvalRequest.agentId,
      branchName: approvalRequest.branchName,
      title: approvalRequest.diffSummary?.title,
      source: 'auto',
      result: 'AUTO_APPROVE_SKIPPED',
      reason: 'DRY_RUN',
      autoApproved: false,
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
  appendAutoApproveEvent({
    phase: 'execution',
    requestId: approvalRequest.requestId,
    agentId: approvalRequest.agentId,
    projectId: approvalRequest.projectId,
    branchName: approvalRequest.branchName,
    decision: ok ? 'MERGED' : 'FAILED',
    reason: ok ? 'MERGE_SUCCESS' : 'MERGE_FAILED',
    dryRun: AUTO_APPROVE_CONFIG.dryRun,
  });
  broadcastToClients({
    event: ok ? 'MERGE_SUCCESS' : 'MERGE_FAILED',
    requestId: approvalRequest.requestId,
    autoApproved: true,
  });
  appendHistory({
    requestId: approvalRequest.requestId,
    projectId: approvalRequest.projectId,
    laneIndex: approvalRequest.laneIndex,
    agentId: approvalRequest.agentId,
    branchName: approvalRequest.branchName,
    title: approvalRequest.diffSummary?.title,
    source: 'auto',
    result: ok ? 'APPROVED' : 'APPROVE_FAILED',
    reason: ok ? 'MERGE_SUCCESS' : 'MERGE_FAILED',
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
        setRequestMeta(payload.requestId, {
          requestId: payload.requestId,
          projectId: payload.projectId,
          laneIndex: payload.laneIndex,
          agentId: payload.agentId,
          branchName: payload.branchName,
          title: payload.title,
        });
        const skipReason = getApproveSkipReason(payload.requestId);
        if (skipReason) {
          ws.send(JSON.stringify({
            event: 'MERGE_SKIPPED',
            requestId: payload.requestId,
            reason: skipReason,
          }));
          appendHistory({
            requestId: payload.requestId,
            source: 'manual',
            result: 'APPROVE_SKIPPED',
            reason: skipReason,
            autoApproved: false,
          });
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
          appendHistory({
            requestId: payload.requestId,
            source: 'manual',
            result: ok ? 'APPROVED' : 'APPROVE_FAILED',
            reason: ok ? 'MERGE_SUCCESS' : 'MERGE_FAILED',
            autoApproved: false,
          });
        } else {
          // 브랜치 정보 없이도 UI 응답은 반환
          markApproveFinished({
            requestId: payload.requestId,
            ok: true,
            source: 'manual',
          });
          ws.send(JSON.stringify({ event: 'MERGE_SUCCESS', requestId: payload.requestId }));
          appendHistory({
            requestId: payload.requestId,
            source: 'manual',
            result: 'APPROVED',
            reason: 'MERGE_SUCCESS',
            autoApproved: false,
          });
        }
        break;
      }

      case 'REJECT': {
        console.log(`❌ 반려: requestId=${payload.requestId}, feedback="${payload.feedback}"`);
        setRequestMeta(payload.requestId, {
          requestId: payload.requestId,
          projectId: payload.projectId,
          laneIndex: payload.laneIndex,
          agentId: payload.agentId,
          branchName: payload.branchName,
          title: payload.title,
        });
        setRequestState(payload.requestId, REQUEST_STATUS.REJECTED, 'manual');
        ws.send(JSON.stringify({ event: 'AGENT_RESTARTED', requestId: payload.requestId }));
        appendHistory({
          requestId: payload.requestId,
          source: 'manual',
          result: 'REJECTED',
          reason: 'AGENT_RESTARTED',
          autoApproved: false,
        });
        break;
      }

      case 'UNDO': {
        console.log('⏪ 롤백 요청!');
        const ok = await gitOps
          .undoLastMerge(mainRepoPath)
          .then(() => true)
          .catch((err) => { console.error('Undo 실패:', err.message); return false; });

        ws.send(JSON.stringify({ event: ok ? 'UNDO_SUCCESS' : 'UNDO_FAILED' }));
        appendHistory({
          requestId: payload.requestId,
          source: 'manual',
          result: ok ? 'ROLLBACK' : 'ROLLBACK_FAILED',
          reason: ok ? 'UNDO_SUCCESS' : 'UNDO_FAILED',
          autoApproved: false,
        });
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
  console.log(`   이력 조회   : GET  http://${HOST}:${PORT}/api/history?limit=40`);
  console.log(`   자동승인 상태: GET  http://${HOST}:${PORT}/api/auto-approve/status`);
  console.log(`   자동승인 로그: GET  http://${HOST}:${PORT}/api/auto-approve/events?limit=40`);
  console.log(`   허용 Origin : ${ALLOWED_ORIGINS.join(', ')}`);
  console.log(`   인증 모드   : ${SERVER_TOKEN ? 'Bearer token required' : 'disabled'}`);
  console.log(`   자동승인    : ${AUTO_APPROVE_CONFIG.enabled ? 'enabled' : 'disabled'}`);
  console.log(`   이력 버퍼   : max ${HISTORY_BUFFER_MAX_ITEMS} items`);
  console.log(`   자동승인 로그: max ${AUTO_APPROVE_LOG_MAX_ITEMS} items`);
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
