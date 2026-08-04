export const EVENT_TYPES = Object.freeze([
  'commit',
  'merge',
  'revert',
  'push',
  'pull',
  'sync',
  'pr-open',
  'pr-update',
  'review-comment',
  'review-request-changes',
  'review-resolve',
  'review-reopen',
  'review-approve',
  'history-approved',
]);

export const COMMIT_CLASSES = Object.freeze([
  'feat',
  'fix',
  'refactor',
  'docs',
  'test',
  'chore',
  'merge',
  'revert',
  'review',
]);

export const STRUCTURAL_ROLES = Object.freeze([
  'intro',
  'verse',
  'build',
  'bridge',
  'cadence',
  'outro',
]);

export const RHYTHM_PATTERNS = Object.freeze([
  'steady',
  'staccato',
  'syncopated',
  'hold',
  'fill',
]);

export const HARMONY_ACTIONS = Object.freeze([
  'establish',
  'repeat',
  'deviate',
  'suspend',
  'resolve',
]);

export function clamp(value, min = 0, max = 1) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return min;
  }

  if (numericValue < min) {
    return min;
  }

  if (numericValue > max) {
    return max;
  }

  return numericValue;
}

export function toNumber(value, fallback = 0) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : fallback;
}

export function hashString(value) {
  const input = String(value ?? '');
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function normalizedLog(value, divisor) {
  const safeValue = Math.max(0, toNumber(value));
  return clamp(Math.log2(safeValue + 1) / divisor, 0, 1);
}

export function coerceArray(value) {
  return Array.isArray(value) ? value : [];
}

export function minutesBetween(leftTimestamp, rightTimestamp) {
  const left = new Date(leftTimestamp).getTime();
  const right = new Date(rightTimestamp).getTime();
  if (!Number.isFinite(left) || !Number.isFinite(right)) {
    return 0;
  }
  return Math.abs(right - left) / 60000;
}

export function normalizeTimestamp(value, fallbackIndex = 0) {
  const timestamp = new Date(value);
  if (!Number.isNaN(timestamp.getTime())) {
    return timestamp.toISOString();
  }

  return new Date(Date.UTC(2026, 0, 1, 0, fallbackIndex, 0)).toISOString();
}

export function pickOne(items, seed) {
  if (!Array.isArray(items) || items.length === 0) {
    return null;
  }
  return items[seed % items.length];
}
