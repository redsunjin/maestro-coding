import { midiToFrequency } from './musicTheory.js';

const STEP_BEATS = 0.5;
const BASE_FREQUENCIES = Object.freeze([220, 261.63, 329.63, 392, 523.25, 659.25]);
// 신스 다듬기 (스펙 2026-08-05 §2-3): type별 엔벨로프와 로우패스 컷오프
const VOICE_SHAPE = Object.freeze({
  tap: { attackSeconds: 0.008, releaseSeconds: 0.06, filterCutoffHz: 3200 },
  accent: { attackSeconds: 0.005, releaseSeconds: 0.12, filterCutoffHz: 2600 },
  hold: { attackSeconds: 0.03, releaseSeconds: 0.2, filterCutoffHz: 1400 },
});
const CHORD_PAD_CUTOFF_HZ = 1200;

export function createReplayCuePlan(notes = [], options = {}) {
  const sortedNotes = [...notes].sort((left, right) => left.beatOffset - right.beatOffset);
  const groupedByStep = new Map();

  sortedNotes.forEach((note) => {
    const stepIndex = Math.max(0, Math.round((note.beatOffset || 0) / STEP_BEATS));
    const cue = createCueFromNote(note, stepIndex, options);
    const existingBatch = groupedByStep.get(stepIndex) || {
      stepIndex,
      cues: [],
    };

    existingBatch.cues.push(cue);
    groupedByStep.set(stepIndex, existingBatch);
  });

  return [...groupedByStep.values()]
    .sort((left, right) => left.stepIndex - right.stepIndex)
    .map((batch) => ({
      ...batch,
      summary: summarizeCueBatch(batch.cues),
    }));
}

export function createBrowserReplayAudioDriver(globalObject = globalThis, options = {}) {
  let audioContext = null;
  const baseVolume = clamp(Number(options.baseVolume) || 0.04, 0.01, 0.15);

  return {
    isSupported() {
      return Boolean(resolveAudioContextConstructor(globalObject));
    },
    async prime() {
      const context = ensureAudioContext(globalObject, audioContext);
      audioContext = context;

      if (context && typeof context.resume === 'function' && context.state === 'suspended') {
        await context.resume();
      }

      return Boolean(context);
    },
    playCueBatch({ batch }) {
      const context = ensureAudioContext(globalObject, audioContext);
      audioContext = context;

      if (!context || !batch?.cues?.length) {
        return false;
      }

      batch.cues.forEach((cue, index) => {
        playCueOnContext(context, cue, baseVolume, index);
        // 코드 컬러 보이싱: 화음 음은 sine 패드로 낮은 게인·긴 길이로 얹는다 (스펙 화음 §1)
        (cue.chordFrequencies || []).forEach((chordFrequencyHz) => {
          playCueOnContext(context, {
            ...cue,
            frequencyHz: chordFrequencyHz,
            waveform: 'sine',
            gainMultiplier: cue.gainMultiplier * 0.35,
            durationSeconds: cue.durationSeconds * 1.6,
            filterCutoffHz: CHORD_PAD_CUTOFF_HZ,
          }, baseVolume, index);
        });
      });

      return true;
    },
    stop() {
      if (audioContext?.state === 'running' && typeof audioContext.suspend === 'function') {
        audioContext.suspend().catch(() => {});
      }
    },
  };
}

function createCueFromNote(note, stepIndex, options) {
  const laneIndex = note.laneIndex || 1;
  const laneCount = Math.max(1, options.laneCount || 4);
  const frequencyHz = Number.isFinite(note.pitchMidi)
    ? resolvePitchedFrequency(note)
    : resolveLegacyLaneFrequency(note, laneIndex, laneCount);
  const chordFrequencies = Array.isArray(note.chordMidis) && note.chordMidis.length
    ? note.chordMidis.map((midi) => Math.round(midiToFrequency(midi) * 100) / 100)
    : null;

  return {
    cueId: `${note.noteId || `cue-${stepIndex}-${laneIndex}`}`,
    noteId: note.noteId || '',
    eventRef: note.eventRef || '',
    laneIndex,
    noteType: note.noteType || 'tap',
    stepIndex,
    frequencyHz,
    chordFrequencies,
    durationSeconds: note.noteType === 'hold' ? 0.28 : note.noteType === 'accent' ? 0.18 : 0.12,
    gainMultiplier: Math.round(
      (note.noteType === 'accent' ? 1.15 : note.noteType === 'hold' ? 0.8 : 0.92)
      * (Number.isFinite(note.velocity) ? note.velocity : 1) * 100,
    ) / 100,
    waveform: note.noteType === 'hold' ? 'sawtooth' : note.noteType === 'accent' ? 'triangle' : 'sine',
    ...(VOICE_SHAPE[note.noteType] || VOICE_SHAPE.tap),
  };
}

// harmony/motif가 배선된 노트: 옥타브 이동만 허용해 피치 클래스(선법 적합)를 보존한다.
function resolvePitchedFrequency(note) {
  const octaveShift = note.noteType === 'hold' ? -12 : note.noteType === 'accent' ? 12 : 0;
  return Math.round(midiToFrequency(note.pitchMidi + octaveShift) * 100) / 100;
}

// pitchMidi가 없는 노트(레거시/외부 차트) 폴백: 기존 레인 고정 주파수 유지.
function resolveLegacyLaneFrequency(note, laneIndex, laneCount) {
  const baseFrequency = BASE_FREQUENCIES[(laneIndex - 1) % BASE_FREQUENCIES.length];
  const octaveShift = laneIndex > laneCount / 2 ? 2 : 1;
  return note.noteType === 'accent'
    ? baseFrequency * octaveShift
    : note.noteType === 'hold'
      ? baseFrequency / 2
      : baseFrequency;
}

function summarizeCueBatch(cues) {
  if (!cues.length) {
    return 'BGM armed';
  }

  const parts = cues.slice(0, 3).map((cue) => `L${cue.laneIndex} ${cue.noteType}`);
  const suffix = cues.length > 3 ? ` +${cues.length - 3}` : '';
  return `Cue ${parts.join(' · ')}${suffix}`;
}

function ensureAudioContext(globalObject, existingContext) {
  if (existingContext) {
    return existingContext;
  }

  const AudioContextCtor = resolveAudioContextConstructor(globalObject);
  if (!AudioContextCtor) {
    return null;
  }

  try {
    return new AudioContextCtor();
  } catch {
    return null;
  }
}

function resolveAudioContextConstructor(globalObject) {
  return globalObject?.AudioContext || globalObject?.webkitAudioContext || null;
}

function playCueOnContext(context, cue, baseVolume, indexOffset) {
  const oscillator = context.createOscillator();
  const gainNode = context.createGain();
  const startTime = context.currentTime + (indexOffset * 0.008);
  const attack = cue.attackSeconds || 0.01;
  const release = cue.releaseSeconds || 0.02;
  const endTime = startTime + cue.durationSeconds;

  oscillator.type = cue.waveform;
  oscillator.frequency.setValueAtTime(cue.frequencyHz, startTime);
  gainNode.gain.setValueAtTime(0.0001, startTime);
  gainNode.gain.exponentialRampToValueAtTime(baseVolume * cue.gainMultiplier, startTime + attack);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, endTime + release);

  // 로우패스로 사각·톱니 하모닉을 정리한다 (미지원 환경은 폴백)
  let head = oscillator;
  if (cue.filterCutoffHz && typeof context.createBiquadFilter === 'function') {
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(cue.filterCutoffHz, startTime);
    oscillator.connect(filter);
    head = filter;
  }

  head.connect(gainNode);
  gainNode.connect(context.destination);
  oscillator.start(startTime);
  oscillator.stop(endTime + release + 0.02);
}

function clamp(value, min, max) {
  if (!Number.isFinite(value)) {
    return min;
  }

  if (value < min) {
    return min;
  }

  if (value > max) {
    return max;
  }

  return value;
}
