import React from 'react';

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
  const repositoryOptions = repositories.map(normalizeRepositoryOption);
  const submitButtonLabel = isSubmitting ? 'Loading…' : submitLabel;

  return (
    <section className="player-card source-input-panel" aria-labelledby="source-input-panel-title">
      <div className="player-card__header">
        <div>
          <p className="player-kicker">Replay Source</p>
          <h2 id="source-input-panel-title" className="player-section-title">Choose input</h2>
        </div>
        <p className="player-card__meta">
          {mode === 'local' && '로컬 Git 저장소와 브랜치를 읽습니다.'}
          {mode === 'public' && '공개 GitHub 또는 GitLab 저장소 URL만으로 플레이 소스를 만듭니다.'}
          {mode === 'account' && 'GitHub 또는 GitLab 계정을 연결하고 저장소를 선택합니다.'}
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
              label: 'Repository Path',
              value: repoPath,
              onChange: onRepoPathChange,
              placeholder: '/Users/agent/projects/maestro',
            })}
            {renderField({
              id: 'player-local-branch',
              label: 'Branch',
              value: branchName,
              onChange: onBranchNameChange,
              placeholder: 'main',
            })}
          </div>
        )}

        {mode === 'public' && (
          <div className="player-field-grid">
            {renderField({
              id: 'player-public-repo-url',
              label: 'Public Repository URL',
              value: publicUrl,
              onChange: onPublicUrlChange,
              placeholder: 'https://github.com/openai/maestro-player 또는 https://gitlab.com/group/maestro-player',
              type: 'url',
            })}
            {renderField({
              id: 'player-public-branch',
              label: 'Branch',
              value: branchName,
              onChange: onBranchNameChange,
              placeholder: 'main',
            })}
          </div>
        )}

        {mode === 'account' && (
          <div className="player-stack">
            <div className="player-field-grid">
              <label className="player-field" htmlFor="player-account-provider">
                <span className="player-label">Provider</span>
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
                label: 'Account Token',
                value: accountToken,
                onChange: onAccountTokenChange,
                placeholder: accountProvider === 'gitlab' ? 'glpat-...' : 'ghp_...',
                type: 'password',
                autoComplete: 'current-password',
              })}
              {renderField({
                id: 'player-account-branch',
                label: 'Branch',
                value: branchName,
                onChange: onBranchNameChange,
                placeholder: 'main',
              })}
            </div>

            <div className="player-field player-field--full">
              <div className="player-label-row">
                <label className="player-label" htmlFor="player-account-repository">Repository</label>
                <button
                  type="button"
                  className="player-button player-button--secondary"
                  disabled={isRefreshingRepositories || !accountToken}
                  onClick={() => onRefreshRepositories?.()}
                >
                  {isRefreshingRepositories ? 'Refreshing…' : 'Refresh Repositories'}
                </button>
              </div>
              <select
                id="player-account-repository"
                className="player-select"
                value={selectedRepo}
                onChange={(event) => onSelectedRepoChange?.(event.target.value)}
              >
                <option value="">Select repository</option>
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
