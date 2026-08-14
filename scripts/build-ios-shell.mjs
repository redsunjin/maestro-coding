#!/usr/bin/env node
// Coding(루트 앱)·Player 정적 빌드 + 런처를 하나의 iOS 웹뷰 셸로 합친다.
// dist-ios-shell/{index.html, launcher.js, coding/, player/}
//   node scripts/build-ios-shell.mjs
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const shellDir = path.join(rootDir, 'dist-ios-shell');
const launcherDir = path.join(rootDir, 'ios/launcher');

rmSync(shellDir, { recursive: true, force: true });
mkdirSync(shellDir, { recursive: true });

await build({
  configFile: path.join(rootDir, 'vite.config.js'),
  base: './',
  logLevel: 'warn',
  build: {
    outDir: path.join(shellDir, 'coding'),
    emptyOutDir: true,
  },
});

await build({
  configFile: path.join(rootDir, 'player/vite.config.js'),
  root: path.join(rootDir, 'player'),
  base: './',
  logLevel: 'warn',
  build: {
    outDir: path.join(shellDir, 'player'),
    emptyOutDir: true,
  },
});

for (const file of ['index.html', 'launcher.js']) {
  const src = path.join(launcherDir, file);
  if (!existsSync(src)) {
    throw new Error(`런처 소스가 없습니다: ${src}`);
  }
  cpSync(src, path.join(shellDir, file));
}

console.log(`iOS 셸 빌드 완료: ${path.relative(rootDir, shellDir)}/{index.html, launcher.js, coding/, player/}`);
