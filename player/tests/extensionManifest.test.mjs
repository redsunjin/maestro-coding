// 배포 패킷 무결성 (G3 스펙 §2·§5): 버전 동기, 아이콘 참조, 최소 권한 고정.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(path.resolve(root, 'extension/manifest.json'), 'utf8'));
const pkg = JSON.parse(readFileSync(path.resolve(root, 'package.json'), 'utf8'));

test('manifest 버전은 package.json과 동기된다', () => {
  assert.equal(manifest.version, pkg.version);
});

test('아이콘 4종이 존재하고 manifest 참조와 일치한다', () => {
  for (const size of [16, 32, 48, 128]) {
    assert.equal(manifest.icons[String(size)], `icons/icon-${size}.png`);
    assert.equal(manifest.action.default_icon[String(size)], `icons/icon-${size}.png`);
    assert.ok(
      existsSync(path.resolve(root, 'extension', `icons/icon-${size}.png`)),
      `icon-${size}.png missing`,
    );
  }
});

test('권한은 문서화된 최소 집합과 정확히 일치한다 (과잉 권한 방지)', () => {
  assert.deepEqual([...manifest.permissions].sort(), ['storage', 'tabs']);
  assert.deepEqual([...manifest.host_permissions].sort(), [
    'https://api.github.com/*',
    'https://github.com/*',
    'https://gitlab.com/*',
  ]);
});
