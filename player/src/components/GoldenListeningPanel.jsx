import React from 'react';
import { getPlayerCopy } from '../lib/playerI18n.js';

export default function GoldenListeningPanel({
  entries = [],
  activeScenarioId = '',
  onAutoplay = null,
  language = 'en',
  compact = false,
}) {
  const copy = getPlayerCopy(language);

  return (
    <section className={`player-card golden-listening-panel${compact ? ' golden-listening-panel--compact' : ''}`} aria-labelledby="golden-listening-panel-title">
      <div className="player-card__header">
        <div>
          <p className="player-kicker">{copy.goldenListening.kicker}</p>
          <h2 id="golden-listening-panel-title" className="player-section-title">{copy.goldenListening.title}</h2>
        </div>
        <p className="player-card__meta">{copy.goldenListening.meta}</p>
      </div>

      {entries.length ? (
        <div className="golden-listening-panel__list">
          {entries.map((entry) => {
            const isActive = activeScenarioId === entry.id;

            if (compact) {
              return (
                <article
                  key={entry.id}
                  className={`golden-listening-panel__quick-card${isActive ? ' is-active' : ''}`}
                  aria-label={entry.label}
                >
                  <div>
                    <div className="golden-listening-panel__quick-meta">
                      <span className="player-pill">{copy.goldenListening.providers[entry.provider] || entry.provider}</span>
                      <span>{copy.goldenListening.tempo(entry.tempo)}</span>
                    </div>
                    <h3 className="golden-listening-panel__title">{entry.label}</h3>
                    <p className="golden-listening-panel__signature">
                      {copy.goldenListening.signature(entry.motifId, entry.key)}
                    </p>
                  </div>
                  <button
                    className="player-button"
                    type="button"
                    aria-label={copy.goldenListening.actions.autoplayAria(entry.label)}
                    onClick={() => onAutoplay?.(entry)}
                  >
                    {copy.goldenListening.actions.autoplayCompact(entry.label)}
                  </button>
                </article>
              );
            }

            return (
              <article
                key={entry.id}
                className={`golden-listening-panel__card${isActive ? ' is-active' : ''}`}
                aria-label={entry.label}
              >
                <div className="golden-listening-panel__heading">
                  <div>
                    <h3 className="golden-listening-panel__title">{entry.label}</h3>
                    <p className="golden-listening-panel__signature">
                      {copy.goldenListening.signature(entry.motifId, entry.key)}
                    </p>
                  </div>
                  <div className="golden-listening-panel__badges">
                    <span className="player-pill">{copy.goldenListening.providers[entry.provider] || entry.provider}</span>
                    <span className="player-pill">{copy.goldenListening.tempo(entry.tempo)}</span>
                    {isActive ? <span className="player-pill is-live">{copy.goldenListening.activeDemo}</span> : null}
                  </div>
                </div>

                <details className="player-collapsible player-collapsible--inline">
                  <summary className="player-collapsible__summary">{copy.goldenListening.detailsLabel}</summary>
                  <dl className="golden-listening-panel__stats">
                    <div className="status-item">
                      <dt>{copy.goldenListening.labels.events}</dt>
                      <dd>{entry.eventCount}</dd>
                    </div>
                    <div className="status-item">
                      <dt>{copy.goldenListening.labels.notes}</dt>
                      <dd>{entry.noteCount}</dd>
                    </div>
                    <div className="status-item">
                      <dt>{copy.goldenListening.labels.peakTension}</dt>
                      <dd>{formatPeakLabel(entry.peakTensionEvent, copy)}</dd>
                    </div>
                    <div className="status-item">
                      <dt>{copy.goldenListening.labels.peakResolution}</dt>
                      <dd>{formatPeakLabel(entry.peakResolutionEvent, copy)}</dd>
                    </div>
                  </dl>

                  <div className="golden-listening-panel__focus">
                    <h3 className="status-section__title">{copy.goldenListening.labels.focus}</h3>
                    <ul className="source-mode-guide__list-items">
                      {entry.listeningFocus.map((focus) => (
                        <li key={focus}>{focus}</li>
                      ))}
                    </ul>
                  </div>
                </details>

                <div className="player-actions">
                  <button
                    className="player-button"
                    type="button"
                    aria-label={copy.goldenListening.actions.autoplayAria(entry.label)}
                    onClick={() => onAutoplay?.(entry)}
                  >
                    {copy.goldenListening.actions.autoplay}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <p className="status-empty">{copy.goldenListening.empty}</p>
      )}
    </section>
  );
}

function formatPeakLabel(eventSummary, copy) {
  if (!eventSummary) {
    return copy.common.pending;
  }

  return copy.eventLabels[eventSummary.eventType] || eventSummary.eventType;
}
