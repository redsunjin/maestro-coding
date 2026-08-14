import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SHELL_DIR = resolve(ROOT_DIR, 'dist-ios-shell');

test('build-ios-shell.mjs는 coding/player 빌드와 런처를 하나의 셸로 배치한다', { timeout: 120_000 }, () => {
  rmSync(SHELL_DIR, { recursive: true, force: true });

  execFileSync('node', ['scripts/build-ios-shell.mjs'], { cwd: ROOT_DIR, stdio: 'inherit' });

  assert.ok(existsSync(resolve(SHELL_DIR, 'index.html')), '런처 index.html 없음');
  assert.ok(existsSync(resolve(SHELL_DIR, 'launcher.js')), '런처 launcher.js 없음');
  assert.ok(existsSync(resolve(SHELL_DIR, 'coding/index.html')), 'coding 빌드 없음');
  assert.ok(existsSync(resolve(SHELL_DIR, 'player/index.html')), 'player 빌드 없음');

  const codingHtml = readFileSync(resolve(SHELL_DIR, 'coding/index.html'), 'utf8');
  assert.match(codingHtml, /src="\.\/assets\//, 'coding 빌드가 상대 경로(base ./)를 쓰지 않음');

  const playerHtml = readFileSync(resolve(SHELL_DIR, 'player/index.html'), 'utf8');
  assert.match(playerHtml, /src="\.\/assets\//, 'player 빌드가 상대 경로(base ./)를 쓰지 않음');

  rmSync(SHELL_DIR, { recursive: true, force: true });
});

test('capacitor.config.json의 webDir은 dist-ios-shell을 가리킨다', () => {
  const config = JSON.parse(readFileSync(resolve(ROOT_DIR, 'capacitor.config.json'), 'utf8'));
  assert.equal(config.webDir, 'dist-ios-shell');
});
