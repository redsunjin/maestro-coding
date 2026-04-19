import React from 'react';

const EVENT_LABELS = {
  commit: 'Commit',
  merge: 'Merge',
  revert: 'Revert',
  push: 'Push',
  pull: 'Pull',
  sync: 'Sync',
  'pr-open': 'PR Open',
  'pr-update': 'PR Update',
  'review-comment': 'Review Comment',
  'review-request-changes': 'Request Changes',
  'review-resolve': 'Resolve Thread',
  'review-reopen': 'Reopen Thread',
  'review-approve': 'Approve',
  'history-approved': 'History Approved',
};

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

function getEventLabel(eventType) {
  if (EVENT_LABELS[eventType]) {
    return EVENT_LABELS[eventType];
  }

  return String(eventType || 'unknown')
    .split('-')
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
}

function getEventMessage(event) {
  if (String(event?.eventType || '').startsWith('review')) {
    return event?.message || event?.title || event?.commitSha || event?.eventId || 'Untitled event';
  }

  return event?.title || event?.message || event?.commitSha || event?.eventId || 'Untitled event';
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

function formatStatLine(event) {
  const filesChanged = getFilesChanged(event);
  const hasAdded = Number.isFinite(event?.linesAdded);
  const hasDeleted = Number.isFinite(event?.linesDeleted);
  const segments = [];

  if (filesChanged !== null) {
    segments.push(`${filesChanged} ${filesChanged === 1 ? 'file' : 'files'}`);
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
  title = 'Recent events',
  emptyMessage = 'No replay events loaded yet.',
  maxItems = 8,
}) {
  const normalizedEvents = Array.isArray(events) ? events.slice(0, maxItems) : [];

  return (
    <section className="player-card" aria-labelledby="replay-event-timeline-title">
      <div className="player-card__header">
        <div>
          <p className="player-kicker">Replay Events</p>
          <h2 id="replay-event-timeline-title" className="player-section-title">{title}</h2>
        </div>
        <span className={`player-pill${normalizedEvents.length > 0 ? ' is-live' : ''}`}>
          {normalizedEvents.length} events
        </span>
      </div>

      {normalizedEvents.length === 0 ? (
        <p className="status-empty">{emptyMessage}</p>
      ) : (
        <div style={containerStyle}>
          <ol style={listStyle} aria-label="Replay event timeline">
            {normalizedEvents.map((event, index) => {
              const statLine = formatStatLine(event);
              const eventKey = event?.eventId || `${event?.eventType || 'event'}-${index}`;

              return (
                <li key={eventKey} style={itemStyle}>
                  <div style={topRowStyle}>
                    <span style={eventTypeStyle}>{getEventLabel(event?.eventType)}</span>
                    <span style={branchStyle}>Branch {event?.branchName || 'unknown'}</span>
                  </div>
                  <p style={messageStyle}>{getEventMessage(event)}</p>
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
