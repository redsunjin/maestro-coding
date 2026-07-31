const EVENT_LABELS = {
  ACTOR_REGISTERED: '액터 등록',
  ACTOR_REVOKED: '토큰 회수',
  REQUEST_CREATED: '요청 생성',
  DECIDED: '결정',
  ACKNOWLEDGED: '수신 확인',
};

// 결정 원장 뷰: 누가(actorId) · 무엇을(title) · 언제(timestamp) · 어떻게(decision) · 왜(comment).
export default function HistoryPanel({ entries }) {
  if (!entries.length) {
    return <div className="p-4 text-sm text-slate-500">아직 기록된 결정이 없습니다</div>;
  }
  return (
    <ul className="divide-y divide-slate-800 p-4">
      {entries.map((entry) => (
        <li key={entry.id} data-testid="history-entry" className="py-2 text-sm">
          <div className="flex items-center gap-2">
            <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px]">
              {EVENT_LABELS[entry.event] || entry.event}
            </span>
            {entry.subjectType ? (
              <span className="text-[10px] uppercase text-indigo-400">{entry.subjectType}</span>
            ) : null}
            <span className="ml-auto text-xs text-slate-500">
              {new Date(entry.timestamp).toLocaleString('ko-KR')}
            </span>
          </div>
          <div className="mt-1">{entry.title || entry.requestId || entry.actorId}</div>
          <div className="text-xs text-slate-400">
            {entry.actorId ? `요청자 ${entry.actorId}` : ''}
            {entry.decision ? ` · ${entry.decision}` : ''}
            {entry.decidedBy ? ` · ${entry.decidedBy}` : ''}
            {entry.comment ? ` · ${entry.comment}` : ''}
          </div>
        </li>
      ))}
    </ul>
  );
}
