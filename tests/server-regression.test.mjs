import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { dirname, resolve } from 'node:path';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
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
  const historyStorePath = extraEnv.MAESTRO_HISTORY_STORE_PATH
    || resolve(os.tmpdir(), `maestro-history-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`);

  const proc = spawn(process.execPath, [SERVER_ENTRY], {
    cwd: ROOT_DIR,
    env: {
      ...process.env,
      PORT: String(port),
      HOST: host,
      MAESTRO_SERVER_TOKEN: token,
      ALLOWED_ORIGINS: allowedOrigins,
      MAESTRO_HISTORY_STORE_PATH: historyStorePath,
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
    historyStorePath,
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

async function postFirstClassApprovalRequest(port, headers = {}, payloadOverrides = {}) {
  const response = await fetch(`http://127.0.0.1:${port}/api/approval-requests`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: JSON.stringify({
      requestId: `apr_${Date.now()}`,
      agentId: 'qa_agent',
      branchName: 'feature/qa-approval-request',
      laneIndex: 1,
      diffSummary: {
        title: 'First-class approval request',
        shortDescription: 'approval request store validation',
      },
      ...payloadOverrides,
    }),
  });

  return response;
}

async function postWorkSession(port, payload = {}, headers = {}) {
  const response = await fetch(`http://127.0.0.1:${port}/api/work-sessions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(payload),
  });

  return response;
}

async function postAgentRegistration(port, payload = {}, headers = {}) {
  const response = await fetch(`http://127.0.0.1:${port}/api/agents/register`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(payload),
  });

  return response;
}

async function postAgentHeartbeat(port, agentId, headers = {}) {
  const response = await fetch(`http://127.0.0.1:${port}/api/agents/${encodeURIComponent(agentId)}/heartbeat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: JSON.stringify({}),
  });

  return response;
}

async function postWorkSessionMessage(port, workSessionId, body, headers = {}) {
  const response = await fetch(`http://127.0.0.1:${port}/api/work-sessions/${workSessionId}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(body),
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

async function waitForAutoApproveEvents(port, predicate, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const response = await fetch(`http://127.0.0.1:${port}/api/auto-approve/events?limit=100`);
    if (response.ok) {
      const body = await response.json();
      const items = Array.isArray(body.items) ? body.items : [];
      if (predicate(items)) {
        return items;
      }
    }
    await delay(100);
  }
  throw new Error(`auto approve events condition not met within ${timeoutMs}ms`);
}

function createTempGitRepo(parentDir, name) {
  const repoPath = resolve(parentDir, name);
  mkdirSync(resolve(repoPath, '.git'), { recursive: true });
  return repoPath;
}

function createProjectRegistryFixture(projects) {
  const tempDir = mkdtempSync(resolve(os.tmpdir(), 'maestro-project-switch-'));
  const registryPath = resolve(tempDir, 'projects.json');
  const envPath = resolve(tempDir, '.env');
  writeFileSync(registryPath, JSON.stringify(projects, null, 2));
  return {
    tempDir,
    registryPath,
    envPath,
  };
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

test('work session APIs create, list, detail, and emit websocket events', async (t) => {
  const fixture = createProjectRegistryFixture([]);
  const workflowStorePath = resolve(fixture.tempDir, 'workflows.json');
  t.after(() => {
    rmSync(fixture.tempDir, { recursive: true, force: true });
  });

  const server = startServer({
    extraEnv: {
      MAESTRO_WORKFLOW_STORE_PATH: workflowStorePath,
    },
  });
  t.after(async () => {
    await stopServer(server.proc);
  });

  await waitForHealth(server.port);

  const ws = new WebSocket(`ws://127.0.0.1:${server.port}`);
  t.after(() => ws.close());
  await once(ws, 'open');
  const createdEventPromise = waitForWebSocketEvent(
    ws,
    (event) => event.event === 'WORK_SESSION_CREATED',
    5000,
    'WORK_SESSION_CREATED',
  );

  const createResponse = await postWorkSession(server.port, {
    projectId: 'runtime_default',
    title: 'Session Core Smoke',
    agentId: 'openclaw',
    source: 'dashboard',
  });
  assert.equal(createResponse.status, 200);
  const createBody = await createResponse.json();
  assert.equal(createBody.success, true);
  assert.equal(createBody.item.title, 'Session Core Smoke');
  assert.equal(createBody.item.status, 'active');

  const createdEvent = await createdEventPromise;
  assert.equal(createdEvent.session.title, 'Session Core Smoke');
  assert.equal(createdEvent.session.workSessionId, createBody.item.workSessionId);

  const listResponse = await fetch(`http://127.0.0.1:${server.port}/api/work-sessions?limit=10`);
  assert.equal(listResponse.status, 200);
  const listBody = await listResponse.json();
  assert.equal(listBody.items.length, 1);
  assert.equal(listBody.items[0].workSessionId, createBody.item.workSessionId);

  const statusResponse = await postWorkSessionMessage(server.port, createBody.item.workSessionId, { body: '/status' });
  assert.equal(statusResponse.status, 200);
  const statusBody = await statusResponse.json();
  assert.equal(statusBody.success, true);
  assert.equal(statusBody.messages.some((message) => message.kind === 'command_result'), true);

  const agentMessageResponse = await postWorkSessionMessage(server.port, createBody.item.workSessionId, {
    body: '에이전트 진행 상황 공유',
    role: 'agent',
    kind: 'message',
  });
  assert.equal(agentMessageResponse.status, 200);

  const detailResponse = await fetch(`http://127.0.0.1:${server.port}/api/work-sessions/${createBody.item.workSessionId}`);
  assert.equal(detailResponse.status, 200);
  const detailBody = await detailResponse.json();
  assert.equal(detailBody.item.workSessionId, createBody.item.workSessionId);
  assert.equal(detailBody.messages.some((message) => message.kind === 'command_result'), true);
  assert.equal(detailBody.messages.some((message) => message.role === 'agent' && message.body === '에이전트 진행 상황 공유'), true);

  const closeResponse = await fetch(`http://127.0.0.1:${server.port}/api/work-sessions/${createBody.item.workSessionId}/close`, {
    method: 'POST',
  });
  assert.equal(closeResponse.status, 200);
  const closeBody = await closeResponse.json();
  assert.equal(closeBody.item.status, 'completed');
});

test('work session store restores sessions and messages after restart', async (t) => {
  const fixture = createProjectRegistryFixture([]);
  const workflowStorePath = resolve(fixture.tempDir, 'workflows.json');
  t.after(() => {
    rmSync(fixture.tempDir, { recursive: true, force: true });
  });

  const firstServer = startServer({
    extraEnv: {
      MAESTRO_WORKFLOW_STORE_PATH: workflowStorePath,
    },
  });
  await waitForHealth(firstServer.port);

  const createResponse = await postWorkSession(firstServer.port, {
    title: 'Persistent Work Session',
  });
  assert.equal(createResponse.status, 200);
  const createBody = await createResponse.json();

  const messageResponse = await postWorkSessionMessage(firstServer.port, createBody.item.workSessionId, { body: '운영자 메모' });
  assert.equal(messageResponse.status, 200);
  await stopServer(firstServer.proc);

  const secondServer = startServer({
    extraEnv: {
      MAESTRO_WORKFLOW_STORE_PATH: workflowStorePath,
    },
  });
  t.after(async () => {
    await stopServer(secondServer.proc);
  });

  await waitForHealth(secondServer.port);

  const detailResponse = await fetch(`http://127.0.0.1:${secondServer.port}/api/work-sessions/${createBody.item.workSessionId}`);
  assert.equal(detailResponse.status, 200);
  const detailBody = await detailResponse.json();
  assert.equal(detailBody.item.title, 'Persistent Work Session');
  assert.equal(detailBody.messages.some((message) => message.body === '운영자 메모'), true);
});

test('agent registry registers, upserts, lists, and records heartbeat', async (t) => {
  const server = startServer();
  t.after(async () => {
    await stopServer(server.proc);
  });

  await waitForHealth(server.port);

  const registerResponse = await postAgentRegistration(server.port, {
    agentId: 'claude_code_local',
    adapterType: 'claude-stop',
    repoRoot: ROOT_DIR,
    displayName: 'Claude Code Local',
    capabilities: ['approval-request', 'decision-polling', 'decision-polling'],
    tokenId: 'local-token',
    metadata: {
      cli: 'claude-code',
      installTarget: 'claude-stop',
    },
  });

  assert.equal(registerResponse.status, 200);
  const registerBody = await registerResponse.json();
  assert.equal(registerBody.success, true);
  assert.equal(registerBody.item.agentId, 'claude_code_local');
  assert.equal(registerBody.item.adapterType, 'claude-stop');
  assert.equal(registerBody.item.repoRoot, ROOT_DIR);
  assert.equal(registerBody.item.displayName, 'Claude Code Local');
  assert.deepEqual(registerBody.item.capabilities, ['approval-request', 'decision-polling']);
  assert.equal(registerBody.item.tokenId, 'local-token');
  assert.equal(registerBody.item.status, 'registered');
  assert.equal(registerBody.item.metadata.cli, 'claude-code');
  assert.equal(typeof registerBody.item.registeredAt, 'string');
  assert.equal(typeof registerBody.item.updatedAt, 'string');
  assert.equal(registerBody.item.lastHeartbeatAt, null);

  const updateResponse = await postAgentRegistration(server.port, {
    agentId: 'claude_code_local',
    adapterType: 'wrapper',
    repoRoot: ROOT_DIR,
    displayName: 'Claude Wrapper',
    capabilities: ['approval-request'],
  });

  assert.equal(updateResponse.status, 200);
  const updateBody = await updateResponse.json();
  assert.equal(updateBody.item.agentId, 'claude_code_local');
  assert.equal(updateBody.item.adapterType, 'wrapper');
  assert.equal(updateBody.item.displayName, 'Claude Wrapper');
  assert.deepEqual(updateBody.item.capabilities, ['approval-request']);
  assert.equal(updateBody.item.tokenId, 'local-token');
  assert.equal(updateBody.item.metadata.cli, 'claude-code');
  assert.equal(updateBody.item.registeredAt, registerBody.item.registeredAt);

  const heartbeatResponse = await postAgentHeartbeat(server.port, 'claude_code_local');
  assert.equal(heartbeatResponse.status, 200);
  const heartbeatBody = await heartbeatResponse.json();
  assert.equal(heartbeatBody.success, true);
  assert.equal(heartbeatBody.item.agentId, 'claude_code_local');
  assert.equal(heartbeatBody.item.status, 'connected');
  assert.equal(typeof heartbeatBody.item.lastHeartbeatAt, 'string');

  const listResponse = await fetch(`http://127.0.0.1:${server.port}/api/agents`);
  assert.equal(listResponse.status, 200);
  const listBody = await listResponse.json();
  assert.equal(listBody.count, 1);
  assert.equal(listBody.items[0].agentId, 'claude_code_local');
  assert.equal(listBody.items[0].status, 'connected');

  const detailResponse = await fetch(`http://127.0.0.1:${server.port}/api/agents/claude_code_local`);
  assert.equal(detailResponse.status, 200);
  const detailBody = await detailResponse.json();
  assert.equal(detailBody.item.agentId, 'claude_code_local');
  assert.equal(detailBody.item.lastHeartbeatAt, heartbeatBody.item.lastHeartbeatAt);
});

test('agent registry APIs enforce bearer token when MAESTRO_SERVER_TOKEN is set', async (t) => {
  const server = startServer({ token: 'secret-token' });
  t.after(async () => {
    await stopServer(server.proc);
  });

  await waitForHealth(server.port);

  const unauthorizedRegister = await postAgentRegistration(server.port, {
    agentId: 'blocked_agent',
    adapterType: 'wrapper',
    repoRoot: ROOT_DIR,
    capabilities: ['approval-request'],
  });
  assert.equal(unauthorizedRegister.status, 401);

  const unauthorizedList = await fetch(`http://127.0.0.1:${server.port}/api/agents`);
  assert.equal(unauthorizedList.status, 401);

  const authorizedRegister = await postAgentRegistration(server.port, {
    agentId: 'trusted_agent',
    adapterType: 'wrapper',
    repoRoot: ROOT_DIR,
    capabilities: ['approval-request'],
  }, {
    Authorization: 'Bearer secret-token',
  });
  assert.equal(authorizedRegister.status, 200);

  const authorizedHeartbeat = await postAgentHeartbeat(server.port, 'trusted_agent', {
    Authorization: 'Bearer secret-token',
  });
  assert.equal(authorizedHeartbeat.status, 200);
});

test('agent registry list includes latest request and decision delivery summary', async (t) => {
  const server = startServer();
  t.after(async () => {
    await stopServer(server.proc);
  });

  await waitForHealth(server.port);

  const registerResponse = await postAgentRegistration(server.port, {
    agentId: 'trust_agent',
    adapterType: 'wrapper',
    repoRoot: ROOT_DIR,
    displayName: 'Trust Agent',
    capabilities: ['approval-request', 'decision-polling'],
  });
  assert.equal(registerResponse.status, 200);

  const heartbeatResponse = await postAgentHeartbeat(server.port, 'trust_agent');
  assert.equal(heartbeatResponse.status, 200);

  const requestId = `apr_agent_trust_${Date.now()}`;
  const requestResponse = await postFirstClassApprovalRequest(server.port, {}, {
    requestId,
    agentId: 'trust_agent',
    branchName: 'feature/trust-surface',
    diffSummary: {
      title: 'Trust surface request',
      shortDescription: 'agent registry trust summary',
    },
  });
  assert.equal(requestResponse.status, 200);

  const ws = new WebSocket(`ws://127.0.0.1:${server.port}`);
  t.after(() => {
    ws.close();
  });
  await withTimeout(once(ws, 'open'), 3000, 'websocket open');

  const rejectEventPromise = waitForWebSocketEvent(
    ws,
    (event) => event.event === 'AGENT_RESTARTED' && event.requestId === requestId,
    3000,
    'agent trust reject',
  );
  ws.send(JSON.stringify({
    action: 'REJECT',
    requestId,
    agentId: 'trust_agent',
    feedback: 'trust summary check',
  }));
  await rejectEventPromise;

  const listResponse = await fetch(`http://127.0.0.1:${server.port}/api/agents`);
  assert.equal(listResponse.status, 200);
  const listBody = await listResponse.json();
  const agent = listBody.items.find((item) => item.agentId === 'trust_agent');
  assert.equal(agent.displayName, 'Trust Agent');
  assert.equal(agent.status, 'connected');
  assert.equal(agent.lastRequest.requestId, requestId);
  assert.equal(agent.lastRequest.status, 'pending_decision');
  assert.equal(agent.lastRequest.branchName, 'feature/trust-surface');
  assert.equal(agent.lastDecision.requestId, requestId);
  assert.equal(agent.lastDecision.decision, 'reject');
  assert.equal(agent.lastDecision.executorAction, 'none');
  assert.equal(agent.lastDecision.deliveryStatus, 'available');
});

test('POST /api/approval-requests stores pending request, broadcasts task ready, and appends history', async (t) => {
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

  const requestId = `apr_store_${Date.now()}`;
  const taskReadyPromise = waitForWebSocketEvent(
    ws,
    (event) => event.event === 'AGENT_TASK_READY' && event.requestId === requestId,
    3000,
    'approval request task ready',
  );
  const historyPromise = waitForWebSocketEvent(
    ws,
    (event) => event.event === 'HISTORY_APPEND' && event.item?.requestId === requestId,
    3000,
    'approval request history append',
  );

  const response = await postFirstClassApprovalRequest(server.port, {}, {
    requestId,
    agentId: 'qa_agent',
    branchName: 'feature/approval-store',
    projectId: 'proj_approval',
    laneIndex: 2,
    diffSummary: {
      title: 'Approval store',
      impact: 'High',
      shortDescription: 'store validation',
    },
  });

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.success, true);
  assert.equal(body.requestId, requestId);
  assert.equal(body.item.requestId, requestId);
  assert.equal(body.item.agentId, 'qa_agent');
  assert.equal(body.item.branchName, 'feature/approval-store');
  assert.equal(body.item.projectId, 'proj_approval');
  assert.equal(body.item.laneIndex, 2);
  assert.equal(body.item.status, 'pending_decision');
  assert.equal(body.item.source, 'agent');
  assert.equal(body.item.diffSummary.title, 'Approval store');
  assert.equal(body.item.diffSummary.shortDescription, 'store validation');
  assert.equal(typeof body.item.createdAt, 'string');
  assert.equal(typeof body.item.updatedAt, 'string');

  const taskReadyEvent = await taskReadyPromise;
  assert.equal(taskReadyEvent.event, 'AGENT_TASK_READY');
  assert.equal(taskReadyEvent.status, 'pending_decision');
  assert.equal(taskReadyEvent.diffSummary.title, 'Approval store');

  const historyEvent = await historyPromise;
  assert.equal(historyEvent.item.result, 'REQUESTED');
  assert.equal(historyEvent.item.reason, 'AGENT_TASK_READY');
  assert.equal(historyEvent.item.agentId, 'qa_agent');

  const historyResponse = await fetch(`http://127.0.0.1:${server.port}/api/history?limit=5&result=REQUESTED`);
  assert.equal(historyResponse.status, 200);
  const historyBody = await historyResponse.json();
  assert.equal(historyBody.items.some((item) => (
    item.requestId === requestId
    && item.result === 'REQUESTED'
    && item.reason === 'AGENT_TASK_READY'
    && item.branchName === 'feature/approval-store'
  )), true);
});

test('legacy POST /api/request uses approval request store without changing ingress contract', async (t) => {
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

  const requestId = `req_legacy_store_${Date.now()}`;
  const taskReadyPromise = waitForWebSocketEvent(
    ws,
    (event) => event.event === 'AGENT_TASK_READY' && event.requestId === requestId,
    3000,
    'legacy task ready',
  );

  const response = await postApprovalRequest(server.port, {}, {
    requestId,
    agentId: 'legacy_agent',
    branchName: 'feature/legacy-approval-store',
    projectId: 'proj_legacy',
    laneIndex: 3,
    diffSummary: {
      title: 'Legacy approval store',
      shortDescription: 'legacy bridge validation',
    },
  });

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.success, true);
  assert.equal(body.requestId, requestId);
  assert.equal(body.item.requestId, requestId);
  assert.equal(body.item.legacyRequestId, requestId);
  assert.equal(body.item.status, 'pending_decision');
  assert.equal(body.item.source, 'legacy');
  assert.equal(body.item.agentId, 'legacy_agent');
  assert.equal(body.item.projectId, 'proj_legacy');
  assert.equal(body.item.laneIndex, 3);
  assert.equal(body.item.branchName, 'feature/legacy-approval-store');

  const taskReadyEvent = await taskReadyPromise;
  assert.equal(taskReadyEvent.event, 'AGENT_TASK_READY');
  assert.equal(taskReadyEvent.requestId, requestId);
  assert.equal(taskReadyEvent.status, 'pending_decision');
  assert.equal(taskReadyEvent.agentId, 'legacy_agent');

  const historyResponse = await fetch(`http://127.0.0.1:${server.port}/api/history?limit=5&result=REQUESTED`);
  assert.equal(historyResponse.status, 200);
  const historyBody = await historyResponse.json();
  assert.equal(historyBody.items.some((item) => (
    item.requestId === requestId
    && item.agentId === 'legacy_agent'
    && item.projectId === 'proj_legacy'
    && item.laneIndex === 3
    && item.branchName === 'feature/legacy-approval-store'
  )), true);
});

test('approval decision polling returns pending for stored request and 404 for unknown request', async (t) => {
  const server = startServer();
  t.after(async () => {
    await stopServer(server.proc);
  });

  await waitForHealth(server.port);

  const requestId = `apr_pending_decision_${Date.now()}`;
  const createResponse = await postFirstClassApprovalRequest(server.port, {}, {
    requestId,
    agentId: 'qa_agent',
    branchName: 'feature/pending-decision',
    diffSummary: {
      title: 'Pending decision',
      shortDescription: 'polling should show no decision yet',
    },
  });
  assert.equal(createResponse.status, 200);

  const pendingResponse = await fetch(`http://127.0.0.1:${server.port}/api/approval-requests/${requestId}/decision`);
  assert.equal(pendingResponse.status, 200);
  const pendingBody = await pendingResponse.json();
  assert.equal(pendingBody.status, 'pending');
  assert.equal(pendingBody.requestId, requestId);
  assert.equal(pendingBody.item, null);

  const unknownResponse = await fetch(`http://127.0.0.1:${server.port}/api/approval-requests/missing_request/decision`);
  assert.equal(unknownResponse.status, 404);
});

test('manual approval decision can be polled and acknowledged idempotently', async (t) => {
  const server = startServer();
  t.after(async () => {
    await stopServer(server.proc);
  });

  await waitForHealth(server.port);

  const requestId = `apr_decision_approve_${Date.now()}`;
  const createResponse = await postFirstClassApprovalRequest(server.port, {}, {
    requestId,
    agentId: 'qa_agent',
    projectId: 'proj_decision',
    laneIndex: 2,
    diffSummary: {
      title: 'Approval decision',
      shortDescription: 'decision polling validation',
    },
  });
  assert.equal(createResponse.status, 200);

  const ws = new WebSocket(`ws://127.0.0.1:${server.port}`);
  t.after(() => {
    ws.close();
  });
  await withTimeout(once(ws, 'open'), 3000, 'websocket open');

  const mergeResultPromise = waitForWebSocketEvent(
    ws,
    (event) => event.event === 'MERGE_SUCCESS' && event.requestId === requestId,
    3000,
    'manual approval merge success',
  );
  ws.send(JSON.stringify({
    action: 'APPROVE',
    requestId,
    agentId: 'qa_agent',
    projectId: 'proj_decision',
    laneIndex: 2,
    title: 'Approval decision',
  }));
  await mergeResultPromise;

  const decisionResponse = await fetch(`http://127.0.0.1:${server.port}/api/approval-requests/${requestId}/decision`);
  assert.equal(decisionResponse.status, 200);
  const decisionBody = await decisionResponse.json();
  assert.equal(decisionBody.status, 'available');
  assert.equal(decisionBody.item.requestId, requestId);
  assert.equal(decisionBody.item.agentId, 'qa_agent');
  assert.equal(decisionBody.item.decision, 'approve');
  assert.equal(decisionBody.item.executorAction, 'merge');
  assert.equal(decisionBody.item.delivery.mode, 'pull');
  assert.equal(decisionBody.item.delivery.status, 'available');
  assert.equal(decisionBody.item.delivery.acknowledgedAt, null);
  assert.equal(typeof decisionBody.item.decisionId, 'string');
  assert.equal(typeof decisionBody.item.createdAt, 'string');

  const ackResponse = await fetch(`http://127.0.0.1:${server.port}/api/approval-decisions/${decisionBody.item.decisionId}/ack`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ agentId: 'qa_agent' }),
  });
  assert.equal(ackResponse.status, 200);
  const ackBody = await ackResponse.json();
  assert.equal(ackBody.success, true);
  assert.equal(ackBody.item.delivery.status, 'acknowledged');
  assert.equal(typeof ackBody.item.delivery.acknowledgedAt, 'string');
  const acknowledgedAt = ackBody.item.delivery.acknowledgedAt;

  const secondAckResponse = await fetch(`http://127.0.0.1:${server.port}/api/approval-decisions/${decisionBody.item.decisionId}/ack`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ agentId: 'qa_agent' }),
  });
  assert.equal(secondAckResponse.status, 200);
  const secondAckBody = await secondAckResponse.json();
  assert.equal(secondAckBody.item.delivery.status, 'acknowledged');
  assert.equal(secondAckBody.item.delivery.acknowledgedAt, acknowledgedAt);
});

test('manual reject creates a pull decision without executor action', async (t) => {
  const server = startServer();
  t.after(async () => {
    await stopServer(server.proc);
  });

  await waitForHealth(server.port);

  const requestId = `apr_decision_reject_${Date.now()}`;
  const createResponse = await postFirstClassApprovalRequest(server.port, {}, {
    requestId,
    agentId: 'qa_agent',
    diffSummary: {
      title: 'Reject decision',
      shortDescription: 'rejection polling validation',
    },
  });
  assert.equal(createResponse.status, 200);

  const ws = new WebSocket(`ws://127.0.0.1:${server.port}`);
  t.after(() => {
    ws.close();
  });
  await withTimeout(once(ws, 'open'), 3000, 'websocket open');

  const rejectResultPromise = waitForWebSocketEvent(
    ws,
    (event) => event.event === 'AGENT_RESTARTED' && event.requestId === requestId,
    3000,
    'manual reject restarted',
  );
  ws.send(JSON.stringify({
    action: 'REJECT',
    requestId,
    agentId: 'qa_agent',
    feedback: 'revise tests',
  }));
  await rejectResultPromise;

  const decisionResponse = await fetch(`http://127.0.0.1:${server.port}/api/approval-requests/${requestId}/decision`);
  assert.equal(decisionResponse.status, 200);
  const decisionBody = await decisionResponse.json();
  assert.equal(decisionBody.status, 'available');
  assert.equal(decisionBody.item.requestId, requestId);
  assert.equal(decisionBody.item.decision, 'reject');
  assert.equal(decisionBody.item.comment, 'revise tests');
  assert.equal(decisionBody.item.executorAction, 'none');
  assert.equal(decisionBody.item.delivery.status, 'available');
});

test('manual approve skips merge executor when executorAction is none', async (t) => {
  const server = startServer();
  t.after(async () => {
    await stopServer(server.proc);
  });

  await waitForHealth(server.port);

  const requestId = `apr_executor_none_${Date.now()}`;
  const createResponse = await postFirstClassApprovalRequest(server.port, {}, {
    requestId,
    agentId: 'qa_agent',
    branchName: 'feature/executor-none',
    diffSummary: {
      title: 'Executor none',
      shortDescription: 'approve without merge execution',
    },
  });
  assert.equal(createResponse.status, 200);

  const ws = new WebSocket(`ws://127.0.0.1:${server.port}`);
  t.after(() => {
    ws.close();
  });
  await withTimeout(once(ws, 'open'), 3000, 'websocket open');

  const skippedPromise = waitForWebSocketEvent(
    ws,
    (event) => event.event === 'MERGE_SKIPPED' && event.requestId === requestId,
    3000,
    'executor none skip',
  );
  ws.send(JSON.stringify({
    action: 'APPROVE',
    requestId,
    agentId: 'qa_agent',
    branchName: 'feature/executor-none',
    executorAction: 'none',
  }));

  const skippedEvent = await skippedPromise;
  assert.equal(skippedEvent.reason, 'EXECUTOR_ACTION_NONE');

  const decisionResponse = await fetch(`http://127.0.0.1:${server.port}/api/approval-requests/${requestId}/decision`);
  assert.equal(decisionResponse.status, 200);
  const decisionBody = await decisionResponse.json();
  assert.equal(decisionBody.item.decision, 'approve');
  assert.equal(decisionBody.item.executorAction, 'none');
  assert.equal(decisionBody.item.executorResult.status, 'skipped');
  assert.equal(decisionBody.item.executorResult.reason, 'EXECUTOR_ACTION_NONE');
});

test('manual approve records failed executor result while decision remains pollable', async (t) => {
  const server = startServer({
    extraEnv: {
      MAIN_REPO_PATH: ROOT_DIR,
    },
  });
  t.after(async () => {
    await stopServer(server.proc);
  });

  await waitForHealth(server.port);

  const requestId = `apr_executor_fail_${Date.now()}`;
  const missingBranch = `feature/missing-executor-branch-${Date.now()}`;
  const createResponse = await postFirstClassApprovalRequest(server.port, {}, {
    requestId,
    agentId: 'qa_agent',
    branchName: missingBranch,
    diffSummary: {
      title: 'Executor failed',
      shortDescription: 'merge failure should not remove decision',
    },
  });
  assert.equal(createResponse.status, 200);

  const ws = new WebSocket(`ws://127.0.0.1:${server.port}`);
  t.after(() => {
    ws.close();
  });
  await withTimeout(once(ws, 'open'), 3000, 'websocket open');

  const failedPromise = waitForWebSocketEvent(
    ws,
    (event) => event.event === 'MERGE_FAILED' && event.requestId === requestId,
    3000,
    'executor merge failed',
  );
  ws.send(JSON.stringify({
    action: 'APPROVE',
    requestId,
    agentId: 'qa_agent',
    branchName: missingBranch,
    executorAction: 'merge',
  }));
  await failedPromise;

  const decisionResponse = await fetch(`http://127.0.0.1:${server.port}/api/approval-requests/${requestId}/decision`);
  assert.equal(decisionResponse.status, 200);
  const decisionBody = await decisionResponse.json();
  assert.equal(decisionBody.status, 'available');
  assert.equal(decisionBody.item.decision, 'approve');
  assert.equal(decisionBody.item.executorAction, 'merge');
  assert.equal(decisionBody.item.executorResult.status, 'failed');
  assert.equal(decisionBody.item.executorResult.reason, 'MERGE_FAILED');
  assert.equal(decisionBody.item.executorResult.event, 'MERGE_FAILED');
  assert.equal(typeof decisionBody.item.executorResult.finishedAt, 'string');
});

test('GET /api/projects returns active runtime project and registered candidates', async (t) => {
  const fixture = createProjectRegistryFixture([]);
  t.after(() => {
    rmSync(fixture.tempDir, { recursive: true, force: true });
  });

  const alphaRepo = createTempGitRepo(fixture.tempDir, 'alpha');
  const betaRepo = createTempGitRepo(fixture.tempDir, 'beta');
  writeFileSync(fixture.registryPath, JSON.stringify([
    {
      id: 'alpha',
      name: 'alpha',
      path: alphaRepo,
      repoUrl: 'https://example.com/alpha.git',
      laneCount: 4,
    },
    {
      id: 'beta',
      name: 'beta',
      path: betaRepo,
      repoUrl: 'https://example.com/beta.git',
      laneCount: 6,
    },
  ], null, 2));

  const server = startServer({
    extraEnv: {
      MAIN_REPO_PATH: alphaRepo,
      MAESTRO_PROJECT_NAME: 'alpha',
      MAESTRO_PROJECT_REGISTRY_PATH: fixture.registryPath,
      MAESTRO_ENV_FILE_PATH: fixture.envPath,
    },
  });
  t.after(async () => {
    await stopServer(server.proc);
  });

  await waitForHealth(server.port);

  const response = await fetch(`http://127.0.0.1:${server.port}/api/projects`);
  assert.equal(response.status, 200);

  const body = await response.json();
  assert.equal(body.currentProject.name, 'alpha');
  assert.equal(body.currentProject.path, alphaRepo);
  assert.equal(body.currentProject.laneCount, 4);
  assert.equal(body.items.length, 2);
  assert.equal(body.items.some((item) => item.name === 'beta' && item.path === betaRepo && item.laneCount === 6), true);
});

test('POST /api/projects/select switches active repo, persists env, and broadcasts websocket event', async (t) => {
  const fixture = createProjectRegistryFixture([]);
  t.after(() => {
    rmSync(fixture.tempDir, { recursive: true, force: true });
  });

  const alphaRepo = createTempGitRepo(fixture.tempDir, 'alpha');
  const betaRepo = createTempGitRepo(fixture.tempDir, 'beta');
  writeFileSync(fixture.registryPath, JSON.stringify([
    {
      id: 'alpha',
      name: 'alpha',
      path: alphaRepo,
      repoUrl: 'https://example.com/alpha.git',
      laneCount: 4,
    },
    {
      id: 'beta',
      name: 'beta',
      path: betaRepo,
      repoUrl: 'https://example.com/beta.git',
      laneCount: 6,
    },
  ], null, 2));

  const server = startServer({
    extraEnv: {
      MAIN_REPO_PATH: alphaRepo,
      MAESTRO_PROJECT_NAME: 'alpha',
      MAESTRO_PROJECT_LANE_COUNT: '4',
      MAESTRO_PROJECT_REGISTRY_PATH: fixture.registryPath,
      MAESTRO_ENV_FILE_PATH: fixture.envPath,
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

  const switchEventPromise = waitForWebSocketEvent(
    ws,
    (event) => event.event === 'PROJECT_SWITCHED' && event.currentProject?.name === 'beta',
    3000,
    'project switched event',
  );

  const response = await fetch(`http://127.0.0.1:${server.port}/api/projects/select`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      projectId: 'beta',
    }),
  });

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.success, true);
  assert.equal(body.currentProject.name, 'beta');
  assert.equal(body.currentProject.path, betaRepo);
  assert.equal(body.currentProject.laneCount, 6);

  const switchEvent = await switchEventPromise;
  assert.equal(switchEvent.currentProject.path, betaRepo);

  const healthRes = await fetch(`http://127.0.0.1:${server.port}/health`);
  const healthBody = await healthRes.json();
  assert.equal(healthBody.project.name, 'beta');
  assert.equal(healthBody.project.path, betaRepo);
  assert.equal(healthBody.project.laneCount, 6);

  const persistedEnv = readFileSync(fixture.envPath, 'utf8');
  assert.match(persistedEnv, new RegExp(`MAIN_REPO_PATH=${betaRepo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
  assert.match(persistedEnv, /MAESTRO_PROJECT_NAME=beta/);
  assert.match(persistedEnv, /MAESTRO_PROJECT_LANE_COUNT=6/);
});

test('POST /api/projects/register saves a new repo and activates it immediately', async (t) => {
  const fixture = createProjectRegistryFixture([]);
  t.after(() => {
    rmSync(fixture.tempDir, { recursive: true, force: true });
  });

  const alphaRepo = createTempGitRepo(fixture.tempDir, 'alpha');
  const gammaRepo = createTempGitRepo(fixture.tempDir, 'gamma');
  writeFileSync(fixture.registryPath, JSON.stringify([
    {
      id: 'alpha',
      name: 'alpha',
      path: alphaRepo,
      repoUrl: 'https://example.com/alpha.git',
      laneCount: 4,
    },
  ], null, 2));

  const server = startServer({
    extraEnv: {
      MAIN_REPO_PATH: alphaRepo,
      MAESTRO_PROJECT_NAME: 'alpha',
      MAESTRO_PROJECT_LANE_COUNT: '4',
      MAESTRO_PROJECT_REGISTRY_PATH: fixture.registryPath,
      MAESTRO_ENV_FILE_PATH: fixture.envPath,
    },
  });
  t.after(async () => {
    await stopServer(server.proc);
  });

  await waitForHealth(server.port);

  const response = await fetch(`http://127.0.0.1:${server.port}/api/projects/register`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      projectPath: gammaRepo,
      projectName: 'gamma',
      repoUrl: 'https://example.com/gamma.git',
      laneCount: 6,
      activate: true,
    }),
  });

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.success, true);
  assert.equal(body.didActivate, true);
  assert.equal(body.currentProject.name, 'gamma');
  assert.equal(body.currentProject.path, gammaRepo);
  assert.equal(body.currentProject.laneCount, 6);

  const registryProjects = JSON.parse(readFileSync(fixture.registryPath, 'utf8'));
  assert.equal(registryProjects.some((project) => project.name === 'gamma' && project.path === gammaRepo && project.laneCount === 6), true);

  const healthRes = await fetch(`http://127.0.0.1:${server.port}/health`);
  const healthBody = await healthRes.json();
  assert.equal(healthBody.project.name, 'gamma');
  assert.equal(healthBody.project.path, gammaRepo);
  assert.equal(healthBody.project.laneCount, 6);
});

test('POST /api/projects/register clamps lane count above 8 to the supported max', async (t) => {
  const fixture = createProjectRegistryFixture([]);
  t.after(() => {
    rmSync(fixture.tempDir, { recursive: true, force: true });
  });

  const alphaRepo = createTempGitRepo(fixture.tempDir, 'alpha');
  const wideRepo = createTempGitRepo(fixture.tempDir, 'wide');
  writeFileSync(fixture.registryPath, JSON.stringify([
    {
      id: 'alpha',
      name: 'alpha',
      path: alphaRepo,
      repoUrl: 'https://example.com/alpha.git',
      laneCount: 4,
    },
  ], null, 2));

  const server = startServer({
    extraEnv: {
      MAIN_REPO_PATH: alphaRepo,
      MAESTRO_PROJECT_NAME: 'alpha',
      MAESTRO_PROJECT_LANE_COUNT: '4',
      MAESTRO_PROJECT_REGISTRY_PATH: fixture.registryPath,
      MAESTRO_ENV_FILE_PATH: fixture.envPath,
    },
  });
  t.after(async () => {
    await stopServer(server.proc);
  });

  await waitForHealth(server.port);

  const response = await fetch(`http://127.0.0.1:${server.port}/api/projects/register`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      projectPath: wideRepo,
      projectName: 'wide',
      repoUrl: 'https://example.com/wide.git',
      laneCount: 99,
      activate: true,
    }),
  });

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.currentProject.laneCount, 8);
  assert.equal(body.savedProject.laneCount, 8);

  const persistedEnv = readFileSync(fixture.envPath, 'utf8');
  assert.match(persistedEnv, /MAESTRO_PROJECT_LANE_COUNT=8/);

  const healthRes = await fetch(`http://127.0.0.1:${server.port}/health`);
  const healthBody = await healthRes.json();
  assert.equal(healthBody.project.laneCount, 8);
});

test('POST /api/projects/update changes an inactive project lane count without switching runtime project', async (t) => {
  const fixture = createProjectRegistryFixture([]);
  t.after(() => {
    rmSync(fixture.tempDir, { recursive: true, force: true });
  });

  const alphaRepo = createTempGitRepo(fixture.tempDir, 'alpha');
  const betaRepo = createTempGitRepo(fixture.tempDir, 'beta');
  writeFileSync(fixture.registryPath, JSON.stringify([
    {
      id: 'alpha',
      name: 'alpha',
      path: alphaRepo,
      repoUrl: 'https://example.com/alpha.git',
      laneCount: 4,
    },
    {
      id: 'beta',
      name: 'beta',
      path: betaRepo,
      repoUrl: 'https://example.com/beta.git',
      laneCount: 6,
    },
  ], null, 2));

  const server = startServer({
    extraEnv: {
      MAIN_REPO_PATH: alphaRepo,
      MAESTRO_PROJECT_NAME: 'alpha',
      MAESTRO_PROJECT_LANE_COUNT: '4',
      MAESTRO_PROJECT_REGISTRY_PATH: fixture.registryPath,
      MAESTRO_ENV_FILE_PATH: fixture.envPath,
    },
  });
  t.after(async () => {
    await stopServer(server.proc);
  });

  await waitForHealth(server.port);

  const response = await fetch(`http://127.0.0.1:${server.port}/api/projects/update`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      projectId: 'beta',
      laneCount: 8,
    }),
  });

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.success, true);
  assert.equal(body.didAffectActiveProject, false);
  assert.equal(body.updatedProject.id, 'beta');
  assert.equal(body.updatedProject.laneCount, 8);
  assert.equal(body.currentProject.name, 'alpha');
  assert.equal(body.currentProject.laneCount, 4);

  const registryProjects = JSON.parse(readFileSync(fixture.registryPath, 'utf8'));
  assert.equal(registryProjects.some((project) => project.id === 'beta' && project.laneCount === 8), true);
});

test('POST /api/projects/update updates active project lane count and persists runtime env', async (t) => {
  const fixture = createProjectRegistryFixture([]);
  t.after(() => {
    rmSync(fixture.tempDir, { recursive: true, force: true });
  });

  const alphaRepo = createTempGitRepo(fixture.tempDir, 'alpha');
  writeFileSync(fixture.registryPath, JSON.stringify([
    {
      id: 'alpha',
      name: 'alpha',
      path: alphaRepo,
      repoUrl: 'https://example.com/alpha.git',
      laneCount: 4,
    },
  ], null, 2));

  const server = startServer({
    extraEnv: {
      MAIN_REPO_PATH: alphaRepo,
      MAESTRO_PROJECT_NAME: 'alpha',
      MAESTRO_PROJECT_LANE_COUNT: '4',
      MAESTRO_PROJECT_REGISTRY_PATH: fixture.registryPath,
      MAESTRO_ENV_FILE_PATH: fixture.envPath,
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

  const updateEventPromise = waitForWebSocketEvent(
    ws,
    (event) => event.event === 'PROJECT_UPDATED' && event.updatedProject?.id === 'alpha',
    3000,
    'project updated event',
  );

  const response = await fetch(`http://127.0.0.1:${server.port}/api/projects/update`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      projectId: 'alpha',
      laneCount: 6,
    }),
  });

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.success, true);
  assert.equal(body.didAffectActiveProject, true);
  assert.equal(body.currentProject.laneCount, 6);
  assert.equal(body.updatedProject.laneCount, 6);

  const updateEvent = await updateEventPromise;
  assert.equal(updateEvent.currentProject.laneCount, 6);
  assert.equal(updateEvent.didAffectActiveProject, true);

  const persistedEnv = readFileSync(fixture.envPath, 'utf8');
  assert.match(persistedEnv, /MAESTRO_PROJECT_LANE_COUNT=6/);

  const healthRes = await fetch(`http://127.0.0.1:${server.port}/health`);
  const healthBody = await healthRes.json();
  assert.equal(healthBody.project.laneCount, 6);
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

test('server accepts lane indices up to the active project lane count', async (t) => {
  const server = startServer({
    extraEnv: {
      MAESTRO_PROJECT_LANE_COUNT: '6',
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

  const requestId = `req_ws_lane_6_${Date.now()}`;
  const messagePromise = waitForWebSocketEvent(
    ws,
    (event) => event.event === 'AGENT_TASK_READY' && event.requestId === requestId,
    3000,
    'agent task ready dynamic lane event',
  );
  const response = await fetch(`http://127.0.0.1:${server.port}/api/request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requestId,
      agentId: 'qa_agent',
      branchName: 'feature/ws-lane-6',
      laneIndex: 6,
      diffSummary: {
        title: 'WebSocket broadcast lane six',
        shortDescription: 'dynamic lane propagation',
      },
    }),
  });
  assert.equal(response.status, 200);

  const event = await messagePromise;
  assert.equal(event.laneIndex, 6);
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

test('GET /api/auto-approve/status enforces bearer token when MAESTRO_SERVER_TOKEN is set', async (t) => {
  const server = startServer({
    token: 'secret-token',
    extraEnv: {
      MAESTRO_AUTO_APPROVE_ENABLED: 'true',
      MAESTRO_AUTO_APPROVE_TRUSTED_AGENTS: 'qa_agent',
    },
  });
  t.after(async () => {
    await stopServer(server.proc);
  });

  await waitForHealth(server.port);

  const unauthorized = await fetch(`http://127.0.0.1:${server.port}/api/auto-approve/status`);
  assert.equal(unauthorized.status, 401);

  const authorized = await fetch(`http://127.0.0.1:${server.port}/api/auto-approve/status`, {
    headers: {
      Authorization: 'Bearer secret-token',
    },
  });
  assert.equal(authorized.status, 200);

  const body = await authorized.json();
  assert.equal(body.config?.enabled, true);
  assert.equal(typeof body.runtime?.inFlightCount, 'number');
  assert.ok(Array.isArray(body.recentEvents));
});

test('auto-approve status/events expose policy and execution decisions', async (t) => {
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

  const requestId = `req_visibility_${Date.now()}`;
  const response = await postApprovalRequest(server.port, {}, {
    requestId,
    branchName: 'feature/visibility',
    autoApprove: true,
  });
  assert.equal(response.status, 200);

  const items = await waitForAutoApproveEvents(
    server.port,
    (events) => (
      events.some((event) => event.requestId === requestId && event.decision === 'ELIGIBLE' && event.phase === 'policy')
      && events.some((event) => event.requestId === requestId && event.decision === 'SKIPPED' && event.reason === 'DRY_RUN')
    ),
    5000,
  );

  const statusRes = await fetch(`http://127.0.0.1:${server.port}/api/auto-approve/status?eventsLimit=20`);
  assert.equal(statusRes.status, 200);
  const statusBody = await statusRes.json();

  assert.equal(statusBody.config?.enabled, true);
  assert.equal(statusBody.config?.requireExplicit, true);
  assert.equal(statusBody.config?.dryRun, true);
  assert.equal(statusBody.config?.trustedAgentsCount, 1);
  assert.ok(statusBody.runtime?.autoApproveEventCount >= 2);
  assert.ok(statusBody.recentEvents.some((event) => event.requestId === requestId));

  const requestFilteredRes = await fetch(`http://127.0.0.1:${server.port}/api/auto-approve/events?requestId=${requestId}&limit=20`);
  assert.equal(requestFilteredRes.status, 200);
  const requestFilteredBody = await requestFilteredRes.json();
  assert.ok(requestFilteredBody.items.length >= 2);
  assert.ok(requestFilteredBody.items.every((event) => event.requestId === requestId));
  assert.ok(requestFilteredBody.items.some((event) => event.decision === 'ELIGIBLE'));
  assert.ok(requestFilteredBody.items.some((event) => event.reason === 'DRY_RUN'));

  const decisionFilteredRes = await fetch(`http://127.0.0.1:${server.port}/api/auto-approve/events?decision=BLOCKED&limit=20`);
  assert.equal(decisionFilteredRes.status, 200);
  const decisionFilteredBody = await decisionFilteredRes.json();
  assert.ok(decisionFilteredBody.items.every((event) => event.decision === 'BLOCKED'));

  assert.ok(items.length >= 2);
});

test('GET /api/auto-approve/events supports limit and reason filter', async (t) => {
  const server = startServer();
  t.after(async () => {
    await stopServer(server.proc);
  });

  await waitForHealth(server.port);

  const firstRequest = await postApprovalRequest(server.port, {}, {
    requestId: `req_auto_events_a_${Date.now()}`,
  });
  assert.equal(firstRequest.status, 200);
  const secondRequest = await postApprovalRequest(server.port, {}, {
    requestId: `req_auto_events_b_${Date.now()}`,
  });
  assert.equal(secondRequest.status, 200);

  const events = await waitForAutoApproveEvents(
    server.port,
    (items) => items.filter((event) => event.reason === 'AUTO_APPROVE_DISABLED').length >= 2,
    5000,
  );
  assert.ok(events.length >= 2);

  const limitedRes = await fetch(`http://127.0.0.1:${server.port}/api/auto-approve/events?limit=1`);
  assert.equal(limitedRes.status, 200);
  const limitedBody = await limitedRes.json();
  assert.equal(limitedBody.items.length, 1);

  const reasonRes = await fetch(`http://127.0.0.1:${server.port}/api/auto-approve/events?reason=AUTO_APPROVE_DISABLED&limit=20`);
  assert.equal(reasonRes.status, 200);
  const reasonBody = await reasonRes.json();
  assert.ok(reasonBody.items.length >= 2);
  assert.ok(reasonBody.items.every((event) => event.reason === 'AUTO_APPROVE_DISABLED'));
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

test('history survives server restart when store path is persisted', async (t) => {
  const tempDir = mkdtempSync(resolve(os.tmpdir(), 'maestro-history-store-'));
  const historyStorePath = resolve(tempDir, 'history.json');
  t.after(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  const requestId = `req_history_persist_${Date.now()}`;
  const firstServer = startServer({
    extraEnv: {
      MAESTRO_HISTORY_STORE_PATH: historyStorePath,
    },
  });

  await waitForHealth(firstServer.port);

  const response = await postApprovalRequest(firstServer.port, {}, {
    requestId,
    projectId: 'proj_b2c',
    laneIndex: 1,
    diffSummary: {
      title: 'Persisted History Item',
      shortDescription: 'history persistence regression',
    },
  });
  assert.equal(response.status, 200);

  await stopServer(firstServer.proc);

  const secondServer = startServer({
    extraEnv: {
      MAESTRO_HISTORY_STORE_PATH: historyStorePath,
    },
  });
  t.after(async () => {
    await stopServer(secondServer.proc);
  });

  await waitForHealth(secondServer.port);

  const historyRes = await fetch(`http://127.0.0.1:${secondServer.port}/api/history?limit=20`);
  assert.equal(historyRes.status, 200);
  const historyBody = await historyRes.json();
  assert.ok(historyBody.items.some((item) => item.requestId === requestId && item.result === 'REQUESTED'));

  const persistedFile = JSON.parse(readFileSync(historyStorePath, 'utf8'));
  assert.equal(persistedFile.version, 1);
  assert.ok(Array.isArray(persistedFile.items));
  assert.ok(persistedFile.items.some((item) => item.requestId === requestId && item.title === 'Persisted History Item'));
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
