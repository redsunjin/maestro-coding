import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  HAPTIC_PATTERNS,
  HAPTICS_STORAGE_KEY,
  isHapticsEnabled,
  mapPatternToNativePlan,
  setHapticsEnabled,
  vibrate,
} from './haptics.js';

const hapticsImpactMock = vi.fn(async () => {});

vi.mock('@capacitor/haptics', () => ({
  Haptics: {
    impact: (...args) => hapticsImpactMock(...args),
  },
  ImpactStyle: {
    Light: 'LIGHT',
    Medium: 'MEDIUM',
    Heavy: 'HEAVY',
  },
}));

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

describe('mapPatternToNativePlan — 네이티브 햅틱 매핑', () => {
  test.each([
    [[10], [{ kind: 'impact', style: 'LIGHT' }]],
    [[15], [{ kind: 'impact', style: 'MEDIUM' }]],
    [[8], [{ kind: 'impact', style: 'LIGHT' }]],
    [[40, 30, 40], [
      { kind: 'impact', style: 'HEAVY' },
      { kind: 'delay', ms: 30 },
      { kind: 'impact', style: 'HEAVY' },
    ]],
    [[25, 20, 25], [
      { kind: 'impact', style: 'MEDIUM' },
      { kind: 'delay', ms: 20 },
      { kind: 'impact', style: 'MEDIUM' },
    ]],
    [[], []],
  ])('%j → %j', (pattern, expected) => {
    expect(mapPatternToNativePlan(pattern)).toEqual(expected);
  });

  test('숫자 단일값과 비정상 입력을 관대하게 처리한다', () => {
    expect(mapPatternToNativePlan(15)).toEqual([{ kind: 'impact', style: 'MEDIUM' }]);
    expect(mapPatternToNativePlan(undefined)).toEqual([]);
    expect(mapPatternToNativePlan('nope')).toEqual([]);
  });
});

describe('vibrate — 네이티브 셸 분기', () => {
  beforeEach(() => {
    window.localStorage.clear();
    hapticsImpactMock.mockClear();
    window.Capacitor = { isNativePlatform: () => true };
  });

  afterEach(() => {
    delete window.Capacitor;
  });

  test('네이티브 셸에서는 navigator.vibrate 대신 Haptics.impact를 호출한다', async () => {
    const vibrateSpy = vi.fn(() => true);
    Object.defineProperty(window.navigator, 'vibrate', {
      value: vibrateSpy,
      configurable: true,
      writable: true,
    });

    vibrate(HAPTIC_PATTERNS.PERFECT);

    await vi.waitFor(() => {
      expect(hapticsImpactMock).toHaveBeenCalledWith({ style: 'MEDIUM' });
    });
    expect(vibrateSpy).not.toHaveBeenCalled();
    delete window.navigator.vibrate;
  });

  test('토글 OFF면 네이티브 경로도 호출되지 않는다', async () => {
    setHapticsEnabled(false);
    vibrate(HAPTIC_PATTERNS.PERFECT);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(hapticsImpactMock).not.toHaveBeenCalled();
  });
});
