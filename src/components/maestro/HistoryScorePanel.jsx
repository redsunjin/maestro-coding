import React, { useEffect, useMemo, useRef } from 'react';
import { Clock3, Filter, Music4, X } from 'lucide-react';
import HistoryScoreLegend from './HistoryScoreLegend.jsx';

const RESULT_META = {
  REQUESTED: {
    label: 'Requested',
    badgeClass: 'border-blue-500/40 bg-blue-500/10 text-blue-200',
    noteClass: 'border-blue-100/70 bg-blue-300 shadow-[0_0_12px_rgba(96,165,250,0.45)]',
  },
  APPROVED: {
    label: 'Approved',
    badgeClass: 'border-green-500/40 bg-green-500/10 text-green-200',
    noteClass: 'border-green-100/70 bg-green-300 shadow-[0_0_12px_rgba(74,222,128,0.45)]',
  },
  APPROVE_FAILED: {
    label: 'Approve Failed',
    badgeClass: 'border-red-500/40 bg-red-500/10 text-red-200',
    noteClass: 'border-red-100/70 bg-red-300 shadow-[0_0_12px_rgba(248,113,113,0.45)]',
  },
  APPROVE_SKIPPED: {
    label: 'Approve Skipped',
    badgeClass: 'border-yellow-500/40 bg-yellow-500/10 text-yellow-200',
    noteClass: 'border-yellow-100/70 bg-yellow-300 shadow-[0_0_12px_rgba(253,224,71,0.45)]',
  },
  REJECTED: {
    label: 'Rejected',
    badgeClass: 'border-orange-500/40 bg-orange-500/10 text-orange-200',
    noteClass: 'border-orange-100/70 bg-orange-300 shadow-[0_0_12px_rgba(251,146,60,0.45)]',
  },
  ROLLBACK: {
    label: 'Rollback',
    badgeClass: 'border-amber-500/40 bg-amber-500/10 text-amber-200',
    noteClass: 'border-amber-100/70 bg-amber-300 shadow-[0_0_12px_rgba(252,211,77,0.45)]',
  },
  ROLLBACK_FAILED: {
    label: 'Rollback Failed',
    badgeClass: 'border-rose-500/40 bg-rose-500/10 text-rose-200',
    noteClass: 'border-rose-100/70 bg-rose-300 shadow-[0_0_12px_rgba(251,113,133,0.45)]',
  },
  AUTO_APPROVE_SKIPPED: {
    label: 'Auto Skip',
    badgeClass: 'border-fuchsia-500/40 bg-fuchsia-500/10 text-fuchsia-200',
    noteClass: 'border-fuchsia-100/70 bg-fuchsia-300 shadow-[0_0_12px_rgba(232,121,249,0.45)]',
  },
};

const FALLBACK_RESULT_META = {
  label: 'Unknown',
  badgeClass: 'border-gray-500/40 bg-gray-500/10 text-gray-200',
  noteClass: 'border-gray-100/70 bg-gray-300 shadow-[0_0_12px_rgba(209,213,219,0.3)]',
};

const SOURCE_LABELS = {
  manual: 'manual',
  auto: 'auto',
  system: 'system',
};

const SCORE_BUCKET_COUNT = 12;
const MAX_OVERVIEW_ITEMS = 48;
const PANEL_ID = 'approval-history-panel';
const PANEL_TITLE_ID = 'approval-history-panel-title';
const PANEL_SUMMARY_ID = 'approval-history-panel-summary';

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
  return RESULT_META[result]?.badgeClass || FALLBACK_RESULT_META.badgeClass;
}

function getResultLabel(result) {
  return RESULT_META[result]?.label || result || FALLBACK_RESULT_META.label;
}

function getResultNoteStyle(result) {
  return RESULT_META[result]?.noteClass || FALLBACK_RESULT_META.noteClass;
}

function clampLaneIndex(laneIndex, laneCount) {
  if (!Number.isInteger(laneIndex)) return Math.min(2, laneCount);
  return Math.min(Math.max(laneIndex, 1), laneCount);
}

function getDensitySizeClass(density) {
  if (density >= 4) return 'h-5 w-5';
  if (density >= 3) return 'h-[1.125rem] w-[1.125rem]';
  if (density === 2) return 'h-4 w-4';
  return 'h-3 w-3';
}

function buildOverviewBuckets(items, lanes) {
  const laneCount = Math.max(lanes.length, 1);
  const laneIds = Array.from({ length: laneCount }, (_, index) => index + 1);
  const buckets = Array.from({ length: SCORE_BUCKET_COUNT }, (_, index) => ({
    id: `bucket_${index}`,
    cells: Object.fromEntries(laneIds.map((laneId) => [laneId, []])),
  }));
  const recentItems = items
    .slice(0, MAX_OVERVIEW_ITEMS)
    .slice()
    .reverse();

  if (recentItems.length === 0) {
    return buckets.map((bucket) => ({
      id: bucket.id,
      cells: laneIds.map((laneId) => ({
        laneId,
        latestItem: null,
        density: 0,
      })),
    }));
  }

  const timestampValues = recentItems.map((item) => Date.parse(item.timestamp || ''));
  const validTimestamps = timestampValues.filter((value) => !Number.isNaN(value));
  const minTimestamp = validTimestamps.length > 0 ? Math.min(...validTimestamps) : 0;
  const maxTimestamp = validTimestamps.length > 0 ? Math.max(...validTimestamps) : 0;
  const useIndexBuckets = validTimestamps.length === 0;
  const useSingleTimeBucket = validTimestamps.length > 0 && minTimestamp === maxTimestamp;

  recentItems.forEach((item, index) => {
    const laneIndex = clampLaneIndex(item.laneIndex, laneCount);
    const parsedTimestamp = timestampValues[index];
    const bucketIndex = useIndexBuckets || Number.isNaN(parsedTimestamp)
      ? Math.round((index / Math.max(recentItems.length - 1, 1)) * (SCORE_BUCKET_COUNT - 1))
      : useSingleTimeBucket
        ? SCORE_BUCKET_COUNT - 1
        : Math.round(((parsedTimestamp - minTimestamp) / Math.max(maxTimestamp - minTimestamp, 1)) * (SCORE_BUCKET_COUNT - 1));
    buckets[bucketIndex].cells[laneIndex].push(item);
  });

  return buckets.map((bucket) => ({
    id: bucket.id,
    cells: laneIds.map((laneId) => {
      const laneItems = bucket.cells[laneId];
      return {
        laneId,
        latestItem: laneItems[laneItems.length - 1] || null,
        density: laneItems.length,
      };
    }),
  }));
}

function describeOverviewCell(laneName, density, item, projectLabel) {
  if (!item || density === 0) {
    return `${laneName} 레인, 표시된 이벤트 없음`;
  }

  const countLabel = density > 1 ? `${density} events` : '1 event';
  return `${laneName} lane, ${countLabel}, latest ${getResultLabel(item.result)}, ${projectLabel}, ${formatTimestamp(item.timestamp)}`;
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
  lanes,
  projectFilter,
  onProjectFilterChange,
  resultFilter,
  onResultFilterChange,
  sourceFilter,
  onSourceFilterChange,
}) {
  const closeButtonRef = useRef(null);
  const projectLabelMap = useMemo(() => new Map(projects.map((project) => [project.id, project.name])), [projects]);
  const overviewBuckets = useMemo(() => buildOverviewBuckets(items, lanes), [items, lanes]);
  const latestVisibleItem = items[0] || null;
  const srSummary = latestVisibleItem
    ? `필터 결과 ${filteredHistoryCount}건 중 ${items.length}건을 표시하고 있습니다. 최신 이벤트는 ${getResultLabel(latestVisibleItem.result)} / ${projectLabelMap.get(latestVisibleItem.projectId) || latestVisibleItem.projectId || 'unknown project'} / ${formatTimestamp(latestVisibleItem.timestamp)} 입니다.`
    : `필터 결과 ${filteredHistoryCount}건입니다. 표시할 히스토리 항목이 없습니다.`;

  useEffect(() => {
    if (isOpen) {
      closeButtonRef.current?.focus();
    }
  }, [isOpen]);

  return (
    <aside
      id={PANEL_ID}
      data-testid="history-panel"
      role="dialog"
      aria-modal="false"
      aria-labelledby={PANEL_TITLE_ID}
      aria-describedby={PANEL_SUMMARY_ID}
      className={`fixed z-40 transition-all duration-200 ${
        isOpen
          ? 'pointer-events-auto opacity-100 translate-y-0 sm:translate-x-0'
          : 'pointer-events-none opacity-0 translate-y-2 sm:translate-x-4'
      } bottom-16 left-3 right-3 sm:bottom-auto sm:left-auto sm:right-4 sm:top-20 sm:w-[420px]`}
      aria-hidden={!isOpen}
      tabIndex={-1}
    >
      <div className="rounded-2xl border border-gray-700/80 bg-gray-900/95 shadow-2xl backdrop-blur-md">
        <div className="flex items-center justify-between border-b border-gray-700/70 px-3 py-2">
          <div className="flex items-center gap-2">
            <Music4 className="h-4 w-4 text-cyan-300" />
            <span id={PANEL_TITLE_ID} className="text-sm font-semibold text-white">Approval Score History</span>
            <span className="rounded-full border border-gray-600 px-1.5 py-0.5 text-[10px] text-gray-300">
              {filteredHistoryCount}
            </span>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="히스토리 패널 닫기"
            className="rounded-md border border-gray-700 p-1 text-gray-300 hover:border-gray-500 hover:text-white"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <p id={PANEL_SUMMARY_ID} className="sr-only">
          {srSummary}
        </p>

        <div aria-live="polite" className="sr-only">
          {srSummary}
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
              {Object.entries(RESULT_META).map(([result, meta]) => (
                <option key={result} value={result}>{meta.label}</option>
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
          <section
            data-testid="history-score-overview"
            className="rounded-xl border border-gray-700/70 bg-gray-950/70 px-3 py-3"
            aria-label="히스토리 악보 요약"
          >
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-200">
                  Score Overview
                </div>
                <div className="mt-1 text-[10px] text-gray-400">
                  최근 {Math.min(items.length, MAX_OVERVIEW_ITEMS)}개 이력을 레인별로 요약합니다.
                </div>
              </div>
              <div className="text-right text-[10px] text-gray-500">
                <div>Older</div>
                <div>Newer</div>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-[auto,1fr] gap-x-2 gap-y-2">
              {lanes.map((lane, laneIndex) => (
                <React.Fragment key={lane.id}>
                  <div className="flex items-center justify-end pr-1 text-[10px] font-semibold text-gray-400">
                    <span className={`${lane.color}`}>L{laneIndex + 1}</span>
                  </div>
                  <div className="grid grid-cols-12 gap-1">
                    {overviewBuckets.map((bucket) => {
                      const cell = bucket.cells[laneIndex];
                      const latestItem = cell.latestItem;
                      const projectLabel = latestItem
                        ? (projectLabelMap.get(latestItem.projectId) || latestItem.projectId || 'unknown project')
                        : 'no project';
                      return (
                        <div
                          key={`${bucket.id}_${lane.id}`}
                          className="relative h-7 rounded-md border border-gray-800/90 bg-gray-950/90"
                        >
                          <span className="absolute left-1 right-1 top-1/2 h-px -translate-y-1/2 bg-gray-700/80" />
                          {latestItem && (
                            <>
                              <span
                                data-testid="history-score-note"
                                role="img"
                                aria-label={describeOverviewCell(lane.name, cell.density, latestItem, projectLabel)}
                                className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border ${getDensitySizeClass(cell.density)} ${getResultNoteStyle(latestItem.result)}`}
                              />
                              {cell.density > 1 && (
                                <span
                                  data-testid="history-score-density"
                                  className="absolute bottom-0.5 right-0.5 rounded-full border border-cyan-500/40 bg-cyan-500/15 px-1 text-[9px] font-semibold text-cyan-100"
                                >
                                  {cell.density}
                                </span>
                              )}
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </React.Fragment>
              ))}
            </div>
          </section>

          <div className="mt-2">
            <HistoryScoreLegend lanes={lanes} resultMeta={RESULT_META} />
          </div>

          {isLoading && (
            <div
              role="status"
              className="mt-2 rounded-lg border border-gray-700/70 bg-gray-950/80 px-3 py-2 text-xs text-gray-300"
            >
              History loading...
            </div>
          )}

          {!isLoading && historyError && (
            <div
              role="status"
              className="mt-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200"
            >
              {historyError}
            </div>
          )}

          {!isLoading && items.length === 0 && (
            <div
              role="status"
              className="mt-2 rounded-lg border border-gray-700/70 bg-gray-950/80 px-3 py-5 text-center text-xs text-gray-400"
            >
              아직 기록된 이력이 없습니다.
            </div>
          )}

          <ul aria-label="승인 이력 목록" className="mt-2 space-y-2">
            {items.map((item) => (
              <li
                key={item.id}
                className="rounded-lg border border-gray-700/80 bg-gray-950/80 px-2.5 py-2"
                aria-label={`${getResultLabel(item.result)} / ${projectLabelMap.get(item.projectId) || item.projectId || 'n/a'} / ${formatTimestamp(item.timestamp)}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2">
                    <ScoreLaneMini laneIndex={item.laneIndex} result={item.result} />
                    <div className="min-w-0">
                      <div className="truncate text-[12px] font-semibold text-gray-100">{item.title || '(untitled)'}</div>
                      <div className="mt-0.5 flex items-center gap-1 text-[10px] text-gray-400">
                        <Clock3 className="h-3 w-3" />
                        {formatTimestamp(item.timestamp)}
                        <span>•</span>
                        <span className="truncate">{projectLabelMap.get(item.projectId) || item.projectId || 'n/a'}</span>
                      </div>
                      <div className="mt-1 truncate text-[10px] text-gray-400">
                        {item.branchName || '-'}
                        {item.agentId ? ` • ${item.agentId}` : ''}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${getResultStyle(item.result)}`}>
                      {getResultLabel(item.result)}
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
