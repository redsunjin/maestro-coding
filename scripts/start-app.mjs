#!/usr/bin/env node

import { spawn } from 'node:child_process';
import http from 'node:http';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { readEnvFile } from './env-utils.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const ENV_PATH = path.resolve(ROOT_DIR, '.env');
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const envLoad = readEnvFile(ENV_PATH);
const loadedEnv = envLoad.values;

const host = loadedEnv.HOST || process.env.HOST || '127.0.0.1';
const port = loadedEnv.PORT || process.env.PORT || '8080';
const wsUrl = loadedEnv.VITE_WS_URL || process.env.VITE_WS_URL || `ws://${host}:${port}`;

const runtimeEnv = {
  ...process.env,
  ...loadedEnv,
  HOST: host,
  PORT: String(port),
  VITE_WS_URL: wsUrl,
};

const children = [];
let isShuttingDown = false;
let dashboardUrl = '';

function stripAnsi(text) {
  return text.replace(/\u001b\[[0-9;]*m/g, '');
}

function detectLocalUrl(line) {
  const plain = stripAnsi(line);
  const localMatch = plain.match(/Local:\s*(https?:\/\/\S+)/i);
  if (localMatch) return localMatch[1];

  const fallbackMatch = plain.match(/(https?:\/\/\S+)/i);
  if (!fallbackMatch) return '';
  const url = fallbackMatch[1];
  if (url.includes('localhost') || url.includes('127.0.0.1')) {
    return url;
  }
  return '';
}

function pipeOutput(stream, label, isError = false, onLine) {
  if (!stream) return;
  const write = isError ? process.stderr.write.bind(process.stderr) : process.stdout.write.bind(process.stdout);
  let buffer = '';

  stream.on('data', (chunk) => {
    buffer += String(chunk);
    let lineBreakIndex = buffer.indexOf('\n');
    while (lineBreakIndex !== -1) {
      const line = buffer.slice(0, lineBreakIndex);
      buffer = buffer.slice(lineBreakIndex + 1);
      write(`[${label}] ${line}\n`);
      if (typeof onLine === 'function') {
        onLine(line);
      }
      lineBreakIndex = buffer.indexOf('\n');
    }
  });

  stream.on('end', () => {
    if (buffer.length > 0) {
      write(`[${label}] ${buffer}\n`);
      if (typeof onLine === 'function') {
        onLine(buffer);
      }
    }
  });
}

function printExitHint(label) {
  if (label === 'server') {
    console.error('[start:app] server 점검: npm run check:env 또는 npm run server 단독 실행으로 원인 확인');
    return;
  }

  if (label === 'ui') {
    console.error('[start:app] ui 점검: npm run dev 단독 실행으로 포트/의존성 문제 확인');
  }
}

function startProcess(label, npmScript) {
  const child = spawn(npmCommand, ['run', npmScript], {
    cwd: ROOT_DIR,
    env: runtimeEnv,
    stdio: ['inherit', 'pipe', 'pipe'],
  });

  const onUiLine = label === 'ui'
    ? (line) => {
      if (dashboardUrl) return;
      const detected = detectLocalUrl(line);
      if (!detected) return;
      dashboardUrl = detected;
      console.log(`[start:app] dashboard detected: ${dashboardUrl}`);
    }
    : undefined;

  pipeOutput(child.stdout, label, false, onUiLine);
  pipeOutput(child.stderr, label, true, onUiLine);

  child.on('error', (error) => {
    if (isShuttingDown) return;
    console.error(`[start:app] ${label} 프로세스 시작 실패: ${error.message}`);
    printExitHint(label);
    void shutdown(1);
  });

  child.on('exit', (code, signal) => {
    if (isShuttingDown) return;
    const exitCode = typeof code === 'number' ? code : 1;
    console.error(`[start:app] ${label} 종료 (code=${exitCode}, signal=${signal || 'none'})`);
    printExitHint(label);
    void shutdown(exitCode);
  });

  children.push(child);
  return child;
}

async function waitForHealth() {
  const timeoutMs = 15000;
  const healthHost = host === '0.0.0.0' ? '127.0.0.1' : host;
  const healthUrl = `http://${healthHost}:${port}/health`;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const isHealthy = await new Promise((resolve) => {
      const request = http.get(healthUrl, (response) => {
        const ok = response.statusCode && response.statusCode >= 200 && response.statusCode < 300;
        response.resume();
        resolve(Boolean(ok));
      });
      request.on('error', () => resolve(false));
      request.setTimeout(700, () => {
        request.destroy();
        resolve(false);
      });
    });

    if (isHealthy) return healthUrl;
    await delay(300);
  }

  throw new Error(`서버 health check 타임아웃 (${healthUrl})`);
}

async function shutdown(exitCode = 0) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  for (const child of children) {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGTERM');
    }
  }

  await delay(1200);

  for (const child of children) {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGKILL');
    }
  }

  process.exit(exitCode);
}

process.on('SIGINT', () => {
  console.log('\n[start:app] 종료 요청(SIGINT)을 수신했습니다.');
  void shutdown(0);
});

process.on('SIGTERM', () => {
  console.log('\n[start:app] 종료 요청(SIGTERM)을 수신했습니다.');
  void shutdown(0);
});

console.log('[start:app] launching server + ui');
startProcess('server', 'server');
startProcess('ui', 'dev');

try {
  const healthUrl = await waitForHealth();
  console.log('[start:app] ready');
  console.log(`  - health   : ${healthUrl}`);
  console.log(`  - ws       : ${wsUrl}`);
  console.log(`  - dashboard: ${dashboardUrl || 'Vite 출력의 Local URL을 열어주세요.'}`);
  console.log('  - stop     : Ctrl+C');
} catch (error) {
  console.error(`[start:app] ${error.message}`);
  console.error('[start:app] 점검 순서: npm run check:env -> npm run server -> npm run dev');
  await shutdown(1);
}
