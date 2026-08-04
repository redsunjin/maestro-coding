import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';

import {
  buildGitLogArgs,
  loadGitReplayEvents,
  parseGitLogOutput,
  resolveGitBranchName,
} from '../src/lib/gitReplayAdapter.js';
import { RAW_GIT_LOG_FIXTURE } from './fixtures/gitLogFixture.mjs';

test('parseGitLogOutput classifies commit, merge, and revert records with git stats', () => {
  const events = parseGitLogOutput(RAW_GIT_LOG_FIXTURE, {
    repoId: 'fixture-repo',
    branchName: 'feature/branch-song',
    repoPath: '/tmp/fixture-repo',
  });

  assert.equal(events.length, 3);

  assert.equal(events[0].eventType, 'commit');
  assert.equal(events[0].actor, 'Alice');
  assert.equal(events[0].branchName, 'feature/branch-song');
  assert.equal(events[0].filesChanged, 3);
  assert.equal(events[0].linesAdded, 22);
  assert.equal(events[0].linesDeleted, 2);
  assert.equal(events[0].newFileCount, 1);
  assert.ok(events[0].changedFiles.includes('new:src/audio/seed.js'));

  assert.equal(events[1].eventType, 'merge');
  assert.equal(events[1].branchName, 'main');
  assert.equal(events[1].parentShas.length, 2);

  assert.equal(events[2].eventType, 'revert');
  assert.equal(events[2].linesDeleted, 10);
});

test('buildGitLogArgs keeps the adapter on read-only git log commands', () => {
  const args = buildGitLogArgs({
    ref: 'main',
    maxCommits: 12,
    since: '2026-04-01',
    until: '2026-04-30',
  });

  assert.equal(args[0], 'log');
  assert.ok(args.includes('--numstat'));
  assert.ok(args.includes('--summary'));
  assert.ok(args.includes('--reverse'));
  assert.ok(args.includes('-12'));
  assert.ok(args.includes('--since=2026-04-01'));
  assert.ok(args.includes('--until=2026-04-30'));
  assert.equal(args.at(-1), 'main');
  assert.equal(args.some((arg) => ['merge', 'push', 'reset', 'checkout'].includes(arg)), false);
});

test('loadGitReplayEvents reads the current repo through git log and returns normalized replay events', () => {
  const repoPath = resolve(import.meta.dirname, '../..');
  const branchName = resolveGitBranchName(repoPath, 'HEAD');
  const events = loadGitReplayEvents({
    repoPath,
    ref: 'HEAD',
    branchName,
    maxCommits: 5,
  });

  assert.ok(events.length >= 1);
  assert.ok(events.length <= 5);
  assert.ok(events.every((event) => event.sourceType === 'git'));
  assert.ok(events.every((event) => event.commitSha));
  assert.ok(events.every((event) => event.timestamp));
  assert.ok(events.every((event) => event.branchName));
  assert.ok(events.every((event) => ['commit', 'merge', 'revert'].includes(event.eventType)));
});
