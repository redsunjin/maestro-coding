import React from 'react';

function formatTimestamp(value) {
  if (!value) {
    return 'Not loaded';
  }

  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) {
    return String(value);
  }

  return timestamp.toLocaleString();
}

function formatSummaryValue(value, fallback = '0') {
  return value ?? fallback;
}

export default function ReplayStatusPanel({
  activeSource = null,
  replaySummary = null,
  chartSummary = null,
  latestError = '',
}) {
  const hasSource = Boolean(activeSource);
  const hasReplaySummary = Boolean(replaySummary);
  const hasChartSummary = Boolean(chartSummary);

  return (
    <section className="player-card replay-status-panel" aria-labelledby="replay-status-panel-title">
      <div className="player-card__header">
        <div>
          <p className="player-kicker">Replay Status</p>
          <h2 id="replay-status-panel-title" className="player-section-title">Current session</h2>
        </div>
        <span className={`player-pill${hasSource ? ' is-live' : ''}`}>
          {hasSource ? 'Source ready' : 'No source loaded'}
        </span>
      </div>

      <div className="status-section">
        <h3 className="status-section__title">Active source</h3>
        {hasSource ? (
          <dl className="status-grid">
            <div className="status-item status-item--wide">
              <dt>Label</dt>
              <dd>{activeSource.sourceLabel || activeSource.repoSlug || activeSource.targetPathOrId}</dd>
            </div>
            <div className="status-item">
              <dt>Mode</dt>
              <dd>{activeSource.sourceType || 'unknown'}</dd>
            </div>
            <div className="status-item">
              <dt>Provider</dt>
              <dd>{activeSource.provider || 'unknown'}</dd>
            </div>
            <div className="status-item">
              <dt>Branch</dt>
              <dd>{activeSource.branchName || 'default'}</dd>
            </div>
            <div className="status-item">
              <dt>Visibility</dt>
              <dd>{activeSource.visibility || 'unknown'}</dd>
            </div>
          </dl>
        ) : (
          <p className="status-empty">로컬 저장소, 공개 URL, 또는 연결된 계정 저장소를 선택하면 여기에서 요약을 보여줍니다.</p>
        )}
      </div>

      <div className="status-section">
        <h3 className="status-section__title">Replay load</h3>
        <div className="status-metrics">
          <article className="status-metric">
            <span className="status-metric__label">Events</span>
            <strong>{formatSummaryValue(replaySummary?.eventCount)}</strong>
          </article>
          <article className="status-metric">
            <span className="status-metric__label">Commits</span>
            <strong>{formatSummaryValue(replaySummary?.commitCount)}</strong>
          </article>
          <article className="status-metric">
            <span className="status-metric__label">Merges</span>
            <strong>{formatSummaryValue(replaySummary?.mergeCount)}</strong>
          </article>
          <article className="status-metric">
            <span className="status-metric__label">Reviews</span>
            <strong>{formatSummaryValue(replaySummary?.reviewCount)}</strong>
          </article>
        </div>
        <p className="status-note">
          Last loaded: {hasReplaySummary ? formatTimestamp(replaySummary.loadedAt) : 'Not loaded'}
        </p>
      </div>

      <div className="status-section">
        <h3 className="status-section__title">Chart summary</h3>
        {hasChartSummary ? (
          <dl className="status-grid">
            <div className="status-item">
              <dt>Notes</dt>
              <dd>{formatSummaryValue(chartSummary.noteCount)}</dd>
            </div>
            <div className="status-item">
              <dt>Phrases</dt>
              <dd>{formatSummaryValue(chartSummary.phraseCount)}</dd>
            </div>
            <div className="status-item">
              <dt>Lanes</dt>
              <dd>{formatSummaryValue(chartSummary.laneCount)}</dd>
            </div>
            <div className="status-item">
              <dt>Duration</dt>
              <dd>{formatSummaryValue(chartSummary.durationLabel, 'Pending')}</dd>
            </div>
            <div className="status-item">
              <dt>Tempo</dt>
              <dd>{formatSummaryValue(chartSummary.tempoLabel, 'Pending')}</dd>
            </div>
            <div className="status-item">
              <dt>Max density</dt>
              <dd>{formatSummaryValue(chartSummary.maxDensity, 'Pending')}</dd>
            </div>
          </dl>
        ) : (
          <p className="status-empty">리플레이를 읽고 차트를 생성하면 노트 수, 구간 수, 레인 구성을 요약합니다.</p>
        )}
      </div>

      {latestError ? (
        <div className="status-error" role="alert">
          <span className="status-error__label">Latest error</span>
          <p>{latestError}</p>
        </div>
      ) : null}
    </section>
  );
}
