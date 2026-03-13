#!/usr/bin/env node

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readEnvFile } from './env-utils.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const ENV_PATH = path.resolve(ROOT_DIR, '.env');

const loadedEnv = readEnvFile(ENV_PATH).values;

const child = spawn(process.execPath, ['maestro-server.js'], {
  cwd: ROOT_DIR,
  env: {
    ...process.env,
    ...loadedEnv,
  },
  stdio: 'inherit',
});
let forwardedSignal = '';

function forwardSignal(signal) {
  forwardedSignal = signal;
  if (child.exitCode === null && child.signalCode === null) {
    child.kill(signal);
  }
}

process.on('SIGINT', () => {
  forwardSignal('SIGINT');
});

process.on('SIGTERM', () => {
  forwardSignal('SIGTERM');
});

child.on('error', (error) => {
  console.error(`[server] 실행 실패: ${error.message}`);
  process.exit(1);
});

child.on('exit', (code, signal) => {
  if (forwardedSignal) {
    process.exit(0);
    return;
  }
  if (signal) {
    process.exit(1);
    return;
  }
  process.exit(code ?? 0);
});
