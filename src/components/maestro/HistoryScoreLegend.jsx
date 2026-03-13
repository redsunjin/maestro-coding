import React from 'react';

export default function HistoryScoreLegend({ lanes, resultMeta }) {
  return (
    <section
      className="rounded-xl border border-gray-700/70 bg-gray-950/70 px-3 py-3"
      aria-label="히스토리 악보 범례"
    >
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-300">
        Score Legend
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {lanes.map((lane, index) => (
          <span
            key={lane.id}
            className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${lane.border} ${lane.bg} ${lane.color}`}
          >
            L{index + 1} {lane.name}
          </span>
        ))}
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {Object.entries(resultMeta).map(([result, meta]) => (
          <span
            key={result}
            className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${meta.badgeClass}`}
          >
            {meta.label}
          </span>
        ))}
      </div>
    </section>
  );
}
