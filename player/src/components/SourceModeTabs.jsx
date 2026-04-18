import React from 'react';

const DEFAULT_MODES = [
  {
    id: 'local',
    label: 'Local Repo',
    description: '현재 머신의 로컬 저장소를 직접 읽습니다.',
  },
  {
    id: 'public',
    label: 'Public Repo',
    description: '공개 저장소 URL로 바로 리플레이를 엽니다.',
  },
  {
    id: 'account',
    label: 'Connected Account',
    description: '연결된 계정에서 저장소를 선택합니다.',
  },
];

export default function SourceModeTabs({
  mode = 'local',
  onModeChange,
  modes = DEFAULT_MODES,
  disabled = false,
}) {
  return (
    <div className="source-mode-tabs" role="tablist" aria-label="Replay source mode">
      {modes.map((item) => {
        const isActive = item.id === mode;

        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            aria-pressed={isActive}
            aria-label={item.label}
            disabled={disabled || item.disabled}
            className={`source-mode-tab${isActive ? ' is-active' : ''}`}
            onClick={() => onModeChange?.(item.id)}
          >
            <span className="source-mode-tab__label">{item.label}</span>
            <span className="source-mode-tab__description">{item.description}</span>
          </button>
        );
      })}
    </div>
  );
}
