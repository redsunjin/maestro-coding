import { afterEach, describe, expect, test, vi } from 'vitest';

import {
  createHttpLocalRepoBridge,
  installHttpLocalRepoBridge,
  shouldInstallHttpLocalRepoBridge,
} from './browserLocalRepoBridge.js';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('browserLocalRepoBridge', () => {
  test('creates an http bridge that checks health and posts replay requests', async () => {
    const fetchMock = vi.fn(async (url, init) => {
      if (String(url).endsWith('/health')) {
        return { ok: true };
      }

      return {
        ok: true,
        json: async () => ({ events: [{ eventId: 'bridge-event-1' }] }),
      };
    });

    const bridge = createHttpLocalRepoBridge({
      fetchImpl: fetchMock,
    });

    await expect(bridge.checkHealth()).resolves.toBe(true);
    await expect(bridge.loadLocalRepoReplayEvents({ repoPath: '/tmp/repo' })).resolves.toEqual({
      events: [{ eventId: 'bridge-event-1' }],
    });

    expect(fetchMock).toHaveBeenCalledWith('/__maestro_player/local-replay/health');
    expect(fetchMock).toHaveBeenCalledWith('/__maestro_player/local-replay', expect.objectContaining({
      method: 'POST',
    }));
  });

  test('installs the http bridge only for local hosts unless forced', () => {
    const fakeGlobal = {
      fetch: vi.fn(),
      location: {
        hostname: 'localhost',
      },
    };

    const bridge = installHttpLocalRepoBridge(fakeGlobal);
    expect(bridge).toBeTruthy();
    expect(fakeGlobal.__MAESTRO_PLAYER_LOCAL_REPO_BRIDGE__).toBe(bridge);
    expect(shouldInstallHttpLocalRepoBridge({ hostname: 'example.com' })).toBe(false);
    expect(shouldInstallHttpLocalRepoBridge({ hostname: 'example.com' }, { force: true })).toBe(true);
  });
});
