import React from 'react';
import ReactDOM from 'react-dom/client';
import App from '../src/App.jsx';
import { installHttpLocalRepoBridge } from '../src/lib/browserLocalRepoBridge.js';
import { readLastLaunch } from './lib/session.js';

async function bootstrap() {
  installHttpLocalRepoBridge(globalThis);
  const launch = await resolveLaunchSession(globalThis.location, chrome.storage.local);
  const appBootstrap = buildExtensionAppBootstrap(launch, globalThis.location);
  const rootElement = document.getElementById('root');

  if (!rootElement) {
    throw new Error('Maestro Player extension root element is missing');
  }

  ReactDOM.createRoot(rootElement).render(
    React.createElement(
      React.StrictMode,
      null,
      React.createElement(App, { bootstrap: appBootstrap }),
    ),
  );
}

async function resolveLaunchSession(locationObject, storageArea) {
  const launchId = new URL(locationObject.href).searchParams.get('launch');
  const storedLaunch = await readLastLaunch(storageArea);

  if (!storedLaunch) {
    return null;
  }

  if (!launchId || storedLaunch.launchId === launchId) {
    return {
      ...storedLaunch,
      launchMatched: true,
    };
  }

  return {
    ...storedLaunch,
    launchMatched: false,
  };
}

function buildExtensionAppBootstrap(launch, locationObject) {
  if (!launch?.canonicalUrl) {
    return {
      initialSourceMode: 'public',
      autoLoadPublicReplay: false,
    };
  }

  const hasRequestedLaunchId = new URL(locationObject.href).searchParams.has('launch');
  const shouldAutoLoad = !hasRequestedLaunchId || launch.launchMatched !== false;

  return {
    initialSourceMode: 'public',
    initialDrafts: {
      public: {
        url: launch.canonicalUrl,
        branch: launch.branchName || 'main',
      },
    },
    autoLoadPublicReplay: shouldAutoLoad,
  };
}

if (typeof document !== 'undefined' && typeof chrome !== 'undefined') {
  void bootstrap();
}
