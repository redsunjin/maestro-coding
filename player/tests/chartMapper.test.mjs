import test from 'node:test';
import assert from 'node:assert/strict';

import { createChartFromMusicPlan } from '../src/lib/chartMapper.js';
import { buildMusicPlan } from '../src/lib/musicIntentMapper.js';

test('merge events resolve onto the accent lane in a 4-lane chart', () => {
  const plan = buildMusicPlan([
    {
      eventId: 'commit-1',
      eventType: 'commit',
      repoId: 'maestro-demo',
      branchName: 'feature/chart-ending',
      timestamp: '2026-04-17T11:00:00.000Z',
      message: 'feat: add chart finale',
      changedFiles: ['src/chart/finale.js'],
      filesChanged: 1,
      linesAdded: 90,
      linesDeleted: 8,
    },
    {
      eventId: 'merge-1',
      eventType: 'merge',
      repoId: 'maestro-demo',
      branchName: 'feature/chart-ending',
      timestamp: '2026-04-17T11:09:00.000Z',
      message: 'Merge pull request #22',
      changedFiles: ['src/chart/finale.js'],
      filesChanged: 1,
      linesAdded: 4,
      linesDeleted: 1,
    },
  ], { laneCount: 4 });

  const chart = createChartFromMusicPlan(plan, { laneCount: 4, maxNotesPerBeat: 2 });
  const mergeNotes = chart.notes.filter((note) => note.eventRef === 'merge-1');

  assert.ok(mergeNotes.length >= 1);
  assert.ok(mergeNotes.every((note) => note.laneIndex === 4));
  assert.ok(mergeNotes.some((note) => note.noteType === 'accent' || note.noteType === 'hold'));
});

test('chart mapper keeps per-beat note density under the configured cap', () => {
  const highDensityEvents = Array.from({ length: 4 }, (_, index) => ({
    eventId: `push-${index + 1}`,
    eventType: 'push',
    repoId: 'maestro-demo',
    branchName: 'feature/push-burst',
    timestamp: `2026-04-17T12:0${index}:00.000Z`,
    message: 'push activity burst',
    changedFiles: ['src/app.js'],
    filesChanged: 1,
    linesAdded: 6,
    linesDeleted: 0,
  }));

  const plan = buildMusicPlan(highDensityEvents, { laneCount: 4 });
  const chart = createChartFromMusicPlan(plan, { laneCount: 4, maxNotesPerBeat: 2 });
  const bucketCounts = new Map();

  for (const note of chart.notes) {
    const bucket = Math.floor(note.beatOffset);
    bucketCounts.set(bucket, (bucketCounts.get(bucket) || 0) + 1);
  }

  const maxBucketSize = Math.max(...bucketCounts.values());
  assert.ok(maxBucketSize <= 2);
});
