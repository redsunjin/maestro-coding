import { pickHarmonyProfile, pickSessionTempo } from './harmonyEngine.js';
import { chooseRegisterBand, pickMotif } from './motifCatalog.js';
import {
  clamp,
  coerceArray,
  hashString,
  minutesBetween,
  normalizeTimestamp,
  normalizedLog,
  toNumber,
} from './types.js';

const EVENT_TYPE_ALIASES = Object.freeze({
  approval: 'review-approve',
  approve: 'review-approve',
  approved: 'review-approve',
  'changes-requested': 'review-request-changes',
  request_changes: 'review-request-changes',
  'request-changes': 'review-request-changes',
  review_requested_changes: 'review-request-changes',
  rollback: 'revert',
  history_approved: 'history-approved',
  pr_open: 'pr-open',
  pr_update: 'pr-update',
});

const BRIGHTNESS_BY_CLASS = Object.freeze({
  feat: 0.82,
  fix: 0.52,
  refactor: 0.44,
  docs: 0.76,
  test: 0.48,
  chore: 0.56,
  merge: 0.88,
  revert: 0.28,
  review: 0.46,
});

export function normalizeReplayEvents(rawEvents, options = {}) {
  const repoId = options.repoId || 'maestro-player';

  return rawEvents
    .map((event, index) => normalizeReplayEvent(event, index, repoId))
    .sort((left, right) => new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime());
}

export function sessionizeEvents(events, options = {}) {
  const gapMinutes = toNumber(options.gapMinutes, 30);
  const sessions = [];
  let currentSession = null;

  for (const event of events) {
    const branchKey = getBranchKey(event);
    const eventTimestamp = new Date(event.timestamp).getTime();

    const shouldStartNewSession = !currentSession
      || currentSession.repoId !== event.repoId
      || currentSession.branchKey !== branchKey
      || minutesBetween(currentSession.lastTimestamp, event.timestamp) > gapMinutes;

    if (shouldStartNewSession) {
      currentSession = {
        sessionId: `${event.repoId}:${branchKey}:${sessions.length + 1}`,
        repoId: event.repoId,
        branchKey,
        branchName: event.branchName,
        prNumber: event.prNumber,
        events: [],
        firstTimestamp: event.timestamp,
        lastTimestamp: event.timestamp,
      };
      sessions.push(currentSession);
    }

    currentSession.events.push(event);
    currentSession.lastTimestamp = event.timestamp;
    currentSession.lastTimestampMs = eventTimestamp;
  }

  return sessions.map((session) => finalizeSession(session));
}

export function classifyReplayEvent(event) {
  const eventType = event.eventType;
  if (eventType === 'merge') {
    return 'merge';
  }

  if (eventType === 'revert') {
    return 'revert';
  }

  if (eventType.startsWith('review') || eventType === 'history-approved') {
    return 'review';
  }

  const message = `${event.title || ''} ${event.message || ''}`.trim().toLowerCase();
  const prefixMatch = message.match(/^(feat|fix|refactor|docs|test|chore)(\(.+\))?:/);
  if (prefixMatch) {
    return prefixMatch[1];
  }

  const pathGroup = detectDominantPathGroup(event.changedFiles);
  if (pathGroup === 'docs') {
    return 'docs';
  }

  if (pathGroup === 'test') {
    return 'test';
  }

  if (pathGroup === 'infra') {
    return 'chore';
  }

  return 'chore';
}

export function extractMetrics(event, session, eventIndex) {
  const recentEvents = session.events.filter((candidate, candidateIndex) => {
    if (candidateIndex > eventIndex) {
      return false;
    }
    return minutesBetween(candidate.timestamp, event.timestamp) <= 20;
  });

  const branchEvents = recentEvents.filter((candidate) => getBranchKey(candidate) === session.branchKey);
  const filesChanged = Math.max(toNumber(event.filesChanged, 0), event.changedFiles.length);
  const linesAdded = toNumber(event.linesAdded, 0);
  const linesDeleted = toNumber(event.linesDeleted, 0);
  const deleteRatio = linesDeleted / Math.max(linesAdded + linesDeleted, 1);
  const commitBurstSize = Math.max(branchEvents.length, 1);
  const newFileCount = toNumber(event.newFileCount, event.changedFiles.filter((path) => path.startsWith('new:')).length);
  const newDirectoryCount = toNumber(event.newDirectoryCount, countNewDirectories(event.changedFiles));
  const requestChangesFlag = event.eventType === 'review-request-changes' ? 1 : 0;
  const revertFlag = event.eventType === 'revert' ? 1 : 0;
  const approveFlag = event.eventType === 'review-approve' || event.eventType === 'history-approved' ? 1 : 0;
  const mergeFlag = event.eventType === 'merge' ? 1 : 0;
  const reworkBurstScore = clamp(
    recentEvents.filter((candidate) => ['fix', 'revert', 'review'].includes(classifyReplayEvent(candidate))).length / 4,
    0,
    1,
  );
  const checksPassedScore = clamp(toNumber(event.successfulChecks, 0) / 5, 0, 1);
  const sizeScore = clamp(
    normalizedLog(
      (filesChanged * 0.6)
      + (linesAdded * 0.015)
      + (linesDeleted * 0.02)
      + (commitBurstSize * 1.2),
      6,
    ),
    0,
    1,
  );
  const noveltyScore = clamp(
    ((newFileCount / Math.max(filesChanged, 1)) * 0.7) + (newDirectoryCount * 0.15),
    0,
    1,
  );
  const tensionScore = clamp(
    (requestChangesFlag * 0.45)
    + (revertFlag * 0.35)
    + (deleteRatio * 0.2)
    + (reworkBurstScore * 0.25),
    0,
    1,
  );
  const resolutionScore = clamp(
    (approveFlag * 0.45)
    + (mergeFlag * 0.8)
    + (checksPassedScore * 0.15),
    0,
    1,
  );
  const activityScore = clamp(normalizedLog(recentEvents.length, 4), 0, 1);

  return {
    filesChanged,
    linesAdded,
    linesDeleted,
    deleteRatio,
    commitBurstSize,
    newFileCount,
    newDirectoryCount,
    sizeScore,
    noveltyScore,
    tensionScore,
    resolutionScore,
    activityScore,
    reworkBurstScore,
  };
}

export function mapEventToMusicIntent(event, session, eventIndex, options = {}) {
  const commitClass = classifyReplayEvent(event);
  const metrics = extractMetrics(event, session, eventIndex);
  const motif = options.motif || pickMotif(`${session.repoId}:${session.branchKey}`);
  const energy = clamp(
    0.18
    + (metrics.sizeScore * 0.38)
    + (metrics.activityScore * 0.28)
    + (metrics.resolutionScore * 0.14)
    + (event.eventType === 'merge' ? 0.18 : 0),
    0,
    1,
  );
  const tension = clamp(
    (metrics.tensionScore * 0.85)
    + (event.eventType === 'review-request-changes' ? 0.25 : 0)
    - (metrics.resolutionScore * 0.2),
    0,
    1,
  );
  const brightness = clamp(
    BRIGHTNESS_BY_CLASS[commitClass]
      + (metrics.noveltyScore * 0.12)
      + (metrics.resolutionScore * 0.08)
      - (metrics.tensionScore * 0.1),
    0,
    1,
  );
  const density = clamp(
    0.18
    + (metrics.sizeScore * 0.35)
    + (metrics.activityScore * 0.32)
    + (event.eventType === 'push' ? 0.12 : 0)
    - (event.eventType === 'merge' ? 0.12 : 0),
    0.1,
    1,
  );
  const accentLevel = clamp(
    0.12
    + (metrics.resolutionScore * 0.35)
    + (metrics.tensionScore * 0.16)
    + (event.eventType === 'merge' ? 0.42 : 0)
    + (event.eventType === 'review-approve' ? 0.16 : 0),
    0,
    1,
  );
  const structuralRole = pickStructuralRole(event, session, eventIndex, metrics);
  const rhythmPattern = pickRhythmPattern(event, commitClass, metrics);
  const harmonyAction = pickHarmonyAction(event, commitClass, metrics);
  const orchestrationHint = pickOrchestrationHint(event, commitClass);
  const laneBias = pickLaneBias(event, commitClass, detectDominantPathGroup(event.changedFiles), options.laneCount || 4);
  const registerBand = chooseRegisterBand(motif.motifSeed, energy, tension, brightness);

  return {
    intentId: `intent:${event.eventId}`,
    eventRef: event.eventId,
    eventType: event.eventType,
    commitClass,
    structuralRole,
    motifId: motif.motifId,
    motifSeed: motif.motifSeed,
    energy,
    tension,
    brightness,
    density,
    accentLevel,
    registerBand,
    harmonyAction,
    rhythmPattern,
    orchestrationHint,
    laneBias,
    dominantPathGroup: detectDominantPathGroup(event.changedFiles),
    metrics,
    sourceEvent: event,
  };
}

export function buildMusicPlan(rawEvents, options = {}) {
  const normalizedEvents = normalizeReplayEvents(rawEvents, options);
  const sessions = sessionizeEvents(normalizedEvents, { gapMinutes: options.gapMinutes || 30 });
  const laneCount = options.laneCount || 4;

  return sessions.map((session) => {
    const motif = pickMotif(`${session.repoId}:${session.branchKey}`);
    const harmony = pickHarmonyProfile({
      repoId: session.repoId,
      branchKey: session.branchKey,
      dominantClass: session.dominantCommitClass,
      tensionScore: session.tensionScore,
      resolutionScore: session.resolutionScore,
    });
    const tempo = pickSessionTempo({
      repoComplexityClass: session.repoComplexityClass,
      activityScore: session.activityScore,
    });
    const intents = session.events.map((event, eventIndex) => (
      mapEventToMusicIntent(event, session, eventIndex, { motif, laneCount })
    ));

    return {
      ...session,
      laneCount,
      motif,
      harmony,
      tempo,
      intents,
    };
  });
}

function normalizeReplayEvent(event, index, repoId) {
  const normalizedEventType = normalizeEventType(event.eventType || 'commit');
  const message = event.message || event.title || '';
  const changedFiles = coerceArray(event.changedFiles).map((path) => String(path));
  const branchName = event.branchName || event.branch || 'detached';
  const prNumber = event.prNumber ?? null;

  return {
    eventId: event.eventId || event.commitSha || `${normalizedEventType}:${hashString(JSON.stringify(event))}:${index}`,
    sourceType: event.sourceType || 'git',
    eventType: normalizedEventType,
    repoId: event.repoId || repoId,
    branchName,
    prNumber,
    commitSha: event.commitSha || null,
    actor: event.actor || event.author || 'unknown',
    title: event.title || message,
    message,
    timestamp: normalizeTimestamp(event.timestamp, index),
    changedFiles,
    filesChanged: event.filesChanged ?? changedFiles.length,
    linesAdded: event.linesAdded ?? event.insertions ?? 0,
    linesDeleted: event.linesDeleted ?? event.deletions ?? 0,
    newFileCount: event.newFileCount ?? 0,
    newDirectoryCount: event.newDirectoryCount ?? 0,
    successfulChecks: event.successfulChecks ?? 0,
  };
}

function normalizeEventType(value) {
  const rawValue = String(value || 'commit').trim().toLowerCase();
  return EVENT_TYPE_ALIASES[rawValue] || rawValue;
}

function finalizeSession(session) {
  const topLevelDirectories = new Set();
  const classCounts = new Map();
  let sessionTension = 0;
  let sessionResolution = 0;

  session.events.forEach((event, eventIndex) => {
    event.changedFiles.forEach((path) => {
      const normalizedPath = path.replace(/^new:/, '');
      const topLevel = normalizedPath.split('/')[0];
      if (topLevel) {
        topLevelDirectories.add(topLevel);
      }
    });

    const commitClass = classifyReplayEvent(event);
    classCounts.set(commitClass, (classCounts.get(commitClass) || 0) + 1);

    const metrics = extractMetrics(event, session, eventIndex);
    sessionTension += metrics.tensionScore;
    sessionResolution += metrics.resolutionScore;
  });

  return {
    ...session,
    activityScore: clamp(normalizedLog(session.events.length, 4), 0, 1),
    repoComplexityClass: Math.min(4, Math.max(1, topLevelDirectories.size || 1)),
    dominantCommitClass: pickDominantClass(classCounts),
    tensionScore: clamp(sessionTension / Math.max(session.events.length, 1), 0, 1),
    resolutionScore: clamp(sessionResolution / Math.max(session.events.length, 1), 0, 1),
  };
}

function pickDominantClass(classCounts) {
  let selectedClass = 'chore';
  let selectedCount = -1;

  for (const [commitClass, count] of classCounts.entries()) {
    if (count > selectedCount) {
      selectedClass = commitClass;
      selectedCount = count;
    }
  }

  return selectedClass;
}

function getBranchKey(event) {
  return event.prNumber ? `pr:${event.prNumber}` : (event.branchName || 'detached');
}

function pickStructuralRole(event, session, eventIndex, metrics) {
  if (eventIndex === 0) {
    return 'intro';
  }

  if (event.eventType === 'merge') {
    return 'outro';
  }

  if (event.eventType === 'review-approve' || event.eventType === 'history-approved') {
    return 'cadence';
  }

  if (event.eventType === 'review-request-changes') {
    return 'bridge';
  }

  if (event.eventType === 'pr-open' || event.eventType === 'pr-update') {
    return 'verse';
  }

  if (metrics.activityScore >= 0.6 || metrics.sizeScore >= 0.7) {
    return 'build';
  }

  if (eventIndex === session.events.length - 1 && metrics.resolutionScore >= 0.35) {
    return 'cadence';
  }

  return 'verse';
}

function pickRhythmPattern(event, commitClass, metrics) {
  if (event.eventType === 'merge') {
    return 'hold';
  }

  if (event.eventType === 'push') {
    return 'fill';
  }

  if (event.eventType === 'review-comment') {
    return 'staccato';
  }

  if (event.eventType === 'review-request-changes') {
    return 'syncopated';
  }

  if (event.eventType === 'pull' || event.eventType === 'sync') {
    return 'steady';
  }

  if (commitClass === 'docs' || commitClass === 'chore') {
    return metrics.sizeScore > 0.5 ? 'steady' : 'staccato';
  }

  if (metrics.activityScore > 0.55) {
    return 'syncopated';
  }

  if (metrics.sizeScore > 0.68) {
    return 'hold';
  }

  return 'steady';
}

function pickHarmonyAction(event, commitClass, metrics) {
  if (event.eventType === 'merge' || event.eventType === 'review-approve' || event.eventType === 'history-approved') {
    return 'resolve';
  }

  if (event.eventType === 'review-request-changes') {
    return 'suspend';
  }

  if (event.eventType === 'pr-open') {
    return 'establish';
  }

  if (event.eventType === 'revert') {
    return 'deviate';
  }

  if (commitClass === 'refactor' || metrics.noveltyScore > 0.45) {
    return 'deviate';
  }

  return 'repeat';
}

function pickOrchestrationHint(event, commitClass) {
  if (event.eventType === 'merge') {
    return 'fx';
  }

  if (event.eventType === 'push') {
    return 'drum';
  }

  if (event.eventType === 'pr-open') {
    return 'pad';
  }

  if (event.eventType.startsWith('review')) {
    return 'fx';
  }

  if (commitClass === 'docs' || commitClass === 'chore') {
    return 'pad';
  }

  if (commitClass === 'test') {
    return 'drum';
  }

  return 'lead';
}

function pickLaneBias(event, commitClass, dominantPathGroup, laneCount) {
  if (laneCount <= 4) {
    if (event.eventType === 'merge' || event.eventType === 'review-approve' || event.eventType === 'history-approved') {
      return 4;
    }

    if (event.eventType === 'review-request-changes' || commitClass === 'fix' || commitClass === 'refactor') {
      return 3;
    }

    if (commitClass === 'feat' || dominantPathGroup === 'frontend' || dominantPathGroup === 'backend') {
      return 2;
    }

    return 1;
  }

  if (event.eventType === 'merge') {
    return 6;
  }

  if (event.eventType === 'review-approve' || event.eventType === 'history-approved' || event.eventType === 'push') {
    return 5;
  }

  if (event.eventType === 'review-request-changes' || commitClass === 'refactor') {
    return 4;
  }

  if (dominantPathGroup === 'backend' || dominantPathGroup === 'core') {
    return 3;
  }

  if (dominantPathGroup === 'frontend' || commitClass === 'feat') {
    return 2;
  }

  return 1;
}

function detectDominantPathGroup(changedFiles) {
  const scores = {
    docs: 0,
    test: 0,
    frontend: 0,
    backend: 0,
    infra: 0,
    core: 0,
  };

  for (const changedFile of changedFiles) {
    const path = changedFile.replace(/^new:/, '').toLowerCase();
    if (path.startsWith('docs/') || path.endsWith('.md')) {
      scores.docs += 1;
      continue;
    }

    if (path.includes('test') || path.includes('spec')) {
      scores.test += 1;
      continue;
    }

    if (path.startsWith('src/components/') || path.includes('ui') || path.endsWith('.tsx') || path.endsWith('.jsx')) {
      scores.frontend += 1;
      continue;
    }

    if (path.startsWith('server/') || path.startsWith('api/') || path.includes('backend')) {
      scores.backend += 1;
      continue;
    }

    if (path.startsWith('.github/') || path.startsWith('infra/') || path.startsWith('scripts/')) {
      scores.infra += 1;
      continue;
    }

    scores.core += 1;
  }

  return Object.entries(scores).sort((left, right) => right[1] - left[1])[0][0];
}

function countNewDirectories(changedFiles) {
  const directoryNames = new Set();

  changedFiles
    .filter((path) => path.startsWith('new:'))
    .forEach((path) => {
      const normalizedPath = path.replace(/^new:/, '');
      const parts = normalizedPath.split('/');
      if (parts.length > 1) {
        directoryNames.add(parts[0]);
      }
    });

  return directoryNames.size;
}
