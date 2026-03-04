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

async function waitForWebSocketEvent(ws, predicate, timeoutMs = 5000, label = 'websocket event') {
  return withTimeout(new Promise((resolve) => {
    const onMessage = (payload) => {
      let event;
      try {
        event = JSON.parse(payload.toString());
      } catch {
        return;
      }
      if (!predicate(event)) return;
      ws.off('message', onMessage);
      resolve(event);
    };
    ws.on('message', onMessage);
  }), timeoutMs, label);
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

  const requestId = `req_ws_${Date.now()}`;
  const messagePromise = waitForWebSocketEvent(
    ws,
    (event) => event.event === 'AGENT_TASK_READY' && event.requestId === requestId,
    3000,
    'agent task ready event',
  );
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

  const event = await messagePromise;

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

  const requestId = `req_auto_${Date.now()}`;
  const taskReadyPromise = waitForWebSocketEvent(
    ws,
    (event) => event.event === 'AGENT_TASK_READY' && event.requestId === requestId,
    5000,
    'auto approve task ready',
  );
  const mergeResultPromise = waitForWebSocketEvent(
    ws,
    (event) => (event.event === 'MERGE_SUCCESS' || event.event === 'MERGE_FAILED') && event.requestId === requestId,
    5000,
    'auto approve merge result',
  );
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

  const taskReadyEvent = await taskReadyPromise;
  assert.equal(taskReadyEvent.event, 'AGENT_TASK_READY');
  assert.equal(taskReadyEvent.requestId, requestId);

  const mergeResult = await mergeResultPromise;
  assert.equal(mergeResult.event, 'MERGE_FAILED');
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

  const firstMessagePromise = waitForWebSocketEvent(
    ws,
    (event) => (event.event === 'MERGE_SUCCESS' || event.event === 'MERGE_FAILED') && event.requestId === requestId,
    3000,
    'first approve result',
  );
  ws.send(JSON.stringify({
    action: 'APPROVE',
    requestId,
  }));
  const firstEvent = await firstMessagePromise;
  assert.equal(firstEvent.event, 'MERGE_SUCCESS');
  assert.equal(firstEvent.requestId, requestId);

  const secondMessagePromise = waitForWebSocketEvent(
    ws,
    (event) => event.event === 'MERGE_SKIPPED' && event.requestId === requestId,
    3000,
    'duplicate approve result',
  );
  ws.send(JSON.stringify({
    action: 'APPROVE',
    requestId,
  }));
  const secondEvent = await secondMessagePromise;
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

  const requestId = `req_dry_${Date.now()}`;
  const taskReadyPromise = waitForWebSocketEvent(
    ws,
    (event) => event.event === 'AGENT_TASK_READY' && event.requestId === requestId,
    5000,
    'dry run task ready',
  );
  const skippedPromise = waitForWebSocketEvent(
    ws,
    (event) => event.event === 'AUTO_APPROVE_SKIPPED' && event.requestId === requestId,
    5000,
    'dry run skip',
  );
  const response = await postApprovalRequest(server.port, {}, {
    requestId,
    branchName: 'feature/dry-run',
    autoApprove: true,
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.autoApprove?.eligible, true);

  const taskReadyEvent = await taskReadyPromise;
  assert.equal(taskReadyEvent.event, 'AGENT_TASK_READY');
  assert.equal(taskReadyEvent.requestId, requestId);

  const skippedEvent = await skippedPromise;
  assert.equal(skippedEvent.event, 'AUTO_APPROVE_SKIPPED');
  assert.equal(skippedEvent.requestId, requestId);
  assert.equal(skippedEvent.reason, 'DRY_RUN');
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

  const messagePromise = waitForWebSocketEvent(
    ws,
    (event) => event.event === 'AGENT_RESTARTED' && event.requestId === 'req_reject_1',
    3000,
    'agent restarted event',
  );
  ws.send(JSON.stringify({
    action: 'REJECT',
    requestId: 'req_reject_1',
    feedback: 'qa rejection',
  }));

  const event = await messagePromise;

  assert.equal(event.event, 'AGENT_RESTARTED');
  assert.equal(event.requestId, 'req_reject_1');
});

test('server emits HISTORY_APPEND for manual REJECT action', async (t) => {
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

  const historyEventPromise = waitForWebSocketEvent(
    ws,
    (event) => (
      event.event === 'HISTORY_APPEND'
      && event.item?.requestId === 'req_hist_reject_1'
      && event.item?.result === 'REJECTED'
    ),
    3000,
    'history append reject',
  );

  ws.send(JSON.stringify({
    action: 'REJECT',
    requestId: 'req_hist_reject_1',
    feedback: 'history regression check',
  }));

  const historyEvent = await historyEventPromise;
  assert.equal(historyEvent.event, 'HISTORY_APPEND');
  assert.equal(historyEvent.item.requestId, 'req_hist_reject_1');
  assert.equal(historyEvent.item.result, 'REJECTED');
  assert.equal(historyEvent.item.reason, 'AGENT_RESTARTED');
});

test('GET /api/history returns filtered entries', async (t) => {
  const server = startServer();
  t.after(async () => {
    await stopServer(server.proc);
  });

  await waitForHealth(server.port);

  const requestId = `req_history_api_${Date.now()}`;
  const response = await postApprovalRequest(server.port, {}, {
    requestId,
    projectId: 'proj_b2c',
    laneIndex: 1,
    diffSummary: {
      title: 'History API Item',
      shortDescription: 'history endpoint regression',
    },
  });
  assert.equal(response.status, 200);

  const ws = new WebSocket(`ws://127.0.0.1:${server.port}`);
  t.after(() => {
    ws.close();
  });
  await withTimeout(once(ws, 'open'), 3000, 'websocket open');

  const approveResultPromise = waitForWebSocketEvent(
    ws,
    (event) => event.event === 'MERGE_SUCCESS' && event.requestId === requestId,
    3000,
    'history merge success',
  );
  ws.send(JSON.stringify({
    action: 'APPROVE',
    requestId,
    laneIndex: 1,
    projectId: 'proj_b2c',
  }));
  await approveResultPromise;

  const allHistoryRes = await fetch(`http://127.0.0.1:${server.port}/api/history?limit=20`);
  assert.equal(allHistoryRes.status, 200);
  const allHistory = await allHistoryRes.json();
  assert.ok(Array.isArray(allHistory.items));
  assert.ok(allHistory.items.some((item) => item.requestId === requestId && item.result === 'REQUESTED'));
  assert.ok(allHistory.items.some((item) => item.requestId === requestId && item.result === 'APPROVED'));

  const approvedHistoryRes = await fetch(`http://127.0.0.1:${server.port}/api/history?limit=20&result=APPROVED`);
  assert.equal(approvedHistoryRes.status, 200);
  const approvedHistory = await approvedHistoryRes.json();
  assert.ok(approvedHistory.items.length >= 1);
  assert.ok(approvedHistory.items.every((item) => item.result === 'APPROVED'));
  assert.ok(approvedHistory.items.some((item) => item.requestId === requestId));

  const projectHistoryRes = await fetch(`http://127.0.0.1:${server.port}/api/history?limit=20&projectId=proj_b2c`);
  assert.equal(projectHistoryRes.status, 200);
  const projectHistory = await projectHistoryRes.json();
  assert.ok(projectHistory.items.length >= 1);
  assert.ok(projectHistory.items.every((item) => item.projectId === 'proj_b2c'));
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
