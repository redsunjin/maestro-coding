import React from 'react';
import { getPlayerCopy, getReplayEventLabel } from '../lib/playerI18n.js';

const containerStyle = {
  display: 'grid',
  gap: '12px',
};

const listStyle = {
  listStyle: 'none',
  padding: 0,
  margin: 0,
  display: 'grid',
  gap: '10px',
};

const itemStyle = {
  display: 'grid',
  gap: '8px',
  padding: '14px 16px',
  borderRadius: '16px',
  border: '1px solid rgba(71, 85, 105, 0.48)',
  background: 'rgba(2, 6, 23, 0.34)',
};

const topRowStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '12px',
  flexWrap: 'wrap',
};

const eventTypeStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: '0.25rem 0.6rem',
  borderRadius: '999px',
  border: '1px solid rgba(103, 232, 249, 0.28)',
  background: 'rgba(8, 47, 73, 0.35)',
  color: '#bae6fd',
  fontSize: '0.74rem',
  fontWeight: 700,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
};

const branchStyle = {
  color: '#94a3b8',
  fontSize: '0.82rem',
  fontWeight: 600,
};

const messageStyle = {
  margin: 0,
  color: '#e5edf7',
  fontSize: '0.94rem',
  lineHeight: 1.5,
  wordBreak: 'break-word',
};

const statLineStyle = {
  color: '#94a3b8',
  fontSize: '0.8rem',
  lineHeight: 1.45,
};

function getEventMessage(event, untitledLabel) {
  if (String(event?.eventType || '').startsWith('review')) {
    return event?.message || event?.title || event?.commitSha || event?.eventId || untitledLabel;
  }

  return event?.title || event?.message || event?.commitSha || event?.eventId || untitledLabel;
}

function getFilesChanged(event) {
  if (Number.isFinite(event?.filesChanged)) {
    return event.filesChanged;
  }

  if (Array.isArray(event?.changedFiles)) {
    return event.changedFiles.length;
  }

  return null;
}

function formatStatLine(event, language = 'en') {
  const copy = getPlayerCopy(language);
  const filesChanged = getFilesChanged(event);
  const hasAdded = Number.isFinite(event?.linesAdded);
  const hasDeleted = Number.isFinite(event?.linesDeleted);
  const segments = [];

  if (filesChanged !== null) {
    segments.push(copy.timeline.fileCount(filesChanged));
  }

  if (hasAdded && event.linesAdded > 0) {
    segments.push(`+${event.linesAdded}`);
  }

  if (hasDeleted && event.linesDeleted > 0) {
    segments.push(`-${event.linesDeleted}`);
  }

  if (segments.length === 0 && (hasAdded || hasDeleted)) {
    segments.push('+0', '-0');
  }

  return segments.join(' · ');
}

export default function ReplayEventTimeline({
  events = [],
  title = null,
  emptyMessage = null,
  maxItems = 8,
  language = 'en',
}) {
  const copy = getPlayerCopy(language);
  const normalizedEvents = Array.isArray(events) ? events.slice(0, maxItems) : [];
  const resolvedTitle = title || copy.timeline.defaultTitle;
  const resolvedEmptyMessage = emptyMessage || copy.timeline.empty;

  return (
    <section className="player-card" aria-labelledby="replay-event-timeline-title">
      <div className="player-card__header">
        <div>
          <p className="player-kicker">{copy.timeline.kicker}</p>
          <h2 id="replay-event-timeline-title" className="player-section-title">{resolvedTitle}</h2>
        </div>
        <span className={`player-pill${normalizedEvents.length > 0 ? ' is-live' : ''}`}>
          {copy.timeline.eventsCount(normalizedEvents.length)}
        </span>
      </div>

      {normalizedEvents.length === 0 ? (
        <p className="status-empty">{resolvedEmptyMessage}</p>
      ) : (
        <div style={containerStyle}>
          <ol style={listStyle} aria-label={copy.timeline.ariaLabel}>
            {normalizedEvents.map((event, index) => {
              const statLine = formatStatLine(event, language);
              const eventKey = event?.eventId || `${event?.eventType || 'event'}-${index}`;

              return (
                <li key={eventKey} style={itemStyle}>
                  <div style={topRowStyle}>
                    <span style={eventTypeStyle}>{getReplayEventLabel(event?.eventType, language)}</span>
                    <span style={branchStyle}>{copy.timeline.branchLabel(event?.branchName || copy.common.unknown)}</span>
                  </div>
                  <p style={messageStyle}>{getEventMessage(event, copy.timeline.untitled)}</p>
                  {statLine ? <span style={statLineStyle}>{statLine}</span> : null}
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </section>
  );
}
