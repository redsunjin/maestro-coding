import React, { useMemo } from 'react';
import { formatPlayerNumber, formatPlayerTimestamp, getPlayerCopy } from '../lib/playerI18n.js';

export default function ScoreHistoryPanel({
  records = [],
  activeSource = null,
  language = 'en',
}) {
  const copy = getPlayerCopy(language);
  const bestScore = useMemo(
    () => (records.length ? Math.max(...records.map((record) => record.score || 0)) : 0),
    [records],
  );
  const latestAccuracy = records[0]?.accuracy ?? 0;

  return (
    <section className="player-card score-history-panel" aria-labelledby="score-history-panel-title">
      <div className="player-card__header">
        <div>
          <p className="player-kicker">{copy.scoreHistory.kicker}</p>
          <h2 id="score-history-panel-title" className="player-section-title">{copy.scoreHistory.title}</h2>
        </div>
        <span className={`player-pill${records.length ? ' is-live' : ''}`}>
          {copy.scoreHistory.savedRuns(records.length)}
        </span>
      </div>

      {records.length ? (
        <>
          <div className="status-metrics">
            <article className="status-metric">
              <span className="status-metric__label">{copy.scoreHistory.labels.bestScore}</span>
              <strong>{formatPlayerNumber(bestScore, language)}</strong>
            </article>
            <article className="status-metric">
              <span className="status-metric__label">{copy.scoreHistory.labels.latestAccuracy}</span>
              <strong>{formatAccuracy(latestAccuracy)}</strong>
            </article>
            <article className="status-metric">
              <span className="status-metric__label">{copy.scoreHistory.labels.currentSource}</span>
              <strong>{activeSource ? copy.scoreHistory.currentSourceFiltered : copy.scoreHistory.currentSourceAll}</strong>
            </article>
            <article className="status-metric">
              <span className="status-metric__label">{copy.scoreHistory.labels.latestMode}</span>
              <strong>{formatPlayMode(records[0]?.playMode, language)}</strong>
            </article>
          </div>

          <ol className="score-history-panel__list">
            {records.map((record) => (
              <li key={record.runId} className="score-history-panel__item">
                <div className="score-history-panel__item-header">
                  <strong>{record.sourceLabel}</strong>
                  <span>{copy.scoreHistory.points(formatPlayerNumber(record.score, language))}</span>
                </div>
                <div className="score-history-panel__meta">
                  <span>{record.branchName}</span>
                  <span>{formatPlayMode(record.playMode, language)}</span>
                  <span>{formatAccuracy(record.accuracy)}</span>
                  <span>{copy.scoreHistory.maxCombo(record.maxCombo)}</span>
                </div>
                <p className="score-history-panel__detail">
                  {copy.scoreHistory.detail({
                    notesHit: record.notesHit,
                    totalNotes: record.totalNotes,
                    misses: record.judgments.miss,
                    timestamp: formatPlayerTimestamp(record.finishedAt, language),
                  })}
                </p>
              </li>
            ))}
          </ol>
        </>
      ) : (
        <p className="status-empty">
          {activeSource
            ? copy.scoreHistory.emptyActive
            : copy.scoreHistory.emptyGeneric}
        </p>
      )}
    </section>
  );
}

function formatAccuracy(value) {
  return `${Math.round((Number(value) || 0) * 10) / 10}%`;
}

function formatPlayMode(value, language = 'en') {
  const copy = getPlayerCopy(language);
  if (value === 'auto') {
    return copy.scoreHistory.playModes.auto;
  }

  return copy.scoreHistory.playModes.manual;
}
