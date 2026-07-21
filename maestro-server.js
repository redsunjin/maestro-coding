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
import crypto from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { WebSocketServer, WebSocket as WSWebSocket } from 'ws';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { fileURLToPath } from 'node:url';
import { buildEnvValues, readEnvFile, writeEnvFile } from './scripts/env-utils.mjs';
import {
  inferProjectRemoteUrl,
  inferProjectName,
  isGitRepository,
  markProjectUsed,
  readProjectRegistry,
  sortProjects,
  upsertProjectEntry,
} from './scripts/project-registry.mjs';
import {
  DEFAULT_LANE_COUNT,
  MAX_LANE_COUNT,
  normalizeLaneIndex as normalizeConfiguredLaneIndex,
  pickRandomLaneIndex,
  sanitizeLaneCount,
} from './shared/lane-config.mjs';

const execFilePromise = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname);
const ENV_PATH = path.resolve(ROOT_DIR, process.env.MAESTRO_ENV_FILE_PATH || '.env');

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
const HISTORY_STORE_PATH = path.resolve(ROOT_DIR, process.env.MAESTRO_HISTORY_STORE_PATH || '.maestro-history.json');
const HISTORY_STORE_VERSION = 1;
const HISTORY_DEFAULT_LIMIT = 40;
const AUTO_APPROVE_EVENTS_DEFAULT_LIMIT = 40;
const WORK_SESSION_DEFAULT_LIMIT = 40;
const WORK_MESSAGE_DEFAULT_LIMIT = 100;
const WORK_SESSION_MAX_ITEMS = Math.min(
  200,
  Math.max(20, parsePositiveInt(process.env.MAESTRO_WORK_SESSION_MAX_ITEMS, 60)),
);
const WORK_MESSAGE_MAX_ITEMS = Math.min(
  500,
  Math.max(20, parsePositiveInt(process.env.MAESTRO_WORK_MESSAGE_MAX_ITEMS, 120)),
);
const WORKFLOW_STORE_PATH = path.resolve(
  ROOT_DIR,
  process.env.MAESTRO_WORKFLOW_STORE_PATH || '.maestro-workflows.json',
);
const WORKFLOW_ENABLED = parseBoolean(process.env.MAESTRO_WORKFLOW_ENABLED, false);
const AGENT_STORE_PATH = path.resolve(
  ROOT_DIR,
  process.env.MAESTRO_AGENT_STORE_PATH || '.maestro-agents.json',
);
const persistedEnvValues = readEnvFile(ENV_PATH).values;
let runtimeProjectState = createRuntimeProjectState({
  path: process.env.MAIN_REPO_PATH || persistedEnvValues.MAIN_REPO_PATH || process.cwd(),
  name: process.env.MAESTRO_PROJECT_NAME || persistedEnvValues.MAESTRO_PROJECT_NAME || '',
  laneCount: process.env.MAESTRO_PROJECT_LANE_COUNT || persistedEnvValues.MAESTRO_PROJECT_LANE_COUNT || DEFAULT_LANE_COUNT,
});

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

// --- Per-agent 인증 (multi-agent connection spec) ---
// 관대(기본): 에이전트 토큰 검증 + 서버 토큰 grace 허용.
// 엄격(MAESTRO_AGENT_AUTH_ENFORCE=true): 에이전트 엔드포인트는 유효한 per-agent 토큰 필수.
const AGENT_AUTH_ENFORCE = /^true$/i.test(process.env.MAESTRO_AGENT_AUTH_ENFORCE || '');

function generateAgentToken() {
  return crypto.randomBytes(24).toString('hex');
}

function hashAgentToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function findAgentByToken(token) {
  if (!token) return null;
  const tokenHash = hashAgentToken(token);
  return Array.from(agentsById.values()).find((agent) => agent.tokenHash && agent.tokenHash === tokenHash) || null;
}

// 에이전트 운영 엔드포인트 공용 인증.
// 반환: { ok:true, mode:'open'|'agent'|'server-grace', agentId|null } 또는 { ok:false, status, error }
function resolveAgentAuth(req) {
  if (!SERVER_TOKEN) return { ok: true, mode: 'open', agentId: null };
  const token = extractBearerToken(req.headers.authorization);
  if (!token) return { ok: false, status: 401, error: 'Unauthorized' };

  const agent = findAgentByToken(token);
  if (agent) return { ok: true, mode: 'agent', agentId: agent.agentId };

  if (!AGENT_AUTH_ENFORCE && token === SERVER_TOKEN) {
    return { ok: true, mode: 'server-grace', agentId: null };
  }
  return { ok: false, status: 401, error: 'Unauthorized' };
}

// expectedAgentId가 주어지면 에이전트 토큰 주인과의 일치를 검증한다.
// (grace/open 모드는 주인이 없으므로 일치 검증을 적용하지 않음 — 스펙 §6 한계 명시 참조)
function authorizeAgentEndpoint(req, res, expectedAgentId = null) {
  const auth = resolveAgentAuth(req);
  if (!auth.ok) {
    res.writeHead(auth.status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: auth.error }));
    return null;
  }
  if (auth.mode === 'agent' && expectedAgentId && auth.agentId !== expectedAgentId) {
    res.writeHead(403, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'AGENT_MISMATCH' }));
    return null;
  }
  return auth;
}

// 응답에는 토큰 해시를 절대 노출하지 않는다.
function toPublicAgent(agent) {
  if (!agent) return agent;
  const { tokenHash, ...publicAgent } = agent;
  return publicAgent;
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
  return normalizeConfiguredLaneIndex(value, MAX_LANE_COUNT);
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

function normalizePersistedHistoryEntry(item = {}) {
  const timestamp = item.timestamp || new Date().toISOString();
  return {
    id: sanitizeHistoryText(item.id || '', 120) || `hist_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    timestamp,
    requestId: sanitizeHistoryText(item.requestId || '', 80) || null,
    projectId: sanitizeHistoryText(item.projectId || '', 64) || null,
    laneIndex: normalizeLaneIndex(item.laneIndex),
    agentId: sanitizeHistoryText(item.agentId || '', 64) || null,
    branchName: sanitizeHistoryText(item.branchName || '', 120) || null,
    title: sanitizeHistoryText(item.title || '', 120) || null,
    result: normalizeHistoryResult(item.result),
    source: normalizeHistorySource(item.source),
    reason: sanitizeHistoryText(item.reason || '', 64) || null,
    autoApproved: item.autoApproved === true,
  };
}

function loadPersistedHistory(storePath = HISTORY_STORE_PATH) {
  if (!existsSync(storePath)) {
    return [];
  }

  try {
    const raw = JSON.parse(readFileSync(storePath, 'utf8'));
    const itemsSource = Array.isArray(raw)
      ? raw
      : Array.isArray(raw?.items)
        ? raw.items
        : [];

    return itemsSource
      .map((item) => normalizePersistedHistoryEntry(item))
      .slice(-HISTORY_BUFFER_MAX_ITEMS)
      .sort((left, right) => Date.parse(left.timestamp || 0) - Date.parse(right.timestamp || 0));
  } catch (error) {
    console.error(`히스토리 저장소 로드 실패: ${error.message}`);
    return [];
  }
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

function createRuntimeProjectState(input = {}) {
  const projectPath = path.resolve(String(input.path || '').trim() || process.cwd());
  const registeredProjects = readProjectRegistry();
  const matchedProject = registeredProjects.find((project) => project.path === projectPath) || null;

  return {
    id: matchedProject?.id || `runtime_${Buffer.from(projectPath).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 12)}`,
    name: String(input.name || matchedProject?.name || inferProjectName(projectPath)).trim() || inferProjectName(projectPath),
    path: projectPath,
    repoUrl: String(matchedProject?.repoUrl || input.repoUrl || '').trim(),
    laneCount: sanitizeLaneCount(input.laneCount || matchedProject?.laneCount || DEFAULT_LANE_COUNT, DEFAULT_LANE_COUNT),
  };
}

function listAvailableProjects() {
  const registeredProjects = sortProjects(readProjectRegistry());
  const items = registeredProjects.map((project) => ({
    ...project,
    isActive: project.path === runtimeProjectState.path,
  }));

  if (items.some((project) => project.path === runtimeProjectState.path)) {
    return items;
  }

  return [
    {
      ...runtimeProjectState,
      isActive: true,
    },
    ...items,
  ];
}

function getActiveProjectResponse() {
  const items = listAvailableProjects();
  return {
    currentProject: {
      ...runtimeProjectState,
      isActive: true,
    },
    items,
    count: items.length,
  };
}

function validateRuntimeProjectPath(projectPath) {
  if (!existsSync(projectPath)) return 'PROJECT_PATH_NOT_FOUND';
  if (!isGitRepository(projectPath)) return 'PROJECT_PATH_NOT_GIT';
  return '';
}

function persistRuntimeProject(project) {
  const existingEnvValues = readEnvFile(ENV_PATH).values;
  const nextEnvValues = buildEnvValues({
    ...existingEnvValues,
    MAIN_REPO_PATH: project.path,
    MAESTRO_PROJECT_NAME: project.name,
    MAESTRO_PROJECT_LANE_COUNT: String(sanitizeLaneCount(project.laneCount, DEFAULT_LANE_COUNT)),
    PORT: existingEnvValues.PORT || String(PORT),
    HOST: existingEnvValues.HOST || String(HOST),
    ALLOWED_ORIGINS: existingEnvValues.ALLOWED_ORIGINS || process.env.ALLOWED_ORIGINS || undefined,
    MAESTRO_SERVER_TOKEN: existingEnvValues.MAESTRO_SERVER_TOKEN || SERVER_TOKEN,
    VITE_WS_URL: existingEnvValues.VITE_WS_URL || process.env.VITE_WS_URL || `ws://${HOST}:${PORT}`,
    MAESTRO_AUTO_APPROVE_ENABLED: existingEnvValues.MAESTRO_AUTO_APPROVE_ENABLED || String(AUTO_APPROVE_CONFIG.enabled),
    MAESTRO_AUTO_APPROVE_TRUSTED_AGENTS: existingEnvValues.MAESTRO_AUTO_APPROVE_TRUSTED_AGENTS || AUTO_APPROVE_CONFIG.trustedAgents.join(','),
    MAESTRO_AUTO_APPROVE_BRANCH_PREFIX: existingEnvValues.MAESTRO_AUTO_APPROVE_BRANCH_PREFIX || AUTO_APPROVE_CONFIG.branchPrefix || '',
    MAESTRO_AUTO_APPROVE_MAX_DESC_LENGTH: existingEnvValues.MAESTRO_AUTO_APPROVE_MAX_DESC_LENGTH || String(AUTO_APPROVE_CONFIG.maxDescriptionLength),
    MAESTRO_AUTO_APPROVE_REQUIRE_EXPLICIT: existingEnvValues.MAESTRO_AUTO_APPROVE_REQUIRE_EXPLICIT || String(AUTO_APPROVE_CONFIG.requireExplicit),
    MAESTRO_AUTO_APPROVE_COOLDOWN_MS: existingEnvValues.MAESTRO_AUTO_APPROVE_COOLDOWN_MS || String(AUTO_APPROVE_CONFIG.cooldownMs),
    MAESTRO_AUTO_APPROVE_DRY_RUN: existingEnvValues.MAESTRO_AUTO_APPROVE_DRY_RUN || String(AUTO_APPROVE_CONFIG.dryRun),
    MAESTRO_AUTO_APPROVE_LOG_MAX_ITEMS: existingEnvValues.MAESTRO_AUTO_APPROVE_LOG_MAX_ITEMS || String(AUTO_APPROVE_LOG_MAX_ITEMS),
    MAESTRO_HISTORY_MAX_ITEMS: existingEnvValues.MAESTRO_HISTORY_MAX_ITEMS || String(HISTORY_BUFFER_MAX_ITEMS),
  });

  writeEnvFile(ENV_PATH, nextEnvValues);
  process.env.MAIN_REPO_PATH = project.path;
  process.env.MAESTRO_PROJECT_NAME = project.name;
  process.env.MAESTRO_PROJECT_LANE_COUNT = String(sanitizeLaneCount(project.laneCount, DEFAULT_LANE_COUNT));
  runtimeProjectState = createRuntimeProjectState(project);
}

function getActiveMainRepoPath() {
  return runtimeProjectState.path;
}

function resolveProjectUpdateTarget({ projectId, projectPath }) {
  const projects = listAvailableProjects();
  return projects.find((project) => (
    (projectId && project.id === projectId)
    || (projectPath && project.path === projectPath)
  )) || null;
}

const AGENT_STATUS = {
  REGISTERED: 'registered',
  CONNECTED: 'connected',
};

const agentsById = new Map();

function normalizeAgentCapabilities(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const items = [];
  for (const item of value) {
    const normalized = sanitizeHistoryText(String(item || ''), 64);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    items.push(normalized);
    if (items.length >= 20) break;
  }
  return items;
}

function sanitizeAgentMetadata(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value;
}

function normalizeAgentRegistration(input = {}) {
  const agentId = sanitizeHistoryText(input.agentId || '', 80);
  if (!agentId) return null;

  const repoRootRaw = typeof input.repoRoot === 'string' ? input.repoRoot.trim() : '';
  const repoRoot = repoRootRaw ? path.resolve(repoRootRaw) : runtimeProjectState.path;
  const existing = agentsById.get(agentId) || null;
  const now = new Date().toISOString();
  const tokenId = Object.prototype.hasOwnProperty.call(input, 'tokenId')
    ? sanitizeHistoryText(input.tokenId || '', 80) || null
    : existing?.tokenId || null;
  const capabilities = Array.isArray(input.capabilities)
    ? normalizeAgentCapabilities(input.capabilities)
    : existing?.capabilities || [];
  const metadata = Object.prototype.hasOwnProperty.call(input, 'metadata')
    ? sanitizeAgentMetadata(input.metadata)
    : existing?.metadata || {};

  return {
    agentId,
    adapterType: sanitizeHistoryText(input.adapterType || '', 40) || existing?.adapterType || 'unknown',
    repoRoot,
    displayName: sanitizeHistoryText(input.displayName || '', 120) || existing?.displayName || agentId,
    capabilities,
    tokenId,
    status: existing?.status || AGENT_STATUS.REGISTERED,
    registeredAt: existing?.registeredAt || now,
    updatedAt: now,
    lastHeartbeatAt: existing?.lastHeartbeatAt || null,
    metadata,
  };
}

function registerAgent(input = {}) {
  const agent = normalizeAgentRegistration(input);
  if (!agent) return null;
  // 재등록(upsert) = 무조건 토큰 회전. 평문은 1회 반환, 레코드에는 sha256 해시만 저장.
  const agentToken = generateAgentToken();
  agent.tokenHash = hashAgentToken(agentToken);
  agentsById.set(agent.agentId, agent);
  persistAgentStore();
  return { agent, agentToken };
}

function getAgent(agentId) {
  const normalizedAgentId = sanitizeHistoryText(agentId || '', 80);
  if (!normalizedAgentId) return null;
  return agentsById.get(normalizedAgentId) || null;
}

function recordAgentHeartbeat(agentId) {
  const existing = getAgent(agentId);
  if (!existing) return null;
  const now = new Date().toISOString();
  const nextAgent = {
    ...existing,
    status: AGENT_STATUS.CONNECTED,
    updatedAt: now,
    lastHeartbeatAt: now,
  };
  agentsById.set(nextAgent.agentId, nextAgent);
  persistAgentStore();
  return nextAgent;
}

function summarizeApprovalRequestForAgent(request = null) {
  if (!request) return null;
  return {
    requestId: request.requestId,
    status: request.status || APPROVAL_REQUEST_STATUS.PENDING_DECISION,
    branchName: request.branchName || null,
    projectId: request.projectId || null,
    source: request.source || null,
    updatedAt: request.updatedAt || request.createdAt || null,
    createdAt: request.createdAt || null,
  };
}

function summarizeApprovalDecisionForAgent(decision = null) {
  if (!decision) return null;
  return {
    decisionId: decision.decisionId,
    requestId: decision.requestId,
    decision: decision.decision,
    executorAction: decision.executorAction,
    deliveryStatus: decision.delivery?.status || null,
    acknowledgedAt: decision.delivery?.acknowledgedAt || null,
    executorStatus: decision.executorResult?.status || null,
    createdAt: decision.createdAt || null,
  };
}

function getLatestAgentRequest(agentId) {
  const normalizedAgentId = sanitizeHistoryText(agentId || '', 80);
  if (!normalizedAgentId) return null;
  return Array.from(approvalRequestsById.values())
    .filter((request) => request.agentId === normalizedAgentId)
    .sort((a, b) => Date.parse(b.updatedAt || b.createdAt || 0) - Date.parse(a.updatedAt || a.createdAt || 0))[0] || null;
}

function withAgentTrustSummary(agent) {
  const lastRequest = getLatestAgentRequest(agent.agentId);
  const lastDecision = lastRequest ? getApprovalDecisionByRequestId(lastRequest.requestId) : null;
  return {
    ...toPublicAgent(agent),
    lastRequest: summarizeApprovalRequestForAgent(lastRequest),
    lastDecision: summarizeApprovalDecisionForAgent(lastDecision),
  };
}

function listAgents() {
  return Array.from(agentsById.values())
    .sort((a, b) => Date.parse(b.updatedAt || 0) - Date.parse(a.updatedAt || 0))
    .map((agent) => withAgentTrustSummary(agent));
}

const WORK_SESSION_STATUS = {
  QUEUED: 'queued',
  ACTIVE: 'active',
  BLOCKED: 'blocked',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
};

const WORK_MESSAGE_KIND = {
  MESSAGE: 'message',
  COMMAND: 'command',
  COMMAND_RESULT: 'command_result',
  STATUS: 'status',
  WARNING: 'warning',
};

const WORK_MESSAGE_ROLE = {
  OPERATOR: 'operator',
  AGENT: 'agent',
  SYSTEM: 'system',
};

const COMMAND_RESULT_STATUS = {
  ACCEPTED: 'accepted',
  REJECTED: 'rejected',
  NEEDS_INPUT: 'needs_input',
  COMPLETED: 'completed',
  FAILED: 'failed',
};

const workSessionsById = new Map();
const workMessagesBySessionId = new Map();

function normalizeWorkSessionStatus(value) {
  const allowed = new Set(Object.values(WORK_SESSION_STATUS));
  return allowed.has(value) ? value : WORK_SESSION_STATUS.ACTIVE;
}

function normalizeWorkMessageKind(value) {
  const allowed = new Set(Object.values(WORK_MESSAGE_KIND));
  return allowed.has(value) ? value : WORK_MESSAGE_KIND.MESSAGE;
}

function normalizeWorkMessageRole(value) {
  const allowed = new Set(Object.values(WORK_MESSAGE_ROLE));
  return allowed.has(value) ? value : WORK_MESSAGE_ROLE.SYSTEM;
}

function normalizeCommandResultStatus(value) {
  const allowed = new Set(Object.values(COMMAND_RESULT_STATUS));
  return allowed.has(value) ? value : COMMAND_RESULT_STATUS.COMPLETED;
}

function sanitizeWorkMetadata(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value;
}

function createWorkSessionId() {
  return `wsn_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function createWorkMessageId() {
  return `wmsg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function isTerminalWorkSessionStatus(status) {
  return [
    WORK_SESSION_STATUS.COMPLETED,
    WORK_SESSION_STATUS.FAILED,
    WORK_SESSION_STATUS.CANCELLED,
  ].includes(status);
}

function ensureWorkMessageList(workSessionId) {
  if (!workMessagesBySessionId.has(workSessionId)) {
    workMessagesBySessionId.set(workSessionId, []);
  }
  return workMessagesBySessionId.get(workSessionId);
}

function parseWorkLimit(value, fallback, maxValue) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, maxValue);
}

function parseWorkSessionLimit(value) {
  return parseWorkLimit(value, WORK_SESSION_DEFAULT_LIMIT, WORK_SESSION_MAX_ITEMS);
}

function parseWorkMessageLimit(value) {
  return parseWorkLimit(value, WORK_MESSAGE_DEFAULT_LIMIT, WORK_MESSAGE_MAX_ITEMS);
}

function sortWorkSessions(items) {
  return items
    .slice()
    .sort((a, b) => Date.parse(b.updatedAt || 0) - Date.parse(a.updatedAt || 0));
}

function pruneClosedWorkSessions() {
  const activeSessions = [];
  const closedSessions = [];

  for (const session of workSessionsById.values()) {
    if (isTerminalWorkSessionStatus(session.status)) {
      closedSessions.push(session);
    } else {
      activeSessions.push(session);
    }
  }

  const keepClosedIds = new Set(
    sortWorkSessions(closedSessions)
      .slice(0, WORK_SESSION_MAX_ITEMS)
      .map((session) => session.workSessionId),
  );

  for (const session of closedSessions) {
    if (keepClosedIds.has(session.workSessionId)) continue;
    workSessionsById.delete(session.workSessionId);
    workMessagesBySessionId.delete(session.workSessionId);
  }
}

// ── Work Request Intake (VU-001 Phase A) ─────────────────────────────────────
const WORK_REQUEST_PRIORITY = {
  LOW: 'low',
  NORMAL: 'normal',
  HIGH: 'high',
  URGENT: 'urgent',
};

const WORK_REQUEST_STATE = {
  SUBMITTED: 'submitted',
  REQUEST_APPROVED: 'request_approved',
  REQUEST_REJECTED: 'request_rejected',
  CANCELLED: 'cancelled',
};

const WORK_REQUEST_DECISION_STATE = {
  approve: WORK_REQUEST_STATE.REQUEST_APPROVED,
  reject: WORK_REQUEST_STATE.REQUEST_REJECTED,
  cancel: WORK_REQUEST_STATE.CANCELLED,
};

const WORK_REQUEST_DEFAULT_LIMIT = 40;
const WORK_REQUEST_MAX_ITEMS = Math.min(
  500,
  Math.max(20, parsePositiveInt(process.env.MAESTRO_WORK_REQUEST_MAX_ITEMS, 100)),
);

const workRequestsById = new Map();

function createWorkRequestId() {
  return `wrk_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeWorkRequestPriority(value) {
  const allowed = new Set(Object.values(WORK_REQUEST_PRIORITY));
  return allowed.has(value) ? value : WORK_REQUEST_PRIORITY.NORMAL;
}

function normalizeWorkRequestState(value) {
  const allowed = new Set(Object.values(WORK_REQUEST_STATE));
  return allowed.has(value) ? value : WORK_REQUEST_STATE.SUBMITTED;
}

function isTerminalWorkRequestState(state) {
  return state !== WORK_REQUEST_STATE.SUBMITTED;
}

function sanitizeWorkRequestStringList(value, { maxItems = 20, maxLength = 240 } = {}) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => sanitizeHistoryText(item || '', maxLength))
    .filter(Boolean)
    .slice(0, maxItems);
}

// Resolve a projectId to { id, laneCount } from the active runtime project or
// the registered project list. Returns null when the id is unknown.
function resolveWorkflowProject(projectId) {
  const normalized = sanitizeHistoryText(projectId || '', 64);
  if (!normalized || normalized === runtimeProjectState.id) {
    return {
      id: runtimeProjectState.id,
      laneCount: sanitizeLaneCount(runtimeProjectState.laneCount, DEFAULT_LANE_COUNT),
    };
  }
  const registered = readProjectRegistry().find((project) => project.id === normalized);
  if (!registered) return null;
  return {
    id: registered.id,
    laneCount: sanitizeLaneCount(registered.laneCount, DEFAULT_LANE_COUNT),
  };
}

function sortWorkRequests(items) {
  return items
    .slice()
    .sort((a, b) => Date.parse(b.createdAt || 0) - Date.parse(a.createdAt || 0));
}

function pruneWorkRequests() {
  sortWorkRequests(Array.from(workRequestsById.values()))
    .slice(WORK_REQUEST_MAX_ITEMS)
    .forEach((item) => {
      workRequestsById.delete(item.workRequestId);
    });
}

function listWorkRequests({ projectId = null, workflowState = null, limit = WORK_REQUEST_DEFAULT_LIMIT } = {}) {
  const normalizedProjectId = sanitizeHistoryText(projectId || '', 64) || null;
  const normalizedState = workflowState ? normalizeWorkRequestState(workflowState) : null;
  return sortWorkRequests(Array.from(workRequestsById.values()))
    .filter((item) => {
      if (normalizedProjectId && item.projectId !== normalizedProjectId) return false;
      if (normalizedState && item.workflowState !== normalizedState) return false;
      return true;
    })
    .slice(0, parseWorkLimit(limit, WORK_REQUEST_DEFAULT_LIMIT, WORK_REQUEST_MAX_ITEMS));
}

function getWorkRequest(workRequestId) {
  const normalized = sanitizeHistoryText(workRequestId || '', 80);
  if (!normalized) return null;
  return workRequestsById.get(normalized) || null;
}

// Returns { ok, code, error } or { ok: true, item }.
function createWorkRequest(input = {}) {
  const title = sanitizeHistoryText(input.title || '', 120);
  const goal = sanitizeHistoryText(input.goal || '', 1000);
  if (!title || !goal) {
    return { ok: false, code: 400, error: 'WORK_REQUEST_INVALID' };
  }

  const project = resolveWorkflowProject(input.projectId);
  if (!project) {
    return { ok: false, code: 400, error: 'PROJECT_ID_INVALID' };
  }

  let laneIndex = null;
  if (input.laneIndex !== undefined && input.laneIndex !== null && input.laneIndex !== '') {
    laneIndex = normalizeConfiguredLaneIndex(input.laneIndex, project.laneCount);
    if (!laneIndex) {
      return { ok: false, code: 400, error: 'LANE_INDEX_INVALID' };
    }
  }

  const now = new Date().toISOString();
  const item = {
    workRequestId: createWorkRequestId(),
    projectId: project.id,
    laneIndex,
    requestedBy: sanitizeHistoryText(input.requestedBy || '', 64) || 'operator',
    preferredAgent: sanitizeHistoryText(input.preferredAgent || '', 64) || 'openclaw',
    title,
    goal,
    constraints: sanitizeWorkRequestStringList(input.constraints),
    acceptanceCriteria: sanitizeWorkRequestStringList(input.acceptanceCriteria),
    priority: normalizeWorkRequestPriority(input.priority),
    targetBranch: sanitizeHistoryText(input.targetBranch || '', 200) || 'main',
    workflowState: WORK_REQUEST_STATE.SUBMITTED,
    createdAt: now,
    updatedAt: now,
  };

  workRequestsById.set(item.workRequestId, item);
  pruneWorkRequests();
  persistWorkflowStore();
  return { ok: true, item };
}

// Returns { ok, code, error } or { ok: true, item, decision }.
function decideWorkRequest(workRequestId, decision) {
  const existing = getWorkRequest(workRequestId);
  if (!existing) {
    return { ok: false, code: 404, error: 'WORK_REQUEST_NOT_FOUND' };
  }
  const normalizedDecision = sanitizeHistoryText(decision || '', 20).toLowerCase();
  const nextState = WORK_REQUEST_DECISION_STATE[normalizedDecision];
  if (!nextState) {
    return { ok: false, code: 400, error: 'WORK_REQUEST_DECISION_INVALID' };
  }
  if (isTerminalWorkRequestState(existing.workflowState)) {
    return { ok: false, code: 409, error: 'WORK_REQUEST_ALREADY_DECIDED' };
  }

  const item = {
    ...existing,
    workflowState: nextState,
    updatedAt: new Date().toISOString(),
  };
  workRequestsById.set(item.workRequestId, item);
  persistWorkflowStore();
  return { ok: true, item, decision: normalizedDecision };
}

function normalizeStoredWorkRequest(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const workRequestId = sanitizeHistoryText(raw.workRequestId || '', 80);
  const title = sanitizeHistoryText(raw.title || '', 120);
  const goal = sanitizeHistoryText(raw.goal || '', 1000);
  if (!workRequestId || !title || !goal) return null;
  const now = new Date().toISOString();
  return {
    workRequestId,
    projectId: sanitizeHistoryText(raw.projectId || '', 64) || runtimeProjectState.id,
    laneIndex: normalizeConfiguredLaneIndex(raw.laneIndex, MAX_LANE_COUNT),
    requestedBy: sanitizeHistoryText(raw.requestedBy || '', 64) || 'operator',
    preferredAgent: sanitizeHistoryText(raw.preferredAgent || '', 64) || 'openclaw',
    title,
    goal,
    constraints: sanitizeWorkRequestStringList(raw.constraints),
    acceptanceCriteria: sanitizeWorkRequestStringList(raw.acceptanceCriteria),
    priority: normalizeWorkRequestPriority(raw.priority),
    targetBranch: sanitizeHistoryText(raw.targetBranch || '', 200) || 'main',
    workflowState: normalizeWorkRequestState(raw.workflowState),
    createdAt: raw.createdAt || now,
    updatedAt: raw.updatedAt || raw.createdAt || now,
  };
}

function persistWorkflowStore() {
  const storeDir = path.dirname(WORKFLOW_STORE_PATH);
  mkdirSync(storeDir, { recursive: true });

  const payload = {
    savedAt: new Date().toISOString(),
    sessions: sortWorkSessions(Array.from(workSessionsById.values())),
    messagesBySession: Object.fromEntries(
      Array.from(workMessagesBySessionId.entries()).map(([workSessionId, items]) => [
        workSessionId,
        items.slice(-WORK_MESSAGE_MAX_ITEMS),
      ]),
    ),
    workRequests: sortWorkRequests(Array.from(workRequestsById.values())),
  };

  writeFileSync(WORKFLOW_STORE_PATH, JSON.stringify(payload, null, 2));
}

function loadWorkflowStore() {
  if (!existsSync(WORKFLOW_STORE_PATH)) return;

  try {
    const raw = readFileSync(WORKFLOW_STORE_PATH, 'utf8');
    if (!raw.trim()) return;
    const parsed = JSON.parse(raw);
    const sessions = Array.isArray(parsed.sessions) ? parsed.sessions : [];
    const messagesBySession = parsed.messagesBySession && typeof parsed.messagesBySession === 'object'
      ? parsed.messagesBySession
      : {};

    sessions.forEach((session) => {
      const workSessionId = sanitizeHistoryText(session.workSessionId || '', 80);
      if (!workSessionId) return;
      workSessionsById.set(workSessionId, {
        workSessionId,
        projectId: sanitizeHistoryText(session.projectId || '', 64) || runtimeProjectState.id,
        title: sanitizeHistoryText(session.title || '', 120) || '새 작업 세션',
        status: normalizeWorkSessionStatus(session.status),
        agentId: sanitizeHistoryText(session.agentId || '', 64) || 'openclaw',
        source: sanitizeHistoryText(session.source || '', 32) || 'api',
        createdAt: session.createdAt || new Date().toISOString(),
        updatedAt: session.updatedAt || session.createdAt || new Date().toISOString(),
        lastMessageAt: session.lastMessageAt || null,
        pendingOperatorDecision: session.pendingOperatorDecision === true,
        metadata: sanitizeWorkMetadata(session.metadata),
      });
    });

    Object.entries(messagesBySession).forEach(([workSessionId, items]) => {
      const normalizedSessionId = sanitizeHistoryText(workSessionId || '', 80);
      if (!normalizedSessionId || !Array.isArray(items) || !workSessionsById.has(normalizedSessionId)) return;
      const normalizedItems = items
        .map((item) => ({
          workMessageId: sanitizeHistoryText(item.workMessageId || '', 80) || createWorkMessageId(),
          workSessionId: normalizedSessionId,
          role: normalizeWorkMessageRole(item.role),
          kind: normalizeWorkMessageKind(item.kind),
          body: sanitizeHistoryText(item.body || '', 500) || '',
          command: sanitizeHistoryText(item.command || '', 80) || null,
          status: item.status ? normalizeCommandResultStatus(item.status) : null,
          createdAt: item.createdAt || new Date().toISOString(),
        }))
        .filter((item) => item.body);
      workMessagesBySessionId.set(normalizedSessionId, normalizedItems.slice(-WORK_MESSAGE_MAX_ITEMS));
    });

    const workRequests = Array.isArray(parsed.workRequests) ? parsed.workRequests : [];
    workRequests.forEach((raw) => {
      const normalized = normalizeStoredWorkRequest(raw);
      if (normalized) {
        workRequestsById.set(normalized.workRequestId, normalized);
      }
    });

    pruneClosedWorkSessions();
    pruneWorkRequests();
  } catch (error) {
    console.error('workflow store load failed:', error.message);
  }
}

function listWorkSessions({ projectId = null, status = null, limit = WORK_SESSION_DEFAULT_LIMIT } = {}) {
  const normalizedProjectId = sanitizeHistoryText(projectId || '', 64) || null;
  const normalizedStatus = status ? normalizeWorkSessionStatus(status) : null;

  return sortWorkSessions(Array.from(workSessionsById.values()))
    .filter((session) => {
      if (normalizedProjectId && session.projectId !== normalizedProjectId) return false;
      if (normalizedStatus && session.status !== normalizedStatus) return false;
      return true;
    })
    .slice(0, parseWorkSessionLimit(limit));
}

function getWorkSession(workSessionId) {
  const normalizedWorkSessionId = sanitizeHistoryText(workSessionId || '', 80);
  if (!normalizedWorkSessionId) return null;
  return workSessionsById.get(normalizedWorkSessionId) || null;
}

function updateWorkSession(workSessionId, patch = {}) {
  const existing = getWorkSession(workSessionId);
  if (!existing) return null;

  const nextSession = {
    ...existing,
    title: sanitizeHistoryText(patch.title ?? existing.title ?? '', 120) || existing.title || '새 작업 세션',
    status: normalizeWorkSessionStatus(patch.status ?? existing.status),
    agentId: sanitizeHistoryText(patch.agentId ?? existing.agentId ?? '', 64) || existing.agentId || 'openclaw',
    source: sanitizeHistoryText(patch.source ?? existing.source ?? '', 32) || existing.source || 'api',
    projectId: sanitizeHistoryText(patch.projectId ?? existing.projectId ?? '', 64) || existing.projectId || runtimeProjectState.id,
    updatedAt: patch.updatedAt || new Date().toISOString(),
    lastMessageAt: patch.lastMessageAt ?? existing.lastMessageAt ?? null,
    pendingOperatorDecision: patch.pendingOperatorDecision ?? existing.pendingOperatorDecision ?? false,
    metadata: sanitizeWorkMetadata(patch.metadata ?? existing.metadata),
  };

  workSessionsById.set(workSessionId, nextSession);
  pruneClosedWorkSessions();
  persistWorkflowStore();
  return nextSession;
}

function createWorkSession(input = {}) {
  const now = new Date().toISOString();
  const workSessionId = createWorkSessionId();
  const session = {
    workSessionId,
    projectId: sanitizeHistoryText(input.projectId || '', 64) || runtimeProjectState.id,
    title: sanitizeHistoryText(input.title || '', 120) || '새 작업 세션',
    status: normalizeWorkSessionStatus(input.status || WORK_SESSION_STATUS.ACTIVE),
    agentId: sanitizeHistoryText(input.agentId || '', 64) || 'openclaw',
    source: sanitizeHistoryText(input.source || '', 32) || 'dashboard',
    createdAt: now,
    updatedAt: now,
    lastMessageAt: null,
    pendingOperatorDecision: input.pendingOperatorDecision === true,
    metadata: sanitizeWorkMetadata(input.metadata),
  };

  workSessionsById.set(workSessionId, session);
  ensureWorkMessageList(workSessionId);
  pruneClosedWorkSessions();
  persistWorkflowStore();
  return session;
}

function appendWorkMessage(workSessionId, input = {}) {
  const session = getWorkSession(workSessionId);
  if (!session) return null;

  const body = sanitizeHistoryText(input.body || '', 500);
  if (!body) return null;

  const message = {
    workMessageId: createWorkMessageId(),
    workSessionId: session.workSessionId,
    role: normalizeWorkMessageRole(input.role),
    kind: normalizeWorkMessageKind(input.kind),
    body,
    command: sanitizeHistoryText(input.command || '', 80) || null,
    status: input.status ? normalizeCommandResultStatus(input.status) : null,
    createdAt: new Date().toISOString(),
  };

  const messageList = ensureWorkMessageList(workSessionId);
  messageList.push(message);
  while (messageList.length > WORK_MESSAGE_MAX_ITEMS) {
    messageList.shift();
  }

  const nextSession = updateWorkSession(workSessionId, {
    updatedAt: message.createdAt,
    lastMessageAt: message.createdAt,
  });

  return {
    session: nextSession,
    message,
  };
}

function getWorkSessionDetail(workSessionId, { limit = WORK_MESSAGE_DEFAULT_LIMIT } = {}) {
  const session = getWorkSession(workSessionId);
  if (!session) return null;
  const messages = (workMessagesBySessionId.get(workSessionId) || []).slice(-parseWorkMessageLimit(limit));
  return {
    item: session,
    messages,
    count: messages.length,
  };
}

function buildStatusCommandSummary(session) {
  const messageCount = (workMessagesBySessionId.get(session.workSessionId) || []).length;
  const lastMessageLabel = session.lastMessageAt || 'none';
  return `status=${session.status}, messages=${messageCount}, lastMessageAt=${lastMessageLabel}, pendingDecision=${session.pendingOperatorDecision ? 'yes' : 'no'}`;
}

function processWorkSessionInput(workSessionId, rawBody) {
  const session = getWorkSession(workSessionId);
  if (!session) {
    return { ok: false, code: 404, error: 'WORK_SESSION_NOT_FOUND' };
  }

  const normalizedBody = sanitizeHistoryText(rawBody || '', 500);
  if (!normalizedBody) {
    return { ok: false, code: 400, error: 'MESSAGE_BODY_REQUIRED' };
  }

  if (!normalizedBody.startsWith('/')) {
    const appended = appendWorkMessage(workSessionId, {
      role: WORK_MESSAGE_ROLE.OPERATOR,
      kind: WORK_MESSAGE_KIND.MESSAGE,
      body: normalizedBody,
    });

    return {
      ok: true,
      session: appended?.session || session,
      messages: appended ? [appended.message] : [],
      commandEvent: null,
    };
  }

  const commandMessage = appendWorkMessage(workSessionId, {
    role: WORK_MESSAGE_ROLE.OPERATOR,
    kind: WORK_MESSAGE_KIND.COMMAND,
    body: normalizedBody,
    command: normalizedBody.split(/\s+/, 1)[0],
  });
  if (!commandMessage) {
    return { ok: false, code: 400, error: 'COMMAND_RECORD_FAILED' };
  }

  const [commandNameRaw, ...argParts] = normalizedBody.slice(1).split(/\s+/);
  const commandName = sanitizeHistoryText(commandNameRaw || '', 40)?.toLowerCase() || '';
  const commandArgs = argParts.join(' ').trim();
  let currentSession = commandMessage.session;
  const createdMessages = [commandMessage.message];
  let commandEvent = 'COMMAND_ACCEPTED';
  let commandResultStatus = COMMAND_RESULT_STATUS.COMPLETED;
  let resultBody = '';

  switch (commandName) {
    case 'status':
      resultBody = buildStatusCommandSummary(currentSession);
      break;
    case 'ask':
      if (!commandArgs) {
        commandEvent = 'COMMAND_REJECTED';
        commandResultStatus = COMMAND_RESULT_STATUS.NEEDS_INPUT;
        resultBody = '질문 내용을 함께 입력해야 합니다.';
      } else {
        resultBody = `질문을 세션에 기록했습니다: ${sanitizeHistoryText(commandArgs, 240)}`;
      }
      break;
    case 'close':
      if (isTerminalWorkSessionStatus(currentSession.status)) {
        commandEvent = 'COMMAND_REJECTED';
        commandResultStatus = COMMAND_RESULT_STATUS.REJECTED;
        resultBody = '이미 종료된 세션입니다.';
      } else {
        currentSession = updateWorkSession(workSessionId, {
          status: WORK_SESSION_STATUS.COMPLETED,
          updatedAt: new Date().toISOString(),
        }) || currentSession;
        const statusMessage = appendWorkMessage(workSessionId, {
          role: WORK_MESSAGE_ROLE.SYSTEM,
          kind: WORK_MESSAGE_KIND.STATUS,
          body: '세션이 종료되었습니다.',
        });
        if (statusMessage) {
          currentSession = statusMessage.session;
          createdMessages.push(statusMessage.message);
        }
        resultBody = '세션을 종료했습니다.';
      }
      break;
    default:
      commandEvent = 'COMMAND_REJECTED';
      commandResultStatus = COMMAND_RESULT_STATUS.REJECTED;
      resultBody = `지원하지 않는 명령입니다: /${commandName || 'unknown'}`;
      break;
  }

  const resultMessage = appendWorkMessage(workSessionId, {
    role: WORK_MESSAGE_ROLE.SYSTEM,
    kind: WORK_MESSAGE_KIND.COMMAND_RESULT,
    body: resultBody,
    command: `/${commandName || 'unknown'}`,
    status: commandResultStatus,
  });

  if (resultMessage) {
    currentSession = resultMessage.session;
    createdMessages.push(resultMessage.message);
  }

  return {
    ok: true,
    session: currentSession,
    messages: createdMessages,
    commandEvent,
  };
}

function appendExternalWorkMessage(workSessionId, input = {}) {
  const session = getWorkSession(workSessionId);
  if (!session) {
    return { ok: false, code: 404, error: 'WORK_SESSION_NOT_FOUND' };
  }

  const role = normalizeWorkMessageRole(input.role);
  const kind = normalizeWorkMessageKind(input.kind || WORK_MESSAGE_KIND.MESSAGE);
  const body = sanitizeHistoryText(input.body || '', 500);

  if (!body) {
    return { ok: false, code: 400, error: 'MESSAGE_BODY_REQUIRED' };
  }

  if (body.startsWith('/')) {
    return processWorkSessionInput(workSessionId, body);
  }

  const appended = appendWorkMessage(workSessionId, {
    role,
    kind,
    body,
  });

  return {
    ok: true,
    session: appended?.session || session,
    messages: appended ? [appended.message] : [],
    commandEvent: null,
  };
}

loadWorkflowStore();

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
    res.end(JSON.stringify({
      status: 'ok',
      clients: wss.clients.size,
      project: {
        name: runtimeProjectState.name,
        path: runtimeProjectState.path,
        laneCount: runtimeProjectState.laneCount,
      },
      workflow: {
        enabled: WORKFLOW_ENABLED,
        sessionCount: workSessionsById.size,
        requestCount: workRequestsById.size,
        storePath: WORKFLOW_STORE_PATH,
      },
    }));
    return;
  }

  if (req.method === 'GET' && pathname === '/api/agents') {
    if (!isRequestAuthorized(req)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return;
    }

    const items = listAgents();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      items,
      count: items.length,
    }));
    return;
  }

  if (req.method === 'POST' && pathname === '/api/agents/register') {
    if (!isRequestAuthorized(req)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return;
    }

    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      try {
        const data = JSON.parse(body || '{}');
        const registration = registerAgent(data);
        if (!registration) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'AGENT_ID_REQUIRED' }));
          return;
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          item: toPublicAgent(registration.agent),
          // 평문 토큰은 이 응답에서 1회만 노출된다 (서버는 해시만 저장)
          agentToken: registration.agentToken,
        }));
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON body' }));
      }
    });
    return;
  }

  const agentHeartbeatMatch = pathname.match(/^\/api\/agents\/([^/]+)\/heartbeat$/);
  if (req.method === 'POST' && agentHeartbeatMatch) {
    const agentId = decodeURIComponent(agentHeartbeatMatch[1]);
    if (!authorizeAgentEndpoint(req, res, agentId)) return;

    const agent = recordAgentHeartbeat(agentId);
    if (!agent) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'AGENT_NOT_FOUND' }));
      return;
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      item: toPublicAgent(agent),
    }));
    return;
  }

  const agentRevokeMatch = pathname.match(/^\/api\/agents\/([^/]+)\/revoke$/);
  if (req.method === 'POST' && agentRevokeMatch) {
    // 토큰 회수는 서버 토큰(관리자) 전용 — 에이전트 토큰으로는 불가
    if (!isRequestAuthorized(req)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return;
    }

    const agentId = decodeURIComponent(agentRevokeMatch[1]);
    const agent = getAgent(agentId);
    if (!agent) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'AGENT_NOT_FOUND' }));
      return;
    }

    const revokedAgent = { ...agent, tokenHash: null, updatedAt: new Date().toISOString() };
    agentsById.set(revokedAgent.agentId, revokedAgent);
    persistAgentStore();

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      item: toPublicAgent(revokedAgent),
    }));
    return;
  }

  const agentDetailMatch = pathname.match(/^\/api\/agents\/([^/]+)$/);
  if (req.method === 'GET' && agentDetailMatch) {
    if (!isRequestAuthorized(req)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return;
    }

    const agentId = decodeURIComponent(agentDetailMatch[1]);
    const agent = getAgent(agentId);
    if (!agent) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'AGENT_NOT_FOUND' }));
      return;
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ item: toPublicAgent(agent) }));
    return;
  }

  if (req.method === 'GET' && pathname === '/api/projects') {
    if (!isRequestAuthorized(req)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return;
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(getActiveProjectResponse()));
    return;
  }

  if (req.method === 'POST' && pathname === '/api/projects/select') {
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
        const projectId = sanitizeHistoryText(data.projectId || '', 80) || null;
        const projectPath = data.projectPath ? path.resolve(String(data.projectPath).trim()) : '';
        const targetProject = resolveProjectUpdateTarget({ projectId, projectPath });

        if (!targetProject) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Project not found' }));
          return;
        }

        const pathValidationError = validateRuntimeProjectPath(targetProject.path);
        if (pathValidationError) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            error: pathValidationError,
            path: targetProject.path,
          }));
          return;
        }

        persistRuntimeProject(targetProject);
        markProjectUsed(targetProject.id);
        const payload = getActiveProjectResponse();
        broadcastToClients({
          event: 'PROJECT_SWITCHED',
          currentProject: payload.currentProject,
        });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          ...payload,
        }));
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON body' }));
      }
    });
    return;
  }

  if (req.method === 'POST' && pathname === '/api/projects/update') {
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
        const projectId = sanitizeHistoryText(data.projectId || '', 80) || null;
        const projectPath = data.projectPath ? path.resolve(String(data.projectPath).trim()) : '';
        const targetProject = resolveProjectUpdateTarget({ projectId, projectPath });

        if (!targetProject) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Project not found' }));
          return;
        }

        const pathValidationError = validateRuntimeProjectPath(targetProject.path);
        if (pathValidationError) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            error: pathValidationError,
            path: targetProject.path,
          }));
          return;
        }

        const updatedProject = upsertProjectEntry({
          id: targetProject.id,
          name: sanitizeHistoryText(data.projectName || '', 80) || targetProject.name,
          path: targetProject.path,
          repoUrl: sanitizeHistoryText(data.repoUrl || '', 240) || targetProject.repoUrl || inferProjectRemoteUrl(targetProject.path),
          laneCount: sanitizeLaneCount(data.laneCount, targetProject.laneCount || DEFAULT_LANE_COUNT),
        });

        const didAffectActiveProject = updatedProject.path === runtimeProjectState.path;
        if (didAffectActiveProject) {
          persistRuntimeProject(updatedProject);
          markProjectUsed(updatedProject.id);
        }

        const payload = getActiveProjectResponse();
        broadcastToClients({
          event: 'PROJECT_UPDATED',
          currentProject: payload.currentProject,
          updatedProject,
          didAffectActiveProject,
        });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          didAffectActiveProject,
          updatedProject,
          ...payload,
        }));
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON body' }));
      }
    });
    return;
  }

  if (req.method === 'POST' && pathname === '/api/projects/register') {
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
        const projectPath = data.projectPath ? path.resolve(String(data.projectPath).trim()) : '';
        const activate = data.activate !== false;

        if (!projectPath) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'PROJECT_PATH_REQUIRED' }));
          return;
        }

        const pathValidationError = validateRuntimeProjectPath(projectPath);
        if (pathValidationError) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            error: pathValidationError,
            path: projectPath,
          }));
          return;
        }

        const savedProject = upsertProjectEntry({
          name: sanitizeHistoryText(data.projectName || '', 80) || inferProjectName(projectPath),
          path: projectPath,
          repoUrl: sanitizeHistoryText(data.repoUrl || '', 240) || inferProjectRemoteUrl(projectPath),
          laneCount: sanitizeLaneCount(data.laneCount, DEFAULT_LANE_COUNT),
        });

        let didActivate = false;
        if (activate) {
          persistRuntimeProject(savedProject);
          markProjectUsed(savedProject.id);
          didActivate = true;
        }

        const payload = getActiveProjectResponse();
        if (didActivate) {
          broadcastToClients({
            event: 'PROJECT_SWITCHED',
            currentProject: payload.currentProject,
          });
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          didActivate,
          savedProject,
          ...payload,
        }));
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON body' }));
      }
    });
    return;
  }

  // ── Work Request Intake routes (VU-001 Phase A, gated by MAESTRO_WORKFLOW_ENABLED) ──
  if (pathname === '/api/work-requests' || pathname.startsWith('/api/work-requests/')) {
    if (!WORKFLOW_ENABLED) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'WORKFLOW_DISABLED' }));
      return;
    }
    if (!isRequestAuthorized(req)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return;
    }
  }

  if (req.method === 'GET' && pathname === '/api/work-requests') {
    const items = listWorkRequests({
      projectId: requestUrl.searchParams.get('projectId'),
      workflowState: requestUrl.searchParams.get('workflowState'),
      limit: requestUrl.searchParams.get('limit'),
    });

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      items,
      count: items.length,
      maxItems: WORK_REQUEST_MAX_ITEMS,
    }));
    return;
  }

  if (req.method === 'POST' && pathname === '/api/work-requests') {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        const result = createWorkRequest({
          projectId: data.projectId,
          laneIndex: data.laneIndex,
          requestedBy: data.requestedBy,
          preferredAgent: data.preferredAgent,
          title: data.title,
          goal: data.goal,
          constraints: data.constraints,
          acceptanceCriteria: data.acceptanceCriteria,
          priority: data.priority,
          targetBranch: data.targetBranch,
        });

        if (!result.ok) {
          res.writeHead(result.code || 400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: result.error || 'WORK_REQUEST_INVALID' }));
          return;
        }

        broadcastToClients({
          event: 'WORK_REQUEST_CREATED',
          item: result.item,
        });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, item: result.item }));
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON body' }));
      }
    });
    return;
  }

  const workRequestDecisionMatch = pathname.match(/^\/api\/work-requests\/([^/]+)\/decision$/);
  if (req.method === 'POST' && workRequestDecisionMatch) {
    const workRequestId = decodeURIComponent(workRequestDecisionMatch[1]);
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        const result = decideWorkRequest(workRequestId, data.decision);

        if (!result.ok) {
          res.writeHead(result.code || 400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: result.error || 'WORK_REQUEST_DECISION_INVALID' }));
          return;
        }

        broadcastToClients({
          event: 'WORK_REQUEST_DECIDED',
          item: result.item,
          decision: result.decision,
        });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, item: result.item, decision: result.decision }));
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON body' }));
      }
    });
    return;
  }

  const workRequestDetailMatch = pathname.match(/^\/api\/work-requests\/([^/]+)$/);
  if (req.method === 'GET' && workRequestDetailMatch) {
    const workRequestId = decodeURIComponent(workRequestDetailMatch[1]);
    const item = getWorkRequest(workRequestId);
    if (!item) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'WORK_REQUEST_NOT_FOUND' }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ item }));
    return;
  }

  if (req.method === 'GET' && pathname === '/api/work-sessions') {
    if (!isRequestAuthorized(req)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return;
    }

    const items = listWorkSessions({
      projectId: requestUrl.searchParams.get('projectId'),
      status: requestUrl.searchParams.get('status'),
      limit: requestUrl.searchParams.get('limit'),
    });

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      items,
      count: items.length,
      maxItems: WORK_SESSION_MAX_ITEMS,
    }));
    return;
  }

  if (req.method === 'POST' && pathname === '/api/work-sessions') {
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
        const session = createWorkSession({
          projectId: data.projectId || runtimeProjectState.id,
          title: data.title,
          agentId: data.agentId,
          source: data.source,
        });
        const initialStatusMessage = appendWorkMessage(session.workSessionId, {
          role: WORK_MESSAGE_ROLE.SYSTEM,
          kind: WORK_MESSAGE_KIND.STATUS,
          body: 'Work session created.',
        });
        const responseSession = initialStatusMessage?.session || session;

        broadcastToClients({
          event: 'WORK_SESSION_CREATED',
          session: responseSession,
        });
        if (initialStatusMessage) {
          broadcastToClients({
            event: 'WORK_MESSAGE_CREATED',
            session: initialStatusMessage.session,
            message: initialStatusMessage.message,
          });
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          item: responseSession,
          messages: initialStatusMessage ? [initialStatusMessage.message] : [],
        }));
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON body' }));
      }
    });
    return;
  }

  const workSessionDetailMatch = pathname.match(/^\/api\/work-sessions\/([^/]+)$/);
  if (req.method === 'GET' && workSessionDetailMatch) {
    if (!isRequestAuthorized(req)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return;
    }

    const workSessionId = decodeURIComponent(workSessionDetailMatch[1]);
    const detail = getWorkSessionDetail(workSessionId, {
      limit: requestUrl.searchParams.get('messageLimit'),
    });

    if (!detail) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'WORK_SESSION_NOT_FOUND' }));
      return;
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(detail));
    return;
  }

  const workSessionMessagesMatch = pathname.match(/^\/api\/work-sessions\/([^/]+)\/messages$/);
  if (req.method === 'POST' && workSessionMessagesMatch) {
    if (!isRequestAuthorized(req)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return;
    }

    const workSessionId = decodeURIComponent(workSessionMessagesMatch[1]);
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        const result = appendExternalWorkMessage(workSessionId, {
          body: data.body,
          role: data.role,
          kind: data.kind,
        });

        if (!result.ok) {
          res.writeHead(result.code || 400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: result.error || 'WORK_MESSAGE_FAILED' }));
          return;
        }

        result.messages.forEach((message) => {
          const eventName = message.kind === WORK_MESSAGE_KIND.COMMAND_RESULT
            ? 'COMMAND_RESULT'
            : 'WORK_MESSAGE_CREATED';
          broadcastToClients({
            event: eventName,
            session: result.session,
            message,
          });
        });

        if (result.commandEvent) {
          broadcastToClients({
            event: result.commandEvent,
            session: result.session,
            command: result.messages.find((message) => message.kind === WORK_MESSAGE_KIND.COMMAND)?.body || null,
          });
        }

        if (result.messages.some((message) => message.kind === WORK_MESSAGE_KIND.STATUS)) {
          broadcastToClients({
            event: 'WORK_SESSION_UPDATED',
            session: result.session,
          });
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          item: result.session,
          messages: result.messages,
        }));
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON body' }));
      }
    });
    return;
  }

  const workSessionCloseMatch = pathname.match(/^\/api\/work-sessions\/([^/]+)\/close$/);
  if (req.method === 'POST' && workSessionCloseMatch) {
    if (!isRequestAuthorized(req)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return;
    }

    const workSessionId = decodeURIComponent(workSessionCloseMatch[1]);
    const session = getWorkSession(workSessionId);

    if (!session) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'WORK_SESSION_NOT_FOUND' }));
      return;
    }

    const nextStatus = isTerminalWorkSessionStatus(session.status)
      ? session.status
      : WORK_SESSION_STATUS.COMPLETED;
    const updatedSession = updateWorkSession(workSessionId, {
      status: nextStatus,
      updatedAt: new Date().toISOString(),
    });
    const statusMessage = appendWorkMessage(workSessionId, {
      role: WORK_MESSAGE_ROLE.SYSTEM,
      kind: WORK_MESSAGE_KIND.STATUS,
      body: nextStatus === session.status ? '세션은 이미 종료 상태입니다.' : '세션이 종료되었습니다.',
    });

    broadcastToClients({
      event: 'WORK_SESSION_UPDATED',
      session: statusMessage?.session || updatedSession,
    });
    if (statusMessage) {
      broadcastToClients({
        event: 'WORK_MESSAGE_CREATED',
        session: statusMessage.session,
        message: statusMessage.message,
      });
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      item: statusMessage?.session || updatedSession,
      messages: statusMessage ? [statusMessage.message] : [],
    }));
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

  if (req.method === 'POST' && pathname === '/api/approval-requests') {
    const approvalAuth = authorizeAgentEndpoint(req, res);
    if (!approvalAuth) return;

    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      try {
        const data = JSON.parse(body || '{}');
        // 에이전트 토큰 호출은 요청 agentId가 토큰 주인과 일치해야 한다
        if (approvalAuth.mode === 'agent') {
          const claimedAgentId = sanitizeHistoryText(data.agentId || '', 80);
          if (claimedAgentId && claimedAgentId !== approvalAuth.agentId) {
            res.writeHead(403, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'AGENT_MISMATCH' }));
            return;
          }
          data.agentId = approvalAuth.agentId;
        }
        const { approvalRequest, autoApprove } = submitApprovalRequest(data, { source: 'agent' });
        console.log(`📨 승인 요청 수신: [${approvalRequest.agentId}] ${approvalRequest.diffSummary.title}`);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          requestId: approvalRequest.requestId,
          item: approvalRequest,
          autoApprove,
        }));
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON body' }));
      }
    });
    return;
  }

  const approvalDecisionPollMatch = pathname.match(/^\/api\/approval-requests\/([^/]+)\/decision$/);
  if (req.method === 'GET' && approvalDecisionPollMatch) {
    const pollAuth = authorizeAgentEndpoint(req, res);
    if (!pollAuth) return;

    const requestId = decodeURIComponent(approvalDecisionPollMatch[1]);
    const approvalRequest = getApprovalRequest(requestId);
    if (!approvalRequest) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'APPROVAL_REQUEST_NOT_FOUND' }));
      return;
    }

    // 에이전트 토큰은 자기 요청만 폴링 가능
    if (pollAuth.mode === 'agent' && approvalRequest.agentId !== pollAuth.agentId) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'AGENT_MISMATCH' }));
      return;
    }

    const decision = getApprovalDecisionByRequestId(requestId);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      requestId: approvalRequest.requestId,
      status: decision ? decision.delivery.status : 'pending',
      item: decision,
    }));
    return;
  }

  const approvalDecisionAckMatch = pathname.match(/^\/api\/approval-decisions\/([^/]+)\/ack$/);
  if (req.method === 'POST' && approvalDecisionAckMatch) {
    const ackAuth = authorizeAgentEndpoint(req, res);
    if (!ackAuth) return;

    const decisionId = decodeURIComponent(approvalDecisionAckMatch[1]);

    // 에이전트 토큰은 자기 요청의 결정만 ack 가능
    if (ackAuth.mode === 'agent') {
      const targetDecision = Array.from(approvalDecisionsByRequestId.values())
        .find((decision) => decision.decisionId === decisionId) || null;
      const targetRequest = targetDecision ? getApprovalRequest(targetDecision.requestId) : null;
      if (targetRequest && targetRequest.agentId !== ackAuth.agentId) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'AGENT_MISMATCH' }));
        return;
      }
    }
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      try {
        const data = body.trim() ? JSON.parse(body) : {};
        const decision = acknowledgeApprovalDecision(decisionId, data);
        if (!decision) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'APPROVAL_DECISION_NOT_FOUND' }));
          return;
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          item: decision,
        }));
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON body' }));
      }
    });
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
  //   "laneIndex": 2,                  // UI 레인 번호 1~활성 프로젝트 레인 수 (없으면 자동 배정)
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
        const data = JSON.parse(body || '{}');
        const { approvalRequest, autoApprove } = submitApprovalRequest(data, { source: 'legacy' });
        console.log(`📨 승인 요청 수신: [${approvalRequest.agentId}] ${approvalRequest.diffSummary.title}`);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          requestId: approvalRequest.requestId,
          item: approvalRequest,
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

const APPROVAL_REQUEST_STATUS = {
  PENDING_DECISION: 'pending_decision',
};

const APPROVAL_DECISION = {
  APPROVE: 'approve',
  REJECT: 'reject',
  REVISE: 'revise',
  ASK: 'ask',
  CANCEL: 'cancel',
};

const EXECUTOR_ACTION = {
  NONE: 'none',
  MERGE: 'merge',
};

const DECISION_DELIVERY_STATUS = {
  AVAILABLE: 'available',
  ACKNOWLEDGED: 'acknowledged',
};

const approvalRequestsById = new Map();
const approvalDecisionsByRequestId = new Map();
const approvalDecisionsById = new Map();
const requestStateById = new Map();
const requestMetaById = new Map();
const autoApproveInFlight = new Set();
const autoApproveEvents = [];
const approvalHistory = loadPersistedHistory();
const historyDedupByKey = new Map();
let lastAutoApproveAt = 0;

// ── Agent + Approval store persistence ───────────────────────────────────────
// Agent registry, approval requests, and approval decisions live in memory; a
// server restart would drop every connected agent and pending pull-decision.
// Persist them to a JSON snapshot so multi-agent connection state survives.
function persistAgentStore() {
  try {
    mkdirSync(path.dirname(AGENT_STORE_PATH), { recursive: true });
    const payload = {
      savedAt: new Date().toISOString(),
      agents: Array.from(agentsById.values()),
      approvalRequests: Array.from(approvalRequestsById.values()),
      approvalDecisions: Array.from(approvalDecisionsByRequestId.values()),
    };
    writeFileSync(AGENT_STORE_PATH, JSON.stringify(payload, null, 2));
  } catch (error) {
    console.error('agent store persist failed:', error.message);
  }
}

function loadAgentStore() {
  if (!existsSync(AGENT_STORE_PATH)) return;
  try {
    const raw = readFileSync(AGENT_STORE_PATH, 'utf8');
    if (!raw.trim()) return;
    const parsed = JSON.parse(raw);
    const now = new Date().toISOString();

    const allowedAgentStatus = new Set(Object.values(AGENT_STATUS));
    (Array.isArray(parsed.agents) ? parsed.agents : []).forEach((item) => {
      const agentId = sanitizeHistoryText(item?.agentId || '', 80);
      if (!agentId) return;
      const repoRootRaw = typeof item.repoRoot === 'string' ? item.repoRoot.trim() : '';
      agentsById.set(agentId, {
        agentId,
        adapterType: sanitizeHistoryText(item.adapterType || '', 40) || 'unknown',
        repoRoot: repoRootRaw ? path.resolve(repoRootRaw) : runtimeProjectState.path,
        displayName: sanitizeHistoryText(item.displayName || '', 120) || agentId,
        capabilities: normalizeAgentCapabilities(item.capabilities),
        tokenId: sanitizeHistoryText(item.tokenId || '', 80) || null,
        tokenHash: typeof item.tokenHash === 'string' && /^[0-9a-f]{64}$/.test(item.tokenHash) ? item.tokenHash : null,
        status: allowedAgentStatus.has(item.status) ? item.status : AGENT_STATUS.REGISTERED,
        registeredAt: item.registeredAt || now,
        updatedAt: item.updatedAt || now,
        lastHeartbeatAt: item.lastHeartbeatAt || null,
        metadata: sanitizeAgentMetadata(item.metadata),
      });
    });

    const allowedRequestStatus = new Set(Object.values(APPROVAL_REQUEST_STATUS));
    (Array.isArray(parsed.approvalRequests) ? parsed.approvalRequests : []).forEach((item) => {
      const requestId = sanitizeHistoryText(item?.requestId || '', 80);
      if (!requestId) return;
      const repoRootRaw = typeof item.repoRoot === 'string' ? item.repoRoot.trim() : '';
      const restored = {
        requestId,
        agentId: sanitizeHistoryText(item.agentId || '', 64) || 'unknown_agent',
        projectId: sanitizeHistoryText(item.projectId || '', 64) || null,
        repoRoot: repoRootRaw ? path.resolve(repoRootRaw) : runtimeProjectState.path,
        branchName: sanitizeHistoryText(item.branchName || '', 120) || null,
        laneIndex: Number.isInteger(item.laneIndex) ? item.laneIndex : null,
        diffSummary: normalizeDiffSummary(item.diffSummary || {}),
        source: sanitizeHistoryText(item.source || '', 32) || 'agent',
        legacyRequestId: sanitizeHistoryText(item.legacyRequestId || '', 80) || null,
        status: allowedRequestStatus.has(item.status) ? item.status : APPROVAL_REQUEST_STATUS.PENDING_DECISION,
        autoApprove: item.autoApprove === true,
        timestamp: item.timestamp || item.createdAt || now,
        createdAt: item.createdAt || now,
        updatedAt: item.updatedAt || now,
      };
      approvalRequestsById.set(requestId, restored);
      setRequestMeta(requestId, {
        requestId,
        projectId: restored.projectId,
        laneIndex: restored.laneIndex,
        agentId: restored.agentId,
        branchName: restored.branchName,
        title: restored.diffSummary?.title,
      });
      setRequestState(requestId, REQUEST_STATUS.READY, restored.source === 'legacy' ? 'request' : 'approval-request');
    });

    const allowedDelivery = new Set(Object.values(DECISION_DELIVERY_STATUS));
    (Array.isArray(parsed.approvalDecisions) ? parsed.approvalDecisions : []).forEach((item) => {
      const requestId = sanitizeHistoryText(item?.requestId || '', 80);
      const decisionId = sanitizeHistoryText(item?.decisionId || '', 80);
      if (!requestId || !decisionId) return;
      const delivery = item.delivery && typeof item.delivery === 'object' ? item.delivery : {};
      const executorResult = item.executorResult && typeof item.executorResult === 'object' ? item.executorResult : null;
      const restored = {
        decisionId,
        requestId,
        agentId: sanitizeHistoryText(item.agentId || '', 64) || null,
        decision: normalizeApprovalDecisionValue(item.decision),
        comment: sanitizeHistoryText(item.comment || '', 500) || null,
        executorAction: normalizeExecutorAction(item.executorAction),
        delivery: {
          mode: 'pull',
          status: allowedDelivery.has(delivery.status) ? delivery.status : DECISION_DELIVERY_STATUS.AVAILABLE,
          acknowledgedAt: delivery.acknowledgedAt || null,
          acknowledgedBy: sanitizeHistoryText(delivery.acknowledgedBy || '', 64) || null,
        },
        decidedBy: sanitizeHistoryText(item.decidedBy || '', 64) || 'operator',
        createdAt: item.createdAt || now,
        executorResult: executorResult ? {
          status: sanitizeHistoryText(executorResult.status || '', 32) || 'skipped',
          reason: sanitizeHistoryText(executorResult.reason || '', 80) || null,
          event: sanitizeHistoryText(executorResult.event || '', 80) || null,
          finishedAt: executorResult.finishedAt || null,
        } : null,
      };
      approvalDecisionsByRequestId.set(requestId, restored);
      approvalDecisionsById.set(decisionId, restored);
    });
  } catch (error) {
    console.error('agent store load failed:', error.message);
  }
}

loadAgentStore();

function persistHistoryStore(storePath = HISTORY_STORE_PATH) {
  const tempPath = `${storePath}.${process.pid}.${Date.now()}.tmp`;
  try {
    writeFileSync(tempPath, JSON.stringify({
      version: HISTORY_STORE_VERSION,
      updatedAt: new Date().toISOString(),
      items: approvalHistory,
    }, null, 2) + '\n', 'utf8');
    renameSync(tempPath, storePath);
    return true;
  } catch (error) {
    try {
      rmSync(tempPath, { force: true });
    } catch {}
    console.error(`히스토리 저장 실패: ${error.message}`);
    return false;
  }
}

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
  persistHistoryStore();

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

function normalizeDiffSummary(input = {}) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  return {
    title: sanitizeHistoryText(source.title || '', 120) || '에이전트 작업 완료',
    impact: sanitizeHistoryText(source.impact || '', 40) || 'Medium',
    shortDescription: sanitizeHistoryText(source.shortDescription || source.description || '', 500) || '',
  };
}

function normalizeApprovalRequest(input = {}, { source = 'agent' } = {}) {
  const now = new Date().toISOString();
  const normalizedSource = sanitizeHistoryText(source || input.source || 'agent', 32) || 'agent';
  const requestIdPrefix = normalizedSource === 'legacy' ? 'req' : 'apr';
  const requestId = sanitizeHistoryText(input.requestId || '', 80) || `${requestIdPrefix}_${Date.now()}`;
  const existing = approvalRequestsById.get(requestId) || null;
  const activeLaneCount = sanitizeLaneCount(runtimeProjectState.laneCount, DEFAULT_LANE_COUNT);
  const normalizedLaneIndex = normalizeConfiguredLaneIndex(input.laneIndex, activeLaneCount);
  const agentId = sanitizeHistoryText(input.agentId || '', 64) || 'unknown_agent';
  const registeredAgent = getAgent(agentId);
  const repoRootRaw = typeof input.repoRoot === 'string' ? input.repoRoot.trim() : '';
  const projectId = sanitizeHistoryText(input.projectId || '', 64)
    || existing?.projectId
    || (normalizedSource === 'legacy' ? null : runtimeProjectState.id);
  const diffSummary = normalizeDiffSummary(input.diffSummary || {
    title: input.title,
    impact: input.impact,
    shortDescription: input.description,
  });

  return {
    requestId,
    agentId,
    projectId,
    repoRoot: repoRootRaw ? path.resolve(repoRootRaw) : registeredAgent?.repoRoot || runtimeProjectState.path,
    branchName: sanitizeHistoryText(input.branchName || '', 120) || null,
    laneIndex: normalizedLaneIndex || existing?.laneIndex || pickRandomLaneIndex(activeLaneCount),
    diffSummary,
    source: normalizedSource,
    legacyRequestId: normalizedSource === 'legacy'
      ? requestId
      : sanitizeHistoryText(input.legacyRequestId || existing?.legacyRequestId || '', 80) || null,
    status: APPROVAL_REQUEST_STATUS.PENDING_DECISION,
    autoApprove: input.autoApprove === true,
    timestamp: existing?.timestamp || now,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
}

function storeApprovalRequest(input = {}, options = {}) {
  const approvalRequest = normalizeApprovalRequest(input, options);
  approvalRequestsById.set(approvalRequest.requestId, approvalRequest);

  setRequestMeta(approvalRequest.requestId, {
    requestId: approvalRequest.requestId,
    projectId: approvalRequest.projectId,
    laneIndex: approvalRequest.laneIndex,
    agentId: approvalRequest.agentId,
    branchName: approvalRequest.branchName,
    title: approvalRequest.diffSummary?.title,
  });
  setRequestState(
    approvalRequest.requestId,
    REQUEST_STATUS.READY,
    approvalRequest.source === 'legacy' ? 'request' : 'approval-request',
  );

  persistAgentStore();
  return approvalRequest;
}

function submitApprovalRequest(input = {}, options = {}) {
  const approvalRequest = storeApprovalRequest(input, options);
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

  if (autoApprove.eligible) {
    void runConditionalAutoApprove(approvalRequest);
  }

  return {
    approvalRequest,
    autoApprove,
  };
}

function getApprovalRequest(requestId) {
  const normalizedRequestId = sanitizeHistoryText(requestId || '', 80);
  if (!normalizedRequestId) return null;
  return approvalRequestsById.get(normalizedRequestId) || null;
}

function createDecisionId() {
  return `apd_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeApprovalDecisionValue(value) {
  const normalized = sanitizeHistoryText(value || '', 32).toLowerCase();
  const allowed = new Set(Object.values(APPROVAL_DECISION));
  return allowed.has(normalized) ? normalized : APPROVAL_DECISION.ASK;
}

function normalizeExecutorAction(value) {
  const normalized = sanitizeHistoryText(value || '', 32).toLowerCase();
  const allowed = new Set(Object.values(EXECUTOR_ACTION));
  return allowed.has(normalized) ? normalized : EXECUTOR_ACTION.NONE;
}

function storeApprovalDecision(input = {}) {
  const requestId = sanitizeHistoryText(input.requestId || '', 80);
  if (!requestId) return null;

  const existing = approvalDecisionsByRequestId.get(requestId) || null;
  if (existing) return existing;

  const request = getApprovalRequest(requestId);
  const meta = getRequestMeta(requestId);
  const now = new Date().toISOString();
  const decision = normalizeApprovalDecisionValue(input.decision);
  const decisionItem = {
    decisionId: createDecisionId(),
    requestId,
    agentId: sanitizeHistoryText(input.agentId || request?.agentId || meta?.agentId || '', 64) || null,
    decision,
    comment: sanitizeHistoryText(input.comment || '', 500) || null,
    executorAction: normalizeExecutorAction(input.executorAction),
    delivery: {
      mode: 'pull',
      status: DECISION_DELIVERY_STATUS.AVAILABLE,
      acknowledgedAt: null,
      acknowledgedBy: null,
    },
    decidedBy: sanitizeHistoryText(input.decidedBy || '', 64) || 'operator',
    createdAt: now,
    executorResult: null,
  };

  approvalDecisionsByRequestId.set(requestId, decisionItem);
  approvalDecisionsById.set(decisionItem.decisionId, decisionItem);
  persistAgentStore();
  return decisionItem;
}

function updateApprovalDecision(decision) {
  if (!decision?.decisionId || !decision?.requestId) return null;
  approvalDecisionsByRequestId.set(decision.requestId, decision);
  approvalDecisionsById.set(decision.decisionId, decision);
  persistAgentStore();
  return decision;
}

function recordApprovalDecisionExecutorResult(decision, input = {}) {
  if (!decision) return null;
  const updatedDecision = {
    ...decision,
    executorResult: {
      status: sanitizeHistoryText(input.status || '', 32) || 'skipped',
      reason: sanitizeHistoryText(input.reason || '', 80) || null,
      event: sanitizeHistoryText(input.event || '', 80) || null,
      finishedAt: new Date().toISOString(),
    },
  };
  return updateApprovalDecision(updatedDecision);
}

function getApprovalDecisionByRequestId(requestId) {
  const normalizedRequestId = sanitizeHistoryText(requestId || '', 80);
  if (!normalizedRequestId) return null;
  return approvalDecisionsByRequestId.get(normalizedRequestId) || null;
}

function getApprovalDecisionById(decisionId) {
  const normalizedDecisionId = sanitizeHistoryText(decisionId || '', 80);
  if (!normalizedDecisionId) return null;
  return approvalDecisionsById.get(normalizedDecisionId) || null;
}

function acknowledgeApprovalDecision(decisionId, input = {}) {
  const existing = getApprovalDecisionById(decisionId);
  if (!existing) return null;
  if (existing.delivery.status === DECISION_DELIVERY_STATUS.ACKNOWLEDGED) {
    return existing;
  }

  const updatedDecision = {
    ...existing,
    delivery: {
      ...existing.delivery,
      status: DECISION_DELIVERY_STATUS.ACKNOWLEDGED,
      acknowledgedAt: new Date().toISOString(),
      acknowledgedBy: sanitizeHistoryText(input.agentId || '', 64) || existing.agentId || null,
    },
  };

  approvalDecisionsByRequestId.set(updatedDecision.requestId, updatedDecision);
  approvalDecisionsById.set(updatedDecision.decisionId, updatedDecision);
  return updatedDecision;
}

async function runDecisionExecutor(decision, {
  requestId,
  branchName = null,
  projectId = null,
  laneIndex = null,
  agentId = null,
  title = null,
  source = 'manual',
  mainRepoPath = getActiveMainRepoPath(),
  sendEvent = () => {},
} = {}) {
  if (!decision) return null;

  const executionRequestId = requestId || decision.requestId;
  const executorSource = normalizeHistorySource(source);
  const historyInput = {
    requestId: executionRequestId,
    projectId,
    laneIndex,
    agentId: agentId || decision.agentId,
    branchName,
    title,
    source: executorSource,
    autoApproved: executorSource === 'auto',
  };

  if (decision.executorAction !== EXECUTOR_ACTION.MERGE) {
    const reason = 'EXECUTOR_ACTION_NONE';
    sendEvent({
      event: 'MERGE_SKIPPED',
      requestId: executionRequestId,
      reason,
    });
    appendHistory({
      ...historyInput,
      result: 'APPROVE_SKIPPED',
      reason,
    });
    return recordApprovalDecisionExecutorResult(decision, {
      status: 'skipped',
      reason,
      event: 'MERGE_SKIPPED',
    });
  }

  const skipReason = getApproveSkipReason(executionRequestId);
  if (skipReason) {
    sendEvent({
      event: 'MERGE_SKIPPED',
      requestId: executionRequestId,
      reason: skipReason,
    });
    appendHistory({
      ...historyInput,
      result: 'APPROVE_SKIPPED',
      reason: skipReason,
    });
    return recordApprovalDecisionExecutorResult(decision, {
      status: 'skipped',
      reason: skipReason,
      event: 'MERGE_SKIPPED',
    });
  }

  setRequestState(executionRequestId, REQUEST_STATUS.APPROVING, executorSource);

  if (branchName && isValidBranchName(branchName)) {
    const ok = await gitOps
      .mergeAgentBranch(mainRepoPath, branchName)
      .then(() => true)
      .catch((err) => { console.error('Merge 실패:', err.message); return false; });

    markApproveFinished({
      requestId: executionRequestId,
      ok,
      source: executorSource,
    });

    const event = ok ? 'MERGE_SUCCESS' : 'MERGE_FAILED';
    sendEvent({
      event,
      requestId: executionRequestId,
      autoApproved: executorSource === 'auto' ? true : undefined,
    });
    appendHistory({
      ...historyInput,
      result: ok ? 'APPROVED' : 'APPROVE_FAILED',
      reason: event,
    });
    return recordApprovalDecisionExecutorResult(decision, {
      status: ok ? 'succeeded' : 'failed',
      reason: event,
      event,
    });
  }

  // 브랜치 정보 없이도 기존 UI 흐름은 성공 이벤트를 반환한다.
  markApproveFinished({
    requestId: executionRequestId,
    ok: true,
    source: executorSource,
  });
  sendEvent({ event: 'MERGE_SUCCESS', requestId: executionRequestId });
  appendHistory({
    ...historyInput,
    result: 'APPROVED',
    reason: 'MERGE_SUCCESS',
  });
  return recordApprovalDecisionExecutorResult(decision, {
    status: 'succeeded',
    reason: 'MERGE_SUCCESS',
    event: 'MERGE_SUCCESS',
  });
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
  const mainRepoPath = getActiveMainRepoPath();
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
    const mainRepoPath = getActiveMainRepoPath();

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
        const decision = storeApprovalDecision({
          requestId: payload.requestId,
          agentId: payload.agentId,
          decision: APPROVAL_DECISION.APPROVE,
          comment: payload.comment || payload.feedback || '',
          executorAction: payload.executorAction || EXECUTOR_ACTION.MERGE,
          decidedBy: 'operator',
        });

        await runDecisionExecutor(decision, {
          requestId: payload.requestId,
          branchName: payload.branchName,
          projectId: payload.projectId,
          laneIndex: payload.laneIndex,
          agentId: payload.agentId,
          title: payload.title,
          source: 'manual',
          mainRepoPath,
          sendEvent: (eventPayload) => {
            ws.send(JSON.stringify(eventPayload));
          },
        });
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
        storeApprovalDecision({
          requestId: payload.requestId,
          agentId: payload.agentId,
          decision: APPROVAL_DECISION.REJECT,
          comment: payload.feedback || payload.comment || '',
          executorAction: EXECUTOR_ACTION.NONE,
          decidedBy: 'operator',
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
  console.log(`   프로젝트 목록: GET  http://${HOST}:${PORT}/api/projects`);
  console.log(`   허용 Origin : ${ALLOWED_ORIGINS.join(', ')}`);
  console.log(`   인증 모드   : ${SERVER_TOKEN ? 'Bearer token required' : 'disabled'}`);
  console.log(`   활성 프로젝트: ${runtimeProjectState.name} (${runtimeProjectState.path})`);
  console.log(`   자동승인    : ${AUTO_APPROVE_CONFIG.enabled ? 'enabled' : 'disabled'}`);
  console.log(`   이력 버퍼   : max ${HISTORY_BUFFER_MAX_ITEMS} items`);
  console.log(`   이력 저장소 : ${HISTORY_STORE_PATH}`);
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

// ── Bonjour(mDNS) 광고 ────────────────────────────────────────────────────────
// 네이티브 앱(iPad)의 '주변 서버 찾기'가 _maestro._tcp 서비스를 발견한다.
// MAESTRO_MDNS=off 로 비활성화. 광고 실패(방화벽 등)는 서버 기동에 영향 없다.
if ((process.env.MAESTRO_MDNS || 'on').toLowerCase() !== 'off') {
  try {
    const [{ Bonjour }, os] = await Promise.all([
      import('bonjour-service'),
      import('node:os'),
    ]);
    const bonjour = new Bonjour();
    bonjour.publish({
      name: `Maestro (${os.hostname()})`,
      type: 'maestro',
      protocol: 'tcp',
      port: Number(PORT),
    });
    console.log(`📡 mDNS 광고: _maestro._tcp port ${PORT} (MAESTRO_MDNS=off로 비활성 가능)`);
    process.once('SIGINT', () => {
      try {
        bonjour.destroy();
      } catch {
        // 광고 해제 실패는 종료에 영향 없음
      }
      process.exit(0);
    });
  } catch (error) {
    console.warn('📡 mDNS 광고 시작 실패 (무시하고 계속):', error?.message || error);
  }
}
