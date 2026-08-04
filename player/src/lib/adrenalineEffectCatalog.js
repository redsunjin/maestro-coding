const DEFAULT_MINIMUM_COMMITS = 4;
const DEFAULT_WINDOW_MINUTES = 45;

export const ADRENALINE_EFFECT_IDS = Object.freeze({
  commitBacklogBarrage: 'maestro-adrenaline.commit-backlog-barrage',
});

export const ADRENALINE_EFFECT_CATALOG = Object.freeze({
  [ADRENALINE_EFFECT_IDS.commitBacklogBarrage]: Object.freeze({
    effectId: ADRENALINE_EFFECT_IDS.commitBacklogBarrage,
    effectType: 'adrenaline-copy',
    triggerType: 'commit-backlog',
    copy: Object.freeze({
      ko: Object.freeze({
        headline: '거침없이 커밋해라.',
        callout: '풀리퀘스트는 거침없이 쏴라.',
        subtitle: '커밋이 밀린 순간, 흐름을 끊지 말고 리듬으로 밀어붙입니다.',
      }),
      en: Object.freeze({
        headline: 'Commit without brakes.',
        callout: 'Fire pull requests like a barrage.',
        subtitle: 'When commits pile up, turn the backlog into a rhythm rush.',
      }),
    }),
    visual: Object.freeze({
      laneGlow: 'amber-cyan-overdrive',
      screenShake: 'short-snare-hit',
      typography: 'bold-strobe-callout',
      durationBeats: 4,
    }),
    audio: Object.freeze({
      cue: 'snare-roll-rise',
      densityBoost: 0.18,
      tempoLift: 6,
      resolveOn: 'next-pr-open-or-merge',
    }),
    chart: Object.freeze({
      laneBias: 'outer-lanes',
      noteTypeBias: 'accent',
      maxInjectionPerBeat: 1,
    }),
  }),
});

export function getAdrenalineEffectDefinition(effectId) {
  return ADRENALINE_EFFECT_CATALOG[effectId] || null;
}

export function detectAdrenalineEffects(events, options = {}) {
  const minimumCommits = Math.max(2, Number(options.minimumCommits || DEFAULT_MINIMUM_COMMITS));
  const windowMinutes = Math.max(1, Number(options.windowMinutes || DEFAULT_WINDOW_MINUTES));
  const windowMs = windowMinutes * 60 * 1000;
  const groupedCommits = groupCommitEvents(events);
  const effects = [];

  groupedCommits.forEach((commits, branchKey) => {
    const matchedWindow = findBestCommitWindow(commits, {
      minimumCommits,
      windowMs,
    });

    if (!matchedWindow) {
      return;
    }

    effects.push(createCommitBacklogEffect({
      branchKey,
      commits: matchedWindow,
      windowMinutes,
    }));
  });

  return effects.sort((left, right) => String(left.firstTimestamp).localeCompare(String(right.firstTimestamp)));
}

function groupCommitEvents(events) {
  const groups = new Map();

  [...(events || [])]
    .filter((event) => event?.eventType === 'commit' && Number.isFinite(Date.parse(event.timestamp)))
    .sort((left, right) => Date.parse(left.timestamp) - Date.parse(right.timestamp))
    .forEach((event) => {
      const branchKey = getBranchKey(event);
      const group = groups.get(branchKey) || [];
      group.push(event);
      groups.set(branchKey, group);
    });

  return groups;
}

function findBestCommitWindow(commits, { minimumCommits, windowMs }) {
  let startIndex = 0;
  let bestWindow = null;

  for (let endIndex = 0; endIndex < commits.length; endIndex += 1) {
    const endTime = Date.parse(commits[endIndex].timestamp);

    while (startIndex < endIndex && endTime - Date.parse(commits[startIndex].timestamp) > windowMs) {
      startIndex += 1;
    }

    const windowCommits = commits.slice(startIndex, endIndex + 1);
    if (windowCommits.length >= minimumCommits) {
      if (!bestWindow || windowCommits.length > bestWindow.length) {
        bestWindow = windowCommits;
      }
    }
  }

  return bestWindow;
}

function createCommitBacklogEffect({ branchKey, commits, windowMinutes }) {
  const definition = ADRENALINE_EFFECT_CATALOG[ADRENALINE_EFFECT_IDS.commitBacklogBarrage];
  const firstCommit = commits[0];
  const lastCommit = commits[commits.length - 1];
  const durationMinutes = Math.max(
    0,
    Math.round((Date.parse(lastCommit.timestamp) - Date.parse(firstCommit.timestamp)) / 60000),
  );

  return {
    effectId: definition.effectId,
    effectType: definition.effectType,
    triggerType: definition.triggerType,
    severity: commits.length >= 7 ? 'overdrive' : 'rush',
    branchKey,
    branchName: lastCommit.branchName || firstCommit.branchName || '',
    prNumber: lastCommit.prNumber || firstCommit.prNumber || null,
    firstTimestamp: firstCommit.timestamp,
    lastTimestamp: lastCommit.timestamp,
    firstEventRef: firstCommit.eventId,
    lastEventRef: lastCommit.eventId,
    eventRefs: commits.map((event) => event.eventId).filter(Boolean),
    metrics: {
      commitCount: commits.length,
      durationMinutes,
      configuredWindowMinutes: windowMinutes,
    },
    copy: definition.copy,
    visual: definition.visual,
    audio: definition.audio,
    chart: definition.chart,
  };
}

function getBranchKey(event) {
  if (event.prNumber) {
    return `pr:${event.prNumber}`;
  }

  return `branch:${event.branchName || event.repoId || 'unknown'}`;
}
