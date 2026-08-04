import { clamp, hashString } from './types.js';

const PATTERN_OFFSETS = Object.freeze({
  steady: [0, 0.75, 1.5, 2.25],
  staccato: [0, 0.5, 1, 1.5],
  syncopated: [0.25, 0.75, 1.25, 1.75],
  hold: [0],
  fill: [0, 0.5, 0.75, 1],
});

export function createChartFromMusicPlan(musicPlan, options = {}) {
  const laneCount = options.laneCount || inferLaneCount(musicPlan);
  const maxNotesPerBeat = options.maxNotesPerBeat || 3;
  const notes = [];
  let beatCursor = 0;

  for (const session of musicPlan) {
    for (const intent of session.intents) {
      const phraseLength = estimatePhraseLength(intent);
      const patternNotes = composeIntentNotes(intent, beatCursor, laneCount, maxNotesPerBeat);
      notes.push(...patternNotes);
      beatCursor += phraseLength;
    }

    beatCursor += 2;
  }

  return {
    laneCount,
    notes: enforceDensityCap(notes, maxNotesPerBeat),
  };
}

export function resolveLaneIndex(intent, laneCount = 4) {
  const baseLane = clamp(Math.round(intent.laneBias || 1), 1, laneCount);
  if (intent.eventType === 'merge') {
    return laneCount;
  }
  return baseLane;
}

function composeIntentNotes(intent, baseBeat, laneCount, maxNotesPerBeat) {
  const lane = resolveLaneIndex(intent, laneCount);
  const offsets = PATTERN_OFFSETS[intent.rhythmPattern] || PATTERN_OFFSETS.steady;
  const noteBudget = getNoteBudget(intent, maxNotesPerBeat);
  const noteSeed = hashString(intent.intentId);
  const notes = [];

  if (intent.rhythmPattern === 'hold') {
    notes.push({
      noteId: `${intent.intentId}:0`,
      laneIndex: lane,
      beatOffset: roundBeat(baseBeat),
      durationBeats: 2 + Math.round(intent.accentLevel * 2),
      noteType: intent.accentLevel >= 0.7 ? 'accent' : 'hold',
      eventRef: intent.eventRef,
    });
    return notes;
  }

  for (let noteIndex = 0; noteIndex < noteBudget; noteIndex += 1) {
    const laneOffset = pickLaneOffset(intent, noteSeed, noteIndex, laneCount);
    notes.push({
      noteId: `${intent.intentId}:${noteIndex}`,
      laneIndex: clamp(lane + laneOffset, 1, laneCount),
      beatOffset: roundBeat(baseBeat + offsets[noteIndex]),
      durationBeats: intent.rhythmPattern === 'fill' ? 0.5 : 1,
      noteType: pickNoteType(intent, noteIndex),
      eventRef: intent.eventRef,
    });
  }

  return notes;
}

function estimatePhraseLength(intent) {
  if (intent.rhythmPattern === 'hold') {
    return 3 + Math.round(intent.energy * 2);
  }

  if (intent.rhythmPattern === 'fill') {
    return 1.5;
  }

  if (intent.rhythmPattern === 'syncopated') {
    return 2;
  }

  return 2 + Math.round(intent.density);
}

function getNoteBudget(intent, maxNotesPerBeat) {
  if (intent.rhythmPattern === 'fill') {
    return Math.min(3, maxNotesPerBeat + 1);
  }

  if (intent.rhythmPattern === 'syncopated') {
    return Math.min(3, 1 + Math.round(intent.density * 3));
  }

  if (intent.rhythmPattern === 'staccato') {
    return Math.min(2, 1 + Math.round(intent.density * 2));
  }

  return Math.min(2, 1 + Math.round(intent.density * 2));
}

function pickLaneOffset(intent, noteSeed, noteIndex, laneCount) {
  if (
    intent.eventType === 'merge'
    || intent.eventType === 'review-approve'
    || intent.eventType === 'review-resolve'
  ) {
    return 0;
  }

  if (laneCount <= 1) {
    return 0;
  }

  const spread = noteSeed % 3;
  if (noteIndex === 0) {
    return 0;
  }

  if (spread === 0) {
    return noteIndex % 2 === 0 ? -1 : 1;
  }

  if (spread === 1) {
    return noteIndex % 2 === 0 ? 1 : 0;
  }

  return noteIndex % 2 === 0 ? 0 : -1;
}

function pickNoteType(intent, noteIndex) {
  if (
    intent.eventType === 'merge'
    || intent.eventType === 'review-resolve'
    || (noteIndex === 0 && intent.accentLevel >= 0.78)
  ) {
    return 'accent';
  }

  if (intent.rhythmPattern === 'fill' || intent.rhythmPattern === 'staccato') {
    return 'tap';
  }

  return noteIndex === 0 && intent.energy >= 0.75 ? 'accent' : 'tap';
}

function enforceDensityCap(notes, maxNotesPerBeat) {
  const buckets = new Map();

  for (const note of notes) {
    const beatBucket = Math.floor(note.beatOffset);
    const bucketNotes = buckets.get(beatBucket) || [];
    bucketNotes.push(note);
    buckets.set(beatBucket, bucketNotes);
  }

  const filteredNotes = [];
  for (const bucketNotes of buckets.values()) {
    bucketNotes.sort((left, right) => {
      const leftWeight = (left.noteType === 'accent' ? 2 : 1) + left.durationBeats;
      const rightWeight = (right.noteType === 'accent' ? 2 : 1) + right.durationBeats;
      return rightWeight - leftWeight;
    });
    filteredNotes.push(...bucketNotes.slice(0, maxNotesPerBeat));
  }

  return filteredNotes.sort((left, right) => {
    if (left.beatOffset !== right.beatOffset) {
      return left.beatOffset - right.beatOffset;
    }
    return left.laneIndex - right.laneIndex;
  });
}

function inferLaneCount(musicPlan) {
  return musicPlan[0]?.laneCount || 4;
}

function roundBeat(value) {
  return Math.round(value * 100) / 100;
}
