import test from 'node:test';
import assert from 'node:assert/strict';

import {
  LOCAL_REPLAY_BRIDGE_NAME,
  loadLocalReplayBridgePayload,
} from '../server/localReplayBridgePlugin.js';

test('loadLocalReplayBridgePayload normalizes a read-only replay response', () => {
  const capturedCalls = [];
  const payload = loadLocalReplayBridgePayload({
    repoPath: '/Users/Agent/projects/local-player',
    branchName: 'feature/local-bridge',
    maxCommits: 7.8,
    since: '2026-04-01',
    until: '2026-04-18',
    repoId: 'local-player',
    sourceLabel: 'Local Player',
  }, (request) => {
    capturedCalls.push(request);
    return [
      {
        eventId: 'commit-1',
        eventType: 'commit',
        timestamp: '2026-04-18T00:00:00Z',
      },
    ];
  });

  assert.deepEqual(capturedCalls[0], {
    repoPath: '/Users/Agent/projects/local-player',
    branchName: 'feature/local-bridge',
    ref: 'feature/local-bridge',
    maxCommits: 7,
    since: '2026-04-01',
    until: '2026-04-18',
    repoId: 'local-player',
  });
  assert.equal(payload.source.repoPath, '/Users/Agent/projects/local-player');
  assert.equal(payload.source.branchName, 'feature/local-bridge');
  assert.equal(payload.source.name, LOCAL_REPLAY_BRIDGE_NAME);
  assert.equal(payload.events.length, 1);
});

test('loadLocalReplayBridgePayload rejects requests without repoPath', () => {
  assert.throws(
    () => loadLocalReplayBridgePayload({}, () => []),
    /requires repoPath/,
  );
});
