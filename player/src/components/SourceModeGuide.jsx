import React from 'react';
import { getPlayerCopy } from '../lib/playerI18n.js';

const MODE_ORDER = ['local', 'public', 'account'];

export default function SourceModeGuide({
  mode = 'public',
  sourceState = {},
  language = 'en',
}) {
  const copy = getPlayerCopy(language);

  return (
    <section className="player-card source-mode-guide" aria-labelledby="source-mode-guide-title">
      <div className="player-card__header">
        <div>
          <p className="player-kicker">{copy.sourceGuide.kicker}</p>
          <h2 id="source-mode-guide-title" className="player-section-title">{copy.sourceGuide.title}</h2>
        </div>
        <p className="player-card__meta">{copy.sourceGuide.meta}</p>
      </div>

      <div className="source-mode-guide__list" role="list">
        {MODE_ORDER.map((modeId) => {
          const entry = buildGuideEntry(modeId, sourceState[modeId], copy);
          const isActive = modeId === mode;

          return (
            <article
              key={modeId}
              className={`source-mode-guide__card${isActive ? ' is-active' : ''}`}
              role="listitem"
              aria-current={isActive ? 'step' : undefined}
              aria-labelledby={`source-mode-guide-${modeId}-title`}
            >
              <div className="source-mode-guide__heading">
                <div>
                  <h3 id={`source-mode-guide-${modeId}-title`} className="source-mode-guide__title">{entry.label}</h3>
                  <p className="source-mode-guide__summary">{entry.summary}</p>
                </div>
                <div className="source-mode-guide__badges">
                  <span className={`player-pill${entry.readinessTone === 'ready' ? ' is-live' : ''}`}>
                    {entry.readiness}
                  </span>
                  {isActive ? <span className="player-pill is-live">{copy.common.activeMode}</span> : null}
                </div>
              </div>

              <dl className="status-grid">
                <div className="status-item status-item--wide">
                  <dt>{copy.sourceGuide.labels.bestFor}</dt>
                  <dd>{entry.bestFor}</dd>
                </div>
                <div className="status-item status-item--wide">
                  <dt>{copy.sourceGuide.labels.currentCue}</dt>
                  <dd>{entry.cue}</dd>
                </div>
              </dl>

              <div className="source-mode-guide__columns">
                <div>
                  <h4 className="source-mode-guide__subheading">{copy.sourceGuide.labels.capabilities}</h4>
                  <ul className="source-mode-guide__list-items">
                    {entry.capabilities.map((capability) => (
                      <li key={capability}>{capability}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h4 className="source-mode-guide__subheading">{copy.sourceGuide.labels.risks}</h4>
                  <ul className="source-mode-guide__list-items">
                    {entry.risks.map((risk) => (
                      <li key={risk}>{risk}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function buildGuideEntry(modeId, overrides = {}, copy) {
  const base = copy.sourceGuide.modes[modeId];
  if (!base) {
    throw new Error(`unsupported source mode guide: ${modeId}`);
  }

  return {
    ...base,
    ...overrides,
    capabilities: Array.isArray(overrides.capabilities) ? overrides.capabilities : base.capabilities,
    risks: Array.isArray(overrides.risks) ? overrides.risks : base.risks,
  };
}
