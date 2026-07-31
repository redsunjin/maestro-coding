import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const WORKFLOW_DIR = resolve(__dirname, '..');
const SERVER_ENTRY = resolve(WORKFLOW_DIR, 'server.js');

export function randomPort() {
  return 18000 + Math.floor(Math.random() * 2000);
}

export async function waitForHealth(port, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`);
      if (res.ok) return;
    } catch {
      // 준비될 때까지 무시
    }
    await delay(100);
  }
  throw new Error(`workflow server did not become healthy on port ${port}`);
}

// tempDir를 넘기면 같은 스토어로 재시작할 수 있다 (영속화 테스트용).
export async function startServer({ serverToken = '', tempDir = null } = {}) {
  const dataDir = tempDir || mkdtempSync(resolve(os.tmpdir(), 'maestro-workflow-test-'));
  const port = randomPort();
  const proc = spawn(process.execPath, [SERVER_ENTRY], {
    cwd: WORKFLOW_DIR,
    env: {
      ...process.env,
      MAESTRO_WORKFLOW_PORT: String(port),
      MAESTRO_WORKFLOW_HOST: '127.0.0.1',
      MAESTRO_WORKFLOW_SERVER_TOKEN: serverToken,
      MAESTRO_WORKFLOW_ACTOR_STORE_PATH: resolve(dataDir, 'actors.json'),
      MAESTRO_WORKFLOW_DECISION_STORE_PATH: resolve(dataDir, 'decisions.json'),
      MAESTRO_WORKFLOW_HISTORY_STORE_PATH: resolve(dataDir, 'history.json'),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  await waitForHealth(port);
  return {
    port,
    dataDir,
    proc,
    stop: async () => {
      proc.kill('SIGTERM');
      await delay(150);
    },
  };
}

export function cleanupDataDir(dataDir) {
  rmSync(dataDir, { recursive: true, force: true });
}

export function authHeaders(token) {
  return token ? { Authorization: `Bearer ${token}` } : {};
}
