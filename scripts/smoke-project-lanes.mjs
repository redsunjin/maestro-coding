#!/usr/bin/env node

import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path, { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { WebSocket } from 'ws';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = resolve(__dirname, '..');
const SERVER_ENTRY = resolve(ROOT_DIR, 'maestro-server.js');
const PORT = Number(process.env.MAESTRO_SMOKE_LANES_PORT || 18084);
const HOST = '127.0.0.1';

let serverProc = null;
let ws = null;
let tempDir = '';

function git(cwd, args) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function withTimeout(promise, timeoutMs, label) {
  return Promise.race([
    promise,
    delay(timeoutMs).then(() => {
      throw new Error(`${label} timed out after ${timeoutMs}ms`);
    }),
  ]);
}

async function waitForHealth(timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://${HOST}:${PORT}/health`);
      if (res.ok) {
        return res.json();
      }
    } catch {
      // ignore until deadline
    }
    await delay(150);
  }
  throw new Error(`server did not become healthy on ${HOST}:${PORT}`);
}

function createRepo(parentDir, name, branchName, featureLine) {
  const repoPath = resolve(parentDir, name);
  git(parentDir, ['init', '-b', 'main', repoPath]);
  git(repoPath, ['config', 'user.name', 'smoke-bot']);
  git(repoPath, ['config', 'user.email', 'smoke-bot@example.com']);

  writeFileSync(resolve(repoPath, 'file.txt'), `${name} base\n`, 'utf8');
  git(repoPath, ['add', 'file.txt']);
  git(repoPath, ['commit', '-m', 'base']);
  const baseHash = git(repoPath, ['rev-parse', 'HEAD']);

  git(repoPath, ['checkout', '-b', branchName]);
  writeFileSync(resolve(repoPath, 'file.txt'), `${name} base\n${featureLine}\n`, 'utf8');
  git(repoPath, ['commit', '-am', `${name} feature`]);
  git(repoPath, ['checkout', 'main']);

  return {
    name,
    repoPath,
    branchName,
    baseHash,
  };
}

function waitForWebSocketEvent(predicate, label, timeoutMs = 5000) {
  return withTimeout(new Promise((resolvePromise) => {
    const onMessage = (payload) => {
      let event;
      try {
        event = JSON.parse(payload.toString());
      } catch {
        return;
      }
      if (!predicate(event)) return;
      ws.off('message', onMessage);
      resolvePromise(event);
    };
    ws.on('message', onMessage);
  }), timeoutMs, label);
}

async function postRequest({ requestId, branchName, laneIndex, title, projectId }) {
  const response = await fetch(`http://${HOST}:${PORT}/api/request`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      requestId,
      agentId: 'smoke_agent',
      branchName,
      projectId,
      laneIndex,
      diffSummary: {
        title,
        shortDescription: `${title} lane=${laneIndex}`,
      },
    }),
  });
  assert.equal(response.status, 200);
  return response.json();
}

async function selectProject(projectId) {
  const response = await fetch(`http://${HOST}:${PORT}/api/projects/select`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ projectId }),
  });
  assert.equal(response.status, 200);
  return response.json();
}

async function readHistory() {
  const response = await fetch(`http://${HOST}:${PORT}/api/history?limit=50`);
  assert.equal(response.status, 200);
  return response.json();
}

async function main() {
  tempDir = mkdtempSync(path.join(os.tmpdir(), 'maestro-smoke-lanes-'));
  const registryPath = resolve(tempDir, 'projects.json');
  const envPath = resolve(tempDir, '.env');

  const alpha = createRepo(tempDir, 'alpha', 'feature/four-lane', 'alpha feature change');
  const beta = createRepo(tempDir, 'beta', 'feature/six-lane', 'beta feature change');

  writeFileSync(registryPath, JSON.stringify([
    {
      id: 'alpha',
      name: 'alpha',
      path: alpha.repoPath,
      repoUrl: 'https://example.com/alpha.git',
      laneCount: 4,
    },
    {
      id: 'beta',
      name: 'beta',
      path: beta.repoPath,
      repoUrl: 'https://example.com/beta.git',
      laneCount: 6,
    },
  ], null, 2), 'utf8');

  serverProc = spawn(process.execPath, [SERVER_ENTRY], {
    cwd: ROOT_DIR,
    env: {
      ...process.env,
      PORT: String(PORT),
      HOST,
      MAIN_REPO_PATH: alpha.repoPath,
      MAESTRO_PROJECT_NAME: 'alpha',
      MAESTRO_PROJECT_LANE_COUNT: '4',
      MAESTRO_PROJECT_REGISTRY_PATH: registryPath,
      MAESTRO_ENV_FILE_PATH: envPath,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let serverLogs = '';
  serverProc.stdout.on('data', (chunk) => { serverLogs += chunk.toString(); });
  serverProc.stderr.on('data', (chunk) => { serverLogs += chunk.toString(); });

  try {
    const initialHealth = await waitForHealth();
    assert.equal(initialHealth.project.name, 'alpha');
    assert.equal(initialHealth.project.laneCount, 4);

    const projectsRes = await fetch(`http://${HOST}:${PORT}/api/projects`);
    assert.equal(projectsRes.status, 200);
    const projectsBody = await projectsRes.json();
    assert.equal(projectsBody.items.some((item) => item.id === 'beta' && item.laneCount === 6), true);

    ws = new WebSocket(`ws://${HOST}:${PORT}`);
    await withTimeout(once(ws, 'open'), 3000, 'websocket open');

    const alphaRequestId = 'req_smoke_alpha_lane_4';
    const alphaReadyPromise = waitForWebSocketEvent(
      (event) => event.event === 'AGENT_TASK_READY' && event.requestId === alphaRequestId,
      'alpha task ready',
    );
    await postRequest({
      requestId: alphaRequestId,
      branchName: alpha.branchName,
      laneIndex: 4,
      title: 'alpha lane 4 request',
      projectId: 'proj_b2c',
    });
    const alphaReady = await alphaReadyPromise;
    assert.equal(alphaReady.laneIndex, 4);

    const alphaMergePromise = waitForWebSocketEvent(
      (event) => event.event === 'MERGE_SUCCESS' && event.requestId === alphaRequestId,
      'alpha merge success',
    );
    ws.send(JSON.stringify({
      action: 'APPROVE',
      requestId: alphaRequestId,
      branchName: alpha.branchName,
      laneIndex: 4,
      projectId: 'proj_b2c',
    }));
    await alphaMergePromise;

    const undoPromise = waitForWebSocketEvent(
      (event) => event.event === 'UNDO_SUCCESS',
      'undo success',
    );
    ws.send(JSON.stringify({ action: 'UNDO' }));
    await undoPromise;

    const switchPromise = waitForWebSocketEvent(
      (event) => event.event === 'PROJECT_SWITCHED' && event.currentProject?.id === 'beta',
      'project switched to beta',
    );
    const switchBody = await selectProject('beta');
    assert.equal(switchBody.currentProject.id, 'beta');
    assert.equal(switchBody.currentProject.laneCount, 6);
    await switchPromise;

    const betaHealth = await waitForHealth();
    assert.equal(betaHealth.project.name, 'beta');
    assert.equal(betaHealth.project.laneCount, 6);

    const betaRequestId = 'req_smoke_beta_lane_6';
    const betaReadyPromise = waitForWebSocketEvent(
      (event) => event.event === 'AGENT_TASK_READY' && event.requestId === betaRequestId,
      'beta task ready',
    );
    await postRequest({
      requestId: betaRequestId,
      branchName: beta.branchName,
      laneIndex: 6,
      title: 'beta lane 6 request',
      projectId: 'proj_b2c',
    });
    const betaReady = await betaReadyPromise;
    assert.equal(betaReady.laneIndex, 6);

    const rejectPromise = waitForWebSocketEvent(
      (event) => event.event === 'AGENT_RESTARTED' && event.requestId === betaRequestId,
      'beta reject event',
    );
    ws.send(JSON.stringify({
      action: 'REJECT',
      requestId: betaRequestId,
      branchName: beta.branchName,
      laneIndex: 6,
      projectId: 'proj_b2c',
      feedback: 'smoke reject check',
    }));
    await rejectPromise;

    const historyBody = await readHistory();
    const items = Array.isArray(historyBody.items) ? historyBody.items : [];
    assert.equal(items.some((item) => item.requestId === alphaRequestId && item.result === 'REQUESTED' && item.laneIndex === 4), true);
    assert.equal(items.some((item) => item.requestId === alphaRequestId && item.result === 'APPROVED'), true);
    assert.equal(items.some((item) => item.result === 'ROLLBACK'), true);
    assert.equal(items.some((item) => item.requestId === betaRequestId && item.result === 'REQUESTED' && item.laneIndex === 6), true);
    assert.equal(items.some((item) => item.requestId === betaRequestId && item.result === 'REJECTED'), true);

    const alphaFinalHash = git(alpha.repoPath, ['rev-parse', 'HEAD']);
    const betaFinalHash = git(beta.repoPath, ['rev-parse', 'HEAD']);
    assert.equal(alphaFinalHash, alpha.baseHash);
    assert.equal(betaFinalHash, beta.baseHash);

    const persistedEnv = readFileSync(envPath, 'utf8');
    assert.match(persistedEnv, /MAESTRO_PROJECT_NAME=beta/);
    assert.match(persistedEnv, /MAESTRO_PROJECT_LANE_COUNT=6/);

    console.log('[SMOKE] PASS - 4-lane alpha + 6-lane beta project switching flow');
  } catch (error) {
    console.error('[SMOKE] FAILED - dynamic project lane scenario');
    console.error(error instanceof Error ? error.message : String(error));
    if (serverLogs) {
      console.error('[SMOKE] server logs');
      console.error(serverLogs.trim());
    }
    throw error;
  }
}

try {
  await main();
} finally {
  if (ws) {
    ws.close();
  }
  if (serverProc && serverProc.exitCode === null && serverProc.signalCode === null) {
    serverProc.kill('SIGTERM');
    try {
      await withTimeout(once(serverProc, 'exit'), 2000, 'server shutdown');
    } catch {
      serverProc.kill('SIGKILL');
      await once(serverProc, 'exit');
    }
  }
  if (tempDir) {
    rmSync(tempDir, { recursive: true, force: true });
  }
}
