const DEFAULT_BEATS_PER_BAR = 4;
const DEFAULT_SUBDIVISION = 2;

export function createPulseDescriptor({
  stepIndex = 0,
  beatsPerBar = DEFAULT_BEATS_PER_BAR,
  subdivision = DEFAULT_SUBDIVISION,
} = {}) {
  const normalizedSubdivision = Math.max(1, Math.round(subdivision));
  const normalizedStepIndex = Math.max(0, Math.round(stepIndex));
  const stepsPerBar = beatsPerBar * normalizedSubdivision;
  const positionInBar = normalizedStepIndex % stepsPerBar;
  const beatInBar = Math.floor(positionInBar / normalizedSubdivision) + 1;
  const subdivisionIndex = positionInBar % normalizedSubdivision;

  return {
    stepIndex: normalizedStepIndex,
    beatInBar,
    isDownbeat: subdivisionIndex === 0 && beatInBar === 1,
    isPrimaryBeat: subdivisionIndex === 0,
    isSubdivision: subdivisionIndex !== 0,
  };
}

export function createBrowserMetronomeDriver(globalObject = globalThis, options = {}) {
  let audioContext = null;
  const baseVolume = clamp(Number(options.baseVolume) || 0.028, 0.005, 0.12);

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
    pulse({ pulse }) {
      const context = ensureAudioContext(globalObject, audioContext);
      audioContext = context;

      if (!context) {
        return false;
      }

      playPulseOnContext(context, pulse, baseVolume);
      return true;
    },
    stop() {
      if (audioContext?.state === 'running' && typeof audioContext.suspend === 'function') {
        audioContext.suspend().catch(() => {});
      }
    },
  };
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

function playPulseOnContext(context, pulse, baseVolume) {
  const oscillator = context.createOscillator();
  const gainNode = context.createGain();
  const startTime = context.currentTime;
  const frequency = pulse?.isDownbeat ? 880 : pulse?.isSubdivision ? 440 : 660;
  const durationSeconds = pulse?.isSubdivision ? 0.045 : 0.08;
  const volume = pulse?.isDownbeat ? baseVolume * 1.5 : pulse?.isSubdivision ? baseVolume * 0.6 : baseVolume;

  oscillator.type = pulse?.isSubdivision ? 'triangle' : 'sine';
  oscillator.frequency.setValueAtTime(frequency, startTime);

  gainNode.gain.setValueAtTime(0.0001, startTime);
  gainNode.gain.exponentialRampToValueAtTime(volume, startTime + 0.005);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, startTime + durationSeconds);

  oscillator.connect(gainNode);
  gainNode.connect(context.destination);
  oscillator.start(startTime);
  oscillator.stop(startTime + durationSeconds + 0.01);
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
