// favicon.svg를 확장 아이콘 PNG(16/32/48/128)로 래스터화한다.
// 실행: node scripts/renderExtensionIcons.mjs  (player/ 에서, 루트 devDep의 Playwright 사용)
import path from 'node:path';
import { mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(projectRoot, '..');
const requireFromRepo = createRequire(path.join(repoRoot, 'package.json'));
const { chromium } = requireFromRepo('@playwright/test');

const SIZES = [16, 32, 48, 128];
const svg = readFileSync(path.resolve(projectRoot, 'public/favicon.svg'), 'utf8');
const outDir = path.resolve(projectRoot, 'extension/icons');
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage();

for (const size of SIZES) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<!doctype html><style>*{margin:0}body{background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`,
  );
  await page.screenshot({
    path: path.join(outDir, `icon-${size}.png`),
    omitBackground: true,
  });
  console.log(`icon-${size}.png`);
}

await browser.close();
