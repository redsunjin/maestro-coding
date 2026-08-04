import { clamp, hashString, pickOne, toNumber } from './types.js';

const NOTE_NAMES = Object.freeze(['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']);

const MODE_BY_CLASS = Object.freeze({
  feat: 'ionian',
  fix: 'dorian',
  refactor: 'aeolian',
  docs: 'lydian',
  test: 'minor-pentatonic',
  chore: 'mixolydian',
  merge: 'ionian',
  revert: 'phrygian',
  review: 'dorian',
});

const CHORD_COLORS = Object.freeze(['triad', 'add9', 'sus2', 'sus4', 'maj7', 'flat7']);

export function pickHarmonyProfile({ repoId, branchKey, dominantClass, tensionScore = 0, resolutionScore = 0 }) {
  const repoSeed = hashString(repoId);
  const branchSeed = hashString(`${repoId}:${branchKey}`);
  const tonicIndex = (repoSeed + branchSeed) % NOTE_NAMES.length;
  const mode = MODE_BY_CLASS[dominantClass] || 'ionian';
  const chordColor = pickChordColor(dominantClass, tensionScore, resolutionScore, branchSeed);

  return {
    key: `${NOTE_NAMES[tonicIndex]} ${mode}`,
    tonic: NOTE_NAMES[tonicIndex],
    tonicIndex,
    mode,
    chordColor,
    repoSeed,
    branchSeed,
  };
}

export function pickSessionTempo({ repoComplexityClass = 2, activityScore = 0 }) {
  const boundedComplexity = clamp(toNumber(repoComplexityClass, 2), 0, 4);
  const boundedActivity = clamp(activityScore, 0, 1);
  const baseTempo = 92 + Math.round(boundedComplexity * 6);
  const tempoBoost = Math.round(boundedActivity * 18);
  return Math.round(clamp(baseTempo + tempoBoost, 88, 142));
}

function pickChordColor(dominantClass, tensionScore, resolutionScore, seed) {
  if (resolutionScore >= 0.72 || dominantClass === 'merge') {
    return 'add9';
  }

  if (tensionScore >= 0.72 || dominantClass === 'revert') {
    return 'sus4';
  }

  if (dominantClass === 'docs') {
    return 'maj7';
  }

  if (dominantClass === 'fix' || dominantClass === 'review') {
    return 'flat7';
  }

  return pickOne(CHORD_COLORS, seed);
}
