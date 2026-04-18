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
  const baseFrequency = BASE_FREQUENCIES[(laneIndex - 1) % BASE_FREQUENCIES.length];
  const octaveShift = laneIndex > laneCount / 2 ? 2 : 1;
  const frequencyHz = note.noteType === 'accent'
    ? baseFrequency * octaveShift
    : note.noteType === 'hold'
      ? baseFrequency / 2
      : baseFrequency;

  return {
    cueId: `${note.noteId || `cue-${stepIndex}-${laneIndex}`}`,
    noteId: note.noteId || '',
    laneIndex,
    noteType: note.noteType || 'tap',
    stepIndex,
    frequencyHz,
    durationSeconds: note.noteType === 'hold' ? 0.28 : note.noteType === 'accent' ? 0.18 : 0.12,
    gainMultiplier: note.noteType === 'accent' ? 1.15 : note.noteType === 'hold' ? 0.8 : 0.92,
    waveform: note.noteType === 'hold' ? 'sawtooth' : note.noteType === 'accent' ? 'triangle' : 'sine',
  };
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
