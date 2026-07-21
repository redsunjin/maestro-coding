import { getStoredString, setStoredValue } from './storage.js';
import { isNativeShell } from './server-address.js';

export const HAPTICS_STORAGE_KEY = 'maestro.haptics';

// 등급/이벤트별 진동 패턴 (ms 단위 진동/휴지 반복)
export const HAPTIC_PATTERNS = {
  PERFECT: [15],
  GREAT: [10],
  EARLY: [8],
  LATE: [40, 30, 40],
  REJECT: [25, 20, 25],
  COMBO_MILESTONE: [10, 10, 10, 10],
};

export const isHapticsEnabled = () => getStoredString(HAPTICS_STORAGE_KEY, 'on') !== 'off';

export const setHapticsEnabled = (enabled) => {
  setStoredValue(HAPTICS_STORAGE_KEY, enabled ? 'on' : 'off');
};

// vibrate 패턴(진동/휴지 ms 교대)을 네이티브 impact/delay 시퀀스로 변환하는 순수 함수.
// 진동 세기: ≤10ms LIGHT, ≤25ms MEDIUM, 그 외 HEAVY.
export const mapPatternToNativePlan = (pattern) => {
  const segments = Array.isArray(pattern) ? pattern : (typeof pattern === 'number' ? [pattern] : []);
  return segments
    .map((ms, index) => {
      if (typeof ms !== 'number' || Number.isNaN(ms)) return null;
      if (index % 2 === 1) return { kind: 'delay', ms };
      const style = ms <= 10 ? 'LIGHT' : ms <= 25 ? 'MEDIUM' : 'HEAVY';
      return { kind: 'impact', style };
    })
    .filter(Boolean);
};

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// 네이티브 셸 전용 — @capacitor/haptics는 dynamic import라 웹 초기 번들에 실리지 않는다.
const runNativeHapticPlan = async (plan) => {
  try {
    const { Haptics, ImpactStyle } = await import('@capacitor/haptics');
    const styleMap = { LIGHT: ImpactStyle.Light, MEDIUM: ImpactStyle.Medium, HEAVY: ImpactStyle.Heavy };
    for (const step of plan) {
      if (step.kind === 'delay') {
        await delay(step.ms);
      } else {
        await Haptics.impact({ style: styleMap[step.style] });
      }
    }
  } catch {
    // 네이티브 브릿지 실패는 조용히 무시 (웹 경로와 동일한 태도)
  }
};

// 토글 OFF 또는 미지원(iOS Safari 등) 환경에서는 조용히 무시한다.
export const vibrate = (pattern) => {
  if (!isHapticsEnabled()) return;

  if (isNativeShell()) {
    const plan = mapPatternToNativePlan(pattern);
    if (plan.length > 0) {
      runNativeHapticPlan(plan);
    }
    return;
  }

  if (typeof window === 'undefined' || typeof window.navigator?.vibrate !== 'function') return;
  try {
    window.navigator.vibrate(pattern);
  } catch {
    // 일부 브라우저는 사용자 제스처 밖 호출을 거부할 수 있음
  }
};
