import { useCallback, useEffect, useMemo, useState } from 'react';

const LOCAL_HISTORY_LIMIT = 300;
const RENDER_BATCH_SIZE = 40;

function toHistoryApiUrl(wsUrl) {
  try {
    const parsedWsUrl = new URL(wsUrl);
    const protocol = parsedWsUrl.protocol === 'wss:' ? 'https:' : 'http:';
    return `${protocol}//${parsedWsUrl.host}/api/history`;
  } catch {
    return '/api/history';
  }
}

function sanitizeText(value, maxLength = 120) {
  if (typeof value !== 'string') return null;
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (!normalized) return null;
  return normalized.slice(0, maxLength);
}

function normalizeLaneIndex(value) {
  const laneIndex = Number(value);
  if (!Number.isInteger(laneIndex) || laneIndex < 1 || laneIndex > 4) return null;
  return laneIndex;
}

function normalizeHistoryItem(item = {}) {
  const timestamp = item.timestamp || new Date().toISOString();
  return {
    id: sanitizeText(item.id, 120) || `hist_local_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    timestamp,
    requestId: sanitizeText(item.requestId, 80),
    projectId: sanitizeText(item.projectId, 64),
    laneIndex: normalizeLaneIndex(item.laneIndex),
    agentId: sanitizeText(item.agentId, 64),
    branchName: sanitizeText(item.branchName, 120),
    title: sanitizeText(item.title, 120),
    result: sanitizeText(item.result, 64) || 'REQUESTED',
    source: sanitizeText(item.source, 16) || 'system',
    reason: sanitizeText(item.reason, 64),
    autoApproved: item.autoApproved === true,
  };
}

function sortByTimestampDesc(items) {
  return items
    .slice()
    .sort((a, b) => Date.parse(b.timestamp || 0) - Date.parse(a.timestamp || 0));
}

export default function useApprovalHistory({ wsUrl }) {
  const [historyItems, setHistoryItems] = useState([]);
  const [historyError, setHistoryError] = useState('');
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [isHistoryPanelOpen, setIsHistoryPanelOpen] = useState(false);
  const [historyProjectFilter, setHistoryProjectFilter] = useState('all');
  const [historyResultFilter, setHistoryResultFilter] = useState('all');
  const [historySourceFilter, setHistorySourceFilter] = useState('all');
  const [historyVisibleCount, setHistoryVisibleCount] = useState(RENDER_BATCH_SIZE);

  const appendHistoryItem = useCallback((item) => {
    const normalized = normalizeHistoryItem(item);
    setHistoryItems((prev) => {
      const withoutDuplicate = prev.filter((entry) => entry.id !== normalized.id);
      return [normalized, ...withoutDuplicate].slice(0, LOCAL_HISTORY_LIMIT);
    });
  }, []);

  const handleSocketEvent = useCallback((payload) => {
    if (payload?.event !== 'HISTORY_APPEND' || !payload.item) return;
    appendHistoryItem(payload.item);
  }, [appendHistoryItem]);

  useEffect(() => {
    const controller = new AbortController();
    const apiUrl = toHistoryApiUrl(wsUrl);

    setIsHistoryLoading(true);
    fetch(`${apiUrl}?limit=${LOCAL_HISTORY_LIMIT}`, {
      method: 'GET',
      signal: controller.signal,
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`history_fetch_failed_${res.status}`);
        const data = await res.json();
        const items = Array.isArray(data.items) ? data.items : [];
        const normalizedItems = sortByTimestampDesc(items.map((item) => normalizeHistoryItem(item)));
        setHistoryItems(normalizedItems.slice(0, LOCAL_HISTORY_LIMIT));
        setHistoryError('');
      })
      .catch((err) => {
        if (err?.name === 'AbortError') return;
        setHistoryError('이력 API 연결 대기 중 (실시간 append는 정상 동작).');
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsHistoryLoading(false);
        }
      });

    return () => controller.abort();
  }, [wsUrl]);

  useEffect(() => {
    setHistoryVisibleCount(RENDER_BATCH_SIZE);
  }, [historyProjectFilter, historyResultFilter, historySourceFilter]);

  const filteredHistoryItems = useMemo(() => {
    return historyItems.filter((item) => {
      if (historyProjectFilter !== 'all' && item.projectId !== historyProjectFilter) return false;
      if (historyResultFilter !== 'all' && item.result !== historyResultFilter) return false;
      if (historySourceFilter !== 'all' && item.source !== historySourceFilter) return false;
      return true;
    });
  }, [historyItems, historyProjectFilter, historyResultFilter, historySourceFilter]);

  const visibleHistoryItems = useMemo(() => (
    filteredHistoryItems.slice(0, historyVisibleCount)
  ), [filteredHistoryItems, historyVisibleCount]);

  const hasMoreHistoryItems = filteredHistoryItems.length > visibleHistoryItems.length;

  const loadMoreHistory = useCallback(() => {
    setHistoryVisibleCount((current) => current + RENDER_BATCH_SIZE);
  }, []);

  return {
    historyItems,
    visibleHistoryItems,
    historyError,
    isHistoryLoading,
    isHistoryPanelOpen,
    setIsHistoryPanelOpen,
    historyProjectFilter,
    setHistoryProjectFilter,
    historyResultFilter,
    setHistoryResultFilter,
    historySourceFilter,
    setHistorySourceFilter,
    hasMoreHistoryItems,
    loadMoreHistory,
    filteredHistoryCount: filteredHistoryItems.length,
    handleSocketEvent,
  };
}
