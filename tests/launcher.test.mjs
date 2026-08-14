import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  LAST_APP_STORAGE_KEY,
  getLastApp,
  setLastApp,
  buildLauncherState,
} from '../ios/launcher/launcher.js';

function createFakeStorage() {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => { map.set(key, value); },
  };
}

test('LAST_APP_STORAGE_KEY는 maestro- 접두사를 쓴다', () => {
  assert.equal(LAST_APP_STORAGE_KEY, 'maestro-shell-last-app');
});

test('getLastApp은 저장된 값이 없으면 null을 반환한다', () => {
  const storage = createFakeStorage();
  assert.equal(getLastApp(storage), null);
});

test('getLastApp은 coding/player가 아닌 값을 무시한다', () => {
  const storage = createFakeStorage();
  storage.setItem(LAST_APP_STORAGE_KEY, 'garbage');
  assert.equal(getLastApp(storage), null);
});

test('setLastApp으로 저장한 값을 getLastApp이 그대로 읽는다', () => {
  const storage = createFakeStorage();
  setLastApp(storage, 'player');
  assert.equal(getLastApp(storage), 'player');
});

test('buildLauncherState는 마지막 선택에만 배지를 켠다', () => {
  assert.deepEqual(buildLauncherState(null), {
    coding: { badge: false },
    player: { badge: false },
  });
  assert.deepEqual(buildLauncherState('coding'), {
    coding: { badge: true },
    player: { badge: false },
  });
  assert.deepEqual(buildLauncherState('player'), {
    coding: { badge: false },
    player: { badge: true },
  });
});

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');

test('launcher index.html은 Coding/Player 버튼과 launcher.js import를 포함한다', () => {
  const html = readFileSync(resolve(ROOT_DIR, 'ios/launcher/index.html'), 'utf8');
  assert.match(html, /data-app="coding"/);
  assert.match(html, /data-app="player"/);
  assert.match(html, /from\s+['"]\.\/launcher\.js['"]/);
  assert.match(html, /coding\/index\.html/);
  assert.match(html, /player\/index\.html/);
});
