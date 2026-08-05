import { clamp, hashString } from './types.js';
import { buildChordOffsets, snapToScale } from './musicTheory.js';

// registerBand별 tonic 기준 옥타브 (스펙 2026-08-04 §2)
const REGISTER_BASE_MIDI = Object.freeze({ low: 36, mid: 48, high: 60 });

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
      const patternNotes = composeIntentNotes(intent, beatCursor, laneCount, maxNotesPerBeat, session);
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

function composeIntentNotes(intent, baseBeat, laneCount, maxNotesPerBeat, session = null) {
  const lane = resolveLaneIndex(intent, laneCount);
  const offsets = PATTERN_OFFSETS[intent.rhythmPattern] || PATTERN_OFFSETS.steady;
  const noteBudget = getNoteBudget(intent, maxNotesPerBeat);
  const noteSeed = hashString(intent.intentId);
  const notes = [];

  if (intent.rhythmPattern === 'hold') {
    const holdType = intent.accentLevel >= 0.7 ? 'accent' : 'hold';
    notes.push({
      noteId: `${intent.intentId}:0`,
      laneIndex: lane,
      beatOffset: roundBeat(baseBeat),
      durationBeats: 2 + Math.round(intent.accentLevel * 2),
      noteType: holdType,
      eventRef: intent.eventRef,
      pitchMidi: computePitchMidi(intent, session, 0),
      chordMidis: computeChordMidis(session, holdType),
      velocity: computeVelocity(intent),
    });
    return notes;
  }

  for (let noteIndex = 0; noteIndex < noteBudget; noteIndex += 1) {
    const laneOffset = pickLaneOffset(intent, noteSeed, noteIndex, laneCount);
    const noteType = pickNoteType(intent, noteIndex);
    notes.push({
      noteId: `${intent.intentId}:${noteIndex}`,
      laneIndex: clamp(lane + laneOffset, 1, laneCount),
      beatOffset: roundBeat(baseBeat + offsets[noteIndex]),
      durationBeats: intent.rhythmPattern === 'fill' ? 0.5 : 1,
      noteType,
      eventRef: intent.eventRef,
      pitchMidi: computePitchMidi(intent, session, noteIndex),
      chordMidis: computeChordMidis(session, noteType),
      velocity: computeVelocity(intent),
    });
  }

  return notes;
}

// 벨로시티 커브 (스펙 2026-08-05 §1): 강조·에너지가 실제 음량으로 반영된다.
function computeVelocity(intent) {
  const accentLevel = clamp(intent.accentLevel || 0, 0, 1);
  const energy = clamp(intent.energy || 0, 0, 1);
  const velocity = clamp(0.7 + accentLevel * 0.3 + energy * 0.1, 0.6, 1.1);
  return Math.round(velocity * 100) / 100;
}

// accent/hold에만 코드 컬러 보이싱 + 베이스 토닉을 부여한다 (tap은 단선율 — 과밀 방지).
function computeChordMidis(session, noteType) {
  if (noteType !== 'accent' && noteType !== 'hold') {
    return null;
  }

  const harmony = session?.harmony;
  if (!harmony) {
    return null;
  }

  const tonicIndex = harmony.tonicIndex || 0;
  const bassMidi = REGISTER_BASE_MIDI.low + tonicIndex;
  const chordRoot = REGISTER_BASE_MIDI.mid + tonicIndex;
  const chordOffsets = buildChordOffsets(harmony.chordColor, harmony.mode);
  return [bassMidi, ...chordOffsets.map((offset) => chordRoot + offset)];
}

// 세션 harmony(조성·선법)와 motif 음정을 실제 음높이로 배선한다 (스펙 §2).
// 세션 정보가 없으면 null — 오디오 엔진이 레거시 레인 주파수로 폴백한다.
function computePitchMidi(intent, session, noteIndex) {
  const harmony = session?.harmony;
  const motif = session?.motif;
  if (!harmony || !motif) {
    return null;
  }

  const baseMidi = (REGISTER_BASE_MIDI[intent.registerBand] ?? REGISTER_BASE_MIDI.mid)
    + (harmony.tonicIndex || 0);
  const intervals = motif.intervals?.length ? motif.intervals : [0];
  const rawOffset = intervals[(noteIndex + (motif.variation || 0)) % intervals.length];
  return baseMidi + snapToScale(rawOffset, harmony.mode);
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
