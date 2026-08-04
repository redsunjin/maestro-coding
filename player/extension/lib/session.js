import { PLAYER_SESSION_KEY } from './constants.js';

export async function readLastLaunch(storageArea) {
  const stored = await storageArea.get(PLAYER_SESSION_KEY);
  return stored?.[PLAYER_SESSION_KEY] || null;
}

export async function writeLastLaunch(storageArea, launch) {
  await storageArea.set({ [PLAYER_SESSION_KEY]: launch });
  return launch;
}

export async function clearLastLaunch(storageArea) {
  await storageArea.remove(PLAYER_SESSION_KEY);
}

export function buildLaunchPayload(input) {
  if (!input?.canonicalUrl || !input?.repoSlug || !input?.provider) {
    throw new Error('launch payload requires canonicalUrl, repoSlug, and provider');
  }

  return {
    launchId: input.launchId || buildLaunchId(),
    canonicalUrl: input.canonicalUrl,
    provider: input.provider,
    repoSlug: input.repoSlug,
    branchName: input.branchName || 'main',
    source: input.source || 'popup-manual-url',
    detectedTabUrl: input.detectedTabUrl || null,
    tabTitle: input.tabTitle || '',
    openedAt: input.openedAt || new Date().toISOString(),
  };
}

function buildLaunchId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  return `launch-${Date.now()}`;
}
