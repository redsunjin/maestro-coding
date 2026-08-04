import { LOCAL_REPO_BRIDGE_GLOBAL_KEYS } from './localRepoBridge.js';

export const LOCAL_REPLAY_BRIDGE_ROUTE = '/__maestro_player/local-replay';
export const LOCAL_REPLAY_BRIDGE_HEALTH_ROUTE = `${LOCAL_REPLAY_BRIDGE_ROUTE}/health`;

export function createHttpLocalRepoBridge(options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') {
    throw new Error('http local repo bridge requires fetch');
  }

  const endpoint = options.endpoint || LOCAL_REPLAY_BRIDGE_ROUTE;
  const healthEndpoint = options.healthEndpoint || LOCAL_REPLAY_BRIDGE_HEALTH_ROUTE;

  return {
    name: 'http-local-replay-bridge',
    async checkHealth() {
      const response = await fetchImpl(healthEndpoint);
      return Boolean(response?.ok);
    },
    async loadLocalRepoReplayEvents(request) {
      const response = await fetchImpl(endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify(request || {}),
      });

      if (!response.ok) {
        throw new Error(`http local repo bridge failed: ${response.status}`);
      }

      return response.json();
    },
  };
}

export function installHttpLocalRepoBridge(globalObject = globalThis, options = {}) {
  if (!shouldInstallHttpLocalRepoBridge(globalObject.location, options)) {
    return null;
  }

  const existingBridge = LOCAL_REPO_BRIDGE_GLOBAL_KEYS
    .map((key) => globalObject[key])
    .find(Boolean);

  if (existingBridge) {
    return existingBridge;
  }

  const bridge = createHttpLocalRepoBridge(options);
  globalObject[LOCAL_REPO_BRIDGE_GLOBAL_KEYS[0]] = bridge;
  return bridge;
}

export function shouldInstallHttpLocalRepoBridge(location, options = {}) {
  if (options.force === true) {
    return true;
  }

  const hostname = String(location?.hostname || '').trim().toLowerCase();
  return hostname === 'localhost' || hostname === '127.0.0.1';
}
