import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeftToLine, ArrowRightToLine, Command, MessagesSquare, ShieldCheck, TerminalSquare, X } from 'lucide-react';

const PANEL_ID = 'work-console-panel';
const PANEL_TITLE_ID = 'work-console-panel-title';
const PANEL_SUMMARY_ID = 'work-console-panel-summary';

function formatTimestamp(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

function getSessionStatusClass(status) {
  if (status === 'active') return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100';
  if (status === 'blocked') return 'border-amber-500/30 bg-amber-500/10 text-amber-100';
  if (status === 'completed') return 'border-cyan-500/30 bg-cyan-500/10 text-cyan-100';
  if (status === 'failed') return 'border-red-500/30 bg-red-500/10 text-red-100';
  if (status === 'cancelled') return 'border-gray-600 bg-gray-800/80 text-gray-200';
  return 'border-gray-700 bg-gray-900/70 text-gray-300';
}

function getAgentStatusClass(status) {
  if (status === 'connected') return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100';
  if (status === 'registered') return 'border-cyan-500/30 bg-cyan-500/10 text-cyan-100';
  if (status === 'stale') return 'border-amber-500/30 bg-amber-500/10 text-amber-100';
  return 'border-gray-700 bg-gray-900/70 text-gray-300';
}

function getMessageTone(role, kind) {
  if (kind === 'command_result') return 'border-cyan-500/20 bg-cyan-500/5';
  if (kind === 'status') return 'border-amber-500/20 bg-amber-500/5';
  if (role === 'operator') return 'border-cyan-500/20 bg-cyan-500/5';
  if (role === 'agent') return 'border-emerald-500/20 bg-emerald-500/5';
  return 'border-gray-700 bg-gray-950/70';
}

export default function WorkConsolePanel({
  isOpen,
  dockSide,
  sessions,
  selectedSessionId,
  selectedSession,
  messages,
  isSessionListLoading,
  isSessionDetailLoading,
  isSubmittingMessage,
  sessionError,
  onSelectSession,
  onCreateSession,
  onSubmitMessage,
  onCloseSession,
  onClose,
  onMoveLeft,
  onMoveRight,
  agents = [],
  isAgentLoading = false,
  agentError = '',
  isAgentAuthRequired = false,
}) {
  const closeButtonRef = useRef(null);
  const [composerValue, setComposerValue] = useState('');

  useEffect(() => {
    if (isOpen) {
      closeButtonRef.current?.focus();
    }
  }, [isOpen]);

  const panelSummary = useMemo(() => {
    if (selectedSession) {
      return `현재 세션 ${selectedSession.title}, 상태 ${selectedSession.status}, 메시지 ${messages.length}개가 표시됩니다.`;
    }
    if (sessions.length > 0) {
      return `열린 세션 ${sessions.length}개 중 세션을 선택할 수 있습니다.`;
    }
    return '아직 열린 작업 세션이 없습니다.';
  }, [messages.length, selectedSession, sessions.length]);

  const handleCreateSession = async () => {
    try {
      await onCreateSession?.('새 작업 세션');
    } catch {
      // noop: hook owns error state
    }
  };

  const handleSubmit = async () => {
    const normalizedValue = composerValue.trim();
    if (!normalizedValue) return;
    const didSubmit = await onSubmitMessage?.(normalizedValue);
    if (didSubmit) {
      setComposerValue('');
    }
  };

  return (
    <aside
      id={PANEL_ID}
      data-testid="work-console-panel"
      role="dialog"
      aria-modal="false"
      aria-labelledby={PANEL_TITLE_ID}
      aria-describedby={PANEL_SUMMARY_ID}
      aria-hidden={!isOpen}
      tabIndex={-1}
      className={`fixed bottom-16 left-3 right-3 top-[17rem] z-[45] transition-all duration-200 sm:bottom-4 sm:top-44 sm:w-[440px] ${
        dockSide === 'left'
          ? 'sm:left-4 sm:right-auto'
          : 'sm:left-auto sm:right-4'
      } ${
        isOpen
          ? 'pointer-events-auto opacity-100 translate-y-0'
          : dockSide === 'left'
            ? 'pointer-events-none opacity-0 translate-y-2 sm:-translate-x-4'
            : 'pointer-events-none opacity-0 translate-y-2 sm:translate-x-4'
      }`}
    >
      <div className="flex h-full flex-col overflow-hidden rounded-[1.5rem] border border-cyan-500/20 bg-slate-950 shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur-md">
        <div className="border-b border-gray-800/80 px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[10px] uppercase tracking-[0.28em] text-cyan-300/70">VU-001</div>
              <div id={PANEL_TITLE_ID} className="mt-1 text-sm font-semibold text-white">Work Console</div>
              <div className="mt-1 flex items-center gap-2 text-[11px] text-gray-400">
                <span className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2 py-0.5 text-cyan-100">
                  session core
                </span>
                <span className="rounded-full border border-gray-700 px-2 py-0.5 text-gray-300">
                  dock {dockSide}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={onMoveLeft}
                aria-label="Work Console 왼쪽으로 이동"
                className={`rounded-md border p-1.5 text-gray-300 transition-colors hover:text-white ${
                  dockSide === 'left'
                    ? 'border-cyan-400/60 bg-cyan-500/20 text-cyan-100'
                    : 'border-gray-700 hover:border-cyan-400/40'
                }`}
              >
                <ArrowLeftToLine className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={onMoveRight}
                aria-label="Work Console 오른쪽으로 이동"
                className={`rounded-md border p-1.5 text-gray-300 transition-colors hover:text-white ${
                  dockSide === 'right'
                    ? 'border-cyan-400/60 bg-cyan-500/20 text-cyan-100'
                    : 'border-gray-700 hover:border-cyan-400/40'
                }`}
              >
                <ArrowRightToLine className="h-3.5 w-3.5" />
              </button>
              <button
                ref={closeButtonRef}
                type="button"
                onClick={onClose}
                aria-label="Work Console 닫기"
                className="rounded-md border border-gray-700 p-1.5 text-gray-300 transition-colors hover:border-gray-500 hover:text-white"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
          <p id={PANEL_SUMMARY_ID} className="mt-3 max-w-[38ch] text-[11px] leading-5 text-gray-400">
            {panelSummary}
          </p>
        </div>

        <section className="border-b border-gray-800/80 px-3 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-gray-200">
              <ShieldCheck className="h-4 w-4 text-emerald-300" />
              Agent Trust
            </div>
            <span className="rounded-full border border-gray-700 bg-gray-950/70 px-2 py-0.5 text-[10px] text-gray-300">
              {agents.length} agents
            </span>
          </div>

          {isAgentAuthRequired ? (
            <div className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-100">
              Agent Registry API 인증이 필요합니다.
            </div>
          ) : agentError ? (
            <div className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-100">
              {agentError}
            </div>
          ) : isAgentLoading && agents.length === 0 ? (
            <div className="mt-3 rounded-xl border border-dashed border-gray-700 bg-gray-950/70 p-3 text-[11px] text-gray-400">
              Agent Registry를 불러오는 중입니다.
            </div>
          ) : agents.length === 0 ? (
            <div className="mt-3 rounded-xl border border-dashed border-gray-700 bg-gray-950/70 p-3 text-[11px] text-gray-400">
              연결된 agent가 없습니다.
            </div>
          ) : (
            <div className="mt-3 grid gap-2">
              {agents.slice(0, 3).map((agent) => (
                <article
                  key={agent.agentId}
                  className="rounded-xl border border-gray-800 bg-gray-950 px-3 py-2"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-[11px] font-semibold text-white">
                        {agent.displayName || agent.agentId}
                      </div>
                      <div className="mt-0.5 truncate text-[10px] text-gray-500">{agent.agentId}</div>
                    </div>
                    <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] ${getAgentStatusClass(agent.status)}`}>
                      {agent.status || 'registered'}
                    </span>
                  </div>

                  <div className="mt-2 grid gap-1 text-[10px] text-gray-400 sm:grid-cols-3">
                    <span className="truncate">heartbeat {formatTimestamp(agent.lastHeartbeatAt)}</span>
                    <span className="truncate">
                      <span>request </span>
                      <span>{agent.lastRequest?.status || '-'}</span>
                    </span>
                    <span className="truncate">
                      <span>decision </span>
                      <span>{agent.lastDecision?.deliveryStatus || '-'}</span>
                    </span>
                  </div>
                  {(agent.lastRequest?.branchName || agent.lastDecision?.executorAction) && (
                    <div className="mt-1 grid gap-1 text-[10px] text-gray-500 sm:flex sm:flex-wrap sm:items-center sm:gap-x-3 sm:gap-y-1">
                      {agent.lastRequest?.branchName && <span className="min-w-0 truncate">branch {agent.lastRequest.branchName}</span>}
                      {agent.lastDecision?.executorAction && <span className="shrink-0">executor {agent.lastDecision.executorAction}</span>}
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>

        <div className="grid min-h-0 flex-1 gap-3 p-3 lg:grid-cols-[168px_minmax(0,1fr)]">
          <section className="min-h-[160px] rounded-2xl border border-gray-800 bg-gray-950/90 p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-gray-200">
                <MessagesSquare className="h-4 w-4 text-cyan-300" />
                Sessions
              </div>
              <button
                type="button"
                onClick={handleCreateSession}
                className="rounded-md border border-cyan-500/30 bg-cyan-500/10 px-2 py-1 text-[11px] font-medium text-cyan-100 hover:bg-cyan-500/15"
              >
                새 작업 시작
              </button>
            </div>

            {sessionError && (
              <div className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-100">
                {sessionError}
              </div>
            )}

            {isSessionListLoading ? (
              <div className="mt-3 rounded-xl border border-dashed border-gray-700 bg-gray-950/70 p-3 text-[11px] text-gray-400">
                세션 목록을 불러오는 중입니다.
              </div>
            ) : sessions.length === 0 ? (
              <div className="mt-3 rounded-xl border border-dashed border-gray-700 bg-gray-950/70 p-3">
                <div className="text-[11px] text-gray-200">아직 열린 작업 세션이 없습니다.</div>
                <p className="mt-2 text-[10px] leading-4 text-gray-500">
                  첫 세션을 만들면 여기에서 상태, 프로젝트, 마지막 활동 시각을 관리합니다.
                </p>
              </div>
            ) : (
              <div className="mt-3 space-y-2">
                {sessions.map((session) => (
                  <button
                    key={session.workSessionId}
                    type="button"
                    onClick={() => onSelectSession?.(session.workSessionId)}
                    className={`w-full rounded-xl border px-3 py-2 text-left transition-colors ${
                      session.workSessionId === selectedSessionId
                        ? 'border-cyan-400/50 bg-cyan-500/10'
                        : 'border-gray-800 bg-gray-950/70 hover:border-gray-700'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="truncate text-[11px] font-semibold text-white">{session.title}</div>
                      <span className={`rounded-full border px-1.5 py-0.5 text-[10px] ${getSessionStatusClass(session.status)}`}>
                        {session.status}
                      </span>
                    </div>
                    <div className="mt-1 truncate text-[10px] text-gray-400">{session.projectId}</div>
                    <div className="mt-1 text-[10px] text-gray-500">
                      updated {formatTimestamp(session.lastMessageAt || session.updatedAt)}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </section>

          <section className="flex min-h-0 flex-col rounded-2xl border border-gray-800 bg-gradient-to-b from-gray-950 via-slate-950 to-gray-950">
            <div className="border-b border-gray-800 px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.2em] text-gray-500">Current Session</div>
                  <div className="mt-1 text-sm font-semibold text-white">
                    {selectedSession ? selectedSession.title : '세션을 선택하면 대화와 명령 결과가 여기에 표시됩니다.'}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {selectedSession && (
                    <button
                      type="button"
                      onClick={() => { void onCloseSession?.(); }}
                      disabled={selectedSession.status === 'completed' || selectedSession.status === 'cancelled' || isSubmittingMessage}
                      className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[10px] font-semibold text-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Close Session
                    </button>
                  )}
                  <span className={`rounded-full border px-2 py-0.5 text-[10px] ${getSessionStatusClass(selectedSession?.status)}`}>
                    {selectedSession?.status || 'idle'}
                  </span>
                </div>
              </div>
            </div>

            <div className="min-h-0 flex-1 space-y-3 overflow-auto px-4 py-4">
              {isSessionDetailLoading ? (
                <div className="rounded-2xl border border-dashed border-gray-700/80 bg-gray-950/60 p-4">
                  <div className="flex items-center gap-2 text-xs font-semibold text-gray-200">
                    <TerminalSquare className="h-4 w-4 text-cyan-300" />
                    Timeline Loading
                  </div>
                  <p className="mt-2 text-[11px] leading-5 text-gray-400">
                    선택한 Work session 상세를 불러오는 중입니다.
                  </p>
                </div>
              ) : !selectedSession ? (
                <div className="rounded-2xl border border-dashed border-gray-700/80 bg-gray-950/60 p-4">
                  <div className="flex items-center gap-2 text-xs font-semibold text-gray-200">
                    <TerminalSquare className="h-4 w-4 text-cyan-300" />
                    Timeline
                  </div>
                  <p className="mt-2 text-[11px] leading-5 text-gray-400">
                    세션을 선택하면 message, command, command result, status 이벤트가 시간순으로 표시됩니다.
                  </p>
                </div>
              ) : messages.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-gray-700/80 bg-gray-950/60 p-4 text-[11px] text-gray-400">
                  아직 표시할 세션 메시지가 없습니다.
                </div>
              ) : (
                messages.map((message) => (
                  <article
                    key={message.workMessageId}
                    className={`rounded-2xl border p-4 ${getMessageTone(message.role, message.kind)}`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-[10px] uppercase tracking-[0.22em] text-gray-400">
                        {message.role} / {message.kind}
                      </div>
                      <div className="text-[10px] text-gray-500">{formatTimestamp(message.createdAt)}</div>
                    </div>
                    <p className="mt-2 whitespace-pre-wrap text-sm text-gray-100">{message.body}</p>
                    {(message.command || message.status) && (
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] text-gray-400">
                        {message.command && <span>cmd {message.command}</span>}
                        {message.status && <span>status {message.status}</span>}
                      </div>
                    )}
                  </article>
                ))
              )}
            </div>

            <div className="border-t border-gray-800 px-4 py-3">
              <label htmlFor="work-console-input" className="flex items-center gap-2 text-[11px] font-semibold text-gray-300">
                <Command className="h-3.5 w-3.5 text-cyan-300" />
                Session Input
              </label>
              <textarea
                id="work-console-input"
                aria-label="Work Console 명령 입력"
                rows={3}
                value={composerValue}
                disabled={!selectedSession || isSubmittingMessage}
                onChange={(event) => setComposerValue(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    void handleSubmit();
                  }
                }}
                placeholder={selectedSession ? '/status 또는 일반 메시지를 입력하세요' : '세션을 먼저 선택하거나 새 작업을 시작하세요'}
                className="mt-2 w-full resize-none rounded-xl border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-gray-200 outline-none placeholder:text-gray-500 disabled:opacity-60"
              />
              <div className="mt-2 flex items-center justify-between gap-3">
                <p className="text-[10px] text-gray-500">
                  Enter 전송, Shift+Enter 줄바꿈
                </p>
                <button
                  type="button"
                  onClick={() => { void handleSubmit(); }}
                  disabled={!selectedSession || !composerValue.trim() || isSubmittingMessage}
                  className="rounded-md border border-cyan-500/30 bg-cyan-500/10 px-3 py-1.5 text-[11px] font-semibold text-cyan-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isSubmittingMessage ? 'Sending...' : 'Send'}
                </button>
              </div>
            </div>
          </section>
        </div>
      </div>
    </aside>
  );
}
