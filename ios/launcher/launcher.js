// iOS 셸 런처의 순수 로직 — DOM 의존 없음, storage 인터페이스(getItem/setItem)만 받는다.
export const LAST_APP_STORAGE_KEY = 'maestro-shell-last-app';

export function getLastApp(storage) {
  const value = storage.getItem(LAST_APP_STORAGE_KEY);
  return value === 'coding' || value === 'player' ? value : null;
}

export function setLastApp(storage, appId) {
  storage.setItem(LAST_APP_STORAGE_KEY, appId);
}

export function buildLauncherState(lastApp) {
  return {
    coding: { badge: lastApp === 'coding' },
    player: { badge: lastApp === 'player' },
  };
}
