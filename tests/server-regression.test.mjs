import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocket } from 'ws';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = resolve(__dirname, '..');
const SERVER_ENTRY = resolve(ROOT_DIR, 'maestro-server.js');

function randomPort() {
  return 12000 + Math.floor(Math.random() * 2000);
}

function withTimeout(promise, timeoutMs, label) {
  return Promise.race([
    promise,
    delay(timeoutMs).then(() => {
      throw new Error(`${label} timed out after ${timeoutMs}ms`);
    }),
  ]);
}

async function waitForHealth(port, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`);
      if (res.ok) return;
    } catch {
      // ignore until deadline
    }
    await delay(100);
  }
  throw new Error(`server did not become healthy on port ${port}`);
}

function startServer({ token = '', host = '127.0.0.1', allowedOrigins = '', extraEnv = {} } = {}) {
  const port = randomPort();
  let logs = '';

  const proc = spawn(process.execPath, [SERVER_ENTRY], {
    cwd: ROOT_DIR,
    env: {
      ...process.env,
      PORT: String(port),
      HOST: host,
      MAESTRO_SERVER_TOKEN: token,
      ALLOWED_ORIGINS: allowedOrigins,
      ...extraEnv,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  proc.stdout.on('data', (chunk) => {
    logs += chunk.toString();
  });
  proc.stderr.on('data', (chunk) => {
    logs += chunk.toString();
  });

  return {
    port,
    proc,
    getLogs: () => logs,
  };
}

async function stopServer(proc) {
  if (proc.exitCode !== null || proc.killed) return;
  proc.kill('SIGTERM');
  try {
    await withTimeout(once(proc, 'exit'), 2000, 'server shutdown');
  } catch {
    proc.kill('SIGKILL');
    await once(proc, 'exit');
  }
}

async function postApprovalRequest(port, headers = {}, payloadOverrides = {}) {
  const response = await fetch(`http://127.0.0.1:${port}/api/request`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: JSON.stringify({
      requestId: `req_${Date.now()}`,
      agentId: 'qa_agent',
      branchName: 'feature/qa',
      laneIndex: 1,
      diffSummary: {
        title: 'QA request',
        shortDescription: 'regression validation',
      },
      ...payloadOverrides,
    }),
  });

  return response;
}

test('POST /api/request accepts unauthenticated request when token is disabled', async (t) => {
  const server = startServer();
  t.after(async () => {
    await stopServer(server.proc);
  });

  await waitForHealth(server.port);
  const response = await postApprovalRequest(server.port);

  assert.equal(response.status, 200);
  const json = await response.json();
  assert.equal(json.success, true);
});

test('POST /api/request enforces bearer token when MAESTRO_SERVER_TOKEN is set', async (t) => {
  const server = startServer({ token: 'secret-token' });
  t.after(async () => {
    await stopServer(server.proc);
  });

  await waitForHealth(server.port);

  const noAuth = await postApprovalRequest(server.port);
  assert.equal(noAuth.status, 401);

  const badAuth = await postApprovalRequest(server.port, {
    Authorization: 'Bearer wrong-token',
  });
  assert.equal(badAuth.status, 401);

  const goodAuth = await postApprovalRequest(server.port, {
    Authorization: 'Bearer secret-token',
  });
  assert.equal(goodAuth.status, 200);
});

test('server broadcasts AGENT_TASK_READY via websocket on request creation', async (t) => {
  const server = startServer();
  t.after(async () => {
    await stopServer(server.proc);
  });

  await waitForHealth(server.port);

  const ws = new WebSocket(`ws://127.0.0.1:${server.port}`);
  t.after(() => {
    ws.close();
  });
  await withTimeout(once(ws, 'open'), 3000, 'websocket open');
  const messagePromise = withTimeout(once(ws, 'message'), 3000, 'websocket message');

  const requestId = `req_ws_${Date.now()}`;
  const response = await fetch(`http://127.0.0.1:${server.port}/api/request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requestId,
      agentId: 'qa_agent',
      branchName: 'feature/ws',
      laneIndex: 2,
      diffSummary: {
        title: 'WebSocket broadcast',
        shortDescription: 'message propagation',
      },
    }),
  });
  assert.equal(response.status, 200);

  const [payload] = await messagePromise;
  const event = JSON.parse(payload.toString());

  assert.equal(event.event, 'AGENT_TASK_READY');
  assert.equal(event.requestId, requestId);
  assert.equal(event.agentId, 'qa_agent');
  assert.equal(event.laneIndex, 2);
});

test('server attempts conditional auto-approve when policy matches', async (t) => {
  const server = startServer({
    extraEnv: {
      MAIN_REPO_PATH: ROOT_DIR,
      MAESTRO_AUTO_APPROVE_ENABLED: 'true',
      MAESTRO_AUTO_APPROVE_TRUSTED_AGENTS: 'qa_agent',
      MAESTRO_AUTO_APPROVE_BRANCH_PREFIX: 'feature/',
      MAESTRO_AUTO_APPROVE_MAX_DESC_LENGTH: '300',
    },
  });
  t.after(async () => {
    await stopServer(server.proc);
  });

  await waitForHealth(server.port);

  const ws = new WebSocket(`ws://127.0.0.1:${server.port}`);
  t.after(() => {
    ws.close();
  });
  await withTimeout(once(ws, 'open'), 3000, 'websocket open');

  const eventsPromise = withTimeout(new Promise((resolve) => {
    const events = [];
    ws.on('message', (payload) => {
      events.push(JSON.parse(payload.toString()));
      if (events.length >= 2) resolve(events);
    });
  }), 5000, 'auto approve events');

  const requestId = `req_auto_${Date.now()}`;
  const response = await fetch(`http://127.0.0.1:${server.port}/api/request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requestId,
      agentId: 'qa_agent',
      branchName: 'feature/auto-approve-missing-branch',
      laneIndex: 1,
      diffSummary: {
        title: 'Auto approve policy',
        shortDescription: 'policy matched',
      },
    }),
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.autoApprove?.eligible, true);

  const events = await eventsPromise;
  assert.equal(events[0].event, 'AGENT_TASK_READY');
  assert.equal(events[0].requestId, requestId);

  const mergeResult = events.find((event) => event.event === 'MERGE_FAILED');
  assert.ok(mergeResult, `expected MERGE_FAILED event, got: ${JSON.stringify(events)}`);
  assert.equal(mergeResult.requestId, requestId);
  assert.equal(mergeResult.autoApproved, true);
});

test('auto-approve requires explicit request flag when configured', async (t) => {
  const server = startServer({
    extraEnv: {
      MAESTRO_AUTO_APPROVE_ENABLED: 'true',
      MAESTRO_AUTO_APPROVE_TRUSTED_AGENTS: 'qa_agent',
      MAESTRO_AUTO_APPROVE_BRANCH_PREFIX: 'feature/',
      MAESTRO_AUTO_APPROVE_REQUIRE_EXPLICIT: 'true',
    },
  });
  t.after(async () => {
    await stopServer(server.proc);
  });

  await waitForHealth(server.port);

  const noFlagResponse = await postApprovalRequest(server.port, {}, {
    requestId: `req_explicit_missing_${Date.now()}`,
    branchName: 'feature/needs-flag',
  });
  assert.equal(noFlagResponse.status, 200);
  const noFlagBody = await noFlagResponse.json();
  assert.equal(noFlagBody.autoApprove?.eligible, false);
  assert.equal(noFlagBody.autoApprove?.reason, 'EXPLICIT_FLAG_REQUIRED');

  const withFlagResponse = await postApprovalRequest(server.port, {}, {
    requestId: `req_explicit_ok_${Date.now()}`,
    branchName: 'feature/has-flag',
    autoApprove: true,
  });
  assert.equal(withFlagResponse.status, 200);
  const withFlagBody = await withFlagResponse.json();
  assert.equal(withFlagBody.autoApprove?.eligible, true);
});

test('auto-approve enforces cooldown between eligible requests', async (t) => {
  const server = startServer({
    extraEnv: {
      MAIN_REPO_PATH: ROOT_DIR,
      MAESTRO_AUTO_APPROVE_ENABLED: 'true',
      MAESTRO_AUTO_APPROVE_TRUSTED_AGENTS: 'qa_agent',
      MAESTRO_AUTO_APPROVE_BRANCH_PREFIX: 'feature/',
      MAESTRO_AUTO_APPROVE_REQUIRE_EXPLICIT: 'true',
      MAESTRO_AUTO_APPROVE_COOLDOWN_MS: '600000',
    },
  });
  t.after(async () => {
    await stopServer(server.proc);
  });

  await waitForHealth(server.port);

  const first = await postApprovalRequest(server.port, {}, {
    requestId: `req_cooldown_1_${Date.now()}`,
    branchName: 'feature/cooldown-one',
    autoApprove: true,
  });
  assert.equal(first.status, 200);
  const firstBody = await first.json();
  assert.equal(firstBody.autoApprove?.eligible, true);

  const second = await postApprovalRequest(server.port, {}, {
    requestId: `req_cooldown_2_${Date.now()}`,
    branchName: 'feature/cooldown-two',
    autoApprove: true,
  });
  assert.equal(second.status, 200);
  const secondBody = await second.json();
  assert.equal(secondBody.autoApprove?.eligible, false);
  assert.equal(secondBody.autoApprove?.reason, 'COOLDOWN_ACTIVE');
});

test('manual APPROVE is skipped when request is already merged', async (t) => {
  const server = startServer();
  t.after(async () => {
    await stopServer(server.proc);
  });

  await waitForHealth(server.port);

  const ws = new WebSocket(`ws://127.0.0.1:${server.port}`);
  t.after(() => {
    ws.close();
  });
  await withTimeout(once(ws, 'open'), 3000, 'websocket open');

  const requestId = `req_manual_dup_${Date.now()}`;

  const firstMessagePromise = withTimeout(once(ws, 'message'), 3000, 'first approve result');
  ws.send(JSON.stringify({
    action: 'APPROVE',
    requestId,
  }));
  const [firstPayload] = await firstMessagePromise;
  const firstEvent = JSON.parse(firstPayload.toString());
  assert.equal(firstEvent.event, 'MERGE_SUCCESS');
  assert.equal(firstEvent.requestId, requestId);

  const secondMessagePromise = withTimeout(once(ws, 'message'), 3000, 'duplicate approve result');
  ws.send(JSON.stringify({
    action: 'APPROVE',
    requestId,
  }));
  const [secondPayload] = await secondMessagePromise;
  const secondEvent = JSON.parse(secondPayload.toString());
  assert.equal(secondEvent.event, 'MERGE_SKIPPED');
  assert.equal(secondEvent.requestId, requestId);
  assert.equal(secondEvent.reason, 'REQUEST_ALREADY_MERGED');
});

test('auto-approve dry-run emits skip event without merge attempt', async (t) => {
  const server = startServer({
    extraEnv: {
      MAESTRO_AUTO_APPROVE_ENABLED: 'true',
      MAESTRO_AUTO_APPROVE_TRUSTED_AGENTS: 'qa_agent',
      MAESTRO_AUTO_APPROVE_BRANCH_PREFIX: 'feature/',
      MAESTRO_AUTO_APPROVE_REQUIRE_EXPLICIT: 'true',
      MAESTRO_AUTO_APPROVE_DRY_RUN: 'true',
    },
  });
  t.after(async () => {
    await stopServer(server.proc);
  });

  await waitForHealth(server.port);

  const ws = new WebSocket(`ws://127.0.0.1:${server.port}`);
  t.after(() => {
    ws.close();
  });
  await withTimeout(once(ws, 'open'), 3000, 'websocket open');

  const eventsPromise = withTimeout(new Promise((resolve) => {
    const events = [];
    ws.on('message', (payload) => {
      events.push(JSON.parse(payload.toString()));
      if (events.length >= 2) resolve(events);
    });
  }), 5000, 'dry run events');

  const requestId = `req_dry_${Date.now()}`;
  const response = await postApprovalRequest(server.port, {}, {
    requestId,
    branchName: 'feature/dry-run',
    autoApprove: true,
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.autoApprove?.eligible, true);

  const events = await eventsPromise;
  assert.equal(events[0].event, 'AGENT_TASK_READY');
  assert.equal(events[0].requestId, requestId);
  assert.equal(events[1].event, 'AUTO_APPROVE_SKIPPED');
  assert.equal(events[1].requestId, requestId);
  assert.equal(events[1].reason, 'DRY_RUN');
});

test('server returns AGENT_RESTARTED event when REJECT action is sent', async (t) => {
  const server = startServer();
  t.after(async () => {
    await stopServer(server.proc);
  });

  await waitForHealth(server.port);

  const ws = new WebSocket(`ws://127.0.0.1:${server.port}`);
  t.after(() => {
    ws.close();
  });
  await withTimeout(once(ws, 'open'), 3000, 'websocket open');

  const messagePromise = withTimeout(once(ws, 'message'), 3000, 'websocket message');
  ws.send(JSON.stringify({
    action: 'REJECT',
    requestId: 'req_reject_1',
    feedback: 'qa rejection',
  }));

  const [payload] = await messagePromise;
  const event = JSON.parse(payload.toString());

  assert.equal(event.event, 'AGENT_RESTARTED');
  assert.equal(event.requestId, 'req_reject_1');
});

test('OPTIONS preflight allows configured origin and returns CORS headers', async (t) => {
  const allowedOrigin = 'http://localhost:5173';
  const server = startServer({ allowedOrigins: allowedOrigin });
  t.after(async () => {
    await stopServer(server.proc);
  });

  await waitForHealth(server.port);

  const response = await fetch(`http://127.0.0.1:${server.port}/api/request`, {
    method: 'OPTIONS',
    headers: {
      Origin: allowedOrigin,
      'Access-Control-Request-Method': 'POST',
    },
  });

  assert.equal(response.status, 204);
  assert.equal(response.headers.get('access-control-allow-origin'), allowedOrigin);
});

test('OPTIONS preflight rejects disallowed origin with 403', async (t) => {
  const server = startServer({ allowedOrigins: 'http://localhost:5173' });
  t.after(async () => {
    await stopServer(server.proc);
  });

  await waitForHealth(server.port);

  const response = await fetch(`http://127.0.0.1:${server.port}/api/request`, {
    method: 'OPTIONS',
    headers: {
      Origin: 'http://evil.example.com',
      'Access-Control-Request-Method': 'POST',
    },
  });

  assert.equal(response.status, 403);
});

test('POST rejects disallowed origin with 403', async (t) => {
  const server = startServer({ allowedOrigins: 'http://localhost:5173' });
  t.after(async () => {
    await stopServer(server.proc);
  });

  await waitForHealth(server.port);

  const response = await postApprovalRequest(server.port, {
    Origin: 'http://evil.example.com',
  });

  assert.equal(response.status, 403);
});
