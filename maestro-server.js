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
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
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
  agentsById.set(agent.agentId, agent);
  return agent;
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
  return nextAgent;
}

function listAgents() {
  return Array.from(agentsById.values())
    .sort((a, b) => Date.parse(b.updatedAt || 0) - Date.parse(a.updatedAt || 0));
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

    pruneClosedWorkSessions();
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
        sessionCount: workSessionsById.size,
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
        const agent = registerAgent(data);
        if (!agent) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'AGENT_ID_REQUIRED' }));
          return;
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          item: agent,
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
    if (!isRequestAuthorized(req)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return;
    }

    const agentId = decodeURIComponent(agentHeartbeatMatch[1]);
    const agent = recordAgentHeartbeat(agentId);
    if (!agent) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'AGENT_NOT_FOUND' }));
      return;
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      item: agent,
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
    res.end(JSON.stringify({ item: agent }));
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
        const data = JSON.parse(body);
        const activeLaneCount = sanitizeLaneCount(runtimeProjectState.laneCount, DEFAULT_LANE_COUNT);
        const normalizedLaneIndex = normalizeConfiguredLaneIndex(data.laneIndex, activeLaneCount);

        // 필수 필드 기본값 채우기
        const approvalRequest = {
          requestId: data.requestId || `req_${Date.now()}`,
          agentId: data.agentId || 'unknown_agent',
          branchName: data.branchName || null,
          projectId: data.projectId || null,
          laneIndex: normalizedLaneIndex || pickRandomLaneIndex(activeLaneCount),
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
  console.log(`   프로젝트 목록: GET  http://${HOST}:${PORT}/api/projects`);
  console.log(`   허용 Origin : ${ALLOWED_ORIGINS.join(', ')}`);
  console.log(`   인증 모드   : ${SERVER_TOKEN ? 'Bearer token required' : 'disabled'}`);
  console.log(`   활성 프로젝트: ${runtimeProjectState.name} (${runtimeProjectState.path})`);
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
