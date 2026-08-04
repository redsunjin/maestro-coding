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

test('소스별 50건 상한: 초과 시 해당 소스의 가장 오래된 기록만 삭제한다', () => {
  const globalObject = createStorageHarness();

  appendPerformanceRecord(createRecord({
    runId: 'run-other',
    sourceKey: 'git-public-url:github:someone/else:main',
    finishedAt: '2026-04-01T00:00:00Z',
  }), globalObject);

  for (let index = 1; index <= 51; index += 1) {
    appendPerformanceRecord(createRecord({
      runId: `run-a-${index}`,
      finishedAt: `2026-04-18T${String(Math.floor(index / 60)).padStart(2, '0')}:${String(index % 60).padStart(2, '0')}:00Z`,
    }), globalObject);
  }

  const history = loadPerformanceHistory(globalObject);
  const sourceARecords = history.filter((entry) => entry.sourceKey.includes('openai/maestro-player'));
  assert.equal(sourceARecords.length, 50);
  // 가장 오래된 run-a-1이 밀려나고 최신 run-a-51은 유지된다
  assert.equal(sourceARecords.some((entry) => entry.runId === 'run-a-1'), false);
  assert.equal(sourceARecords[0].runId, 'run-a-51');
  // 다른 소스의 오래된 기록은 유지된다
  assert.equal(history.some((entry) => entry.runId === 'run-other'), true);
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
