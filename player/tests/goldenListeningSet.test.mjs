import test from 'node:test';
import assert from 'node:assert/strict';

import { buildGoldenListeningPack } from '../scripts/exportGoldenListeningPack.mjs';
import { buildGoldenListeningScenarios } from './fixtures/goldenListeningSet.mjs';

test('golden listening set exposes three stable autoplay scenarios', () => {
  const scenarios = buildGoldenListeningScenarios();

  assert.equal(scenarios.length, 3);
  assert.deepEqual(scenarios.map((scenario) => scenario.id), [
    'github-public-pr-cadence',
    'gitlab-public-discussion-resolution',
    'transition-overlay-practice',
  ]);
});

test('golden listening pack summarizes each scenario with stable musical metadata', () => {
  const entries = buildGoldenListeningPack();

  assert.equal(entries.length, 3);
  assert.ok(entries.every((entry) => entry.tempo >= 100));
  assert.ok(entries.every((entry) => entry.noteCount >= 2));
  assert.ok(entries.every((entry) => entry.cueBatchCount >= 1));
  assert.ok(entries.every((entry) => entry.listeningFocus.length >= 3));

  const githubEntry = entries.find((entry) => entry.id === 'github-public-pr-cadence');
  const gitlabEntry = entries.find((entry) => entry.id === 'gitlab-public-discussion-resolution');
  const transitionEntry = entries.find((entry) => entry.id === 'transition-overlay-practice');

  assert.ok(githubEntry);
  assert.equal(githubEntry.provider, 'github');
  assert.equal(githubEntry.peakResolutionEvent.eventType, 'merge');

  assert.ok(gitlabEntry);
  assert.equal(gitlabEntry.provider, 'gitlab');
  assert.ok(gitlabEntry.rhythmSequence.includes('syncopated'));

  assert.ok(transitionEntry);
  assert.equal(transitionEntry.provider, 'hybrid');
  assert.equal(transitionEntry.peakTensionEvent.eventType, 'review-request-changes');
  assert.ok(transitionEntry.rhythmSequence.includes('fill'));
});
