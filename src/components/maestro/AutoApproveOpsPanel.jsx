import React, { useEffect, useMemo, useRef } from 'react';
import { KeyRound, RefreshCw, ShieldCheck, TriangleAlert, X } from 'lucide-react';

const DECISION_META = {
  ELIGIBLE: {
    label: 'Eligible',
    badgeClass: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200',
  },
  BLOCKED: {
    label: 'Blocked',
    badgeClass: 'border-red-500/40 bg-red-500/10 text-red-200',
  },
  EXECUTING: {
    label: 'Executing',
    badgeClass: 'border-blue-500/40 bg-blue-500/10 text-blue-200',
  },
  SKIPPED: {
    label: 'Skipped',
    badgeClass: 'border-yellow-500/40 bg-yellow-500/10 text-yellow-200',
  },
  MERGED: {
    label: 'Merged',
    badgeClass: 'border-green-500/40 bg-green-500/10 text-green-200',
  },
  FAILED: {
    label: 'Failed',
    badgeClass: 'border-rose-500/40 bg-rose-500/10 text-rose-200',
  },
};

const DECISION_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'ELIGIBLE', label: 'Eligible' },
  { value: 'BLOCKED', label: 'Blocked' },
  { value: 'EXECUTING', label: 'Executing' },
  { value: 'SKIPPED', label: 'Skipped' },
  { value: 'MERGED', label: 'Merged' },
  { value: 'FAILED', label: 'Failed' },
];

const PANEL_ID = 'auto-approve-ops-panel';
const PANEL_TITLE_ID = 'auto-approve-ops-title';
const PANEL_SUMMARY_ID = 'auto-approve-ops-summary';

function formatTimestamp(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('ko-KR', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

function formatDuration(ms) {
  if (!Number.isFinite(Number(ms)) || Number(ms) <= 0) return 'off';
  const seconds = Math.floor(Number(ms) / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}

function getDecisionMeta(decision) {
  return DECISION_META[decision] || {
    label: decision || 'Unknown',
    badgeClass: 'border-gray-500/40 bg-gray-500/10 text-gray-200',
  };
}

function SummaryStat({ label, value, hint, toneClass = 'text-white' }) {
  return (
    <div className="rounded-xl border border-gray-700/70 bg-gray-950/80 px-3 py-2">
      <div className="text-[10px] uppercase tracking-[0.18em] text-gray-500">{label}</div>
      <div className={`mt-1 text-lg font-semibold ${toneClass}`}>{value}</div>
      {hint && (
        <div className="mt-1 text-[10px] text-gray-400">{hint}</div>
      )}
    </div>
  );
}

export default function AutoApproveOpsPanel({
  isOpen,
  panelTopOffset = 92,
  onClose,
  statusData,
  events,
  isLoading,
  error,
  isAuthRequired,
  decisionFilter,
  onDecisionFilterChange,
  onRefresh,
  tokenInput,
  onTokenInputChange,
  onSaveToken,
  onClearToken,
  hasToken,
  lastUpdatedAt,
}) {
  const closeButtonRef = useRef(null);
  const modeLabel = statusData.config.enabled
    ? (statusData.config.dryRun ? 'Dry Run' : 'Enabled')
    : 'Disabled';
  const policyHint = [
    statusData.config.requireExplicit ? 'explicit required' : 'explicit optional',
    `cooldown ${formatDuration(statusData.config.cooldownMs)}`,
  ].join(' • ');
  const runtimeSummary = `${statusData.runtime.inFlightCount} in-flight, ${statusData.runtime.trackedRequestCount} tracked requests, ${statusData.runtime.autoApproveEventCount} logged events.`;
  const srSummary = useMemo(() => {
    if (isAuthRequired) {
      return '자동승인 운영 API 인증이 필요합니다. 토큰을 입력해야 상태와 이벤트를 볼 수 있습니다.';
    }
    return `자동승인 모드는 ${modeLabel} 입니다. ${runtimeSummary}`;
  }, [isAuthRequired, modeLabel, runtimeSummary]);

  useEffect(() => {
    if (isOpen) {
      closeButtonRef.current?.focus();
    }
  }, [isOpen]);

  return (
    <aside
      id={PANEL_ID}
      data-testid="auto-approve-panel"
      role="dialog"
      aria-modal="false"
      aria-labelledby={PANEL_TITLE_ID}
      aria-describedby={PANEL_SUMMARY_ID}
      aria-hidden={!isOpen}
      tabIndex={-1}
      className={`fixed z-40 transition-all duration-200 ${
        isOpen
          ? 'pointer-events-auto opacity-100 translate-y-0 sm:translate-x-0'
          : 'pointer-events-none opacity-0 translate-y-2 sm:-translate-x-4'
      } bottom-16 left-3 right-3 sm:bottom-auto sm:left-4 sm:right-auto sm:top-[var(--panel-top-offset)] sm:w-[396px]`}
      style={{ '--panel-top-offset': `${panelTopOffset}px` }}
    >
      <div className="rounded-2xl border border-gray-700/80 bg-gray-900/95 shadow-2xl backdrop-blur-md">
        <div className="flex items-center justify-between border-b border-gray-700/70 px-3 py-2">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-emerald-300" />
            <span id={PANEL_TITLE_ID} className="text-sm font-semibold text-white">Auto Approve Ops</span>
            <span className="rounded-full border border-gray-600 px-1.5 py-0.5 text-[10px] text-gray-300">
              {statusData.runtime.autoApproveEventCount}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={onRefresh}
              aria-label="자동승인 운영 데이터 새로고침"
              className="maestro-touch-control maestro-touch-control--compact rounded-md border border-gray-700 p-1 text-gray-300 hover:border-gray-500 hover:text-white"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
            <button
              ref={closeButtonRef}
              type="button"
              onClick={onClose}
              aria-label="자동승인 운영 패널 닫기"
              className="maestro-touch-control maestro-touch-control--compact rounded-md border border-gray-700 p-1 text-gray-300 hover:border-gray-500 hover:text-white"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        <p id={PANEL_SUMMARY_ID} className="sr-only">
          {srSummary}
        </p>

        <div aria-live="polite" className="sr-only">
          {srSummary}
        </div>

        <div className="max-h-[58vh] overflow-y-auto px-3 py-3">
          <div className="grid grid-cols-2 gap-2">
            <SummaryStat
              label="Mode"
              value={modeLabel}
              hint={policyHint}
              toneClass={
                statusData.config.enabled
                  ? (statusData.config.dryRun ? 'text-amber-200' : 'text-emerald-200')
                  : 'text-gray-200'
              }
            />
            <SummaryStat
              label="Trust"
              value={statusData.config.trustedAgentsCount > 0 ? `${statusData.config.trustedAgentsCount} agents` : 'all agents'}
              hint={statusData.config.branchPrefix ? `branch ${statusData.config.branchPrefix}` : 'branch unrestricted'}
              toneClass="text-cyan-100"
            />
            <SummaryStat
              label="Runtime"
              value={`${statusData.runtime.inFlightCount} / ${statusData.runtime.trackedRequestCount}`}
              hint="in-flight / tracked"
              toneClass="text-white"
            />
            <SummaryStat
              label="Last Merge"
              value={statusData.runtime.lastAutoApproveAt ? formatTimestamp(statusData.runtime.lastAutoApproveAt) : 'No merge yet'}
              hint={`max desc ${statusData.config.maxDescriptionLength || 0}`}
              toneClass="text-purple-100"
            />
          </div>

          <div className="mt-2 flex flex-wrap gap-1.5">
            {statusData.config.trustedAgents.map((agentId) => (
              <span
                key={agentId}
                className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2 py-0.5 text-[10px] text-cyan-100"
              >
                {agentId}
              </span>
            ))}
            <span className="rounded-full border border-gray-700 bg-gray-950/80 px-2 py-0.5 text-[10px] text-gray-300">
              ready {statusData.runtime.requestStateSummary.ready}
            </span>
            <span className="rounded-full border border-blue-500/30 bg-blue-500/10 px-2 py-0.5 text-[10px] text-blue-200">
              approving {statusData.runtime.requestStateSummary.approving}
            </span>
            <span className="rounded-full border border-green-500/30 bg-green-500/10 px-2 py-0.5 text-[10px] text-green-200">
              merged {statusData.runtime.requestStateSummary.merged}
            </span>
            <span className="rounded-full border border-orange-500/30 bg-orange-500/10 px-2 py-0.5 text-[10px] text-orange-200">
              rejected {statusData.runtime.requestStateSummary.rejected}
            </span>
            {lastUpdatedAt && (
              <span className="rounded-full border border-gray-700 bg-gray-950/80 px-2 py-0.5 text-[10px] text-gray-400">
                updated {formatTimestamp(lastUpdatedAt)}
              </span>
            )}
          </div>

          {(isAuthRequired || hasToken) && (
            <section className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-3">
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-200">
                <KeyRound className="h-3.5 w-3.5" />
                Ops Token
              </div>
              <p className="mt-1 text-[11px] text-amber-100/80">
                토큰 모드 서버에서는 상태/이벤트 조회에 `Bearer` 토큰이 필요합니다.
              </p>
              <label htmlFor="auto-approve-api-token" className="sr-only">운영 API 토큰</label>
              <input
                id="auto-approve-api-token"
                aria-label="운영 API 토큰"
                type="password"
                value={tokenInput}
                onChange={(event) => onTokenInputChange(event.target.value)}
                placeholder="maestro server token"
                className="mt-2 w-full rounded-md border border-amber-500/30 bg-gray-950 px-2 py-1.5 text-xs text-gray-100 outline-none focus:border-amber-300"
              />
              <div className="mt-2 flex items-center justify-end gap-2">
                {hasToken && (
                  <button
                    type="button"
                    onClick={onClearToken}
                    className="maestro-touch-control maestro-touch-control--compact rounded-md border border-gray-700 px-2 py-1 text-[11px] text-gray-300 hover:bg-gray-800"
                  >
                    비우기
                  </button>
                )}
                <button
                  type="button"
                  onClick={onSaveToken}
                  className="maestro-touch-control maestro-touch-control--compact rounded-md bg-amber-400 px-2 py-1 text-[11px] font-semibold text-black hover:bg-amber-300"
                >
                  저장
                </button>
              </div>
            </section>
          )}

          {error && (
            <div
              role="status"
              className={`mt-3 rounded-xl border px-3 py-2 text-xs ${
                isAuthRequired
                  ? 'border-amber-500/40 bg-amber-500/10 text-amber-200'
                  : 'border-red-500/30 bg-red-500/10 text-red-200'
              }`}
            >
              <div className="flex items-center gap-2">
                <TriangleAlert className="h-3.5 w-3.5" />
                <span>{error}</span>
              </div>
            </div>
          )}

          <div className="mt-3 flex items-center justify-between gap-2">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-300">
                Recent Events
              </div>
              <div className="mt-1 text-[10px] text-gray-500">
                정책 판정과 실행 결과를 최신순으로 표시합니다.
              </div>
            </div>
            <select
              aria-label="자동승인 결정 필터"
              value={decisionFilter}
              onChange={(event) => onDecisionFilterChange(event.target.value)}
              className="rounded-md border border-gray-700 bg-gray-950 px-2 py-1 text-[11px] text-gray-100"
            >
              {DECISION_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>

          {isLoading && (
            <div role="status" className="mt-2 rounded-lg border border-gray-700/70 bg-gray-950/80 px-3 py-2 text-xs text-gray-300">
              Auto approve ops loading...
            </div>
          )}

          {!isLoading && events.length === 0 && !error && (
            <div role="status" className="mt-2 rounded-lg border border-gray-700/70 bg-gray-950/80 px-3 py-5 text-center text-xs text-gray-400">
              표시할 자동승인 이벤트가 없습니다.
            </div>
          )}

          <ul aria-label="자동승인 이벤트 목록" className="mt-2 space-y-2">
            {events.map((event) => {
              const decisionMeta = getDecisionMeta(event.decision);
              return (
                <li
                  key={event.id}
                  className="rounded-xl border border-gray-700/70 bg-gray-950/80 px-3 py-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${decisionMeta.badgeClass}`}>
                          {decisionMeta.label}
                        </span>
                        {event.dryRun && (
                          <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-200">
                            dry-run
                          </span>
                        )}
                      </div>
                      <div className="mt-1 break-all text-[12px] font-semibold text-gray-100">
                        {event.reason}
                      </div>
                      <div className="mt-1 text-[10px] text-gray-400">
                        {event.phase} • {event.requestId || 'no request'} • {event.branchName || 'no branch'}
                      </div>
                      <div className="mt-1 text-[10px] text-gray-500">
                        {event.agentId || 'unknown agent'}
                        {event.projectId ? ` • ${event.projectId}` : ''}
                        {event.retryAfterMs ? ` • retry ${formatDuration(event.retryAfterMs)}` : ''}
                      </div>
                    </div>
                    <div className="shrink-0 text-[10px] text-gray-500">
                      {formatTimestamp(event.timestamp)}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </aside>
  );
}
