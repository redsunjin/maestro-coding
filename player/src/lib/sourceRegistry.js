import { hashString } from './types.js';

export function createReplaySource(input) {
  const sourceType = input.sourceType || 'git-local';
  const provider = input.provider || inferProvider(sourceType);
  const visibility = input.visibility || (sourceType === 'git-public-url' ? 'public' : 'private');
  const sourceLabel = input.sourceLabel || input.targetPathOrId || input.canonicalUrl || input.repoSlug || 'unknown-source';
  const targetPathOrId = input.targetPathOrId || input.canonicalUrl || input.repoSlug || sourceLabel;

  return {
    sourceId: input.sourceId || `${sourceType}:${hashString(`${provider}:${targetPathOrId}`)}`,
    sourceType,
    provider,
    visibility,
    sourceLabel,
    targetPathOrId,
    owner: input.owner || null,
    repo: input.repo || null,
    repoSlug: input.repoSlug || buildRepoSlug(input.owner, input.repo),
    branchName: input.branchName || null,
    canonicalUrl: input.canonicalUrl || null,
    accountId: input.accountId || null,
    metadata: input.metadata || {},
  };
}

export function registerLocalRepoSource(input) {
  return createReplaySource({
    sourceType: 'git-local',
    provider: 'local',
    visibility: input.visibility || 'private',
    sourceLabel: input.sourceLabel || input.repoPath,
    targetPathOrId: input.repoPath,
    branchName: input.branchName || null,
    metadata: {
      repoPath: input.repoPath,
    },
  });
}

export function registerConnectedAccountSource(input) {
  return createReplaySource({
    sourceType: 'git-account',
    provider: input.provider,
    visibility: input.visibility || 'private',
    sourceLabel: input.sourceLabel || buildRepoSlug(input.owner, input.repo),
    targetPathOrId: input.targetPathOrId || buildRepoSlug(input.owner, input.repo),
    owner: input.owner,
    repo: input.repo,
    branchName: input.branchName || input.defaultBranch || null,
    accountId: input.accountId || null,
    metadata: {
      repoId: input.repoId || null,
      defaultBranch: input.defaultBranch || null,
    },
  });
}

export function registerPublicRepoSource(input) {
  return createReplaySource({
    sourceType: 'git-public-url',
    provider: input.provider,
    visibility: 'public',
    sourceLabel: input.sourceLabel || buildRepoSlug(input.owner, input.repo),
    targetPathOrId: input.canonicalUrl,
    owner: input.owner,
    repo: input.repo,
    branchName: input.branchName || input.defaultBranch || null,
    canonicalUrl: input.canonicalUrl,
    metadata: {
      defaultBranch: input.defaultBranch || null,
      apiBaseUrl: input.apiBaseUrl || null,
    },
  });
}

function inferProvider(sourceType) {
  if (sourceType === 'git-local') {
    return 'local';
  }

  return 'unknown';
}

function buildRepoSlug(owner, repo) {
  if (!owner || !repo) {
    return null;
  }

  return `${owner}/${repo}`;
}
