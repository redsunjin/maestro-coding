import React, { useMemo } from 'react';

export default function ScoreHistoryPanel({
  records = [],
  activeSource = null,
}) {
  const bestScore = useMemo(
    () => (records.length ? Math.max(...records.map((record) => record.score || 0)) : 0),
    [records],
  );
  const latestAccuracy = records[0]?.accuracy ?? 0;

  return (
    <section className="player-card score-history-panel" aria-labelledby="score-history-panel-title">
      <div className="player-card__header">
        <div>
          <p className="player-kicker">Performance History</p>
          <h2 id="score-history-panel-title" className="player-section-title">Recent score history</h2>
        </div>
        <span className={`player-pill${records.length ? ' is-live' : ''}`}>
          {records.length ? `${records.length} saved run${records.length > 1 ? 's' : ''}` : 'No runs saved'}
        </span>
      </div>

      {records.length ? (
        <>
          <div className="status-metrics">
            <article className="status-metric">
              <span className="status-metric__label">Best score</span>
              <strong>{formatNumber(bestScore)}</strong>
            </article>
            <article className="status-metric">
              <span className="status-metric__label">Latest accuracy</span>
              <strong>{formatAccuracy(latestAccuracy)}</strong>
            </article>
            <article className="status-metric">
              <span className="status-metric__label">Current source</span>
              <strong>{activeSource ? 'Filtered' : 'All runs'}</strong>
            </article>
            <article className="status-metric">
              <span className="status-metric__label">Latest mode</span>
              <strong>{formatPlayMode(records[0]?.playMode)}</strong>
            </article>
          </div>

          <ol className="score-history-panel__list">
            {records.map((record) => (
              <li key={record.runId} className="score-history-panel__item">
                <div className="score-history-panel__item-header">
                  <strong>{record.sourceLabel}</strong>
                  <span>{formatNumber(record.score)} pts</span>
                </div>
                <div className="score-history-panel__meta">
                  <span>{record.branchName}</span>
                  <span>{formatPlayMode(record.playMode)}</span>
                  <span>{formatAccuracy(record.accuracy)}</span>
                  <span>{record.maxCombo} max combo</span>
                </div>
                <p className="score-history-panel__detail">
                  {record.notesHit} / {record.totalNotes} notes, {record.judgments.miss} misses, saved {formatTimestamp(record.finishedAt)}.
                </p>
              </li>
            ))}
          </ol>
        </>
      ) : (
        <p className="status-empty">
          {activeSource
            ? 'Complete a run on the active replay source to save score history for this chart.'
            : 'Load a replay source and finish a run to start building score history.'}
        </p>
      )}
    </section>
  );
}

function formatAccuracy(value) {
  return `${Math.round((Number(value) || 0) * 10) / 10}%`;
}

function formatNumber(value) {
  return new Intl.NumberFormat().format(Number(value) || 0);
}

function formatPlayMode(value) {
  if (value === 'auto') {
    return 'Auto Preview';
  }

  return 'Manual Play';
}

function formatTimestamp(value) {
  const timestamp = new Date(value);

  if (Number.isNaN(timestamp.getTime())) {
    return String(value);
  }

  return timestamp.toLocaleString();
}
