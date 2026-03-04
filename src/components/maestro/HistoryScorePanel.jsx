import React from 'react';
import { Clock3, Filter, Music4, X } from 'lucide-react';

const RESULT_LABELS = {
  REQUESTED: 'Requested',
  APPROVED: 'Approved',
  APPROVE_FAILED: 'Approve Failed',
  APPROVE_SKIPPED: 'Approve Skipped',
  REJECTED: 'Rejected',
  ROLLBACK: 'Rollback',
  ROLLBACK_FAILED: 'Rollback Failed',
  AUTO_APPROVE_SKIPPED: 'Auto Skip',
};

const RESULT_STYLES = {
  REQUESTED: 'border-blue-500/40 bg-blue-500/10 text-blue-200',
  APPROVED: 'border-green-500/40 bg-green-500/10 text-green-200',
  APPROVE_FAILED: 'border-red-500/40 bg-red-500/10 text-red-200',
  APPROVE_SKIPPED: 'border-yellow-500/40 bg-yellow-500/10 text-yellow-200',
  REJECTED: 'border-orange-500/40 bg-orange-500/10 text-orange-200',
  ROLLBACK: 'border-amber-500/40 bg-amber-500/10 text-amber-200',
  ROLLBACK_FAILED: 'border-rose-500/40 bg-rose-500/10 text-rose-200',
  AUTO_APPROVE_SKIPPED: 'border-fuchsia-500/40 bg-fuchsia-500/10 text-fuchsia-200',
};

const SOURCE_LABELS = {
  manual: 'manual',
  auto: 'auto',
  system: 'system',
};

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

function getResultStyle(result) {
  return RESULT_STYLES[result] || 'border-gray-500/40 bg-gray-500/10 text-gray-200';
}

function ScoreLaneMini({ laneIndex, result }) {
  const lane = Number.isInteger(laneIndex) ? Math.max(1, Math.min(4, laneIndex)) : 2;
  const topOffset = (4 - lane) * 7 + 2;
  const noteStyle = result === 'APPROVED' ? 'bg-green-300' : result === 'REJECTED' ? 'bg-orange-300' : 'bg-blue-300';

  return (
    <div className="relative h-7 w-14 rounded-md border border-gray-700/80 bg-gray-950/80">
      {[0, 1, 2, 3].map((line) => (
        <span
          key={line}
          className="absolute left-1 right-1 h-px bg-gray-700"
          style={{ top: `${line * 7 + 3}px` }}
        />
      ))}
      <span
        className={`absolute left-1/2 h-2 w-2 -translate-x-1/2 rounded-full shadow-[0_0_8px_rgba(255,255,255,0.4)] ${noteStyle}`}
        style={{ top: `${topOffset}px` }}
      />
    </div>
  );
}

export default function HistoryScorePanel({
  isOpen,
  onClose,
  items,
  isLoading,
  historyError,
  filteredHistoryCount,
  hasMore,
  onLoadMore,
  projects,
  projectFilter,
  onProjectFilterChange,
  resultFilter,
  onResultFilterChange,
  sourceFilter,
  onSourceFilterChange,
}) {
  return (
    <aside
      data-testid="history-panel"
      className={`fixed z-40 transition-all duration-200 ${
        isOpen
          ? 'pointer-events-auto opacity-100 translate-y-0 sm:translate-x-0'
          : 'pointer-events-none opacity-0 translate-y-2 sm:translate-x-4'
      } bottom-16 left-3 right-3 sm:bottom-auto sm:left-auto sm:right-4 sm:top-20 sm:w-[420px]`}
      aria-hidden={!isOpen}
    >
      <div className="rounded-2xl border border-gray-700/80 bg-gray-900/95 shadow-2xl backdrop-blur-md">
        <div className="flex items-center justify-between border-b border-gray-700/70 px-3 py-2">
          <div className="flex items-center gap-2">
            <Music4 className="h-4 w-4 text-cyan-300" />
            <span className="text-sm font-semibold text-white">Approval Score History</span>
            <span className="rounded-full border border-gray-600 px-1.5 py-0.5 text-[10px] text-gray-300">
              {filteredHistoryCount}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="히스토리 패널 닫기"
            className="rounded-md border border-gray-700 p-1 text-gray-300 hover:border-gray-500 hover:text-white"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-1 gap-2 border-b border-gray-700/70 px-3 py-2 sm:grid-cols-3">
          <label className="flex items-center gap-1 text-[11px] text-gray-300">
            <Filter className="h-3 w-3" />
            프로젝트
            <select
              aria-label="히스토리 프로젝트 필터"
              value={projectFilter}
              onChange={(event) => onProjectFilterChange(event.target.value)}
              className="w-full rounded border border-gray-700 bg-gray-950 px-1.5 py-1 text-[11px] text-gray-100"
            >
              <option value="all">All</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>{project.name}</option>
              ))}
            </select>
          </label>

          <label className="flex items-center gap-1 text-[11px] text-gray-300">
            결과
            <select
              aria-label="히스토리 결과 필터"
              value={resultFilter}
              onChange={(event) => onResultFilterChange(event.target.value)}
              className="w-full rounded border border-gray-700 bg-gray-950 px-1.5 py-1 text-[11px] text-gray-100"
            >
              <option value="all">All</option>
              {Object.keys(RESULT_LABELS).map((result) => (
                <option key={result} value={result}>{RESULT_LABELS[result]}</option>
              ))}
            </select>
          </label>

          <label className="flex items-center gap-1 text-[11px] text-gray-300">
            소스
            <select
              aria-label="히스토리 소스 필터"
              value={sourceFilter}
              onChange={(event) => onSourceFilterChange(event.target.value)}
              className="w-full rounded border border-gray-700 bg-gray-950 px-1.5 py-1 text-[11px] text-gray-100"
            >
              <option value="all">All</option>
              {Object.keys(SOURCE_LABELS).map((source) => (
                <option key={source} value={source}>{SOURCE_LABELS[source]}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="max-h-[52vh] overflow-y-auto px-3 py-2">
          {isLoading && (
            <div className="rounded-lg border border-gray-700/70 bg-gray-950/80 px-3 py-2 text-xs text-gray-300">
              History loading...
            </div>
          )}

          {!isLoading && historyError && (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
              {historyError}
            </div>
          )}

          {!isLoading && items.length === 0 && (
            <div className="rounded-lg border border-gray-700/70 bg-gray-950/80 px-3 py-5 text-center text-xs text-gray-400">
              아직 기록된 이력이 없습니다.
            </div>
          )}

          <ul className="space-y-2">
            {items.map((item) => (
              <li key={item.id} className="rounded-lg border border-gray-700/80 bg-gray-950/80 px-2.5 py-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2">
                    <ScoreLaneMini laneIndex={item.laneIndex} result={item.result} />
                    <div className="min-w-0">
                      <div className="truncate text-[12px] font-semibold text-gray-100">{item.title || '(untitled)'}</div>
                      <div className="mt-0.5 flex items-center gap-1 text-[10px] text-gray-400">
                        <Clock3 className="h-3 w-3" />
                        {formatTimestamp(item.timestamp)}
                        <span>•</span>
                        <span className="truncate">{item.projectId || 'n/a'}</span>
                      </div>
                      <div className="mt-1 truncate text-[10px] text-gray-400">
                        {item.branchName || '-'}
                        {item.agentId ? ` • ${item.agentId}` : ''}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${getResultStyle(item.result)}`}>
                      {RESULT_LABELS[item.result] || item.result}
                    </span>
                    <span className="rounded-full border border-gray-700 px-1.5 py-0.5 text-[10px] text-gray-300">
                      {item.autoApproved ? 'auto-approved' : (SOURCE_LABELS[item.source] || item.source)}
                    </span>
                  </div>
                </div>
                {item.reason && (
                  <div className="mt-1 truncate text-[10px] text-gray-500">
                    reason: {item.reason}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>

        {hasMore && (
          <div className="border-t border-gray-700/70 px-3 py-2">
            <button
              type="button"
              onClick={onLoadMore}
              className="w-full rounded-md border border-cyan-500/40 bg-cyan-500/10 py-1.5 text-xs font-semibold text-cyan-200 hover:bg-cyan-500/20"
            >
              더보기
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
