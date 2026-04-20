import test from 'node:test';
import assert from 'node:assert/strict';

import { createChartFromMusicPlan } from '../src/lib/chartMapper.js';
import { buildMusicPlan } from '../src/lib/musicIntentMapper.js';
import { createReplayCuePlan } from '../src/lib/replayAudioEngine.js';
import { buildTransitionValidationFixture } from './fixtures/goldenListeningSet.mjs';

test('music validation harness keeps the musical fingerprint deterministic for the same fixture', () => {
  const firstFingerprint = createMusicFingerprint(buildTransitionValidationFixture());
  const secondFingerprint = createMusicFingerprint(buildTransitionValidationFixture());

  assert.deepEqual(firstFingerprint, secondFingerprint);
});

test('music validation harness preserves tension, resolution, and transition semantics', () => {
  const { plan, chart, cuePlan, fingerprint } = createMusicFingerprint(buildTransitionValidationFixture());
  const session = plan[0];
  const pushIntent = session.intents.find((intent) => intent.eventType === 'push');
  const syncIntent = session.intents.find((intent) => intent.eventType === 'sync');
  const reviewIntent = session.intents.find((intent) => intent.eventType === 'review-request-changes');
  const resolveIntent = session.intents.find((intent) => intent.eventType === 'review-resolve');
  const approveIntent = session.intents.find((intent) => intent.eventType === 'review-approve');
  const mergeIntent = session.intents.find((intent) => intent.eventType === 'merge');
  const mergeNotes = chart.notes.filter((note) => note.eventRef === 'mv-merge-1');
  const pushNotes = chart.notes.filter((note) => note.eventRef === 'mv-push-1');
  const mergeCueCount = cuePlan.flatMap((batch) => batch.cues).filter((cue) => cue.eventRef === 'mv-merge-1').length;
  const pushCueCount = cuePlan.flatMap((batch) => batch.cues).filter((cue) => cue.eventRef === 'mv-push-1').length;

  assert.ok(pushIntent);
  assert.equal(pushIntent.rhythmPattern, 'fill');
  assert.equal(pushIntent.orchestrationHint, 'drum');

  assert.ok(syncIntent);
  assert.equal(syncIntent.rhythmPattern, 'steady');
  assert.equal(syncIntent.harmonyAction, 'repeat');

  assert.ok(reviewIntent);
  assert.equal(reviewIntent.structuralRole, 'bridge');
  assert.ok(reviewIntent.tension > resolveIntent.tension);

  assert.ok(resolveIntent);
  assert.equal(resolveIntent.structuralRole, 'cadence');
  assert.equal(resolveIntent.harmonyAction, 'resolve');

  assert.ok(approveIntent);
  assert.equal(approveIntent.harmonyAction, 'resolve');
  assert.ok(approveIntent.tension < reviewIntent.tension);

  assert.ok(mergeIntent);
  assert.equal(mergeIntent.structuralRole, 'outro');
  assert.equal(mergeIntent.harmonyAction, 'resolve');
  assert.ok(mergeIntent.accentLevel >= approveIntent.accentLevel);

  assert.equal(fingerprint.peakTensionEventRef, 'mv-review-1');
  assert.equal(fingerprint.peakResolutionEventRef, 'mv-merge-1');
  assert.equal(fingerprint.rhythmByEvent['mv-push-1'], 'fill');
  assert.equal(fingerprint.rhythmByEvent['mv-review-1'], 'syncopated');
  assert.equal(fingerprint.rhythmByEvent['mv-sync-1'], 'steady');
  assert.equal(fingerprint.rhythmByEvent['mv-merge-1'], 'hold');

  assert.ok(pushNotes.length >= 1);
  assert.ok(mergeNotes.length >= 1);
  assert.ok(mergeNotes.every((note) => note.laneIndex === 4));
  assert.ok(mergeNotes.every((note) => note.noteType === 'accent'));
  assert.ok(pushCueCount >= 1);
  assert.ok(mergeCueCount >= 1);
});

function createMusicFingerprint(events) {
  const plan = buildMusicPlan(events, { laneCount: 4 });
  const chart = createChartFromMusicPlan(plan, { laneCount: 4, maxNotesPerBeat: 2 });
  const cuePlan = createReplayCuePlan(chart.notes, { laneCount: 4 });
  const session = plan[0];
  const eventCueCounts = {};
  const eventNoteCounts = {};

  chart.notes.forEach((note) => {
    eventNoteCounts[note.eventRef] = (eventNoteCounts[note.eventRef] || 0) + 1;
  });

  cuePlan.forEach((batch) => {
    batch.cues.forEach((cue) => {
      eventCueCounts[cue.eventRef] = (eventCueCounts[cue.eventRef] || 0) + 1;
    });
  });

  const peakTensionIntent = [...session.intents].sort((left, right) => right.tension - left.tension)[0];
  const peakResolutionIntent = [...session.intents].sort((left, right) => right.accentLevel - left.accentLevel)[0];

  return {
    plan,
    chart,
    cuePlan,
    fingerprint: {
      motifId: session.motif.motifId,
      key: session.harmony.key,
      tempo: session.tempo,
      roleSequence: session.intents.map((intent) => intent.structuralRole),
      rhythmSequence: session.intents.map((intent) => intent.rhythmPattern),
      harmonySequence: session.intents.map((intent) => intent.harmonyAction),
      rhythmByEvent: Object.fromEntries(session.intents.map((intent) => [intent.eventRef, intent.rhythmPattern])),
      peakTensionEventRef: peakTensionIntent.eventRef,
      peakResolutionEventRef: peakResolutionIntent.eventRef,
      eventNoteCounts,
      eventCueCounts,
      cueBatchCount: cuePlan.length,
      accentNoteCount: chart.notes.filter((note) => note.noteType === 'accent').length,
    },
  };
}
