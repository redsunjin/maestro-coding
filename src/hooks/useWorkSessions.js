import { useCallback, useEffect, useMemo, useState } from 'react';

const SESSION_RENDER_LIMIT = 80;
const MESSAGE_RENDER_LIMIT = 120;

function toWorkSessionsApiBase(wsUrl) {
  try {
    const parsedWsUrl = new URL(wsUrl);
    const protocol = parsedWsUrl.protocol === 'wss:' ? 'https:' : 'http:';
    return `${protocol}//${parsedWsUrl.host}/api/work-sessions`;
  } catch {
    return '/api/work-sessions';
  }
}

function sanitizeText(value, maxLength = 200) {
  if (typeof value !== 'string') return null;
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (!normalized) return null;
  return normalized.slice(0, maxLength);
}

function normalizeSession(item = {}) {
  const timestamp = item.updatedAt || item.createdAt || new Date().toISOString();
  return {
    workSessionId: sanitizeText(item.workSessionId, 80) || `wsn_local_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    projectId: sanitizeText(item.projectId, 64) || 'runtime_default',
    title: sanitizeText(item.title, 120) || '새 작업 세션',
    status: sanitizeText(item.status, 32) || 'active',
    agentId: sanitizeText(item.agentId, 64) || 'openclaw',
    source: sanitizeText(item.source, 32) || 'api',
    createdAt: item.createdAt || timestamp,
    updatedAt: timestamp,
    lastMessageAt: item.lastMessageAt || null,
    pendingOperatorDecision: item.pendingOperatorDecision === true,
    metadata: item.metadata && typeof item.metadata === 'object' ? item.metadata : {},
  };
}

function normalizeMessage(item = {}) {
  const timestamp = item.createdAt || new Date().toISOString();
  return {
    workMessageId: sanitizeText(item.workMessageId, 80) || `wmsg_local_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    workSessionId: sanitizeText(item.workSessionId, 80) || null,
    role: sanitizeText(item.role, 32) || 'system',
    kind: sanitizeText(item.kind, 32) || 'message',
    body: sanitizeText(item.body, 500) || '',
    command: sanitizeText(item.command, 80),
    status: sanitizeText(item.status, 32),
    createdAt: timestamp,
  };
}

function sortSessionsDesc(items) {
  return items
    .slice()
    .sort((a, b) => Date.parse(b.updatedAt || 0) - Date.parse(a.updatedAt || 0));
}

function sortMessagesAsc(items) {
  return items
    .slice()
    .sort((a, b) => Date.parse(a.createdAt || 0) - Date.parse(b.createdAt || 0));
}

export default function useWorkSessions({
  wsUrl,
  selectedSessionId,
  onSelectedSessionChange,
}) {
  const [sessions, setSessions] = useState([]);
  const [messagesBySession, setMessagesBySession] = useState({});
  const [sessionError, setSessionError] = useState('');
  const [isSessionListLoading, setIsSessionListLoading] = useState(false);
  const [isSessionDetailLoading, setIsSessionDetailLoading] = useState(false);
  const [isSubmittingMessage, setIsSubmittingMessage] = useState(false);

  const apiBase = useMemo(() => toWorkSessionsApiBase(wsUrl), [wsUrl]);

  const upsertSession = useCallback((item) => {
    const normalized = normalizeSession(item);
    setSessions((prev) => sortSessionsDesc([
      normalized,
      ...prev.filter((session) => session.workSessionId !== normalized.workSessionId),
    ]).slice(0, SESSION_RENDER_LIMIT));
    return normalized;
  }, []);

  const appendMessage = useCallback((item) => {
    const normalized = normalizeMessage(item);
    if (!normalized.workSessionId || !normalized.body) return normalized;

    setMessagesBySession((prev) => {
      const current = prev[normalized.workSessionId] || [];
      const nextItems = sortMessagesAsc([
        ...current.filter((message) => message.workMessageId !== normalized.workMessageId),
        normalized,
      ]).slice(-MESSAGE_RENDER_LIMIT);
      return {
        ...prev,
        [normalized.workSessionId]: nextItems,
      };
    });

    return normalized;
  }, []);

  const refreshSessions = useCallback(() => {
    const controller = new AbortController();
    setIsSessionListLoading(true);
    fetch(`${apiBase}?limit=${SESSION_RENDER_LIMIT}`, {
      method: 'GET',
      signal: controller.signal,
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`work_sessions_fetch_failed_${res.status}`);
        const data = await res.json();
        const items = Array.isArray(data.items) ? data.items : [];
        const normalizedItems = sortSessionsDesc(items.map((item) => normalizeSession(item)));
        setSessions(normalizedItems.slice(0, SESSION_RENDER_LIMIT));
        setSessionError('');
      })
      .catch((err) => {
        if (err?.name === 'AbortError') return;
        setSessionError('Work session API 연결 대기 중입니다.');
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsSessionListLoading(false);
        }
      });
    return controller;
  }, [apiBase]);

  useEffect(() => {
    const controller = refreshSessions();
    return () => controller.abort();
  }, [refreshSessions]);

  useEffect(() => {
    if (selectedSessionId || sessions.length === 0 || typeof onSelectedSessionChange !== 'function') return;
    onSelectedSessionChange(sessions[0].workSessionId);
  }, [onSelectedSessionChange, selectedSessionId, sessions]);

  useEffect(() => {
    if (!selectedSessionId) return undefined;
    const controller = new AbortController();
    setIsSessionDetailLoading(true);
    fetch(`${apiBase}/${selectedSessionId}?messageLimit=${MESSAGE_RENDER_LIMIT}`, {
      method: 'GET',
      signal: controller.signal,
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`work_session_detail_failed_${res.status}`);
        const data = await res.json();
        if (data.item) {
          upsertSession(data.item);
        }
        const messages = Array.isArray(data.messages) ? data.messages.map((item) => normalizeMessage(item)) : [];
        setMessagesBySession((prev) => ({
          ...prev,
          [selectedSessionId]: sortMessagesAsc(messages).slice(-MESSAGE_RENDER_LIMIT),
        }));
      })
      .catch((err) => {
        if (err?.name === 'AbortError') return;
        setSessionError('선택한 Work session 상세를 불러오지 못했습니다.');
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsSessionDetailLoading(false);
        }
      });

    return () => controller.abort();
  }, [apiBase, selectedSessionId, upsertSession]);

  const createSession = useCallback(async (title = '새 작업 세션') => {
    const response = await fetch(apiBase, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title,
      }),
    });

    if (!response.ok) {
      throw new Error(`work_session_create_failed_${response.status}`);
    }

    const data = await response.json();
    if (data.item) {
      const normalized = upsertSession(data.item);
      const createdMessages = Array.isArray(data.messages) ? data.messages : [];
      createdMessages.forEach((message) => appendMessage(message));
      if (typeof onSelectedSessionChange === 'function') {
        onSelectedSessionChange(normalized.workSessionId);
      }
      return normalized;
    }

    return null;
  }, [apiBase, appendMessage, onSelectedSessionChange, upsertSession]);

  const submitMessage = useCallback(async (body) => {
    const normalizedBody = sanitizeText(body, 500);
    if (!selectedSessionId || !normalizedBody) return false;

    setIsSubmittingMessage(true);
    try {
      const response = await fetch(`${apiBase}/${selectedSessionId}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          body: normalizedBody,
        }),
      });
      if (!response.ok) {
        throw new Error(`work_session_message_failed_${response.status}`);
      }
      const data = await response.json();
      if (data.item) {
        upsertSession(data.item);
      }
      const createdMessages = Array.isArray(data.messages) ? data.messages : [];
      createdMessages.forEach((message) => appendMessage(message));
      setSessionError('');
      return true;
    } catch {
      setSessionError('메시지를 Work session에 저장하지 못했습니다.');
      return false;
    } finally {
      setIsSubmittingMessage(false);
    }
  }, [apiBase, appendMessage, selectedSessionId, upsertSession]);

  const handleSocketEvent = useCallback((payload) => {
    if (!payload?.event) return;

    if (payload.session) {
      upsertSession(payload.session);
    }

    if (payload.message) {
      appendMessage(payload.message);
    }

    if (payload.event === 'WORK_SESSION_CREATED' && !selectedSessionId && payload.session && typeof onSelectedSessionChange === 'function') {
      onSelectedSessionChange(payload.session.workSessionId);
    }
  }, [appendMessage, onSelectedSessionChange, selectedSessionId, upsertSession]);

  return {
    sessions,
    selectedSession: sessions.find((session) => session.workSessionId === selectedSessionId) || null,
    selectedSessionMessages: selectedSessionId ? (messagesBySession[selectedSessionId] || []) : [],
    sessionError,
    isSessionListLoading,
    isSessionDetailLoading,
    isSubmittingMessage,
    refreshSessions,
    createSession,
    submitMessage,
    handleSocketEvent,
  };
}
