#!/usr/bin/env node

import { existsSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readEnvFile } from './env-utils.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const ENV_PATH = path.resolve(ROOT_DIR, '.env');

function toPortNumber(portValue) {
  const port = Number(portValue);
  if (!Number.isInteger(port)) return null;
  if (port < 1 || port > 65535) return null;
  return port;
}

function checkPortAvailable({ host, port }) {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();

    server.once('error', (error) => {
      reject(error);
    });

    server.listen({ host, port }, () => {
      server.close((closeError) => {
        if (closeError) {
          reject(closeError);
          return;
        }
        resolve(true);
      });
    });
  });
}

function isLikelyPlaceholderPath(value) {
  const text = String(value || '').trim().toLowerCase();
  return text.includes('/path/to/') || text.includes('your/main/repo');
}

const errors = [];
const warnings = [];

const envLoad = readEnvFile(ENV_PATH);
if (!envLoad.found) {
  errors.push('.env 파일이 없습니다. 먼저 `npm run configure`를 실행하세요.');
}

const envValues = envLoad.values;
const host = envValues.HOST || '127.0.0.1';
const portRaw = envValues.PORT || '8080';
const port = toPortNumber(portRaw);
const mainRepoPath = (envValues.MAIN_REPO_PATH || ROOT_DIR).trim();
const wsUrlRaw = (envValues.VITE_WS_URL || `ws://${host}:${portRaw}`).trim();

if (isLikelyPlaceholderPath(mainRepoPath)) {
  errors.push('MAIN_REPO_PATH가 예시 경로입니다. 실제 git 레포 경로로 수정하세요.');
}

if (!existsSync(mainRepoPath)) {
  errors.push(`MAIN_REPO_PATH 경로가 존재하지 않습니다: ${mainRepoPath}`);
} else if (!existsSync(path.join(mainRepoPath, '.git'))) {
  errors.push(`MAIN_REPO_PATH가 git 레포가 아닙니다: ${mainRepoPath}`);
}

if (!port) {
  errors.push(`PORT 값이 유효하지 않습니다: ${portRaw}`);
}

let wsUrl;
try {
  wsUrl = new URL(wsUrlRaw);
  if (!['ws:', 'wss:'].includes(wsUrl.protocol)) {
    errors.push(`VITE_WS_URL 프로토콜은 ws:// 또는 wss:// 여야 합니다: ${wsUrlRaw}`);
  }
} catch {
  errors.push(`VITE_WS_URL 형식이 올바르지 않습니다: ${wsUrlRaw}`);
}

if (wsUrl && port) {
  const wsPort = Number(wsUrl.port || (wsUrl.protocol === 'wss:' ? '443' : '80'));
  if (wsPort !== port) {
    warnings.push(`PORT(${port})와 VITE_WS_URL 포트(${wsPort})가 다릅니다.`);
  }
}

if (errors.length === 0 && port) {
  try {
    await checkPortAvailable({ host, port });
  } catch (error) {
    if (error && error.code === 'EADDRINUSE') {
      errors.push(`PORT ${port}가 이미 사용 중입니다. 기존 프로세스를 종료하거나 포트를 변경하세요.`);
    } else {
      warnings.push(`포트 점검 중 경고가 발생했습니다 (${host}:${port}): ${error.message}`);
    }
  }
}

if (warnings.length > 0) {
  console.log('[preflight] warnings');
  for (const warning of warnings) {
    console.log(`  - ${warning}`);
  }
}

if (errors.length > 0) {
  console.error('[preflight] failed');
  for (const error of errors) {
    console.error(`  - ${error}`);
  }
  process.exit(1);
}

console.log('[preflight] OK');
console.log(`  - MAIN_REPO_PATH: ${mainRepoPath}`);
console.log(`  - HOST/PORT      : ${host}:${port}`);
console.log(`  - VITE_WS_URL    : ${wsUrlRaw}`);
