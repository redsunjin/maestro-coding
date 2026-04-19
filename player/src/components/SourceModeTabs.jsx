import React from 'react';

export default function SourceModeTabs({
  mode = 'local',
  onModeChange,
  modes = [],
  disabled = false,
  ariaLabel = 'Replay source mode',
}) {
  return (
    <div className="source-mode-tabs" role="tablist" aria-label={ariaLabel}>
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
