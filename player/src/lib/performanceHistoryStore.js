const PERFORMANCE_HISTORY_STORAGE_KEY = 'maestro-player-performance-history-v1';
const MAX_PERFORMANCE_HISTORY_RECORDS = 18;

export function getPerformanceHistoryStorageKey() {
  return PERFORMANCE_HISTORY_STORAGE_KEY;
}

export function loadPerformanceHistory(globalObject = globalThis) {
  const storage = resolveStorage(globalObject);

  if (!storage) {
    return [];
  }

  try {
    const rawValue = storage.getItem(PERFORMANCE_HISTORY_STORAGE_KEY);
    if (!rawValue) {
      return [];
    }

    const parsed = JSON.parse(rawValue);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map(normalizePerformanceRecord)
      .filter(Boolean)
      .sort(comparePerformanceRecords)
      .slice(0, MAX_PERFORMANCE_HISTORY_RECORDS);
  } catch {
    return [];
  }
}

export function appendPerformanceRecord(record, globalObject = globalThis) {
  const normalizedRecord = normalizePerformanceRecord(record);
  if (!normalizedRecord) {
    return loadPerformanceHistory(globalObject);
  }

  const nextHistory = [
    normalizedRecord,
    ...loadPerformanceHistory(globalObject).filter((entry) => entry.runId !== normalizedRecord.runId),
  ]
    .sort(comparePerformanceRecords)
    .slice(0, MAX_PERFORMANCE_HISTORY_RECORDS);

  writePerformanceHistory(nextHistory, globalObject);
  return nextHistory;
}

export function clearPerformanceHistory(globalObject = globalThis) {
  const storage = resolveStorage(globalObject);

  if (!storage) {
    return;
  }

  try {
    storage.removeItem(PERFORMANCE_HISTORY_STORAGE_KEY);
  } catch {
    // Ignore storage failures so the shell remains read-only and resilient.
  }
}

function writePerformanceHistory(history, globalObject) {
  const storage = resolveStorage(globalObject);

  if (!storage) {
    return;
  }

  try {
    storage.setItem(PERFORMANCE_HISTORY_STORAGE_KEY, JSON.stringify(history));
  } catch {
    // Ignore storage failures so run completion still renders in the active session.
  }
}

function resolveStorage(globalObject) {
  const storage = globalObject?.localStorage;

  if (!storage || typeof storage.getItem !== 'function') {
    return null;
  }

  return storage;
}

function normalizePerformanceRecord(record) {
  if (!record || typeof record !== 'object') {
    return null;
  }

  const finishedAt = normalizeTimestamp(record.finishedAt);
  if (!finishedAt) {
    return null;
  }

  const runId = normalizeString(record.runId) || `run-${finishedAt}`;
  const chartId = normalizeString(record.chartId) || 'unknown-chart';
  const sourceKey = normalizeString(record.sourceKey) || 'unknown-source';
  const sourceLabel = normalizeString(record.sourceLabel) || 'Unknown source';
  const sourceType = normalizeString(record.sourceType) || 'unknown';
  const branchName = normalizeString(record.branchName) || 'main';
  const playMode = normalizeString(record.playMode) || 'manual';
  const provider = normalizeString(record.provider) || 'unknown';
  const visibility = normalizeString(record.visibility) || 'unknown';
  const judgments = normalizeJudgments(record.judgments);

  return {
    runId,
    chartId,
    sourceKey,
    sourceLabel,
    sourceType,
    branchName,
    playMode,
    provider,
    visibility,
    score: normalizeNonNegativeNumber(record.score),
    maxCombo: normalizeNonNegativeNumber(record.maxCombo),
    accuracy: normalizeAccuracy(record.accuracy),
    notesHit: normalizeNonNegativeNumber(record.notesHit),
    totalNotes: normalizeNonNegativeNumber(record.totalNotes),
    tempo: normalizeNonNegativeNumber(record.tempo),
    laneCount: normalizeNonNegativeNumber(record.laneCount),
    judgments,
    finishedAt,
  };
}

function normalizeJudgments(value) {
  const judgments = value && typeof value === 'object' ? value : {};

  return {
    perfect: normalizeNonNegativeNumber(judgments.perfect),
    great: normalizeNonNegativeNumber(judgments.great),
    good: normalizeNonNegativeNumber(judgments.good),
    miss: normalizeNonNegativeNumber(judgments.miss),
  };
}

function comparePerformanceRecords(left, right) {
  return new Date(right.finishedAt).getTime() - new Date(left.finishedAt).getTime();
}

function normalizeTimestamp(value) {
  const timestamp = new Date(value);

  if (Number.isNaN(timestamp.getTime())) {
    return null;
  }

  return timestamp.toISOString();
}

function normalizeString(value) {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim();
}

function normalizeNonNegativeNumber(value) {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue) || numericValue < 0) {
    return 0;
  }

  return Math.round(numericValue * 100) / 100;
}

function normalizeAccuracy(value) {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    return 0;
  }

  if (numericValue < 0) {
    return 0;
  }

  if (numericValue > 100) {
    return 100;
  }

  return Math.round(numericValue * 10) / 10;
}
