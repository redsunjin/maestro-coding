// server-embed.mjs — maestro-server를 소비자(CLI/플러그인/확장)가 한 줄로 띄우는 supervisor.
// 서버 본체를 자식 프로세스로 스폰하고 /health로 기동을 확인한다. 서버 코드는 무변경.
import { spawn } from 'node:child_process';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SERVER_ENTRY = path.resolve(ROOT_DIR, 'maestro-server.js');
const LOG_TAIL_LINES = 30;

async function fetchHealth(url, timeoutMs = 1500) {
  try {
    const response = await fetch(`${url}/health`, { signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok) return { reachable: true, maestro: false };
    const body = await response.json().catch(() => null);
    if (body?.status === 'ok' && body?.project) {
      return { reachable: true, maestro: true, health: body };
    }
    return { reachable: true, maestro: false };
  } catch (error) {
    // 연결 거부 = 포트 비어 있음. 그 외(타임아웃 등)는 도달 불가로 간주.
    return { reachable: false, maestro: false, error };
  }
}

export async function startMaestroServer(options = {}) {
  const {
    port = 8080,
    host = '127.0.0.1',
    repoPath,
    mdns = true,
    token,
    reuseExisting = true,
    env: extraEnv = {},
    onLog,
    startTimeoutMs = 15000,
  } = options;

  const url = `http://${host}:${port}`;
  const wsUrl = `ws://${host}:${port}`;

  if (reuseExisting) {
    const probe = await fetchHealth(url);
    if (probe.maestro) {
      return {
        url,
        wsUrl,
        port,
        host,
        alreadyRunning: true,
        pid: null,
        health: probe.health,
        stop: async () => {}, // 이 핸들이 소유하지 않은 서버는 건드리지 않는다
      };
    }
    if (probe.reachable) {
      throw new Error(`포트 ${host}:${port}가 이미 사용 중이지만 Maestro 서버가 아닙니다. 다른 포트를 지정하세요.`);
    }
  }

  const childEnv = {
    ...process.env,
    PORT: String(port),
    HOST: host,
    MAESTRO_MDNS: mdns ? 'on' : 'off',
    ...(repoPath ? { MAIN_REPO_PATH: repoPath } : {}),
    ...(token ? { MAESTRO_SERVER_TOKEN: token } : {}),
    ...extraEnv,
  };

  const child = spawn(process.execPath, [SERVER_ENTRY], {
    cwd: ROOT_DIR,
    env: childEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const logTail = [];
  const handleChunk = (chunk) => {
    for (const line of chunk.toString().split('\n')) {
      if (!line.trim()) continue;
      logTail.push(line);
      if (logTail.length > LOG_TAIL_LINES) logTail.shift();
      if (typeof onLog === 'function') onLog(line);
    }
  };
  child.stdout.on('data', handleChunk);
  child.stderr.on('data', handleChunk);

  let exited = false;
  child.on('exit', () => {
    exited = true;
  });

  const deadline = Date.now() + startTimeoutMs;
  let healthy = null;
  while (Date.now() < deadline) {
    if (exited) break;
    const probe = await fetchHealth(url, 1000);
    if (probe.maestro) {
      healthy = probe.health;
      break;
    }
    await delay(150);
  }

  const stop = async () => {
    if (child.exitCode !== null || child.signalCode !== null) return;
    child.kill('SIGTERM');
    const killDeadline = Date.now() + 2000;
    while (Date.now() < killDeadline) {
      if (child.exitCode !== null || child.signalCode !== null) return;
      await delay(50);
    }
    child.kill('SIGKILL');
  };

  if (!healthy) {
    await stop();
    const reason = exited ? '프로세스가 조기 종료됨' : `기동 타임아웃(${startTimeoutMs}ms)`;
    throw new Error(`Maestro 서버 기동 실패 — ${reason}\n--- 최근 로그 ---\n${logTail.join('\n')}`);
  }

  return {
    url,
    wsUrl,
    port,
    host,
    alreadyRunning: false,
    pid: child.pid,
    health: healthy,
    stop,
  };
}
