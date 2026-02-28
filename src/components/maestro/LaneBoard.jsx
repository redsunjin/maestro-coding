import React from 'react';
import { GitMerge, GitCommit, Code } from 'lucide-react';

export default function LaneBoard({
  lanes,
  notes,
  activeProjectId,
  combo,
  feedbacks,
  sfxBursts,
  baseBottom,
  noteStatus,
  onPreviewNote,
  onLaneAction,
}) {
  return (
    <main className="flex-1 relative bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-gray-900 via-gray-950 to-black">
      {combo > 2 && (
        <div className="absolute top-1/4 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-0 opacity-20 pointer-events-none flex flex-col items-center">
          <span className="text-8xl font-black italic">{combo}</span>
          <span className="text-2xl tracking-widest">COMBO</span>
        </div>
      )}

      {feedbacks.filter((feedback) => feedback.lane === -1 && feedback.projectId === activeProjectId).map((feedback) => (
        <div key={feedback.id} className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-50 animate-bounce">
          <span className={`text-3xl font-bold bg-black/80 px-6 py-3 rounded-lg border border-yellow-500 shadow-[0_0_30px_rgba(234,179,8,0.5)] ${feedback.color}`}>
            {feedback.text}
          </span>
        </div>
      ))}

      <div className="absolute inset-0 flex justify-center max-w-5xl mx-auto px-4">
        {lanes.map((lane) => (
          <div key={lane.id} className="relative flex-1 flex flex-col border-r border-l border-gray-800/50 bg-gray-900/10 backdrop-blur-[2px]">
            <div className="absolute top-0 w-full p-4 text-center z-10 bg-gradient-to-b from-gray-900 to-transparent">
              <span className={`text-sm font-semibold tracking-wider ${lane.color}`}>{lane.name}</span>
            </div>

            {notes.filter((note) => note.lane === lane.id && note.projectId === activeProjectId).map((note) => (
              <div
                key={note.id}
                onClick={() => onPreviewNote(note)}
                className={`absolute left-4 right-4 p-3 rounded-lg border shadow-lg transition-colors duration-200 cursor-pointer group ${
                  note.status === noteStatus.APPROVING
                    ? 'bg-yellow-900/20 border-yellow-500/70 opacity-80 animate-pulse'
                    : note.status === noteStatus.REJECTING
                      ? 'bg-orange-900/20 border-orange-500/70 opacity-80 animate-pulse'
                      : `${lane.bg} ${lane.border} hover:brightness-125`
                }`}
                style={{ bottom: `${note.currentBottom}px` }}
              >
                <div className="flex justify-between items-start">
                  <div className="flex items-start space-x-2 overflow-hidden">
                    <GitCommit className={`w-4 h-4 mt-0.5 shrink-0 ${
                      note.status === noteStatus.APPROVING
                        ? 'text-yellow-300'
                        : note.status === noteStatus.REJECTING
                          ? 'text-orange-300'
                          : lane.color
                    }`} />
                    <div className="flex flex-col overflow-hidden">
                      <span className={`text-xs truncate ${
                        note.status === noteStatus.APPROVING
                          ? 'text-yellow-300'
                          : note.status === noteStatus.REJECTING
                            ? 'text-orange-300'
                            : 'text-gray-400'
                      }`}>
                        {note.status === noteStatus.APPROVING
                          ? 'Merge pending...'
                          : note.status === noteStatus.REJECTING
                            ? 'Reject pending...'
                            : 'Agent proposed:'}
                      </span>
                      <span className="text-sm font-medium truncate group-hover:underline">{note.title}</span>
                    </div>
                  </div>
                  <Code className="w-4 h-4 text-gray-500 group-hover:text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </div>
            ))}

            {feedbacks.filter((feedback) => feedback.lane === lane.id && feedback.projectId === activeProjectId).map((feedback) => (
              <div
                key={feedback.id}
                className={`absolute w-full text-center z-50 font-bold text-xl tracking-widest animate-pulse ${feedback.color}`}
                style={{ bottom: `${baseBottom}px` }}
              >
                {feedback.text}
              </div>
            ))}

            {sfxBursts.filter((effect) => effect.lane === lane.id).map((effect) => (
              <div
                key={effect.id}
                className="absolute left-1/2 z-40 -translate-x-1/2 pointer-events-none"
                style={{ bottom: `${baseBottom + 48}px` }}
              >
                <span className={`inline-flex items-center rounded-full border px-2 py-1 text-[10px] font-mono font-semibold shadow-[0_0_20px_rgba(255,255,255,0.15)] bg-black/70 animate-pulse ${lane.border} ${lane.color}`}>
                  ♪ {effect.label}
                </span>
              </div>
            ))}

            <div className="absolute w-full bottom-0 h-48 bg-gradient-to-t from-gray-900 to-transparent border-t border-gray-800 flex flex-col items-center justify-end pb-8">
              <div className="absolute w-full h-1 bg-gray-700 shadow-[0_0_10px_rgba(255,255,255,0.1)]" style={{ bottom: `${baseBottom - 15}px` }} />

              <div className="relative flex flex-col items-center gap-2">
                <button
                  type="button"
                  onClick={() => onLaneAction(lane.id)}
                  aria-label={`${lane.name} 승인`}
                  className={`h-16 w-16 rounded-xl border-2 bg-gray-900 ${lane.border} shadow-[0_0_15px_rgba(0,0,0,0.5)] touch-manipulation transition-transform active:scale-95`}
                >
                  <span className={`text-2xl font-bold uppercase ${lane.color}`}>{lane.key}</span>
                </button>
                <button
                  type="button"
                  onClick={() => onLaneAction(lane.id, { isRejectAction: true, promptFeedback: true })}
                  aria-label={`${lane.name} 반려`}
                  className="min-h-[32px] rounded-md border border-orange-500/40 bg-orange-500/10 px-2 py-1 text-[11px] font-semibold text-orange-200 transition-colors hover:bg-orange-500/20 touch-manipulation"
                >
                  Reject
                </button>
              </div>

              <div className="mt-2 text-xs text-gray-500 font-mono">
                <GitMerge className="mr-1 inline h-3 w-3" /> Tap: Approve / Reject
              </div>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
