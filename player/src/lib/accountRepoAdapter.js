import { registerConnectedAccountSource } from './sourceRegistry.js';
import { mapGitHubCommitToReplayEvent, mapGitLabCommitToReplayEvent } from './publicRepoAdapter.js';

const GITHUB_API_BASE_URL = 'https://api.github.com';
const GITLAB_API_BASE_URL = 'https://gitlab.com/api/v4';

export async function listConnectedRepositories(input) {
  const provider = input.provider || 'github';

  if (provider === 'gitlab') {
    return listConnectedGitlabRepositories(input);
  }

  return listConnectedGithubRepositories(input);
}

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

export async function listConnectedGitlabRepositories(input) {
  const fetchImpl = input.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') {
    throw new Error('account repo adapter requires a fetch implementation');
  }

  if (!input.accessToken) {
    throw new Error('gitlab account listing requires an access token');
  }

  const perPage = Number.isFinite(input.perPage) && input.perPage > 0 ? Math.floor(input.perPage) : 50;
  const url = `${GITLAB_API_BASE_URL}/projects?membership=true&simple=true&order_by=last_activity_at&sort=desc&per_page=${perPage}`;
  const response = await fetchImpl(url, {
    headers: {
      'PRIVATE-TOKEN': input.accessToken,
    },
  });

  if (!response.ok) {
    throw new Error(`gitlab account repo listing failed: ${response.status}`);
  }

  const repositories = await response.json();
  return repositories.map((repository) => normalizeGitlabRepository(repository));
}

export function createConnectedAccountRepoSource(input) {
  return registerConnectedAccountSource({
    provider: input.provider || 'github',
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

  if (source.provider === 'gitlab') {
    return loadGitlabConnectedAccountReplayEvents(source, input.accessToken, fetchImpl, maxCommits);
  }

  return loadGithubConnectedAccountReplayEvents(source, input.accessToken, fetchImpl, maxCommits);
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

function normalizeGitlabRepository(repository) {
  const repoSlug = repository.path_with_namespace;
  const slugSegments = String(repoSlug || '').split('/').filter(Boolean);

  return {
    provider: 'gitlab',
    repoId: repository.id,
    owner: repository.namespace?.full_path || slugSegments.slice(0, -1).join('/'),
    repo: repository.path || slugSegments.at(-1),
    repoSlug,
    visibility: repository.visibility || 'private',
    defaultBranch: repository.default_branch || 'main',
    htmlUrl: repository.web_url,
  };
}

async function loadGithubConnectedAccountReplayEvents(source, accessToken, fetchImpl, maxCommits) {
  const apiBaseUrl = `${GITHUB_API_BASE_URL}/repos/${source.repoSlug}`;
  const headers = {
    authorization: `Bearer ${accessToken}`,
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

async function loadGitlabConnectedAccountReplayEvents(source, accessToken, fetchImpl, maxCommits) {
  const apiBaseUrl = `${GITLAB_API_BASE_URL}/projects/${encodeURIComponent(source.repoSlug)}`;
  const headers = {
    'PRIVATE-TOKEN': accessToken,
  };
  const commitListResponse = await fetchImpl(
    `${apiBaseUrl}/repository/commits?ref_name=${encodeURIComponent(source.branchName || 'main')}&per_page=${maxCommits}`,
    { headers },
  );

  if (!commitListResponse.ok) {
    throw new Error(`gitlab account replay loading failed: ${commitListResponse.status}`);
  }

  const commitList = await commitListResponse.json();
  const replayEvents = await Promise.all(
    commitList.map(async (commit) => {
      const commitSha = commit.id || commit.sha;
      const [detailResponse, diffResponse] = await Promise.all([
        fetchImpl(`${apiBaseUrl}/repository/commits/${commitSha}?stats=true`, { headers }),
        fetchImpl(`${apiBaseUrl}/repository/commits/${commitSha}/diff`, { headers }),
      ]);

      if (!detailResponse.ok) {
        throw new Error(`gitlab account commit detail failed: ${detailResponse.status}`);
      }

      if (!diffResponse.ok) {
        throw new Error(`gitlab account commit diff failed: ${diffResponse.status}`);
      }

      const [detail, diffEntries] = await Promise.all([
        detailResponse.json(),
        diffResponse.json(),
      ]);

      return mapGitLabCommitToReplayEvent(detail, diffEntries, {
        ...source,
        sourceType: 'git-account',
        visibility: source.visibility,
        metadata: {
          ...source.metadata,
          apiBaseUrl,
        },
      });
    }),
  );

  return replayEvents.map((event) => ({
    ...event,
    sourceType: 'git-account',
    visibility: source.visibility,
  }));
}
