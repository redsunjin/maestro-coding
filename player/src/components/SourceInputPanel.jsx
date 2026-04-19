import React from 'react';
import { getPlayerCopy } from '../lib/playerI18n.js';

function normalizeRepositoryOption(repository) {
  if (typeof repository === 'string') {
    return {
      value: repository,
      label: repository,
      meta: '',
    };
  }

  const value = repository.value || repository.repoSlug || repository.id || '';
  const label = repository.label || repository.repoSlug || repository.name || value;
  const meta = repository.meta
    || [repository.visibility, repository.defaultBranch].filter(Boolean).join(' · ');

  return {
    value,
    label,
    meta,
  };
}

function renderField({
  id,
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  autoComplete = 'off',
}) {
  return (
    <label className="player-field" htmlFor={id}>
      <span className="player-label">{label}</span>
      <input
        id={id}
        className="player-input"
        type={type}
        value={value}
        placeholder={placeholder}
        autoComplete={autoComplete}
        onChange={(event) => onChange?.(event.target.value)}
      />
    </label>
  );
}

export default function SourceInputPanel({
  mode = 'local',
  language = 'en',
  repoPath = '',
  publicUrl = '',
  branchName = '',
  accountProvider = 'github',
  accountToken = '',
  repositories = [],
  selectedRepo = '',
  onRepoPathChange,
  onPublicUrlChange,
  onBranchNameChange,
  onAccountProviderChange,
  onAccountTokenChange,
  onSelectedRepoChange,
  onRefreshRepositories,
  onSubmit,
  submitLabel = 'Load Replay',
  isSubmitting = false,
  isRefreshingRepositories = false,
}) {
  const copy = getPlayerCopy(language);
  const repositoryOptions = repositories.map(normalizeRepositoryOption);
  const submitButtonLabel = isSubmitting ? copy.sourceInput.buttons.submitting : submitLabel;

  return (
    <section className="player-card source-input-panel" aria-labelledby="source-input-panel-title">
      <div className="player-card__header">
        <div>
          <p className="player-kicker">{copy.sourceInput.kicker}</p>
          <h2 id="source-input-panel-title" className="player-section-title">{copy.sourceInput.title}</h2>
        </div>
        <p className="player-card__meta">
          {copy.sourceInput.meta[mode]}
        </p>
      </div>

      <form
        className="source-input-panel__form"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit?.(event);
        }}
      >
        {mode === 'local' && (
          <div className="player-field-grid">
            {renderField({
              id: 'player-local-repo-path',
              label: copy.sourceInput.labels.repoPath,
              value: repoPath,
              onChange: onRepoPathChange,
              placeholder: copy.sourceInput.placeholders.repoPath,
            })}
            {renderField({
              id: 'player-local-branch',
              label: copy.sourceInput.labels.branch,
              value: branchName,
              onChange: onBranchNameChange,
              placeholder: copy.sourceInput.placeholders.branch,
            })}
          </div>
        )}

        {mode === 'public' && (
          <div className="player-field-grid">
            {renderField({
              id: 'player-public-repo-url',
              label: copy.sourceInput.labels.publicUrl,
              value: publicUrl,
              onChange: onPublicUrlChange,
              placeholder: copy.sourceInput.placeholders.publicUrl,
              type: 'url',
            })}
            {renderField({
              id: 'player-public-branch',
              label: copy.sourceInput.labels.branch,
              value: branchName,
              onChange: onBranchNameChange,
              placeholder: copy.sourceInput.placeholders.branch,
            })}
          </div>
        )}

        {mode === 'account' && (
          <div className="player-stack">
            <div className="player-field-grid">
              <label className="player-field" htmlFor="player-account-provider">
                <span className="player-label">{copy.sourceInput.labels.provider}</span>
                <select
                  id="player-account-provider"
                  className="player-select"
                  value={accountProvider}
                  onChange={(event) => onAccountProviderChange?.(event.target.value)}
                >
                  <option value="github">GitHub</option>
                  <option value="gitlab">GitLab</option>
                </select>
              </label>
              {renderField({
                id: 'player-account-token',
                label: copy.sourceInput.labels.token,
                value: accountToken,
                onChange: onAccountTokenChange,
                placeholder: accountProvider === 'gitlab'
                  ? copy.sourceInput.placeholders.tokenGitlab
                  : copy.sourceInput.placeholders.tokenGithub,
                type: 'password',
                autoComplete: 'current-password',
              })}
              {renderField({
                id: 'player-account-branch',
                label: copy.sourceInput.labels.branch,
                value: branchName,
                onChange: onBranchNameChange,
                placeholder: copy.sourceInput.placeholders.branch,
              })}
            </div>

            <div className="player-field player-field--full">
              <div className="player-label-row">
                <label className="player-label" htmlFor="player-account-repository">{copy.sourceInput.labels.repository}</label>
                <button
                  type="button"
                  className="player-button player-button--secondary"
                  disabled={isRefreshingRepositories || !accountToken}
                  onClick={() => onRefreshRepositories?.()}
                >
                  {isRefreshingRepositories ? copy.sourceInput.buttons.refreshing : copy.sourceInput.buttons.refresh}
                </button>
              </div>
              <select
                id="player-account-repository"
                className="player-select"
                value={selectedRepo}
                onChange={(event) => onSelectedRepoChange?.(event.target.value)}
              >
                <option value="">{copy.common.selectRepository}</option>
                {repositoryOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.meta ? `${option.label} (${option.meta})` : option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        <div className="player-actions">
          <button className="player-button" type="submit" disabled={isSubmitting}>
            {submitButtonLabel}
          </button>
        </div>
      </form>
    </section>
  );
}
