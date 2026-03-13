import { useCallback, useEffect, useRef, useState } from 'react';
import { getStoredString, setStoredValue } from '../utils/storage.js';
import { SERVER_API_TOKEN_STORAGE_KEY } from '../constants/ops.js';

const AUTO_APPROVE_EVENTS_LIMIT = 20;
const AUTO_APPROVE_POLL_INTERVAL_MS = 15000;
const AUTO_APPROVE_REFRESH_DEBOUNCE_MS = 450;

const TRACKED_EVENTS = new Set([
  'AGENT_TASK_READY',
  'MERGE_SUCCESS',
  'MERGE_FAILED',
  'AUTO_APPROVE_SKIPPED',
  'AGENT_RESTARTED',
]);

const EMPTY_STATUS = {
  config: {
    enabled: false,
    dryRun: false,
    requireExplicit: false,
    cooldownMs: 0,
    maxDescriptionLength: 0,
    branchPrefix: '',
    trustedAgents: [],
    trustedAgentsCount: 0,
  },
  runtime: {
    inFlightCount: 0,
    trackedRequestCount: 0,
    requestStateSummary: {
      ready: 0,
      approving: 0,
      merged: 0,
      rejected: 0,
    },
    lastAutoApproveAt: null,
    autoApproveEventCount: 0,
  },
  recentEvents: [],
  count: 0,
};

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

function normalizeText(value, fallback = null) {
  if (typeof value !== 'string') return fallback;
  const normalized = value.trim();
  return normalized || fallback;
}

function normalizeCount(value, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return Math.trunc(parsed);
}

function normalizeAutoApproveEvent(item = {}) {
  return {
    id: normalizeText(item.id, `auto_evt_local_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`),
    timestamp: normalizeText(item.timestamp),
    phase: normalizeText(item.phase, 'policy'),
    requestId: normalizeText(item.requestId),
    agentId: normalizeText(item.agentId),
    projectId: normalizeText(item.projectId),
    branchName: normalizeText(item.branchName),
    decision: normalizeText(item.decision, 'BLOCKED'),
    reason: normalizeText(item.reason, 'UNKNOWN_REASON'),
    retryAfterMs: Number.isFinite(Number(item.retryAfterMs)) ? Math.max(0, Number(item.retryAfterMs)) : null,
    dryRun: item.dryRun === true,
  };
}

function normalizeAutoApproveStatus(body = {}) {
  const config = body.config || {};
  const runtime = body.runtime || {};
  const trustedAgents = Array.isArray(config.trustedAgents)
    ? config.trustedAgents
      .map((agentId) => normalizeText(agentId))
      .filter(Boolean)
    : [];

  return {
    config: {
      enabled: config.enabled === true,
      dryRun: config.dryRun === true,
      requireExplicit: config.requireExplicit === true,
      cooldownMs: normalizeCount(config.cooldownMs),
      maxDescriptionLength: normalizeCount(config.maxDescriptionLength),
      branchPrefix: normalizeText(config.branchPrefix, ''),
      trustedAgents,
      trustedAgentsCount: normalizeCount(config.trustedAgentsCount, trustedAgents.length),
    },
    runtime: {
      inFlightCount: normalizeCount(runtime.inFlightCount),
      trackedRequestCount: normalizeCount(runtime.trackedRequestCount),
      requestStateSummary: {
        ready: normalizeCount(runtime.requestStateSummary?.ready),
        approving: normalizeCount(runtime.requestStateSummary?.approving),
        merged: normalizeCount(runtime.requestStateSummary?.merged),
        rejected: normalizeCount(runtime.requestStateSummary?.rejected),
      },
      lastAutoApproveAt: normalizeText(runtime.lastAutoApproveAt),
      autoApproveEventCount: normalizeCount(runtime.autoApproveEventCount),
    },
    recentEvents: Array.isArray(body.recentEvents) ? body.recentEvents.map((item) => normalizeAutoApproveEvent(item)) : [],
    count: normalizeCount(body.count, Array.isArray(body.recentEvents) ? body.recentEvents.length : 0),
  };
}

export default function useAutoApproveOps({ wsUrl }) {
  const [autoApproveStatus, setAutoApproveStatus] = useState(EMPTY_STATUS);
  const [autoApproveEvents, setAutoApproveEvents] = useState([]);
  const [autoApproveError, setAutoApproveError] = useState('');
  const [isAutoApproveLoading, setIsAutoApproveLoading] = useState(false);
  const [isAutoApprovePanelOpen, setIsAutoApprovePanelOpen] = useState(false);
  const [autoApproveDecisionFilter, setAutoApproveDecisionFilter] = useState('all');
  const [autoApproveApiToken, setAutoApproveApiToken] = useState(() => getStoredString(SERVER_API_TOKEN_STORAGE_KEY, ''));
  const [autoApproveTokenInput, setAutoApproveTokenInput] = useState(() => getStoredString(SERVER_API_TOKEN_STORAGE_KEY, ''));
  const [isAutoApproveAuthRequired, setIsAutoApproveAuthRequired] = useState(false);
  const [lastAutoApproveUpdatedAt, setLastAutoApproveUpdatedAt] = useState(null);

  const refreshTimerRef = useRef(null);
  const mountedRef = useRef(true);

  const refreshAutoApproveData = useCallback(async () => {
    const statusUrl = new URL(toApiUrl(wsUrl, '/api/auto-approve/status'), window.location.origin);
    statusUrl.searchParams.set('eventsLimit', String(AUTO_APPROVE_EVENTS_LIMIT));

    const eventsUrl = new URL(toApiUrl(wsUrl, '/api/auto-approve/events'), window.location.origin);
    eventsUrl.searchParams.set('limit', String(AUTO_APPROVE_EVENTS_LIMIT));
    if (autoApproveDecisionFilter !== 'all') {
      eventsUrl.searchParams.set('decision', autoApproveDecisionFilter);
    }

    setIsAutoApproveLoading(true);

    try {
      const headers = buildAuthHeaders(autoApproveApiToken);
      const [statusRes, eventsRes] = await Promise.all([
        fetch(statusUrl.toString(), {
          method: 'GET',
          headers,
        }),
        fetch(eventsUrl.toString(), {
          method: 'GET',
          headers,
        }),
      ]);

      if (statusRes.status === 401 || eventsRes.status === 401) {
        if (!mountedRef.current) return;
        setIsAutoApproveAuthRequired(true);
        setAutoApproveError('자동승인 운영 API 인증이 필요합니다. 서버 토큰을 입력해주세요.');
        return;
      }

      if (!statusRes.ok) throw new Error(`auto_approve_status_failed_${statusRes.status}`);
      if (!eventsRes.ok) throw new Error(`auto_approve_events_failed_${eventsRes.status}`);

      const [statusBody, eventsBody] = await Promise.all([
        statusRes.json(),
        eventsRes.json(),
      ]);

      if (!mountedRef.current) return;

      const normalizedStatus = normalizeAutoApproveStatus(statusBody);
      setAutoApproveStatus(normalizedStatus);
      setAutoApproveEvents(
        Array.isArray(eventsBody.items)
          ? eventsBody.items.map((item) => normalizeAutoApproveEvent(item))
          : normalizedStatus.recentEvents,
      );
      setAutoApproveError('');
      setIsAutoApproveAuthRequired(false);
      setLastAutoApproveUpdatedAt(new Date().toISOString());
    } catch {
      if (!mountedRef.current) return;
      setAutoApproveError('자동승인 운영 API에 연결하지 못했습니다.');
    } finally {
      if (mountedRef.current) {
        setIsAutoApproveLoading(false);
      }
    }
  }, [wsUrl, autoApproveApiToken, autoApproveDecisionFilter]);

  useEffect(() => {
    if (!isAutoApprovePanelOpen) return undefined;

    refreshAutoApproveData();
    const intervalId = setInterval(() => {
      refreshAutoApproveData();
    }, AUTO_APPROVE_POLL_INTERVAL_MS);

    return () => clearInterval(intervalId);
  }, [isAutoApprovePanelOpen, refreshAutoApproveData]);

  useEffect(() => () => {
    mountedRef.current = false;
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
    }
  }, []);

  const handleSocketEvent = useCallback((payload) => {
    if (!isAutoApprovePanelOpen || !TRACKED_EVENTS.has(payload?.event)) return;

    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
    }

    refreshTimerRef.current = setTimeout(() => {
      refreshAutoApproveData();
    }, AUTO_APPROVE_REFRESH_DEBOUNCE_MS);
  }, [isAutoApprovePanelOpen, refreshAutoApproveData]);

  const saveAutoApproveToken = useCallback(() => {
    const normalizedToken = autoApproveTokenInput.trim();
    setStoredValue(SERVER_API_TOKEN_STORAGE_KEY, normalizedToken);
    setAutoApproveApiToken(normalizedToken);
    setAutoApproveTokenInput(normalizedToken);
  }, [autoApproveTokenInput]);

  const clearAutoApproveToken = useCallback(() => {
    setStoredValue(SERVER_API_TOKEN_STORAGE_KEY, '');
    setAutoApproveApiToken('');
    setAutoApproveTokenInput('');
  }, []);

  return {
    autoApproveStatus,
    autoApproveEvents,
    autoApproveError,
    isAutoApproveLoading,
    isAutoApprovePanelOpen,
    setIsAutoApprovePanelOpen,
    autoApproveDecisionFilter,
    setAutoApproveDecisionFilter,
    autoApproveTokenInput,
    setAutoApproveTokenInput,
    saveAutoApproveToken,
    clearAutoApproveToken,
    isAutoApproveAuthRequired,
    hasAutoApproveApiToken: autoApproveApiToken.length > 0,
    lastAutoApproveUpdatedAt,
    refreshAutoApproveData,
    handleSocketEvent,
  };
}
