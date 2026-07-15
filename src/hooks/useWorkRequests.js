import { useCallback, useEffect, useMemo, useState } from 'react';

const REQUEST_RENDER_LIMIT = 60;

function toApiOrigin(wsUrl) {
  try {
    const parsedWsUrl = new URL(wsUrl);
    const protocol = parsedWsUrl.protocol === 'wss:' ? 'https:' : 'http:';
    return `${protocol}//${parsedWsUrl.host}`;
  } catch {
    return '';
  }
}

function sanitizeText(value, maxLength = 200) {
  if (typeof value !== 'string') return null;
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (!normalized) return null;
  return normalized.slice(0, maxLength);
}

function normalizeRequest(item = {}) {
  const timestamp = item.updatedAt || item.createdAt || new Date().toISOString();
  return {
    workRequestId: sanitizeText(item.workRequestId, 80) || `wrk_local_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    projectId: sanitizeText(item.projectId, 64) || 'runtime_default',
    laneIndex: Number.isInteger(item.laneIndex) ? item.laneIndex : null,
    requestedBy: sanitizeText(item.requestedBy, 64) || 'operator',
    preferredAgent: sanitizeText(item.preferredAgent, 64) || 'openclaw',
    title: sanitizeText(item.title, 120) || '제목 없는 작업 요청',
    goal: sanitizeText(item.goal, 1000) || '',
    constraints: Array.isArray(item.constraints) ? item.constraints.map((c) => sanitizeText(c, 240)).filter(Boolean) : [],
    acceptanceCriteria: Array.isArray(item.acceptanceCriteria) ? item.acceptanceCriteria.map((c) => sanitizeText(c, 240)).filter(Boolean) : [],
    priority: sanitizeText(item.priority, 16) || 'normal',
    targetBranch: sanitizeText(item.targetBranch, 200) || 'main',
    workflowState: sanitizeText(item.workflowState, 32) || 'submitted',
    createdAt: item.createdAt || timestamp,
    updatedAt: timestamp,
  };
}

function sortRequestsDesc(items) {
  return items
    .slice()
    .sort((a, b) => Date.parse(b.createdAt || 0) - Date.parse(a.createdAt || 0));
}

export default function useWorkRequests({ wsUrl, selectedRequestId, onSelectedRequestChange }) {
  const [isWorkflowEnabled, setIsWorkflowEnabled] = useState(null);
  const [requests, setRequests] = useState([]);
  const [requestError, setRequestError] = useState('');
  const [isRequestListLoading, setIsRequestListLoading] = useState(false);
  const [isSubmittingRequest, setIsSubmittingRequest] = useState(false);

  const apiOrigin = useMemo(() => toApiOrigin(wsUrl), [wsUrl]);
  const apiBase = useMemo(() => `${apiOrigin}/api/work-requests`, [apiOrigin]);

  const upsertRequest = useCallback((item) => {
    const normalized = normalizeRequest(item);
    setRequests((prev) => sortRequestsDesc([
      normalized,
      ...prev.filter((request) => request.workRequestId !== normalized.workRequestId),
    ]).slice(0, REQUEST_RENDER_LIMIT));
    return normalized;
  }, []);

  const refreshRequests = useCallback(() => {
    const controller = new AbortController();
    setIsRequestListLoading(true);
    fetch(`${apiBase}?limit=${REQUEST_RENDER_LIMIT}`, { method: 'GET', signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(`work_requests_fetch_failed_${res.status}`);
        const data = await res.json();
        const items = Array.isArray(data.items) ? data.items : [];
        setRequests(sortRequestsDesc(items.map((item) => normalizeRequest(item))).slice(0, REQUEST_RENDER_LIMIT));
        setRequestError('');
      })
      .catch((err) => {
        if (err?.name === 'AbortError') return;
        setRequestError('Work request API 연결 대기 중입니다.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsRequestListLoading(false);
      });
    return controller;
  }, [apiBase]);

  // Probe the feature flag via /health so the toggle stays hidden unless the
  // operator explicitly enabled MAESTRO_WORKFLOW_ENABLED on the server.
  useEffect(() => {
    const controller = new AbortController();
    fetch(`${apiOrigin}/health`, { method: 'GET', signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(`health_failed_${res.status}`);
        const data = await res.json();
        setIsWorkflowEnabled(data?.workflow?.enabled === true);
      })
      .catch((err) => {
        if (err?.name === 'AbortError') return;
        setIsWorkflowEnabled(false);
      });
    return () => controller.abort();
  }, [apiOrigin]);

  useEffect(() => {
    if (isWorkflowEnabled !== true) return undefined;
    const controller = refreshRequests();
    return () => controller.abort();
  }, [isWorkflowEnabled, refreshRequests]);

  const createRequest = useCallback(async (payload = {}) => {
    setIsSubmittingRequest(true);
    try {
      const response = await fetch(apiBase, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || `work_request_create_failed_${response.status}`);
      }
      const data = await response.json();
      if (data.item) {
        const normalized = upsertRequest(data.item);
        if (typeof onSelectedRequestChange === 'function') {
          onSelectedRequestChange(normalized.workRequestId);
        }
        setRequestError('');
        return normalized;
      }
      return null;
    } catch (err) {
      setRequestError(`작업 요청을 등록하지 못했습니다: ${err.message}`);
      return null;
    } finally {
      setIsSubmittingRequest(false);
    }
  }, [apiBase, onSelectedRequestChange, upsertRequest]);

  const decideRequest = useCallback(async (workRequestId, decision) => {
    if (!workRequestId || !decision) return false;
    try {
      const response = await fetch(`${apiBase}/${workRequestId}/decision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || `work_request_decision_failed_${response.status}`);
      }
      const data = await response.json();
      if (data.item) upsertRequest(data.item);
      setRequestError('');
      return true;
    } catch (err) {
      setRequestError(`결정을 저장하지 못했습니다: ${err.message}`);
      return false;
    }
  }, [apiBase, upsertRequest]);

  const handleSocketEvent = useCallback((payload) => {
    if (!payload?.event) return;
    if (payload.event === 'WORK_REQUEST_CREATED' || payload.event === 'WORK_REQUEST_DECIDED') {
      if (payload.item) upsertRequest(payload.item);
    }
  }, [upsertRequest]);

  return {
    isWorkflowEnabled,
    requests,
    selectedRequest: requests.find((request) => request.workRequestId === selectedRequestId) || null,
    requestError,
    isRequestListLoading,
    isSubmittingRequest,
    refreshRequests,
    createRequest,
    decideRequest,
    handleSocketEvent,
  };
}
