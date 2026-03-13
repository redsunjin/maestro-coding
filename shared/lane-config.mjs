export const DEFAULT_LANE_COUNT = 4;
export const MIN_LANE_COUNT = 1;
export const MAX_LANE_COUNT = 8;

const LEGACY_LANE_NAMES = [
  'Frontend Agent',
  'Backend Agent',
  'Database Agent',
  'AI Model Agent',
];

const LANE_STYLE_PALETTE = [
  { color: 'text-blue-400', border: 'border-blue-500', bg: 'bg-blue-900/30' },
  { color: 'text-green-400', border: 'border-green-500', bg: 'bg-green-900/30' },
  { color: 'text-yellow-400', border: 'border-yellow-500', bg: 'bg-yellow-900/30' },
  { color: 'text-purple-400', border: 'border-purple-500', bg: 'bg-purple-900/30' },
  { color: 'text-rose-400', border: 'border-rose-500', bg: 'bg-rose-900/30' },
  { color: 'text-cyan-400', border: 'border-cyan-500', bg: 'bg-cyan-900/30' },
  { color: 'text-orange-400', border: 'border-orange-500', bg: 'bg-orange-900/30' },
  { color: 'text-lime-400', border: 'border-lime-500', bg: 'bg-lime-900/30' },
];

const LANE_KEY_POOL = ['d', 'f', 'j', 'k', 'a', 's', 'l', ';'];

export function sanitizeLaneCount(value, fallback = DEFAULT_LANE_COUNT) {
  const normalizedFallback = Number.isInteger(Number(fallback))
    ? Math.min(MAX_LANE_COUNT, Math.max(MIN_LANE_COUNT, Number(fallback)))
    : DEFAULT_LANE_COUNT;
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return normalizedFallback;
  return Math.min(MAX_LANE_COUNT, Math.max(MIN_LANE_COUNT, parsed));
}

export function normalizeLaneIndex(value, laneCount = DEFAULT_LANE_COUNT) {
  const parsed = Number(value);
  const maxLaneCount = sanitizeLaneCount(laneCount);
  if (!Number.isInteger(parsed)) return null;
  if (parsed < 1 || parsed > maxLaneCount) return null;
  return parsed;
}

export function pickRandomLaneIndex(laneCount = DEFAULT_LANE_COUNT) {
  const maxLaneCount = sanitizeLaneCount(laneCount);
  return Math.floor(Math.random() * maxLaneCount) + 1;
}

export function getLaneDefinitions(inputLaneCount = DEFAULT_LANE_COUNT) {
  const laneCount = sanitizeLaneCount(inputLaneCount);

  return Array.from({ length: laneCount }, (_, index) => {
    const style = LANE_STYLE_PALETTE[index] || LANE_STYLE_PALETTE[index % LANE_STYLE_PALETTE.length];
    const name = laneCount === DEFAULT_LANE_COUNT
      ? LEGACY_LANE_NAMES[index]
      : `Lane ${index + 1}`;

    return {
      id: index,
      name,
      key: LANE_KEY_POOL[index] || '',
      ...style,
    };
  });
}

export function formatLaneKeyLabel(key) {
  const normalized = String(key || '').trim();
  if (!normalized) return 'Click';
  return normalized.length === 1 ? normalized.toUpperCase() : normalized;
}
