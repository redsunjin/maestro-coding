import { getStoredString, setStoredValue } from './storage.js';

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

// 토글 OFF 또는 미지원(iOS Safari 등) 환경에서는 조용히 무시한다.
export const vibrate = (pattern) => {
  if (!isHapticsEnabled()) return;
  if (typeof window === 'undefined' || typeof window.navigator?.vibrate !== 'function') return;
  try {
    window.navigator.vibrate(pattern);
  } catch {
    // 일부 브라우저는 사용자 제스처 밖 호출을 거부할 수 있음
  }
};
