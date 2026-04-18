import { clamp, hashString, pickOne } from './types.js';

const MOTIF_LIBRARY = Object.freeze([
  {
    id: 'aurora',
    contour: 'rise',
    intervals: [0, 2, 4, 7],
    rhythm: [1, 1, 2, 1],
    accents: [1, 0, 0, 1],
  },
  {
    id: 'switchback',
    contour: 'zigzag',
    intervals: [0, 3, 1, 5],
    rhythm: [1, 0.5, 0.5, 2],
    accents: [1, 0, 1, 0],
  },
  {
    id: 'pulse-grid',
    contour: 'flat',
    intervals: [0, 0, 2, 0],
    rhythm: [0.5, 0.5, 1, 2],
    accents: [1, 0, 0, 1],
  },
  {
    id: 'vector',
    contour: 'rise-fall',
    intervals: [0, 4, 7, 2],
    rhythm: [1, 1, 1, 1],
    accents: [1, 0, 1, 0],
  },
  {
    id: 'cadenza',
    contour: 'fall',
    intervals: [0, -2, -5, -7],
    rhythm: [2, 1, 0.5, 0.5],
    accents: [1, 0, 0, 1],
  },
  {
    id: 'relay',
    contour: 'step',
    intervals: [0, 1, 3, 5],
    rhythm: [0.5, 1, 0.5, 2],
    accents: [1, 0, 1, 0],
  },
]);

export function pickMotif(motifKey) {
  const motifSeed = hashString(motifKey);
  const motifTemplate = pickOne(MOTIF_LIBRARY, motifSeed);

  return {
    motifId: `${motifTemplate.id}-${motifSeed % 13}`,
    motifSeed,
    contour: motifTemplate.contour,
    intervals: [...motifTemplate.intervals],
    rhythm: [...motifTemplate.rhythm],
    accents: [...motifTemplate.accents],
    variation: motifSeed % 5,
  };
}

export function chooseRegisterBand(seed, energy, tension, brightness) {
  const blend = clamp((energy * 0.45) + (tension * 0.2) + (brightness * 0.35), 0, 1);
  const weightedSeed = (seed % 17) / 16;

  if (blend + weightedSeed * 0.15 >= 0.72) {
    return 'high';
  }

  if (blend <= 0.36) {
    return 'low';
  }

  return 'mid';
}
