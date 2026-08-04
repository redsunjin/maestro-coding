import React from 'react';
import { getPlayerCopy } from '../lib/playerI18n.js';

export default function ExtensionPublicLauncher({
  language = 'en',
  publicUrl = '',
  branchName = 'main',
  onPublicUrlChange,
  onBranchNameChange,
  onSubmit,
  isSubmitting = false,
}) {
  const copy = getPlayerCopy(language);
  const buttonLabel = isSubmitting
    ? copy.extensionLauncher.loading
    : copy.extensionLauncher.loadReplay;

  return (
    <section className="player-card extension-launcher" aria-labelledby="extension-public-launcher-title">
      <div className="extension-launcher__heading">
        <div>
          <p className="player-kicker">{copy.extensionLauncher.kicker}</p>
          <h2 id="extension-public-launcher-title" className="player-section-title">
            {copy.extensionLauncher.title}
          </h2>
        </div>
        <span className="player-pill">{copy.extensionLauncher.publicOnly}</span>
      </div>

      <p className="extension-launcher__copy">{copy.extensionLauncher.description}</p>

      <form
        className="extension-launcher__form"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit?.(event);
        }}
      >
        <label className="player-field" htmlFor="extension-public-repo-url">
          <span className="player-label">{copy.sourceInput.labels.publicUrl}</span>
          <input
            id="extension-public-repo-url"
            className="player-input"
            type="url"
            value={publicUrl}
            placeholder={copy.sourceInput.placeholders.publicUrl}
            autoComplete="off"
            onChange={(event) => onPublicUrlChange?.(event.target.value)}
          />
        </label>

        <div className="extension-launcher__footer">
          <label className="extension-launcher__branch" htmlFor="extension-public-branch">
            <span className="player-label">{copy.sourceInput.labels.branch}</span>
            <input
              id="extension-public-branch"
              className="player-input"
              value={branchName}
              placeholder={copy.sourceInput.placeholders.branch}
              autoComplete="off"
              onChange={(event) => onBranchNameChange?.(event.target.value)}
            />
          </label>
          <button className="player-button" type="submit" disabled={isSubmitting}>
            {buttonLabel}
          </button>
        </div>
      </form>

      <p className="extension-launcher__hint">{copy.extensionLauncher.demoHint}</p>
    </section>
  );
}
