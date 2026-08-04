import { OPEN_PLAYER_MESSAGE, OPEN_REPO_MESSAGE } from './lib/constants.js';
import { buildLaunchPayload, writeLastLaunch } from './lib/session.js';

function registerBackgroundHandlers() {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message?.type) {
      return false;
    }

    handleMessage(message)
      .then((payload) => sendResponse({ ok: true, ...payload }))
      .catch((error) => sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      }));

    return true;
  });
}

async function handleMessage(message) {
  if (message.type === OPEN_REPO_MESSAGE) {
    const launch = buildLaunchPayload(message.payload || {});
    await writeLastLaunch(chrome.storage.local, launch);
    await openPlayerTab(`player.html?launch=${encodeURIComponent(launch.launchId)}`);
    return { launch };
  }

  if (message.type === OPEN_PLAYER_MESSAGE) {
    await openPlayerTab('player.html');
    return {};
  }

  throw new Error(`unsupported Maestro Player extension message: ${message.type}`);
}

async function openPlayerTab(relativePath) {
  const targetUrl = chrome.runtime.getURL(relativePath);
  return chrome.tabs.create({ url: targetUrl });
}

if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
  registerBackgroundHandlers();
}
