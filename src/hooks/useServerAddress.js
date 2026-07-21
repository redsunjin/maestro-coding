import { useCallback, useState } from 'react';
import { removeStoredValue, setStoredValue } from '../utils/storage.js';
import {
  SERVER_WS_URL_STORAGE_KEY,
  getDefaultWsUrl,
  getStoredWsUrl,
  normalizeWsUrlInput,
  resolveInitialWsUrl,
} from '../utils/server-address.js';

// WS 서버 주소를 런타임 상태로 관리한다. 우선순위: localStorage > VITE_WS_URL > ws://<페이지 호스트>:8080
export default function useServerAddress() {
  const [wsUrl, setWsUrl] = useState(() => resolveInitialWsUrl());
  const [hasStoredWsUrl, setHasStoredWsUrl] = useState(() => Boolean(getStoredWsUrl()));

  const saveWsUrl = useCallback((input) => {
    const normalized = normalizeWsUrlInput(input);
    if (!normalized) {
      return { ok: false, error: '주소 형식이 올바르지 않습니다. 예: ws://192.168.0.10:8080' };
    }
    setStoredValue(SERVER_WS_URL_STORAGE_KEY, normalized);
    setWsUrl(normalized);
    setHasStoredWsUrl(true);
    return { ok: true, wsUrl: normalized };
  }, []);

  const resetWsUrl = useCallback(() => {
    removeStoredValue(SERVER_WS_URL_STORAGE_KEY);
    setHasStoredWsUrl(false);
    const next = getDefaultWsUrl();
    setWsUrl(next);
    return next;
  }, []);

  return { wsUrl, hasStoredWsUrl, saveWsUrl, resetWsUrl };
}
