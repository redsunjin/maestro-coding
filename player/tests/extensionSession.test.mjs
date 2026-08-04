// launch 세션 저장 정책 (G2 스펙 §2): 단일 키에 마지막 1건만 유지한다.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildLaunchPayload,
  clearLastLaunch,
  readLastLaunch,
  writeLastLaunch,
} from '../extension/lib/session.js';

function createStorageArea() {
  const store = new Map();
  return {
    async get(key) {
      return { [key]: store.get(key) };
    },
    async set(entries) {
      for (const [key, value] of Object.entries(entries)) {
        store.set(key, value);
      }
    },
    async remove(key) {
      store.delete(key);
    },
    size() {
      return store.size;
    },
  };
}

test('launch 세션은 마지막 1건만 유지한다', async () => {
  const storage = createStorageArea();
  const first = buildLaunchPayload({
    canonicalUrl: 'https://github.com/openai/a',
    repoSlug: 'openai/a',
    provider: 'github',
  });
  const second = buildLaunchPayload({
    canonicalUrl: 'https://github.com/openai/b',
    repoSlug: 'openai/b',
    provider: 'github',
  });

  await writeLastLaunch(storage, first);
  await writeLastLaunch(storage, second);

  const stored = await readLastLaunch(storage);
  assert.equal(stored.repoSlug, 'openai/b');
  assert.equal(storage.size(), 1); // 항상 단일 키 — 세션이 쌓이지 않는다

  await clearLastLaunch(storage);
  assert.equal(await readLastLaunch(storage), null);
});
