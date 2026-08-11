#!/usr/bin/env node
// iOS AppIcon(단일 1024 유니버설) 생성기 — generate-pwa-icons.mjs와 동일 모티프를 1024px로 렌더.
//   node scripts/generate-ios-appicon.mjs
import { chromium } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outFile = path.join(rootDir, 'ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png');

const iconSvg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#312e81"/>
      <stop offset="1" stop-color="#111827"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" fill="url(#bg)"/>
  <rect x="88" y="380" width="336" height="16" rx="8" fill="#a855f7"/>
  <circle cx="212" cy="330" r="48" fill="#ffffff"/>
  <rect x="246" y="112" width="18" height="220" rx="9" fill="#ffffff"/>
  <path d="M264 112 q76 26 64 104 q-8 -48 -64 -60 z" fill="#ffffff"/>
  <circle cx="360" cy="200" r="14" fill="#fbbf24"/>
  <circle cx="140" cy="160" r="10" fill="#22d3ee"/>
</svg>`;

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setViewportSize({ width: 1024, height: 1024 });
await page.setContent(`<!doctype html><style>html,body{margin:0}svg{display:block;width:1024px;height:1024px}</style>${iconSvg}`);
await page.screenshot({ path: outFile });
await browser.close();

console.log(`generated ${path.relative(rootDir, outFile)} (1024x1024)`);
