import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  HAPTIC_PATTERNS,
  HAPTICS_STORAGE_KEY,
  isHapticsEnabled,
  setHapticsEnabled,
  vibrate,
} from './haptics.js';

describe('haptics — 진동 래퍼', () => {
  let vibrateSpy;

  beforeEach(() => {
    window.localStorage.clear();
    vibrateSpy = vi.fn(() => true);
    Object.defineProperty(window.navigator, 'vibrate', {
      value: vibrateSpy,
      configurable: true,
      writable: true,
    });
  });

  afterEach(() => {
    delete window.navigator.vibrate;
  });

  test('기본 상태(저장값 없음)에서 햅틱은 켜져 있고 vibrate가 호출된다', () => {
    expect(isHapticsEnabled()).toBe(true);
    vibrate(HAPTIC_PATTERNS.PERFECT);
    expect(vibrateSpy).toHaveBeenCalledWith(HAPTIC_PATTERNS.PERFECT);
  });

  test('setHapticsEnabled(false) 저장 후에는 vibrate가 호출되지 않는다', () => {
    setHapticsEnabled(false);
    expect(isHapticsEnabled()).toBe(false);
    expect(window.localStorage.getItem(HAPTICS_STORAGE_KEY)).toBe('off');

    vibrate(HAPTIC_PATTERNS.GREAT);
    expect(vibrateSpy).not.toHaveBeenCalled();
  });

  test('다시 켜면 저장값이 갱신되고 vibrate가 호출된다', () => {
    setHapticsEnabled(false);
    setHapticsEnabled(true);
    expect(isHapticsEnabled()).toBe(true);

    vibrate(HAPTIC_PATTERNS.LATE);
    expect(vibrateSpy).toHaveBeenCalledWith(HAPTIC_PATTERNS.LATE);
  });

  test('navigator.vibrate 미지원 환경에서도 오류 없이 무시된다', () => {
    delete window.navigator.vibrate;
    expect(() => vibrate(HAPTIC_PATTERNS.REJECT)).not.toThrow();
  });

  test('등급/이벤트별 패턴이 정의되어 있다', () => {
    expect(HAPTIC_PATTERNS.PERFECT).toEqual([15]);
    expect(HAPTIC_PATTERNS.GREAT).toEqual([10]);
    expect(HAPTIC_PATTERNS.EARLY).toEqual([8]);
    expect(HAPTIC_PATTERNS.LATE).toEqual([40, 30, 40]);
    expect(HAPTIC_PATTERNS.REJECT).toEqual([25, 20, 25]);
    expect(HAPTIC_PATTERNS.COMBO_MILESTONE).toEqual([10, 10, 10, 10]);
  });
});
