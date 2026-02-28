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

function isCompatibleWsHost({ host, wsHost }) {
  if (host === wsHost) return true;
  if (host === '0.0.0.0' && (wsHost === '127.0.0.1' || wsHost === 'localhost')) return true;
  if (host === '127.0.0.1' && wsHost === 'localhost') return true;
  if (host === 'localhost' && wsHost === '127.0.0.1') return true;
  return false;
}

function printIssues(title, items, logger) {
  if (items.length === 0) return;
  logger(title);
  for (const item of items) {
    logger(`  - ${item.message}`);
    if (item.fix) {
      logger(`    > 조치: ${item.fix}`);
    }
  }
}

const errors = [];
const warnings = [];
const pushError = (message, fix = '') => errors.push({ message, fix });
const pushWarning = (message, fix = '') => warnings.push({ message, fix });

const envLoad = readEnvFile(ENV_PATH);
if (!envLoad.found) {
  pushError('.env 파일이 없습니다.', 'npm run configure 실행 후 다시 시도하세요.');
}

const envValues = envLoad.values;
const host = envValues.HOST || '127.0.0.1';
const portRaw = envValues.PORT || '8080';
const port = toPortNumber(portRaw);
const mainRepoPath = (envValues.MAIN_REPO_PATH || ROOT_DIR).trim();
const wsUrlRaw = (envValues.VITE_WS_URL || `ws://${host}:${portRaw}`).trim();

const nodeModulesPath = path.join(ROOT_DIR, 'node_modules');
if (!existsSync(nodeModulesPath)) {
  pushError('의존성이 설치되어 있지 않습니다 (node_modules 없음).', 'npm install 실행 후 다시 시도하세요.');
}

if (isLikelyPlaceholderPath(mainRepoPath)) {
  pushError('MAIN_REPO_PATH가 예시 경로입니다.', '.env의 MAIN_REPO_PATH를 실제 git 레포 경로로 수정하세요.');
}

if (!existsSync(mainRepoPath)) {
  pushError(`MAIN_REPO_PATH 경로가 존재하지 않습니다: ${mainRepoPath}`, '.env의 MAIN_REPO_PATH를 올바른 절대 경로로 수정하세요.');
} else if (!existsSync(path.join(mainRepoPath, '.git'))) {
  pushError(`MAIN_REPO_PATH가 git 레포가 아닙니다: ${mainRepoPath}`, 'git 레포 루트 경로를 MAIN_REPO_PATH로 지정하세요.');
}

if (!port) {
  pushError(`PORT 값이 유효하지 않습니다: ${portRaw}`, '1~65535 사이 정수로 수정하세요.');
}

let wsUrl;
try {
  wsUrl = new URL(wsUrlRaw);
  if (!['ws:', 'wss:'].includes(wsUrl.protocol)) {
    pushError(`VITE_WS_URL 프로토콜이 올바르지 않습니다: ${wsUrlRaw}`, 'ws:// 또는 wss:// 형식을 사용하세요.');
  }
} catch {
  pushError(`VITE_WS_URL 형식이 올바르지 않습니다: ${wsUrlRaw}`, '예: ws://127.0.0.1:8080');
}

if (wsUrl && port) {
  const wsPort = Number(wsUrl.port || (wsUrl.protocol === 'wss:' ? '443' : '80'));
  if (wsPort !== port) {
    pushWarning(
      `PORT(${port})와 VITE_WS_URL 포트(${wsPort})가 다릅니다.`,
      '동일 포트를 사용하도록 .env를 정렬하세요.',
    );
  }

  if (!isCompatibleWsHost({ host, wsHost: wsUrl.hostname })) {
    pushWarning(
      `HOST(${host})와 VITE_WS_URL 호스트(${wsUrl.hostname})가 다릅니다.`,
      '서버 바인딩과 프론트 연결 호스트를 같은 로컬 주소로 맞추세요.',
    );
  }
}

if (errors.length === 0 && port) {
  try {
    await checkPortAvailable({ host, port });
  } catch (error) {
    if (error && error.code === 'EADDRINUSE') {
      pushError(
        `PORT ${port}가 이미 사용 중입니다.`,
        '기존 프로세스를 종료하거나 .env에서 다른 PORT를 사용하세요.',
      );
    } else if (error && error.code === 'EACCES') {
      pushError(
        `PORT ${port} 바인딩 권한이 없습니다.`,
        '1024 미만 포트 대신 8080 같은 비권한 포트를 사용하세요.',
      );
    } else {
      pushWarning(`포트 점검 중 경고가 발생했습니다 (${host}:${port}): ${error.message}`);
    }
  }
}

printIssues('[preflight] warnings', warnings, console.log);

if (errors.length > 0) {
  printIssues('[preflight] failed', errors, console.error);
  process.exit(1);
}

console.log('[preflight] OK');
console.log(`  - MAIN_REPO_PATH: ${mainRepoPath}`);
console.log(`  - HOST/PORT      : ${host}:${port}`);
console.log(`  - VITE_WS_URL    : ${wsUrlRaw}`);
console.log('  - next           : npm run start:app');
