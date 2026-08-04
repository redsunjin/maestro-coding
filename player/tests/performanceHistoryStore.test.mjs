import test from 'node:test';
import assert from 'node:assert/strict';

import {
  appendPerformanceRecord,
  clearPerformanceHistory,
  getPerformanceHistoryStorageKey,
  loadPerformanceHistory,
} from '../src/lib/performanceHistoryStore.js';

test('appendPerformanceRecord persists newest-first history', () => {
  const globalObject = createStorageHarness();

  appendPerformanceRecord(createRecord({
    runId: 'run-1',
    score: 1200,
    finishedAt: '2026-04-18T08:00:00Z',
  }), globalObject);
  const nextHistory = appendPerformanceRecord(createRecord({
    runId: 'run-2',
    score: 2200,
    finishedAt: '2026-04-18T09:00:00Z',
  }), globalObject);

  assert.equal(nextHistory.length, 2);
  assert.equal(nextHistory[0].runId, 'run-2');
  assert.equal(nextHistory[1].runId, 'run-1');
  assert.equal(
    JSON.parse(globalObject.localStorage.getItem(getPerformanceHistoryStorageKey())).length,
    2,
  );
});

test('loadPerformanceHistory ignores invalid storage payloads', () => {
  const globalObject = createStorageHarness();
  globalObject.localStorage.setItem(getPerformanceHistoryStorageKey(), '{"broken":true}');

  assert.deepEqual(loadPerformanceHistory(globalObject), []);
});

test('clearPerformanceHistory removes stored records', () => {
  const globalObject = createStorageHarness();
  appendPerformanceRecord(createRecord({
    runId: 'run-3',
    finishedAt: '2026-04-18T10:00:00Z',
  }), globalObject);

  clearPerformanceHistory(globalObject);

  assert.equal(globalObject.localStorage.getItem(getPerformanceHistoryStorageKey()), null);
  assert.deepEqual(loadPerformanceHistory(globalObject), []);
});

function createRecord(overrides = {}) {
  return {
    runId: 'run-default',
    chartId: 'chart-default',
    sourceKey: 'git-public-url:github:openai/maestro-player:main',
    sourceLabel: 'openai/maestro-player',
    sourceType: 'git-public-url',
    branchName: 'main',
    playMode: 'manual',
    provider: 'github',
    visibility: 'public',
    score: 1000,
    maxCombo: 8,
    accuracy: 95.5,
    notesHit: 8,
    totalNotes: 9,
    tempo: 120,
    laneCount: 4,
    judgments: {
      perfect: 7,
      great: 0,
      good: 1,
      miss: 1,
    },
    finishedAt: '2026-04-18T07:00:00Z',
    ...overrides,
  };
}

function createStorageHarness() {
  const storageMap = new Map();

  return {
    localStorage: {
      getItem(key) {
        return storageMap.has(key) ? storageMap.get(key) : null;
      },
      setItem(key, value) {
        storageMap.set(key, String(value));
      },
      removeItem(key) {
        storageMap.delete(key);
      },
    },
  };
}
