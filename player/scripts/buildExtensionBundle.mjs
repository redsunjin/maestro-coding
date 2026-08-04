import path from 'node:path';
import { rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const outDir = path.resolve(projectRoot, 'dist-extension');
const configFile = path.resolve(projectRoot, 'vite.extension.config.js');

await rm(outDir, { recursive: true, force: true });
await build({
  configFile,
});
