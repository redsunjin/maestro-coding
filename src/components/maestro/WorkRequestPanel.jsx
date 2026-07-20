import { useMemo, useState } from 'react';
import { ClipboardList, X } from 'lucide-react';

const PANEL_ID = 'work-request-panel';
const PANEL_TITLE_ID = 'work-request-panel-title';
const PANEL_SUMMARY_ID = 'work-request-panel-summary';

const PRIORITY_OPTIONS = [
  { value: 'low', label: 'Low' },
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' },
];

const STATE_STYLES = {
  submitted: 'border-amber-500/40 bg-amber-500/10 text-amber-200',
  request_approved: 'border-green-500/40 bg-green-500/10 text-green-200',
  request_rejected: 'border-red-500/40 bg-red-500/10 text-red-200',
  cancelled: 'border-gray-600 bg-gray-800/80 text-gray-300',
};

function toLines(value) {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

export default function WorkRequestPanel({
  isOpen,
  requests = [],
  selectedRequestId,
  selectedRequest,
  isLoading,
  isSubmitting,
  error,
  laneCount = 4,
  onSelectRequest,
  onCreateRequest,
  onDecide,
  onClose,
}) {
  const [title, setTitle] = useState('');
  const [goal, setGoal] = useState('');
  const [priority, setPriority] = useState('normal');
  const [laneIndex, setLaneIndex] = useState('');
  const [constraints, setConstraints] = useState('');
  const [acceptanceCriteria, setAcceptanceCriteria] = useState('');

  const laneOptions = useMemo(
    () => Array.from({ length: Math.max(1, laneCount) }, (_, index) => index + 1),
    [laneCount],
  );

  const summaryText = useMemo(() => {
    if (selectedRequest) {
      return `선택한 작업 요청 ${selectedRequest.title}, 상태 ${selectedRequest.workflowState}.`;
    }
    if (requests.length > 0) {
      return `작업 요청 ${requests.length}건 중 하나를 선택할 수 있습니다.`;
    }
    return '등록된 작업 요청이 없습니다. 새 요청을 등록하세요.';
  }, [requests.length, selectedRequest]);

  const canSubmit = title.trim().length > 0 && goal.trim().length > 0 && !isSubmitting;

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!canSubmit) return;
    const created = await onCreateRequest?.({
      title: title.trim(),
      goal: goal.trim(),
      priority,
      laneIndex: laneIndex ? Number(laneIndex) : undefined,
      constraints: toLines(constraints),
      acceptanceCriteria: toLines(acceptanceCriteria),
    });
    if (created) {
      setTitle('');
      setGoal('');
      setPriority('normal');
      setLaneIndex('');
      setConstraints('');
      setAcceptanceCriteria('');
    }
  };

  return (
    <aside
      id={PANEL_ID}
      data-testid="work-request-panel"
      role="dialog"
      aria-modal="false"
      aria-labelledby={PANEL_TITLE_ID}
      aria-describedby={PANEL_SUMMARY_ID}
      aria-hidden={!isOpen}
      tabIndex={-1}
      className={`fixed bottom-16 left-3 right-3 top-[17rem] z-[44] transition-all duration-200 sm:bottom-4 sm:left-auto sm:right-4 sm:top-44 sm:w-[440px] ${
        isOpen
          ? 'pointer-events-auto opacity-100 translate-y-0'
          : 'pointer-events-none opacity-0 translate-y-2 sm:translate-x-4'
      }`}
    >
      <div className="flex h-full flex-col overflow-hidden rounded-[1.5rem] border border-amber-500/20 bg-slate-950 shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur-md">
        <div className="border-b border-gray-800/80 px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[10px] uppercase tracking-[0.28em] text-amber-300/70">VU-001 · Phase A</div>
              <div id={PANEL_TITLE_ID} className="mt-1 flex items-center gap-2 text-sm font-semibold text-white">
                <ClipboardList className="h-4 w-4 text-amber-300" />
                Work Requests
              </div>
              <div id={PANEL_SUMMARY_ID} aria-live="polite" className="mt-1 text-[11px] text-gray-400">
                {summaryText}
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="작업 요청 패널 닫기"
              className="maestro-touch-control maestro-touch-control--compact rounded-md border border-gray-700 p-1.5 text-gray-300 transition-colors hover:border-amber-400/40 hover:text-white"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3">
          <form onSubmit={handleSubmit} className="space-y-2">
            <div>
              <label htmlFor="work-request-title" className="text-[11px] font-medium text-gray-300">작업 제목</label>
              <input
                id="work-request-title"
                type="text"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                maxLength={120}
                className="mt-1 w-full rounded-md border border-gray-700 bg-gray-900/80 px-2 py-1 text-[12px] text-white outline-none focus:border-amber-400/60"
              />
            </div>
            <div>
              <label htmlFor="work-request-goal" className="text-[11px] font-medium text-gray-300">작업 목표</label>
              <textarea
                id="work-request-goal"
                value={goal}
                onChange={(event) => setGoal(event.target.value)}
                maxLength={1000}
                rows={2}
                className="mt-1 w-full rounded-md border border-gray-700 bg-gray-900/80 px-2 py-1 text-[12px] text-white outline-none focus:border-amber-400/60"
              />
            </div>
            <div className="flex gap-2">
              <div className="flex-1">
                <label htmlFor="work-request-priority" className="text-[11px] font-medium text-gray-300">우선순위</label>
                <select
                  id="work-request-priority"
                  value={priority}
                  onChange={(event) => setPriority(event.target.value)}
                  className="mt-1 w-full rounded-md border border-gray-700 bg-gray-900/80 px-2 py-1 text-[12px] text-white outline-none focus:border-amber-400/60"
                >
                  {PRIORITY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>
              <div className="flex-1">
                <label htmlFor="work-request-lane" className="text-[11px] font-medium text-gray-300">레인</label>
                <select
                  id="work-request-lane"
                  value={laneIndex}
                  onChange={(event) => setLaneIndex(event.target.value)}
                  className="mt-1 w-full rounded-md border border-gray-700 bg-gray-900/80 px-2 py-1 text-[12px] text-white outline-none focus:border-amber-400/60"
                >
                  <option value="">Auto</option>
                  {laneOptions.map((lane) => (
                    <option key={lane} value={lane}>{`Lane ${lane}`}</option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label htmlFor="work-request-constraints" className="text-[11px] font-medium text-gray-300">제약사항 (줄바꿈 구분)</label>
              <textarea
                id="work-request-constraints"
                value={constraints}
                onChange={(event) => setConstraints(event.target.value)}
                rows={2}
                className="mt-1 w-full rounded-md border border-gray-700 bg-gray-900/80 px-2 py-1 text-[12px] text-white outline-none focus:border-amber-400/60"
              />
            </div>
            <div>
              <label htmlFor="work-request-acceptance" className="text-[11px] font-medium text-gray-300">완료 기준 (줄바꿈 구분)</label>
              <textarea
                id="work-request-acceptance"
                value={acceptanceCriteria}
                onChange={(event) => setAcceptanceCriteria(event.target.value)}
                rows={2}
                className="mt-1 w-full rounded-md border border-gray-700 bg-gray-900/80 px-2 py-1 text-[12px] text-white outline-none focus:border-amber-400/60"
              />
            </div>
            <button
              type="submit"
              disabled={!canSubmit}
              className="maestro-touch-control maestro-touch-control--compact w-full rounded-md border border-amber-400/50 bg-amber-500/10 px-2 py-1.5 text-[12px] font-semibold text-amber-100 transition-colors hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-40"
            >
              작업 요청 등록
            </button>
          </form>

          {error && (
            <div className="mt-3 rounded-md border border-red-500/40 bg-red-500/10 px-2 py-1.5 text-[11px] text-red-200">
              {error}
            </div>
          )}

          <div className="mt-4 space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">요청 목록</div>
              {isLoading && <span className="text-[10px] text-gray-500">불러오는 중…</span>}
            </div>
            {requests.length === 0 ? (
              <div className="rounded-md border border-gray-800 bg-gray-900/50 px-3 py-4 text-center text-[11px] text-gray-500">
                등록된 작업 요청이 없습니다.
              </div>
            ) : (
              requests.map((request) => {
                const isSelected = request.workRequestId === selectedRequestId;
                const isSubmitted = request.workflowState === 'submitted';
                return (
                  <div
                    key={request.workRequestId}
                    className={`rounded-lg border px-3 py-2 transition-colors ${
                      isSelected ? 'border-amber-400/50 bg-amber-500/5' : 'border-gray-800 bg-gray-900/40'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => onSelectRequest?.(request.workRequestId)}
                      className="maestro-touch-control maestro-touch-control--compact w-full text-left"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-[12px] font-semibold text-white">{request.title}</span>
                        <span className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] ${STATE_STYLES[request.workflowState] || STATE_STYLES.submitted}`}>
                          {request.workflowState}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center gap-2 text-[10px] text-gray-500">
                        <span className="uppercase">{request.priority}</span>
                        <span>· {request.laneIndex ? `Lane ${request.laneIndex}` : 'Auto'}</span>
                        <span>· {request.requestedBy}</span>
                      </div>
                      <div className="mt-1 line-clamp-2 text-[11px] text-gray-400">{request.goal}</div>
                    </button>
                    {isSubmitted && (
                      <div className="mt-2 flex gap-1.5">
                        <button
                          type="button"
                          onClick={() => onDecide?.(request.workRequestId, 'approve')}
                          aria-label="작업 요청 승인"
                          className="maestro-touch-control maestro-touch-control--compact flex-1 rounded border border-green-500/40 bg-green-500/10 px-1.5 py-1 text-[11px] font-medium text-green-200 hover:bg-green-500/20"
                        >
                          승인
                        </button>
                        <button
                          type="button"
                          onClick={() => onDecide?.(request.workRequestId, 'reject')}
                          aria-label="작업 요청 반려"
                          className="maestro-touch-control maestro-touch-control--compact flex-1 rounded border border-red-500/40 bg-red-500/10 px-1.5 py-1 text-[11px] font-medium text-red-200 hover:bg-red-500/20"
                        >
                          반려
                        </button>
                        <button
                          type="button"
                          onClick={() => onDecide?.(request.workRequestId, 'cancel')}
                          aria-label="작업 요청 취소"
                          className="maestro-touch-control maestro-touch-control--compact flex-1 rounded border border-gray-600 bg-gray-800/80 px-1.5 py-1 text-[11px] font-medium text-gray-300 hover:bg-gray-700"
                        >
                          취소
                        </button>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </aside>
  );
}
