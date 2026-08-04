// dist-extension을 스토어 제출용 zip으로 패키징한다.
// 실행: npm run package:extension  (build:extension 이후)
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const distDir = path.resolve(projectRoot, 'dist-extension');
const outDir = path.resolve(projectRoot, 'output');

if (!existsSync(distDir)) {
  throw new Error('dist-extension이 없습니다 — 먼저 npm run build:extension을 실행하세요.');
}

const { version } = JSON.parse(readFileSync(path.resolve(projectRoot, 'package.json'), 'utf8'));
mkdirSync(outDir, { recursive: true });
const zipPath = path.resolve(outDir, `maestro-player-extension-v${version}.zip`);
rmSync(zipPath, { force: true });
execFileSync('zip', ['-r', zipPath, '.'], { cwd: distDir, stdio: 'inherit' });
console.log(`\n📦 ${zipPath}`);
