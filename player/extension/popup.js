import { OPEN_PLAYER_MESSAGE, OPEN_REPO_MESSAGE } from './lib/constants.js';
import { getExtensionCopy } from './lib/copy.js';
import { maybeParsePublicRepositoryUrl } from './lib/repoUrl.js';
import { readLastLaunch } from './lib/session.js';

const copy = getExtensionCopy(globalThis.navigator?.language);
const state = {
  activeTab: null,
  detectedRepository: null,
};

async function bootstrap() {
  bindStaticText();
  bindEvents();

  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const lastLaunch = await readLastLaunch(chrome.storage.local);
  const detectedRepository = activeTab?.url ? maybeParsePublicRepositoryUrl(activeTab.url) : null;
  const initialUrl = detectedRepository?.canonicalUrl || lastLaunch?.canonicalUrl || '';

  state.activeTab = activeTab || null;
  state.detectedRepository = detectedRepository;
  elements.repoUrl.value = initialUrl;

  renderDetectedContext(lastLaunch);
  setStatus(detectedRepository ? copy.popup.ready : copy.popup.idle);
}

function bindStaticText() {
  elements.popupEyebrow.textContent = copy.popup.eyebrow;
  elements.popupTitle.textContent = copy.popup.title;
  elements.popupSubtitle.textContent = copy.popup.subtitle;
  elements.urlLabel.textContent = copy.popup.urlLabel;
  elements.playButton.textContent = copy.popup.playButton;
  elements.openPlayerButton.textContent = copy.popup.openPlayerButton;
}

function bindEvents() {
  elements.repoForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    const parsed = maybeParsePublicRepositoryUrl(elements.repoUrl.value.trim());
    if (!parsed) {
      setStatus(copy.popup.invalidUrl, 'error');
      return;
    }

    setBusy(true);
    setStatus(copy.popup.launching);

    try {
      const response = await chrome.runtime.sendMessage({
        type: OPEN_REPO_MESSAGE,
        payload: {
          canonicalUrl: parsed.canonicalUrl,
          provider: parsed.provider,
          repoSlug: parsed.repoSlug,
          branchName: parsed.branchName,
          detectedTabUrl: state.activeTab?.url || null,
          source: state.detectedRepository ? 'popup-current-tab' : 'popup-manual-url',
          tabTitle: state.activeTab?.title || '',
        },
      });

      if (!response?.ok) {
        throw new Error(response?.error || copy.popup.launchFailed);
      }

      globalThis.close();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : copy.popup.launchFailed, 'error');
      setBusy(false);
    }
  });

  elements.openPlayerButton.addEventListener('click', async () => {
    setBusy(true);
    setStatus(copy.popup.openingPlayer);

    try {
      const response = await chrome.runtime.sendMessage({ type: OPEN_PLAYER_MESSAGE });
      if (!response?.ok) {
        throw new Error(response?.error || copy.popup.openPlayerFailed);
      }

      globalThis.close();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : copy.popup.openPlayerFailed, 'error');
      setBusy(false);
    }
  });
}

function renderDetectedContext(lastLaunch) {
  if (state.detectedRepository) {
    elements.detectedContext.textContent = copy.popup.detectedRepository(
      state.detectedRepository.provider,
      state.detectedRepository.repoSlug,
    );
    return;
  }

  if (lastLaunch?.repoSlug) {
    elements.detectedContext.textContent = copy.popup.lastLaunch(lastLaunch.repoSlug);
    return;
  }

  elements.detectedContext.textContent = copy.popup.noRepositoryDetected;
}

function setBusy(isBusy) {
  elements.playButton.disabled = isBusy;
  elements.openPlayerButton.disabled = isBusy;
  elements.repoUrl.disabled = isBusy;
}

function setStatus(message, tone = 'neutral') {
  elements.popupStatus.textContent = message;
  elements.popupStatus.dataset.tone = tone;
}

const elements = {
  repoForm: document.querySelector('#repo-form'),
  repoUrl: document.querySelector('#repo-url'),
  popupEyebrow: document.querySelector('#popup-eyebrow'),
  popupTitle: document.querySelector('#popup-title'),
  popupSubtitle: document.querySelector('#popup-subtitle'),
  urlLabel: document.querySelector('#url-label'),
  detectedContext: document.querySelector('#detected-context'),
  popupStatus: document.querySelector('#popup-status'),
  playButton: document.querySelector('#play-button'),
  openPlayerButton: document.querySelector('#open-player-button'),
};

if (typeof document !== 'undefined' && typeof chrome !== 'undefined') {
  void bootstrap();
}
