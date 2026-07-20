import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import useLongPress from './useLongPress.js';

describe('useLongPress — 짧은 탭 / 롱프레스 판별', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const setup = (delayMs = 500) => {
    const onTap = vi.fn();
    const onLongPress = vi.fn();
    const hook = renderHook(() => useLongPress({ onTap, onLongPress, delayMs }));
    return { onTap, onLongPress, hook };
  };

  test('짧은 탭(딜레이 전 pointerUp)은 onTap만 1회 호출한다', () => {
    const { onTap, onLongPress, hook } = setup();

    act(() => {
      hook.result.current.handlers.onPointerDown();
      vi.advanceTimersByTime(200);
      hook.result.current.handlers.onPointerUp();
    });

    expect(onTap).toHaveBeenCalledTimes(1);
    expect(onLongPress).not.toHaveBeenCalled();
  });

  test('딜레이 도달 시 onLongPress 1회, 이후 pointerUp에도 onTap 미호출', () => {
    const { onTap, onLongPress, hook } = setup();

    act(() => {
      hook.result.current.handlers.onPointerDown();
      vi.advanceTimersByTime(500);
    });
    act(() => {
      hook.result.current.handlers.onPointerUp();
    });

    expect(onLongPress).toHaveBeenCalledTimes(1);
    expect(onTap).not.toHaveBeenCalled();
  });

  test('pointerLeave로 이탈하면 탭/롱프레스 모두 무효', () => {
    const { onTap, onLongPress, hook } = setup();

    act(() => {
      hook.result.current.handlers.onPointerDown();
      vi.advanceTimersByTime(200);
      hook.result.current.handlers.onPointerLeave();
      vi.advanceTimersByTime(1000);
      hook.result.current.handlers.onPointerUp();
    });

    expect(onTap).not.toHaveBeenCalled();
    expect(onLongPress).not.toHaveBeenCalled();
  });

  test('누르는 동안 isPressing이 true, 해제 시 false', () => {
    const { hook } = setup();

    expect(hook.result.current.isPressing).toBe(false);
    act(() => {
      hook.result.current.handlers.onPointerDown();
    });
    expect(hook.result.current.isPressing).toBe(true);
    act(() => {
      hook.result.current.handlers.onPointerUp();
    });
    expect(hook.result.current.isPressing).toBe(false);
  });

  test('언마운트 시 타이머가 정리되어 onLongPress가 호출되지 않는다', () => {
    const { onLongPress, hook } = setup();

    act(() => {
      hook.result.current.handlers.onPointerDown();
    });
    hook.unmount();
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(onLongPress).not.toHaveBeenCalled();
  });
});
