import test from 'node:test';
import assert from 'node:assert/strict';

import {
  LOCAL_REPO_BRIDGE_GLOBAL_KEYS,
  createLocalRepoBridgeSource,
  detectLocalRepoBridge,
  hasLocalRepoBridge,
  loadLocalRepoReplayEvents,
  normalizeLocalRepoBridgeResult,
} from '../src/lib/localRepoBridge.js';

test('detectLocalRepoBridge finds a supported bridge on global-like objects', () => {
  const bridge = {
    async loadLocalRepoReplayEvents() {
      return [];
    },
  };

  const detected = detectLocalRepoBridge({
    [LOCAL_REPO_BRIDGE_GLOBAL_KEYS[1]]: bridge,
  });

  assert.equal(detected, bridge);
  assert.equal(hasLocalRepoBridge({
    [LOCAL_REPO_BRIDGE_GLOBAL_KEYS[0]]: bridge,
  }), true);
  assert.equal(hasLocalRepoBridge({ maestroPlayerLocalRepoBridge: {} }), false);
});

test('normalizeLocalRepoBridgeResult converts bridge payloads into app-safe source and event shapes', () => {
  const result = normalizeLocalRepoBridgeResult({
    source: {
      repoPath: '/repos/player',
      branchName: 'feature/bridge',
      repoId: 'player-repo',
      name: 'desktop-bridge',
      version: '0.2.0',
    },
    events: [
      {
        id: 'commit-1',
        type: 'rollback',
        occurredAt: '2026-04-18T09:30:00Z',
        author: 'Agent',
        branch: 'feature/bridge',
        sha: 'abc123',
        files: [
          { path: 'src/main.js', status: 'modified' },
          { path: 'src/new-song.js', status: 'added' },
        ],
        additions: 12,
        deletions: 4,
      },
    ],
  }, {
    repoPath: '/repos/player',
    sourceLabel: 'Local Repo',
  });

  assert.equal(result.source.sourceType, 'git-local');
  assert.equal(result.source.provider, 'local');
  assert.equal(result.source.branchName, 'feature/bridge');
  assert.equal(result.source.metadata.repoPath, '/repos/player');
  assert.equal(result.source.metadata.bridgeName, 'desktop-bridge');
  assert.equal(result.source.metadata.bridgeVersion, '0.2.0');

  assert.equal(result.replayEvents.length, 1);
  assert.equal(result.replayEvents[0].sourceType, 'git-local');
  assert.equal(result.replayEvents[0].eventType, 'revert');
  assert.equal(result.replayEvents[0].actor, 'Agent');
  assert.equal(result.replayEvents[0].commitSha, 'abc123');
  assert.deepEqual(result.replayEvents[0].changedFiles, ['src/main.js', 'new:src/new-song.js']);
  assert.equal(result.replayEvents[0].filesChanged, 2);
  assert.equal(result.replayEvents[0].newFileCount, 1);
  assert.equal(result.replayEvents[0].newDirectoryCount, 1);
  assert.equal(result.replayEvents[0].weight, 18);
  assert.ok(result.replayEvents[0].replayId.startsWith('local:'));
});

test('loadLocalRepoReplayEvents prefers an injected bridge, sends a read-only request, and normalizes arrays', async () => {
  const calls = [];
  const bridge = {
    async loadReplayEvents(request) {
      calls.push(request);
      return [
        {
          eventId: 'commit-2',
          timestamp: '2026-04-18T10:00:00Z',
          actor: 'Bridge Dev',
          branchName: 'main',
          commitSha: 'def456',
          changedFiles: ['README.md'],
        },
      ];
    },
  };

  const result = await loadLocalRepoReplayEvents({
    bridge,
    globalObject: {
      [LOCAL_REPO_BRIDGE_GLOBAL_KEYS[0]]: {
        async loadLocalRepoReplayEvents() {
          throw new Error('should not use detected bridge when bridge option is supplied');
        },
      },
    },
    repoPath: '/repos/app',
    branchName: 'main',
    maxCommits: 6.7,
    since: '2026-04-01',
    until: '2026-04-30',
    repoId: 'app-repo',
    sourceLabel: 'App Repo',
  });

  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], {
    repoPath: '/repos/app',
    branchName: 'main',
    maxCommits: 6,
    since: '2026-04-01',
    until: '2026-04-30',
    repoId: 'app-repo',
    sourceLabel: 'App Repo',
  });
  assert.equal(result.source.sourceLabel, 'App Repo');
  assert.equal(result.source.metadata.repoId, 'app-repo');
  assert.equal(result.replayEvents[0].repoId, 'app-repo');
  assert.equal(result.replayEvents[0].title, 'def456');
  assert.equal(result.replayEvents[0].weight, 1);
});

test('createLocalRepoBridgeSource falls back to path-derived labels and preserves private local metadata', () => {
  const source = createLocalRepoBridgeSource({
    repoPath: '/workspace/demo-repo',
    branchName: 'develop',
  });

  assert.equal(source.sourceType, 'git-local');
  assert.equal(source.visibility, 'private');
  assert.equal(source.sourceLabel, '/workspace/demo-repo');
  assert.equal(source.targetPathOrId, '/workspace/demo-repo');
  assert.equal(source.branchName, 'develop');
  assert.equal(source.metadata.defaultBranch, 'develop');
});

test('loadLocalRepoReplayEvents throws when no compatible bridge is available', async () => {
  await assert.rejects(
    () => loadLocalRepoReplayEvents({
      globalObject: {},
    }),
    /local repo bridge is unavailable/,
  );
});
