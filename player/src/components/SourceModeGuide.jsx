import React from 'react';

const MODE_GUIDES = {
  local: {
    id: 'local',
    label: 'Local Repo',
    readiness: 'Staged',
    readinessTone: 'staged',
    summary: 'Read a repository already present on this machine.',
    bestFor: 'Private experiments, offline replay prep, and desktop-first workflows.',
    cue: 'Live replay loading still needs a desktop or server bridge.',
    capabilities: [
      'Can target private local history without publishing it.',
      'Avoids network round-trips once a local bridge exists.',
      'Fits future desktop capture and practice workflows.',
    ],
    risks: [
      'Not fully wired for live loading in the current shell.',
      'Path access and machine-specific setup can block replay.',
    ],
  },
  public: {
    id: 'public',
    label: 'Public Repo URL',
    readiness: 'Ready now',
    readinessTone: 'ready',
    summary: 'Load a public GitHub or GitLab repository by URL and build a replay from commit history.',
    bestFor: 'Open-source repos, demos, and frictionless share links.',
    cue: 'Best default for immediate play because no account connection is required.',
    capabilities: [
      'Start from a GitHub or GitLab URL without signing in.',
      'Works well for public repository discovery and quick challenge sharing.',
      'Keeps replay generation deterministic from forge history.',
    ],
    risks: [
      'Limited to public history exposed by the forge API.',
      'Rate limits or missing metadata can reduce replay depth.',
    ],
  },
  account: {
    id: 'account',
    label: 'Connected Account',
    readiness: 'Ready now',
    readinessTone: 'ready',
    summary: 'Connect a GitHub or GitLab token, browse repositories, and load private or public history.',
    bestFor: 'Private repositories, curated repo pickers, and repeat personal sessions.',
    cue: 'Requires a token first, then a repository refresh before replay can load.',
    capabilities: [
      'Can unlock private repository history.',
      'Lets the UI offer a repository picker instead of manual URLs.',
      'Leaves room for richer collaboration overlays later.',
    ],
    risks: [
      'Depends on token validity and correct scopes.',
      'Account and API limits can affect repository listing or replay load speed.',
    ],
  },
};

const MODE_ORDER = ['local', 'public', 'account'];

export default function SourceModeGuide({ mode = 'public', sourceState = {} }) {
  return (
    <section className="player-card source-mode-guide" aria-labelledby="source-mode-guide-title">
      <div className="player-card__header">
        <div>
          <p className="player-kicker">Source Modes</p>
          <h2 id="source-mode-guide-title" className="player-section-title">Choose the right input path</h2>
        </div>
        <p className="player-card__meta">
          Public and account modes are ready in the shell now for GitHub and GitLab. Local mode stays staged until a bridge can read machine repositories safely.
        </p>
      </div>

      <div className="source-mode-guide__list" role="list">
        {MODE_ORDER.map((modeId) => {
          const entry = buildGuideEntry(modeId, sourceState[modeId]);
          const isActive = modeId === mode;

          return (
            <article
              key={modeId}
              className={`source-mode-guide__card${isActive ? ' is-active' : ''}`}
              role="listitem"
              aria-current={isActive ? 'step' : undefined}
              aria-labelledby={`source-mode-guide-${modeId}-title`}
            >
              <div className="source-mode-guide__heading">
                <div>
                  <h3 id={`source-mode-guide-${modeId}-title`} className="source-mode-guide__title">{entry.label}</h3>
                  <p className="source-mode-guide__summary">{entry.summary}</p>
                </div>
                <div className="source-mode-guide__badges">
                  <span className={`player-pill${entry.readinessTone === 'ready' ? ' is-live' : ''}`}>
                    {entry.readiness}
                  </span>
                  {isActive ? <span className="player-pill is-live">Active mode</span> : null}
                </div>
              </div>

              <dl className="status-grid">
                <div className="status-item status-item--wide">
                  <dt>Best for</dt>
                  <dd>{entry.bestFor}</dd>
                </div>
                <div className="status-item status-item--wide">
                  <dt>Current cue</dt>
                  <dd>{entry.cue}</dd>
                </div>
              </dl>

              <div className="source-mode-guide__columns">
                <div>
                  <h4 className="source-mode-guide__subheading">Capabilities</h4>
                  <ul className="source-mode-guide__list-items">
                    {entry.capabilities.map((capability) => (
                      <li key={capability}>{capability}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h4 className="source-mode-guide__subheading">Risks</h4>
                  <ul className="source-mode-guide__list-items">
                    {entry.risks.map((risk) => (
                      <li key={risk}>{risk}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function buildGuideEntry(modeId, overrides = {}) {
  const base = MODE_GUIDES[modeId];
  if (!base) {
    throw new Error(`unsupported source mode guide: ${modeId}`);
  }

  return {
    ...base,
    ...overrides,
    capabilities: Array.isArray(overrides.capabilities) ? overrides.capabilities : base.capabilities,
    risks: Array.isArray(overrides.risks) ? overrides.risks : base.risks,
  };
}
