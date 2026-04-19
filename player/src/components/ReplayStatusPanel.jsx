import React from 'react';
import { formatPlayerTimestamp, getPlayerCopy } from '../lib/playerI18n.js';

function formatSummaryValue(value, fallback = '0') {
  return value ?? fallback;
}

export default function ReplayStatusPanel({
  activeSource = null,
  replaySummary = null,
  chartSummary = null,
  latestError = '',
  language = 'en',
}) {
  const copy = getPlayerCopy(language);
  const hasSource = Boolean(activeSource);
  const hasReplaySummary = Boolean(replaySummary);
  const hasChartSummary = Boolean(chartSummary);

  return (
    <section className="player-card replay-status-panel" aria-labelledby="replay-status-panel-title">
      <div className="player-card__header">
        <div>
          <p className="player-kicker">{copy.replayStatus.kicker}</p>
          <h2 id="replay-status-panel-title" className="player-section-title">{copy.replayStatus.title}</h2>
        </div>
        <span className={`player-pill${hasSource ? ' is-live' : ''}`}>
          {hasSource ? copy.replayStatus.sourceReady : copy.replayStatus.noSource}
        </span>
      </div>

      <div className="status-section">
        <h3 className="status-section__title">{copy.replayStatus.sections.activeSource}</h3>
        {hasSource ? (
          <dl className="status-grid">
            <div className="status-item status-item--wide">
              <dt>{copy.replayStatus.fields.label}</dt>
              <dd>{activeSource.sourceLabel || activeSource.repoSlug || activeSource.targetPathOrId}</dd>
            </div>
            <div className="status-item">
              <dt>{copy.replayStatus.fields.mode}</dt>
              <dd>{activeSource.sourceType || copy.common.unknown}</dd>
            </div>
            <div className="status-item">
              <dt>{copy.replayStatus.fields.provider}</dt>
              <dd>{activeSource.provider || copy.common.unknown}</dd>
            </div>
            <div className="status-item">
              <dt>{copy.replayStatus.fields.branch}</dt>
              <dd>{activeSource.branchName || copy.common.defaultBranch}</dd>
            </div>
            <div className="status-item">
              <dt>{copy.replayStatus.fields.visibility}</dt>
              <dd>{activeSource.visibility || copy.common.unknown}</dd>
            </div>
          </dl>
        ) : (
          <p className="status-empty">{copy.replayStatus.emptySource}</p>
        )}
      </div>

      <div className="status-section">
        <h3 className="status-section__title">{copy.replayStatus.sections.replayLoad}</h3>
        <div className="status-metrics">
          <article className="status-metric">
            <span className="status-metric__label">{copy.replayStatus.fields.events}</span>
            <strong>{formatSummaryValue(replaySummary?.eventCount)}</strong>
          </article>
          <article className="status-metric">
            <span className="status-metric__label">{copy.replayStatus.fields.commits}</span>
            <strong>{formatSummaryValue(replaySummary?.commitCount)}</strong>
          </article>
          <article className="status-metric">
            <span className="status-metric__label">{copy.replayStatus.fields.merges}</span>
            <strong>{formatSummaryValue(replaySummary?.mergeCount)}</strong>
          </article>
          <article className="status-metric">
            <span className="status-metric__label">{copy.replayStatus.fields.reviews}</span>
            <strong>{formatSummaryValue(replaySummary?.reviewCount)}</strong>
          </article>
        </div>
        <p className="status-note">
          {copy.replayStatus.fields.lastLoaded}: {hasReplaySummary ? formatPlayerTimestamp(replaySummary.loadedAt, language) : copy.common.notLoaded}
        </p>
      </div>

      <div className="status-section">
        <h3 className="status-section__title">{copy.replayStatus.sections.chartSummary}</h3>
        {hasChartSummary ? (
          <dl className="status-grid">
            <div className="status-item">
              <dt>{copy.replayStatus.fields.notes}</dt>
              <dd>{formatSummaryValue(chartSummary.noteCount)}</dd>
            </div>
            <div className="status-item">
              <dt>{copy.replayStatus.fields.phrases}</dt>
              <dd>{formatSummaryValue(chartSummary.phraseCount)}</dd>
            </div>
            <div className="status-item">
              <dt>{copy.replayStatus.fields.lanes}</dt>
              <dd>{formatSummaryValue(chartSummary.laneCount)}</dd>
            </div>
            <div className="status-item">
              <dt>{copy.replayStatus.fields.duration}</dt>
              <dd>{formatSummaryValue(chartSummary.durationLabel, copy.common.pending)}</dd>
            </div>
            <div className="status-item">
              <dt>{copy.replayStatus.fields.tempo}</dt>
              <dd>{formatSummaryValue(chartSummary.tempoLabel, copy.common.pending)}</dd>
            </div>
            <div className="status-item">
              <dt>{copy.replayStatus.fields.maxDensity}</dt>
              <dd>{formatSummaryValue(chartSummary.maxDensity, copy.common.pending)}</dd>
            </div>
          </dl>
        ) : (
          <p className="status-empty">{copy.replayStatus.emptyChart}</p>
        )}
      </div>

      {latestError ? (
        <div className="status-error" role="alert">
          <span className="status-error__label">{copy.replayStatus.fields.latestError}</span>
          <p>{latestError}</p>
        </div>
      ) : null}
    </section>
  );
}
