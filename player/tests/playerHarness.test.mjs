import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { createChartFromMusicPlan } from '../src/lib/chartMapper.js';
import { createConnectedAccountRepoSource } from '../src/lib/accountRepoAdapter.js';
import { loadGitReplayEvents } from '../src/lib/gitReplayAdapter.js';
import { createPublicRepoSource } from '../src/lib/publicRepoAdapter.js';
import { buildMusicPlan } from '../src/lib/musicIntentMapper.js';
import { buildHarnessReplayFixture } from './fixtures/replayFixture.mjs';

test('player harness keeps required docs and source files in sync', () => {
  const requiredPaths = [
    '../README.md',
    '../../docs/maestro-player/README.md',
    '../../docs/maestro-player/mvp-spec.md',
    '../../docs/maestro-player/music-mapping-spec.md',
    '../../docs/maestro-player/PLAYER_BRANCH_HARNESS_PLAN.md',
    '../src/lib/accountRepoAdapter.js',
    '../src/lib/browserLocalRepoBridge.js',
    '../src/lib/collaborationOverlayAdapter.js',
    '../src/lib/gitReplayAdapter.js',
    '../src/lib/localRepoBridge.js',
    '../src/lib/metronomeEngine.js',
    '../src/lib/performanceHistoryStore.js',
    '../src/lib/replayAudioEngine.js',
    '../src/lib/sourceRegistry.js',
    '../src/lib/publicRepoAdapter.js',
    '../src/lib/musicIntentMapper.js',
    '../src/lib/chartMapper.js',
    '../src/lib/motifCatalog.js',
    '../src/lib/harmonyEngine.js',
    '../src/components/PlayerRunPanel.jsx',
    '../src/components/ScoreHistoryPanel.jsx',
    '../server/localReplayBridgePlugin.js',
  ];

  requiredPaths.forEach((relativePath) => {
    assert.equal(
      existsSync(resolve(import.meta.dirname, relativePath)),
      true,
      `missing required harness path: ${relativePath}`,
    );
  });
});

test('player harness fixture produces stable session semantics across PR and merge events', () => {
  const plan = buildMusicPlan(buildHarnessReplayFixture(), { laneCount: 4 });

  assert.equal(plan.length, 1);
  assert.equal(plan[0].branchKey, 'pr:81');
  assert.equal(plan[0].intents.length, 5);
  assert.equal(plan[0].intents[0].motifId, plan[0].intents[4].motifId);
  assert.equal(plan[0].intents[2].structuralRole, 'bridge');
  assert.equal(plan[0].intents[3].structuralRole, 'cadence');
  assert.equal(plan[0].intents[4].structuralRole, 'outro');
});

test('player harness fixture produces a playable chart with merge resolution and density control', () => {
  const plan = buildMusicPlan(buildHarnessReplayFixture(), { laneCount: 4 });
  const chart = createChartFromMusicPlan(plan, { laneCount: 4, maxNotesPerBeat: 2 });
  const mergeNotes = chart.notes.filter((note) => note.eventRef === 'fixture-merge-1');
  const bucketCounts = new Map();

  chart.notes.forEach((note) => {
    const bucket = Math.floor(note.beatOffset);
    bucketCounts.set(bucket, (bucketCounts.get(bucket) || 0) + 1);
  });

  assert.ok(mergeNotes.length >= 1);
  assert.ok(mergeNotes.every((note) => note.laneIndex === 4));
  assert.ok(Math.max(...bucketCounts.values()) <= 2);
});

test('player harness can ingest live git history from the current worktree with read-only commands', () => {
  const repoPath = resolve(import.meta.dirname, '../..');
  const events = loadGitReplayEvents({
    repoPath,
    ref: 'HEAD',
    maxCommits: 4,
  });

  assert.ok(events.length >= 1);
  assert.ok(events.every((event) => event.sourceType === 'git'));
  assert.ok(events.every((event) => ['commit', 'merge', 'revert'].includes(event.eventType)));
});

test('player harness can register a public repository replay source from a github url', () => {
  const source = createPublicRepoSource({
    url: 'https://github.com/openai/openai-python',
  });

  assert.equal(source.sourceType, 'git-public-url');
  assert.equal(source.visibility, 'public');
  assert.equal(source.repoSlug, 'openai/openai-python');
});

test('player harness can register a connected account repository replay source', () => {
  const source = createConnectedAccountRepoSource({
    owner: 'agent',
    repo: 'private-player-repo',
    accountId: 'github-user-1',
    defaultBranch: 'main',
    visibility: 'private',
  });

  assert.equal(source.sourceType, 'git-account');
  assert.equal(source.visibility, 'private');
  assert.equal(source.repoSlug, 'agent/private-player-repo');
});
