import { useCallback, useEffect, useRef, useState } from 'react';

// 짧은 탭과 롱프레스를 판별하는 포인터 핸들러 훅.
// delayMs 도달 전 pointerUp = onTap, 도달 = onLongPress(1회).
// pointerLeave/pointerCancel로 이탈하면 둘 다 무효.
export default function useLongPress({ onTap, onLongPress, delayMs = 500 }) {
  const [isPressing, setIsPressing] = useState(false);
  const timerRef = useRef(null);
  const longPressFiredRef = useRef(false);
  const invalidatedRef = useRef(false);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const onPointerDown = useCallback(() => {
    longPressFiredRef.current = false;
    invalidatedRef.current = false;
    setIsPressing(true);
    clearTimer();
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      longPressFiredRef.current = true;
      setIsPressing(false);
      onLongPress?.();
    }, delayMs);
  }, [clearTimer, delayMs, onLongPress]);

  const onPointerUp = useCallback(() => {
    clearTimer();
    setIsPressing(false);
    if (!longPressFiredRef.current && !invalidatedRef.current) {
      onTap?.();
    }
    invalidatedRef.current = true;
  }, [clearTimer, onTap]);

  const onPointerLeave = useCallback(() => {
    clearTimer();
    setIsPressing(false);
    invalidatedRef.current = true;
  }, [clearTimer]);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  return {
    isPressing,
    handlers: {
      onPointerDown,
      onPointerUp,
      onPointerLeave,
      onPointerCancel: onPointerLeave,
    },
  };
}
