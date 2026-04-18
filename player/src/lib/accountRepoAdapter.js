import { registerConnectedAccountSource } from './sourceRegistry.js';
import { mapGitHubCommitToReplayEvent } from './publicRepoAdapter.js';

export async function listConnectedGithubRepositories(input) {
  const fetchImpl = input.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') {
    throw new Error('account repo adapter requires a fetch implementation');
  }

  if (!input.accessToken) {
    throw new Error('github account listing requires an access token');
  }

  const perPage = Number.isFinite(input.perPage) && input.perPage > 0 ? Math.floor(input.perPage) : 50;
  const visibility = input.visibility || 'all';
  const url = `https://api.github.com/user/repos?sort=updated&per_page=${perPage}&visibility=${visibility}`;
  const response = await fetchImpl(url, {
    headers: {
      authorization: `Bearer ${input.accessToken}`,
      accept: 'application/vnd.github+json',
    },
  });

  if (!response.ok) {
    throw new Error(`github account repo listing failed: ${response.status}`);
  }

  const repositories = await response.json();
  return repositories.map((repository) => normalizeGithubRepository(repository));
}

export function createConnectedAccountRepoSource(input) {
  return registerConnectedAccountSource({
    provider: 'github',
    owner: input.owner,
    repo: input.repo,
    sourceLabel: input.sourceLabel || `${input.owner}/${input.repo}`,
    targetPathOrId: input.targetPathOrId || `${input.owner}/${input.repo}`,
    branchName: input.branchName || input.defaultBranch || 'main',
    accountId: input.accountId,
    repoId: input.repoId,
    defaultBranch: input.defaultBranch || 'main',
    visibility: input.visibility || 'private',
  });
}

export async function loadConnectedAccountReplayEvents(input) {
  const fetchImpl = input.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') {
    throw new Error('account repo adapter requires a fetch implementation');
  }

  if (!input.accessToken) {
    throw new Error('connected account replay loading requires an access token');
  }

  const source = createConnectedAccountRepoSource(input);
  const maxCommits = Number.isFinite(input.maxCommits) && input.maxCommits > 0 ? Math.floor(input.maxCommits) : 20;
  const apiBaseUrl = `https://api.github.com/repos/${source.repoSlug}`;
  const headers = {
    authorization: `Bearer ${input.accessToken}`,
    accept: 'application/vnd.github+json',
  };
  const commitListResponse = await fetchImpl(
    `${apiBaseUrl}/commits?sha=${encodeURIComponent(source.branchName || 'main')}&per_page=${maxCommits}`,
    { headers },
  );

  if (!commitListResponse.ok) {
    throw new Error(`github account replay loading failed: ${commitListResponse.status}`);
  }

  const commitList = await commitListResponse.json();
  const commitDetails = await Promise.all(
    commitList.map(async (commit) => {
      const detailResponse = await fetchImpl(`${apiBaseUrl}/commits/${commit.sha}`, { headers });
      if (!detailResponse.ok) {
        throw new Error(`github account commit detail failed: ${detailResponse.status}`);
      }
      return detailResponse.json();
    }),
  );

  return commitDetails.map((detail) => mapGitHubCommitToReplayEvent(detail, {
    ...source,
    sourceType: 'git-account',
    visibility: source.visibility,
    metadata: {
      ...source.metadata,
      apiBaseUrl,
    },
  })).map((event) => ({
    ...event,
    sourceType: 'git-account',
    visibility: source.visibility,
  }));
}

function normalizeGithubRepository(repository) {
  return {
    provider: 'github',
    repoId: repository.id,
    owner: repository.owner?.login,
    repo: repository.name,
    repoSlug: repository.full_name,
    visibility: repository.private ? 'private' : 'public',
    defaultBranch: repository.default_branch || 'main',
    htmlUrl: repository.html_url,
  };
}
