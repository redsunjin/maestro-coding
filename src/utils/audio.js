// --- Web Audio API (타격음 생성기) ---
let sfxAudioContext = null;
let sfxMasterGain = null;

export const ensureSfxAudioContext = () => {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return null;

  if (!sfxAudioContext) {
    sfxAudioContext = new AudioContext();
    sfxMasterGain = sfxAudioContext.createGain();
    sfxMasterGain.gain.value = 0.8;
    sfxMasterGain.connect(sfxAudioContext.destination);
  }

  if (sfxAudioContext.state === 'suspended') {
    sfxAudioContext.resume().catch(() => {
      // 브라우저 정책으로 실패 가능
    });
  }

  return sfxAudioContext;
};

export const playBeep = (freq, type = 'sine') => {
  const triggerBeep = (ctx) => {
    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);

    gainNode.gain.setValueAtTime(0.0001, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + 0.01);
    gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);

    osc.connect(gainNode);
    gainNode.connect(sfxMasterGain || ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.13);
  };

  try {
    const ctx = ensureSfxAudioContext();
    if (!ctx) return;
    if (ctx.state !== 'running') {
      ctx.resume()
        .then(() => {
          if (ctx.state === 'running') triggerBeep(ctx);
        })
        .catch(() => {
          // 브라우저 정책으로 resume 실패 가능
        });
      return;
    }

    triggerBeep(ctx);
  } catch {
    // Audio 방어 코드
  }
};
