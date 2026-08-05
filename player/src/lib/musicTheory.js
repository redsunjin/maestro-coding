// 음악 이론 테이블과 정량 지표 (스펙 2026-08-04 §1).
// 하니스(CI 게이트)와 chartMapper의 음높이 스냅이 공유한다.

export const MODE_INTERVALS = Object.freeze({
  ionian: [0, 2, 4, 5, 7, 9, 11],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  aeolian: [0, 2, 3, 5, 7, 8, 10],
  'minor-pentatonic': [0, 3, 5, 7, 10],
});

export const NOTE_NAME_TO_PITCH_CLASS = Object.freeze({
  C: 0, Db: 1, D: 2, Eb: 3, E: 4, F: 5, Gb: 6, G: 7, Ab: 8, A: 9, Bb: 10, B: 11,
});

export function frequencyToMidi(frequencyHz) {
  return Math.round(69 + 12 * Math.log2(frequencyHz / 440));
}

export function midiToFrequency(midi) {
  return 440 * 2 ** ((midi - 69) / 12);
}

// tonic 기준 상대 반음을 선법 스케일의 최근접 스케일음으로 스냅한다 (하행 우선).
export function snapToScale(semitoneOffset, mode) {
  const scale = MODE_INTERVALS[mode] || MODE_INTERVALS.ionian;
  const pitchClass = ((semitoneOffset % 12) + 12) % 12;
  if (scale.includes(pitchClass)) {
    return semitoneOffset;
  }

  for (let distance = 1; distance <= 6; distance += 1) {
    const down = ((pitchClass - distance) % 12 + 12) % 12;
    if (scale.includes(down)) {
      return semitoneOffset - distance;
    }
    const up = (pitchClass + distance) % 12;
    if (scale.includes(up)) {
      return semitoneOffset + distance;
    }
  }

  return semitoneOffset;
}

// 코드 컬러 구성음 (스펙 2026-08-04 화음 §1) — 선법 스냅으로 3도/7도가 자동 조정된다.
const CHORD_COLOR_BASE = Object.freeze({
  triad: [0, 4, 7],
  add9: [0, 4, 7, 14],
  sus2: [0, 2, 7],
  sus4: [0, 5, 7],
  maj7: [0, 4, 7, 11],
  flat7: [0, 4, 7, 10],
});

export function buildChordOffsets(chordColor, mode) {
  const base = CHORD_COLOR_BASE[chordColor] || CHORD_COLOR_BASE.triad;
  return base.map((offset) => snapToScale(offset, mode));
}

export function scaleConformance(cuePlan, harmony) {
  const scale = MODE_INTERVALS[harmony?.mode] || MODE_INTERVALS.ionian;
  const tonicPitchClass = NOTE_NAME_TO_PITCH_CLASS[harmony?.tonic] ?? 0;
  const cues = cuePlan.flatMap((batch) => batch.cues);
  const offenders = [];
  let total = 0;

  for (const cue of cues) {
    const frequencies = [cue.frequencyHz, ...(cue.chordFrequencies || [])];
    for (const frequencyHz of frequencies) {
      total += 1;
      const pitchClass = ((frequencyToMidi(frequencyHz) - tonicPitchClass) % 12 + 12) % 12;
      if (!scale.includes(pitchClass)) {
        offenders.push({ cueId: cue.cueId, pitchClass });
      }
    }
  }

  return {
    total,
    conformant: total - offenders.length,
    ratio: total ? (total - offenders.length) / total : 1,
    offenders,
  };
}

export function beatGridConformance(chart, resolution = 0.25) {
  const notes = chart?.notes || [];
  const offenders = notes.filter((note) => {
    const steps = note.beatOffset / resolution;
    return Math.abs(steps - Math.round(steps)) > 1e-6;
  });

  return {
    total: notes.length,
    ratio: notes.length ? (notes.length - offenders.length) / notes.length : 1,
    offenders: offenders.map((note) => note.noteId),
  };
}

export function chartMaxNotesPerBeat(chart) {
  const buckets = new Map();
  for (const note of chart?.notes || []) {
    const bucket = Math.floor(note.beatOffset);
    buckets.set(bucket, (buckets.get(bucket) || 0) + 1);
  }
  return Math.max(0, ...buckets.values());
}

// 배치별 리드 큐(첫 큐)의 연속 도약 통계.
export function leapStats(cuePlan) {
  const leadMidis = cuePlan
    .filter((batch) => batch.cues.length > 0)
    .map((batch) => frequencyToMidi(batch.cues[0].frequencyHz));
  const leaps = [];
  for (let index = 1; index < leadMidis.length; index += 1) {
    leaps.push(Math.abs(leadMidis[index] - leadMidis[index - 1]));
  }

  return {
    count: leaps.length,
    maxLeapSemitones: leaps.length ? Math.max(...leaps) : 0,
    overOctaveRatio: leaps.length ? leaps.filter((leap) => leap > 12).length / leaps.length : 0,
  };
}
