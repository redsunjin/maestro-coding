#!/usr/bin/env node
// PWA 아이콘 생성기 — 기존 devDependency(@playwright/test)의 chromium으로 SVG를 렌더해
// public/icons/*.png 을 만든다. 산출 PNG는 커밋 대상이며, 디자인 변경 시에만 재실행한다.
//   node scripts/generate-pwa-icons.mjs
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(rootDir, 'public', 'icons');

// 레인 판정선 + 낙하 노트(8분음표) 모티프. maskable은 안전 영역(80%)으로 축소.
const iconSvg = ({ padded = false } = {}) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#312e81"/>
      <stop offset="1" stop-color="#111827"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" fill="url(#bg)"/>
  <g transform="${padded ? 'translate(51.2 51.2) scale(0.8)' : ''}">
    <rect x="88" y="380" width="336" height="16" rx="8" fill="#a855f7"/>
    <circle cx="212" cy="330" r="48" fill="#ffffff"/>
    <rect x="246" y="112" width="18" height="220" rx="9" fill="#ffffff"/>
    <path d="M264 112 q76 26 64 104 q-8 -48 -64 -60 z" fill="#ffffff"/>
    <circle cx="360" cy="200" r="14" fill="#fbbf24"/>
    <circle cx="140" cy="160" r="10" fill="#22d3ee"/>
  </g>
</svg>`;

const targets = [
  { file: 'apple-touch-icon.png', size: 180, padded: false },
  { file: 'icon-192.png', size: 192, padded: false },
  { file: 'icon-512.png', size: 512, padded: false },
  { file: 'icon-512-maskable.png', size: 512, padded: true },
];

await mkdir(outDir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage();

for (const { file, size, padded } of targets) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<!doctype html><style>html,body{margin:0}svg{display:block;width:${size}px;height:${size}px}</style>${iconSvg({ padded })}`);
  await page.screenshot({ path: path.join(outDir, file) });
  console.log(`generated public/icons/${file} (${size}x${size}${padded ? ', maskable' : ''})`);
}

await browser.close();
