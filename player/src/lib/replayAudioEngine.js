import { midiToFrequency } from './musicTheory.js';

const STEP_BEATS = 0.5;
const BASE_FREQUENCIES = Object.freeze([220, 261.63, 329.63, 392, 523.25, 659.25]);

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
    gainMultiplier: note.noteType === 'accent' ? 1.15 : note.noteType === 'hold' ? 0.8 : 0.92,
    waveform: note.noteType === 'hold' ? 'sawtooth' : note.noteType === 'accent' ? 'triangle' : 'sine',
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
  const endTime = startTime + cue.durationSeconds;

  oscillator.type = cue.waveform;
  oscillator.frequency.setValueAtTime(cue.frequencyHz, startTime);
  gainNode.gain.setValueAtTime(0.0001, startTime);
  gainNode.gain.exponentialRampToValueAtTime(baseVolume * cue.gainMultiplier, startTime + 0.01);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, endTime);

  oscillator.connect(gainNode);
  gainNode.connect(context.destination);
  oscillator.start(startTime);
  oscillator.stop(endTime + 0.02);
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
