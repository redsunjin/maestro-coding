import React from 'react';
import useLongPress from '../../hooks/useLongPress.js';

function GripButton({ lane, onTap, onLongPress }) {
  const { isPressing, handlers } = useLongPress({ onTap, onLongPress });

  return (
    <button
      type="button"
      aria-label={`${lane.name} 그립 승인 (길게 눌러 반려)`}
      {...handlers}
      className={`maestro-touch-control relative h-16 w-16 rounded-full border-2 bg-gray-900 ${lane.border} shadow-[0_0_15px_rgba(0,0,0,0.5)]`}
    >
      <span className={`text-2xl font-bold uppercase ${lane.color}`}>{lane.key}</span>
      {isPressing && (
        <span
          data-testid="grip-press-ring"
          className="pointer-events-none absolute -inset-1 rounded-full border-2 border-orange-400 maestro-grip-ring"
        />
      )}
    </button>
  );
}

// 스팀덱식 좌/우 그립 존 — 앞 절반 레인은 왼쪽, 나머지는 오른쪽 엄지 존에 배치
export default function GripZones({ lanes, onTap, onLongPress }) {
  const half = Math.ceil(lanes.length / 2);
  const zones = [
    { side: 'left', lanes: lanes.slice(0, half), position: 'left-4' },
    { side: 'right', lanes: lanes.slice(half), position: 'right-4' },
  ];

  return (
    <>
      {zones.filter((zone) => zone.lanes.length > 0).map((zone) => (
        <div
          key={zone.side}
          data-testid={`grip-zone-${zone.side}`}
          className={`fixed bottom-6 ${zone.position} z-40 flex flex-col gap-3 rounded-2xl border border-gray-700/60 bg-gray-900/75 p-3 shadow-2xl backdrop-blur`}
        >
          {zone.lanes.map((lane) => (
            <GripButton
              key={lane.id}
              lane={lane}
              onTap={() => onTap(lane.id)}
              onLongPress={() => onLongPress(lane.id)}
            />
          ))}
        </div>
      ))}
    </>
  );
}
