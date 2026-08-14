// 이 테스트는 player/를 Vite로 실제 빌드하며 player/node_modules 설치가 필요하다.
// 기본 `npm test`/`npm run qa` 체인은 이를 보장하지 않으므로(별도의 player-app CI 잡에서만 설치),
// tests/*.test.mjs 글롭에서 제외되도록 .itest.mjs 확장자를 쓰고 `npm run test:ios-shell`로 수동 실행한다.
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

  execFileSync('node', ['scripts/build-ios-shell.mjs'], {
    cwd: ROOT_DIR,
    stdio: 'inherit',
    timeout: 120_000,
    killSignal: 'SIGKILL',
  });

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

test('헤더 전환 버튼은 빌드된 셸의 런처 경로(../index.html)를 참조한다', () => {
  const codingSource = readFileSync(resolve(ROOT_DIR, 'src/components/maestro/MaestroHeader.jsx'), 'utf8');
  assert.match(codingSource, /['"]\.\.\/index\.html['"]/, 'Coding 헤더의 전환 버튼이 런처 경로(../index.html)를 참조하지 않음');

  const playerSource = readFileSync(resolve(ROOT_DIR, 'player/src/App.jsx'), 'utf8');
  assert.match(playerSource, /['"]\.\.\/index\.html['"]/, 'Player 헤더의 전환 버튼이 런처 경로(../index.html)를 참조하지 않음');
});
