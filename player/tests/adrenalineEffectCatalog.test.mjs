import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ADRENALINE_EFFECT_IDS,
  detectAdrenalineEffects,
  getAdrenalineEffectDefinition,
} from '../src/lib/adrenalineEffectCatalog.js';

test('adrenaline effect catalog stores the commit and PR barrage phrase', () => {
  const definition = getAdrenalineEffectDefinition(ADRENALINE_EFFECT_IDS.commitBacklogBarrage);

  assert.ok(definition);
  assert.equal(definition.copy.ko.headline, '거침없이 커밋해라.');
  assert.equal(definition.copy.ko.callout, '풀리퀘스트는 거침없이 쏴라.');
  assert.equal(definition.triggerType, 'commit-backlog');
  assert.equal(definition.visual.laneGlow, 'amber-cyan-overdrive');
});

test('detectAdrenalineEffects emits a deterministic barrage for a commit backlog window', () => {
  const effects = detectAdrenalineEffects([
    buildCommit('rush-1', 'feature/barrage', '2026-04-23T01:00:00Z'),
    buildCommit('rush-2', 'feature/barrage', '2026-04-23T01:08:00Z'),
    buildCommit('rush-3', 'feature/barrage', '2026-04-23T01:18:00Z'),
    buildCommit('rush-4', 'feature/barrage', '2026-04-23T01:32:00Z'),
  ]);

  assert.equal(effects.length, 1);
  assert.equal(effects[0].effectId, ADRENALINE_EFFECT_IDS.commitBacklogBarrage);
  assert.equal(effects[0].severity, 'rush');
  assert.equal(effects[0].branchKey, 'branch:feature/barrage');
  assert.deepEqual(effects[0].eventRefs, ['rush-1', 'rush-2', 'rush-3', 'rush-4']);
  assert.equal(effects[0].metrics.commitCount, 4);
});

test('detectAdrenalineEffects avoids firing for small or cross-branch commit sets', () => {
  const effects = detectAdrenalineEffects([
    buildCommit('small-1', 'feature/a', '2026-04-23T01:00:00Z'),
    buildCommit('small-2', 'feature/a', '2026-04-23T01:10:00Z'),
    buildCommit('small-3', 'feature/b', '2026-04-23T01:20:00Z'),
    buildCommit('small-4', 'feature/b', '2026-04-23T01:30:00Z'),
  ]);

  assert.equal(effects.length, 0);
});

test('detectAdrenalineEffects upgrades severe commit piles to overdrive', () => {
  const effects = detectAdrenalineEffects(Array.from({ length: 7 }, (_, index) => (
    buildCommit(`overdrive-${index + 1}`, 'feature/overdrive', `2026-04-23T01:${String(index * 4).padStart(2, '0')}:00Z`)
  )));

  assert.equal(effects.length, 1);
  assert.equal(effects[0].severity, 'overdrive');
  assert.equal(effects[0].metrics.commitCount, 7);
});

function buildCommit(eventId, branchName, timestamp) {
  return {
    eventId,
    eventType: 'commit',
    repoId: 'adrenaline-fixture',
    branchName,
    timestamp,
    message: `feat: ${eventId}`,
    changedFiles: ['src/player/run.js'],
    filesChanged: 1,
    linesAdded: 10,
    linesDeleted: 1,
  };
}
