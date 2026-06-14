import { getExtensionCopy } from './lib/copy.js';
import { clearLastLaunch, readLastLaunch } from './lib/session.js';

const copy = getExtensionCopy(globalThis.navigator?.language);

async function bootstrap() {
  bindStaticText();
  bindEvents();
  await renderLastLaunch();
}

function bindStaticText() {
  elements.playerEyebrow.textContent = copy.player.eyebrow;
  elements.playerTitle.textContent = copy.player.title;
  elements.playerSubtitle.textContent = copy.player.subtitle;
  elements.selectedRepoTitle.textContent = copy.player.selectedRepoTitle;
  elements.selectedRepoCopy.textContent = copy.player.selectedRepoCopy;
  elements.repoLabel.textContent = copy.player.repoLabel;
  elements.branchLabel.textContent = copy.player.branchLabel;
  elements.sourceLabel.textContent = copy.player.sourceLabel;
  elements.urlTitle.textContent = copy.player.urlTitle;
  elements.openRepoButton.textContent = copy.player.openRepoButton;
  elements.refreshButton.textContent = copy.player.refreshButton;
  elements.clearButton.textContent = copy.player.clearButton;
  elements.scaffoldTitle.textContent = copy.player.scaffoldTitle;
  elements.nextTitle.textContent = copy.player.nextTitle;
  elements.sessionTitle.textContent = copy.player.sessionTitle;

  renderList(elements.scaffoldList, copy.player.scaffoldItems);
  renderList(elements.nextList, copy.player.nextItems);
}

function bindEvents() {
  elements.openRepoButton.addEventListener('click', async () => {
    const launch = await readLastLaunch(chrome.storage.local);
    if (!launch?.canonicalUrl) {
      setStatus(copy.player.missingRepository, 'error');
      return;
    }

    await chrome.tabs.create({ url: launch.canonicalUrl });
  });

  elements.refreshButton.addEventListener('click', async () => {
    await renderLastLaunch();
    setStatus(copy.player.refreshed);
  });

  elements.clearButton.addEventListener('click', async () => {
    await clearLastLaunch(chrome.storage.local);
    await renderLastLaunch();
    setStatus(copy.player.cleared);
  });
}

async function renderLastLaunch() {
  const launch = await readLastLaunch(chrome.storage.local);

  if (!launch) {
    elements.repoProviderPill.textContent = copy.player.pendingLabel;
    elements.repoSlug.textContent = copy.player.emptyValue;
    elements.repoBranch.textContent = copy.player.emptyValue;
    elements.repoSource.textContent = copy.player.emptyValue;
    elements.repoUrlDisplay.textContent = copy.player.emptyValue;
    elements.sessionJson.textContent = '{}';
    setStatus(copy.player.awaitingLaunch);
    return;
  }

  elements.repoProviderPill.textContent = launch.provider || copy.player.pendingLabel;
  elements.repoSlug.textContent = launch.repoSlug || copy.player.emptyValue;
  elements.repoBranch.textContent = launch.branchName || 'main';
  elements.repoSource.textContent = launch.source || copy.player.emptyValue;
  elements.repoUrlDisplay.textContent = launch.canonicalUrl || copy.player.emptyValue;
  elements.sessionJson.textContent = JSON.stringify(launch, null, 2);
  setStatus(copy.player.loaded(launch.repoSlug || launch.canonicalUrl || copy.player.pendingLabel));
}

function renderList(target, items) {
  target.replaceChildren(...items.map((item) => {
    const entry = document.createElement('li');
    entry.textContent = item;
    return entry;
  }));
}

function setStatus(message, tone = 'neutral') {
  elements.playerStatus.textContent = message;
  elements.playerStatus.dataset.tone = tone;
}

const elements = {
  playerEyebrow: document.querySelector('#player-eyebrow'),
  playerTitle: document.querySelector('#player-title'),
  playerSubtitle: document.querySelector('#player-subtitle'),
  selectedRepoTitle: document.querySelector('#selected-repo-title'),
  selectedRepoCopy: document.querySelector('#selected-repo-copy'),
  repoProviderPill: document.querySelector('#repo-provider-pill'),
  repoLabel: document.querySelector('#repo-label'),
  branchLabel: document.querySelector('#branch-label'),
  sourceLabel: document.querySelector('#source-label'),
  urlTitle: document.querySelector('#url-title'),
  repoSlug: document.querySelector('#repo-slug'),
  repoBranch: document.querySelector('#repo-branch'),
  repoSource: document.querySelector('#repo-source'),
  repoUrlDisplay: document.querySelector('#repo-url-display'),
  openRepoButton: document.querySelector('#open-repo-button'),
  refreshButton: document.querySelector('#refresh-button'),
  clearButton: document.querySelector('#clear-button'),
  playerStatus: document.querySelector('#player-status'),
  scaffoldTitle: document.querySelector('#scaffold-title'),
  scaffoldList: document.querySelector('#scaffold-list'),
  nextTitle: document.querySelector('#next-title'),
  nextList: document.querySelector('#next-list'),
  sessionTitle: document.querySelector('#session-title'),
  sessionJson: document.querySelector('#session-json'),
};

if (typeof document !== 'undefined' && typeof chrome !== 'undefined') {
  void bootstrap();
}
