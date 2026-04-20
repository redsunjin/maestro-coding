import { createChartFromMusicPlan } from './chartMapper.js';
import { buildMusicPlan } from './musicIntentMapper.js';
import { createReplayCuePlan } from './replayAudioEngine.js';

export function buildTransitionValidationFixture() {
  return [
    {
      eventId: 'mv-commit-1',
      eventType: 'commit',
      repoId: 'maestro-player-validation',
      branchName: 'feature/validation-song',
      prNumber: 142,
      timestamp: '2026-04-20T01:00:00.000Z',
      message: 'feat: add harmonic replay opening',
      changedFiles: ['src/audio/opening.js', 'src/audio/theme.js', 'new:src/audio/fills.js'],
      filesChanged: 3,
      linesAdded: 84,
      linesDeleted: 12,
      newFileCount: 1,
      newDirectoryCount: 1,
    },
    {
      eventId: 'mv-push-1',
      eventType: 'push',
      repoId: 'maestro-player-validation',
      branchName: 'feature/validation-song',
      prNumber: 142,
      timestamp: '2026-04-20T01:04:00.000Z',
      message: 'push latest branch build',
      changedFiles: ['src/audio/fills.js'],
      filesChanged: 1,
      linesAdded: 8,
      linesDeleted: 0,
    },
    {
      eventId: 'mv-review-1',
      eventType: 'review-request-changes',
      repoId: 'maestro-player-validation',
      branchName: 'feature/validation-song',
      prNumber: 142,
      timestamp: '2026-04-20T01:07:00.000Z',
      message: 'needs stronger tension before merge',
      changedFiles: ['src/audio/theme.js'],
      filesChanged: 1,
      linesAdded: 4,
      linesDeleted: 14,
    },
    {
      eventId: 'mv-resolve-1',
      eventType: 'review-resolve',
      repoId: 'maestro-player-validation',
      branchName: 'feature/validation-song',
      prNumber: 142,
      timestamp: '2026-04-20T01:10:00.000Z',
      message: 'resolved after cadence fix',
      changedFiles: ['src/audio/theme.js'],
      filesChanged: 1,
      linesAdded: 6,
      linesDeleted: 2,
    },
    {
      eventId: 'mv-sync-1',
      eventType: 'sync',
      repoId: 'maestro-player-validation',
      branchName: 'feature/validation-song',
      prNumber: 142,
      timestamp: '2026-04-20T01:12:00.000Z',
      message: 'sync latest main before approval',
      changedFiles: ['src/audio/theme.js', 'src/chart/view.js'],
      filesChanged: 2,
      linesAdded: 5,
      linesDeleted: 3,
    },
    {
      eventId: 'mv-approve-1',
      eventType: 'review-approve',
      repoId: 'maestro-player-validation',
      branchName: 'feature/validation-song',
      prNumber: 142,
      timestamp: '2026-04-20T01:15:00.000Z',
      message: 'approved after retest',
      successfulChecks: 4,
      changedFiles: ['src/audio/theme.js'],
      filesChanged: 1,
      linesAdded: 2,
      linesDeleted: 1,
    },
    {
      eventId: 'mv-merge-1',
      eventType: 'merge',
      repoId: 'maestro-player-validation',
      branchName: 'main',
      prNumber: 142,
      timestamp: '2026-04-20T01:18:00.000Z',
      message: 'Merge pull request #142 from feature/validation-song',
      changedFiles: ['src/audio/opening.js', 'src/audio/theme.js'],
      filesChanged: 2,
      linesAdded: 9,
      linesDeleted: 2,
    },
  ];
}

export function buildGoldenListeningScenarios() {
  return [
    {
      id: 'github-public-pr-cadence',
      label: 'GitHub Public PR Cadence',
      provider: 'github',
      sourceUrl: 'https://github.com/openai/maestro-player/tree/feature/cadence',
      sourceLabel: 'GitHub Public PR Cadence',
      listeningFocus: [
        'Feature intro motif should establish quickly.',
        'Request-changes should create the clearest tension peak.',
        'Approval and merge should sound like separate release stages.',
      ],
      events: [
        {
          eventId: 'gh-demo-commit-1',
          eventType: 'commit',
          repoId: 'golden-listening-github',
          branchName: 'feature/cadence',
          prNumber: 81,
          timestamp: '2026-04-20T10:00:00.000Z',
          message: 'feat: add replay intro theme',
          changedFiles: ['src/player/intro.js', 'new:src/player/motif.js'],
          filesChanged: 2,
          linesAdded: 36,
          linesDeleted: 6,
          newFileCount: 1,
          newDirectoryCount: 1,
        },
        {
          eventId: 'gh-demo-pr-open-1',
          eventType: 'pr-open',
          repoId: 'golden-listening-github',
          branchName: 'feature/cadence',
          prNumber: 81,
          timestamp: '2026-04-20T10:03:00.000Z',
          message: 'Feature cadence polish',
          changedFiles: [],
          filesChanged: 0,
          linesAdded: 0,
          linesDeleted: 0,
        },
        {
          eventId: 'gh-demo-review-request-1',
          eventType: 'review-request-changes',
          repoId: 'golden-listening-github',
          branchName: 'feature/cadence',
          prNumber: 81,
          timestamp: '2026-04-20T10:07:00.000Z',
          message: 'Please tighten the bridge section.',
          changedFiles: ['src/player/intro.js'],
          filesChanged: 1,
          linesAdded: 0,
          linesDeleted: 2,
        },
        {
          eventId: 'gh-demo-review-comment-1',
          eventType: 'review-comment',
          repoId: 'golden-listening-github',
          branchName: 'feature/cadence',
          prNumber: 81,
          timestamp: '2026-04-20T10:08:00.000Z',
          message: 'This needs a smoother release.',
          changedFiles: ['src/audio/bridge.js'],
          filesChanged: 1,
          linesAdded: 0,
          linesDeleted: 0,
        },
        {
          eventId: 'gh-demo-commit-2',
          eventType: 'commit',
          repoId: 'golden-listening-github',
          branchName: 'feature/cadence',
          prNumber: 81,
          timestamp: '2026-04-20T10:11:00.000Z',
          message: 'fix: smooth cadence handoff',
          changedFiles: ['src/player/intro.js'],
          filesChanged: 1,
          linesAdded: 10,
          linesDeleted: 4,
        },
        {
          eventId: 'gh-demo-approve-1',
          eventType: 'review-approve',
          repoId: 'golden-listening-github',
          branchName: 'feature/cadence',
          prNumber: 81,
          timestamp: '2026-04-20T10:15:00.000Z',
          message: 'Looks good now.',
          successfulChecks: 3,
          changedFiles: ['src/player/intro.js'],
          filesChanged: 1,
          linesAdded: 0,
          linesDeleted: 0,
        },
        {
          eventId: 'gh-demo-merge-1',
          eventType: 'merge',
          repoId: 'golden-listening-github',
          branchName: 'main',
          prNumber: 81,
          timestamp: '2026-04-20T10:18:00.000Z',
          message: 'Merge pull request #81 from contributor/feature-song',
          changedFiles: ['src/player/intro.js'],
          filesChanged: 1,
          linesAdded: 10,
          linesDeleted: 2,
        },
      ],
    },
    {
      id: 'gitlab-public-discussion-resolution',
      label: 'GitLab Public Discussion Resolution',
      provider: 'gitlab',
      sourceUrl: 'https://gitlab.com/openai/maestro-player/-/tree/feature/cadence',
      sourceLabel: 'GitLab Public Discussion Resolution',
      listeningFocus: [
        'Discussion reopen should feel like tension returning after partial release.',
        'Resolved discussion should be softer than final merge closure.',
        'Approval should not overshadow the final merge cadence.',
      ],
      events: [
        {
          eventId: 'gl-demo-commit-1',
          eventType: 'commit',
          repoId: 'golden-listening-gitlab',
          branchName: 'feature/cadence',
          prNumber: 11,
          timestamp: '2026-04-20T11:00:00.000Z',
          message: 'feat: add merge request groove',
          changedFiles: ['src/player/glide.js', 'new:src/player/mr-theme.js'],
          filesChanged: 2,
          linesAdded: 20,
          linesDeleted: 6,
          newFileCount: 1,
          newDirectoryCount: 1,
        },
        {
          eventId: 'gl-demo-pr-open-1',
          eventType: 'pr-open',
          repoId: 'golden-listening-gitlab',
          branchName: 'feature/cadence',
          prNumber: 11,
          timestamp: '2026-04-20T11:02:00.000Z',
          message: 'GitLab cadence polish',
          changedFiles: [],
          filesChanged: 0,
          linesAdded: 0,
          linesDeleted: 0,
        },
        {
          eventId: 'gl-demo-review-request-1',
          eventType: 'review-request-changes',
          repoId: 'golden-listening-gitlab',
          branchName: 'feature/cadence',
          prNumber: 11,
          timestamp: '2026-04-20T11:06:00.000Z',
          message: 'Please smooth out the cadence handoff.',
          changedFiles: ['src/audio/gitlab-bridge.js'],
          filesChanged: 1,
          linesAdded: 0,
          linesDeleted: 2,
        },
        {
          eventId: 'gl-demo-review-resolve-1',
          eventType: 'review-resolve',
          repoId: 'golden-listening-gitlab',
          branchName: 'feature/cadence',
          prNumber: 11,
          timestamp: '2026-04-20T11:10:00.000Z',
          message: 'Consider tightening the synth release.',
          changedFiles: ['src/audio/gitlab-bridge.js'],
          filesChanged: 1,
          linesAdded: 2,
          linesDeleted: 1,
        },
        {
          eventId: 'gl-demo-review-reopen-1',
          eventType: 'review-reopen',
          repoId: 'golden-listening-gitlab',
          branchName: 'feature/cadence',
          prNumber: 11,
          timestamp: '2026-04-20T11:12:00.000Z',
          message: 'Reopening after retest because the click is still audible.',
          changedFiles: ['src/audio/gitlab-loop.js'],
          filesChanged: 1,
          linesAdded: 0,
          linesDeleted: 1,
        },
        {
          eventId: 'gl-demo-approve-1',
          eventType: 'review-approve',
          repoId: 'golden-listening-gitlab',
          branchName: 'feature/cadence',
          prNumber: 11,
          timestamp: '2026-04-20T11:15:00.000Z',
          message: 'Approved after retest.',
          successfulChecks: 4,
          changedFiles: ['src/audio/gitlab-loop.js'],
          filesChanged: 1,
          linesAdded: 0,
          linesDeleted: 0,
        },
        {
          eventId: 'gl-demo-merge-1',
          eventType: 'merge',
          repoId: 'golden-listening-gitlab',
          branchName: 'main',
          prNumber: 11,
          timestamp: '2026-04-20T11:18:00.000Z',
          message: "Merge branch 'feature/cadence' into 'main'",
          changedFiles: ['src/player/glide.js'],
          filesChanged: 1,
          linesAdded: 7,
          linesDeleted: 2,
        },
      ],
    },
    {
      id: 'transition-overlay-practice',
      label: 'Transition Overlay Practice',
      provider: 'hybrid',
      sourceUrl: 'fixture://transition-overlay-practice',
      sourceLabel: 'Transition Overlay Practice',
      listeningFocus: [
        'Push should behave like a short fill, not a new melody lead.',
        'Sync should sound like re-centering rather than escalation.',
        'Merge should still dominate as the clearest ending.',
      ],
      events: buildTransitionValidationFixture(),
    },
  ];
}

export function buildGoldenListeningPackEntries() {
  return buildGoldenListeningScenarios().map((scenario) => summarizeScenario(scenario));
}

export function buildGoldenListeningSource(entry) {
  return {
    sourceType: 'golden-listening-demo',
    provider: entry.provider,
    visibility: 'fixture',
    repoSlug: entry.id,
    sourceLabel: entry.sourceLabel || entry.label,
    targetPathOrId: entry.id,
    branchName: entry.branchName || 'golden-demo',
    canonicalUrl: entry.sourceUrl,
  };
}

function summarizeScenario(scenario) {
  const plan = buildMusicPlan(scenario.events, { laneCount: 4 });
  const chart = createChartFromMusicPlan(plan, { laneCount: 4, maxNotesPerBeat: 2 });
  const cuePlan = createReplayCuePlan(chart.notes, { laneCount: 4 });
  const primarySession = plan[0];
  const allIntents = plan.flatMap((session) => session.intents);
  const peakTensionIntent = [...allIntents].sort((left, right) => right.tension - left.tension)[0];
  const peakResolutionIntent = pickPeakResolutionIntent(allIntents);

  return {
    ...scenario,
    sessionCount: plan.length,
    eventCount: scenario.events.length,
    cueBatchCount: cuePlan.length,
    noteCount: chart.notes.length,
    tempo: primarySession.tempo,
    motifId: primarySession.motif.motifId,
    key: primarySession.harmony.key,
    roleSequence: allIntents.map((intent) => intent.structuralRole),
    rhythmSequence: allIntents.map((intent) => intent.rhythmPattern),
    harmonySequence: allIntents.map((intent) => intent.harmonyAction),
    peakTensionEvent: describeIntent(allIntents, peakTensionIntent.eventRef),
    peakResolutionEvent: describeIntent(allIntents, peakResolutionIntent.eventRef),
    cueSummaryPreview: cuePlan.slice(0, 4).map((batch) => batch.summary),
  };
}

function describeIntent(intents, eventRef) {
  const intent = intents.find((entry) => entry.eventRef === eventRef);
  if (!intent) {
    return null;
  }

  return {
    eventRef: intent.eventRef,
    eventType: intent.eventType,
    structuralRole: intent.structuralRole,
    rhythmPattern: intent.rhythmPattern,
    harmonyAction: intent.harmonyAction,
  };
}

function pickPeakResolutionIntent(intents) {
  return [...intents].sort((left, right) => scoreResolutionIntent(right) - scoreResolutionIntent(left))[0];
}

function scoreResolutionIntent(intent) {
  let score = intent.accentLevel || 0;

  if (intent.eventType === 'merge') {
    score += 3;
  } else if (intent.eventType === 'review-approve' || intent.eventType === 'history-approved') {
    score += 2;
  } else if (intent.eventType === 'review-resolve') {
    score += 1.25;
  }

  if (intent.structuralRole === 'outro') {
    score += 1;
  } else if (intent.structuralRole === 'cadence') {
    score += 0.5;
  }

  if (intent.harmonyAction === 'resolve') {
    score += 0.5;
  }

  return score;
}
