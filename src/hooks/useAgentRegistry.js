import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SERVER_API_TOKEN_STORAGE_KEY } from '../constants/ops.js';
import { getStoredString } from '../utils/storage.js';

const AGENT_RENDER_LIMIT = 12;
const AGENT_REFRESH_INTERVAL_MS = 15000;

const TRACKED_EVENTS = new Set([
  'AGENT_TASK_READY',
  'MERGE_SUCCESS',
  'MERGE_FAILED',
  'MERGE_SKIPPED',
  'AGENT_RESTARTED',
  'AUTO_APPROVE_SKIPPED',
]);

function toApiUrl(wsUrl, path) {
  try {
    const parsedWsUrl = new URL(wsUrl);
    const protocol = parsedWsUrl.protocol === 'wss:' ? 'https:' : 'http:';
    return `${protocol}//${parsedWsUrl.host}${path}`;
  } catch {
    return path;
  }
}

function buildAuthHeaders(token) {
  if (!token) return {};
  return {
    Authorization: `Bearer ${token}`,
  };
}

function normalizeText(value, fallback = null, maxLength = 200) {
  if (typeof value !== 'string') return fallback;
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (!normalized) return fallback;
  return normalized.slice(0, maxLength);
}

function normalizeAgentRequest(item = null) {
  if (!item || typeof item !== 'object') return null;
  return {
    requestId: normalizeText(item.requestId, null, 80),
    status: normalizeText(item.status, 'pending_decision', 40),
    branchName: normalizeText(item.branchName, null, 120),
    projectId: normalizeText(item.projectId, null, 64),
    source: normalizeText(item.source, null, 32),
    updatedAt: normalizeText(item.updatedAt || item.createdAt, null, 80),
    createdAt: normalizeText(item.createdAt, null, 80),
  };
}

function normalizeAgentDecision(item = null) {
  if (!item || typeof item !== 'object') return null;
  return {
    decisionId: normalizeText(item.decisionId, null, 80),
    requestId: normalizeText(item.requestId, null, 80),
    decision: normalizeText(item.decision, null, 32),
    executorAction: normalizeText(item.executorAction, null, 32),
    deliveryStatus: normalizeText(item.deliveryStatus || item.delivery?.status, null, 32),
    acknowledgedAt: normalizeText(item.acknowledgedAt || item.delivery?.acknowledgedAt, null, 80),
    executorStatus: normalizeText(item.executorStatus || item.executorResult?.status, null, 32),
    createdAt: normalizeText(item.createdAt, null, 80),
  };
}

function normalizeAgent(item = {}) {
  const agentId = normalizeText(item.agentId, 'unknown_agent', 80);
  return {
    agentId,
    adapterType: normalizeText(item.adapterType, 'unknown', 40),
    repoRoot: normalizeText(item.repoRoot, null, 240),
    displayName: normalizeText(item.displayName, agentId, 120),
    capabilities: Array.isArray(item.capabilities)
      ? item.capabilities.map((capability) => normalizeText(capability, null, 64)).filter(Boolean)
      : [],
    status: normalizeText(item.status, 'registered', 32),
    registeredAt: normalizeText(item.registeredAt, null, 80),
    updatedAt: normalizeText(item.updatedAt, null, 80),
    lastHeartbeatAt: normalizeText(item.lastHeartbeatAt, null, 80),
    lastRequest: normalizeAgentRequest(item.lastRequest),
    lastDecision: normalizeAgentDecision(item.lastDecision),
  };
}

function sortAgents(items) {
  return items
    .slice()
    .sort((a, b) => Date.parse(b.updatedAt || b.lastHeartbeatAt || 0) - Date.parse(a.updatedAt || a.lastHeartbeatAt || 0));
}

export default function useAgentRegistry({ wsUrl, enabled = true } = {}) {
  const [agents, setAgents] = useState([]);
  const [agentError, setAgentError] = useState('');
  const [isAgentLoading, setIsAgentLoading] = useState(false);
  const [isAgentAuthRequired, setIsAgentAuthRequired] = useState(false);
  const mountedRef = useRef(true);
  const agentApiToken = useMemo(() => getStoredString(SERVER_API_TOKEN_STORAGE_KEY, ''), []);
  const apiUrl = useMemo(() => toApiUrl(wsUrl, '/api/agents'), [wsUrl]);

  const refreshAgents = useCallback(async () => {
    setIsAgentLoading(true);
    try {
      const response = await fetch(apiUrl, {
        method: 'GET',
        headers: buildAuthHeaders(agentApiToken),
      });

      if (response.status === 401) {
        if (!mountedRef.current) return;
        setIsAgentAuthRequired(true);
        setAgentError('Agent Registry API 인증이 필요합니다.');
        return;
      }

      if (!response.ok) throw new Error(`agent_registry_failed_${response.status}`);
      const body = await response.json();
      if (!mountedRef.current) return;
      const items = Array.isArray(body.items) ? body.items : [];
      setAgents(sortAgents(items.map((item) => normalizeAgent(item))).slice(0, AGENT_RENDER_LIMIT));
      setAgentError('');
      setIsAgentAuthRequired(false);
    } catch {
      if (!mountedRef.current) return;
      setAgentError('Agent Registry API에 연결하지 못했습니다.');
    } finally {
      if (mountedRef.current) {
        setIsAgentLoading(false);
      }
    }
  }, [agentApiToken, apiUrl]);

  useEffect(() => {
    if (!enabled) return undefined;
    refreshAgents();
    const intervalId = setInterval(() => {
      refreshAgents();
    }, AGENT_REFRESH_INTERVAL_MS);
    return () => clearInterval(intervalId);
  }, [enabled, refreshAgents]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const handleSocketEvent = useCallback((payload) => {
    if (!enabled || !TRACKED_EVENTS.has(payload?.event)) return;
    refreshAgents();
  }, [enabled, refreshAgents]);

  return {
    agents,
    agentError,
    isAgentLoading,
    isAgentAuthRequired,
    refreshAgents,
    handleSocketEvent,
  };
}
