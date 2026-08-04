import test from 'node:test';
import assert from 'node:assert/strict';

import { buildMusicPlan } from '../src/lib/musicIntentMapper.js';

function buildFeatureEvents() {
  return [
    {
      eventId: 'c1',
      eventType: 'commit',
      repoId: 'maestro-demo',
      branchName: 'feature/audio-theme',
      timestamp: '2026-04-17T09:00:00.000Z',
      message: 'feat: add replay motif seed',
      changedFiles: ['src/audio/motif.js', 'src/audio/scale.js'],
      filesChanged: 2,
      linesAdded: 120,
      linesDeleted: 18,
      newFileCount: 1,
      newDirectoryCount: 1,
    },
    {
      eventId: 'c2',
      eventType: 'review-request-changes',
      repoId: 'maestro-demo',
      branchName: 'feature/audio-theme',
      timestamp: '2026-04-17T09:08:00.000Z',
      message: 'needs stronger cadence',
      changedFiles: ['src/audio/motif.js'],
    },
    {
      eventId: 'c3',
      eventType: 'review-resolve',
      repoId: 'maestro-demo',
      branchName: 'feature/audio-theme',
      timestamp: '2026-04-17T09:12:00.000Z',
      message: 'resolved after patch review',
      changedFiles: ['src/audio/motif.js'],
    },
    {
      eventId: 'c4',
      eventType: 'review-reopen',
      repoId: 'maestro-demo',
      branchName: 'feature/audio-theme',
      timestamp: '2026-04-17T09:14:00.000Z',
      message: 'reopened after retest',
      changedFiles: ['src/audio/motif.js'],
    },
    {
      eventId: 'c5',
      eventType: 'review-approve',
      repoId: 'maestro-demo',
      branchName: 'feature/audio-theme',
      timestamp: '2026-04-17T09:16:00.000Z',
      message: 'approved',
      successfulChecks: 3,
      changedFiles: ['src/audio/motif.js'],
    },
    {
      eventId: 'c6',
      eventType: 'merge',
      repoId: 'maestro-demo',
      branchName: 'feature/audio-theme',
      timestamp: '2026-04-17T09:19:00.000Z',
      message: 'Merge pull request #81',
      changedFiles: ['src/audio/motif.js', 'src/audio/scale.js'],
      filesChanged: 2,
      linesAdded: 10,
      linesDeleted: 2,
    },
  ];
}

test('buildMusicPlan keeps motif, key, and tempo deterministic for the same branch', () => {
  const events = buildFeatureEvents();
  const firstRun = buildMusicPlan(events, { laneCount: 4 });
  const secondRun = buildMusicPlan(events, { laneCount: 4 });

  assert.equal(firstRun[0].motif.motifId, secondRun[0].motif.motifId);
  assert.equal(firstRun[0].harmony.key, secondRun[0].harmony.key);
  assert.equal(firstRun[0].tempo, secondRun[0].tempo);
  assert.deepEqual(
    firstRun[0].intents.map((intent) => ({
      eventRef: intent.eventRef,
      structuralRole: intent.structuralRole,
      rhythmPattern: intent.rhythmPattern,
      harmonyAction: intent.harmonyAction,
    })),
    secondRun[0].intents.map((intent) => ({
      eventRef: intent.eventRef,
      structuralRole: intent.structuralRole,
      rhythmPattern: intent.rhythmPattern,
      harmonyAction: intent.harmonyAction,
    })),
  );
});

test('review request changes maps to a high-tension syncopated intent', () => {
  const plan = buildMusicPlan(buildFeatureEvents(), { laneCount: 4 });
  const reviewIntent = plan[0].intents.find((intent) => intent.eventType === 'review-request-changes');

  assert.ok(reviewIntent);
  assert.equal(reviewIntent.structuralRole, 'bridge');
  assert.equal(reviewIntent.rhythmPattern, 'syncopated');
  assert.ok(reviewIntent.tension >= 0.55);
  assert.equal(reviewIntent.harmonyAction, 'suspend');
});

test('review resolve and reopen map to distinct cadence and bridge intents', () => {
  const plan = buildMusicPlan(buildFeatureEvents(), { laneCount: 4 });
  const resolveIntent = plan[0].intents.find((intent) => intent.eventType === 'review-resolve');
  const reopenIntent = plan[0].intents.find((intent) => intent.eventType === 'review-reopen');

  assert.ok(resolveIntent);
  assert.equal(resolveIntent.structuralRole, 'cadence');
  assert.equal(resolveIntent.harmonyAction, 'resolve');
  assert.equal(resolveIntent.rhythmPattern, 'steady');

  assert.ok(reopenIntent);
  assert.equal(reopenIntent.structuralRole, 'bridge');
  assert.equal(reopenIntent.harmonyAction, 'suspend');
  assert.equal(reopenIntent.rhythmPattern, 'syncopated');
  assert.ok(reopenIntent.tension > resolveIntent.tension);
});

test('git-only replay still forms a valid music plan without collaboration overlay events', () => {
  const events = [
    {
      eventId: 'g1',
      eventType: 'commit',
      repoId: 'maestro-demo',
      branchName: 'feature/git-only',
      timestamp: '2026-04-17T10:00:00.000Z',
      message: 'fix: cap chart density',
      changedFiles: ['src/chart.js', 'tests/chart.test.js'],
      filesChanged: 2,
      linesAdded: 48,
      linesDeleted: 12,
    },
    {
      eventId: 'g2',
      eventType: 'merge',
      repoId: 'maestro-demo',
      branchName: 'feature/git-only',
      timestamp: '2026-04-17T10:11:00.000Z',
      message: 'Merge branch feature/git-only',
      changedFiles: ['src/chart.js'],
      filesChanged: 1,
      linesAdded: 8,
      linesDeleted: 1,
    },
  ];

  const plan = buildMusicPlan(events, { laneCount: 4 });

  assert.equal(plan.length, 1);
  assert.equal(plan[0].intents.length, 2);
  assert.equal(plan[0].intents[0].eventType, 'commit');
  assert.equal(plan[0].intents[1].eventType, 'merge');
  assert.equal(plan[0].intents[1].harmonyAction, 'resolve');
});
