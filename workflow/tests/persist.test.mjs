import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import os from 'node:os';
import { saveStore, loadStore } from '../server/persist.js';

function withTempDir(fn) {
  const dir = mkdtempSync(resolve(os.tmpdir(), 'maestro-workflow-persist-'));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('saveStore writes and loadStore reads round-trip', () => {
  withTempDir((dir) => {
    const storePath = resolve(dir, 'store.json');
    assert.equal(saveStore(storePath, { items: [{ id: 'a' }] }), true);
    const loaded = loadStore(storePath);
    assert.equal(loaded.version, 1);
    assert.deepEqual(loaded.items, [{ id: 'a' }]);
    // 임시 파일이 남지 않아야 한다
    assert.deepEqual(readdirSync(dir), ['store.json']);
  });
});

test('loadStore returns null for missing or corrupt files', () => {
  withTempDir((dir) => {
    assert.equal(loadStore(resolve(dir, 'missing.json')), null);
    const corruptPath = resolve(dir, 'corrupt.json');
    writeFileSync(corruptPath, '{not json', 'utf8');
    assert.equal(loadStore(corruptPath), null);
  });
});
