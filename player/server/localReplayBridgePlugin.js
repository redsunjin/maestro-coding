import { loadGitReplayEvents } from '../src/lib/gitReplayAdapter.js';

export const LOCAL_REPLAY_BRIDGE_ROUTE = '/__maestro_player/local-replay';
export const LOCAL_REPLAY_BRIDGE_HEALTH_ROUTE = `${LOCAL_REPLAY_BRIDGE_ROUTE}/health`;
export const LOCAL_REPLAY_BRIDGE_NAME = 'vite-local-replay-bridge';

export function createLocalReplayBridgePlugin() {
  return {
    name: 'maestro-player-local-replay-bridge',
    configureServer(server) {
      server.middlewares.use(createLocalReplayBridgeMiddleware());
    },
    configurePreviewServer(server) {
      server.middlewares.use(createLocalReplayBridgeMiddleware());
    },
  };
}

export function createLocalReplayBridgeMiddleware(options = {}) {
  const loader = options.loader || loadGitReplayEvents;

  return async function localReplayBridgeMiddleware(request, response, next) {
    try {
      if (request.method === 'GET' && request.url === LOCAL_REPLAY_BRIDGE_HEALTH_ROUTE) {
        writeJson(response, 200, {
          available: true,
          name: LOCAL_REPLAY_BRIDGE_NAME,
        });
        return;
      }

      if (request.method === 'POST' && request.url === LOCAL_REPLAY_BRIDGE_ROUTE) {
        const requestBody = await readJsonBody(request);
        const payload = loadLocalReplayBridgePayload(requestBody, loader);
        writeJson(response, 200, payload);
        return;
      }

      next();
    } catch (error) {
      writeJson(response, 500, {
        error: error instanceof Error ? error.message : 'local replay bridge failed',
      });
    }
  };
}

export function loadLocalReplayBridgePayload(input = {}, loader = loadGitReplayEvents) {
  const request = normalizeLocalReplayRequest(input);
  const events = loader({
    repoPath: request.repoPath,
    branchName: request.branchName,
    ref: request.ref,
    maxCommits: request.maxCommits,
    since: request.since,
    until: request.until,
    repoId: request.repoId,
  });

  return {
    source: {
      repoPath: request.repoPath,
      branchName: request.branchName || request.ref || 'HEAD',
      repoId: request.repoId,
      sourceLabel: request.sourceLabel || request.repoPath,
      name: LOCAL_REPLAY_BRIDGE_NAME,
      version: '0.1.0',
    },
    events,
  };
}

function normalizeLocalReplayRequest(input) {
  const repoPath = getText(input.repoPath);
  if (!repoPath) {
    throw new Error('local replay bridge requires repoPath');
  }

  const branchName = getText(input.branchName);
  const ref = getText(input.ref) || branchName || 'HEAD';
  const sourceLabel = getText(input.sourceLabel) || repoPath;
  const repoId = getText(input.repoId);

  return {
    repoPath,
    branchName,
    ref,
    repoId,
    sourceLabel,
    maxCommits: toPositiveInteger(input.maxCommits),
    since: getText(input.since),
    until: getText(input.until),
  };
}

async function readJsonBody(request) {
  const chunks = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  }

  const rawBody = Buffer.concat(chunks).toString('utf8').trim();
  if (!rawBody) {
    return {};
  }

  return JSON.parse(rawBody);
}

function writeJson(response, statusCode, payload) {
  response.statusCode = statusCode;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.end(JSON.stringify(payload));
}

function getText(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function toPositiveInteger(value) {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : undefined;
}
