import { registerPublicRepoSource } from './sourceRegistry.js';

const GITHUB_HOSTS = new Set(['github.com', 'www.github.com']);

export function parsePublicRepositoryUrl(inputUrl) {
  let parsedUrl;

  try {
    parsedUrl = new URL(inputUrl);
  } catch (error) {
    throw new Error(`invalid public repository url: ${inputUrl}`);
  }

  if (!GITHUB_HOSTS.has(parsedUrl.hostname)) {
    throw new Error(`unsupported public repository host: ${parsedUrl.hostname}`);
  }

  const pathSegments = parsedUrl.pathname
    .replace(/\.git$/, '')
    .split('/')
    .filter(Boolean);

  if (pathSegments.length < 2) {
    throw new Error(`public repository url is missing owner/repo: ${inputUrl}`);
  }

  const [owner, repo, treeKeyword, treeBranch] = pathSegments;
  const branchName = treeKeyword === 'tree' && treeBranch ? decodeURIComponent(treeBranch) : 'main';
  const canonicalUrl = `https://github.com/${owner}/${repo}`;

  return {
    provider: 'github',
    owner,
    repo,
    repoSlug: `${owner}/${repo}`,
    branchName,
    canonicalUrl,
    apiBaseUrl: `https://api.github.com/repos/${owner}/${repo}`,
  };
}

export function createPublicRepoSource(input) {
  const parsed = parsePublicRepositoryUrl(input.url);

  return registerPublicRepoSource({
    ...parsed,
    branchName: input.branchName || parsed.branchName,
    sourceLabel: input.sourceLabel || parsed.repoSlug,
  });
}

export async function loadPublicRepoReplayEvents(input) {
  const fetchImpl = input.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') {
    throw new Error('public repo adapter requires a fetch implementation');
  }

  const source = createPublicRepoSource({
    url: input.url,
    sourceLabel: input.sourceLabel,
    branchName: input.branchName,
  });
  const maxCommits = Number.isFinite(input.maxCommits) && input.maxCommits > 0 ? Math.floor(input.maxCommits) : 20;
  const commitListUrl = `${source.metadata.apiBaseUrl}/commits?sha=${encodeURIComponent(source.branchName || 'main')}&per_page=${maxCommits}`;
  const commitList = await fetchJson(fetchImpl, commitListUrl);
  const commitDetails = await Promise.all(
    commitList.map((commit) => fetchJson(fetchImpl, `${source.metadata.apiBaseUrl}/commits/${commit.sha}`)),
  );

  return commitDetails.map((detail) => mapGitHubCommitToReplayEvent(detail, source));
}

export function mapGitHubCommitToReplayEvent(detail, source) {
  const changedFiles = (detail.files || []).map((file) => (
    file.status === 'added' ? `new:${file.filename}` : file.filename
  ));
  const stats = detail.stats || {};

  return {
    eventId: detail.sha,
    sourceType: 'git-public-url',
    repoId: source.repoSlug,
    sourceLabel: source.canonicalUrl,
    eventType: detectGitHubCommitEventType(detail),
    timestamp: detail.commit?.author?.date || detail.commit?.committer?.date,
    actor: detail.commit?.author?.name || detail.author?.login || 'unknown',
    branchName: source.branchName,
    commitSha: detail.sha,
    title: detail.commit?.message?.split('\n')[0] || detail.sha,
    message: detail.commit?.message || detail.sha,
    changedFiles,
    filesChanged: changedFiles.length,
    linesAdded: stats.additions || 0,
    linesDeleted: stats.deletions || 0,
    newFileCount: changedFiles.filter((path) => path.startsWith('new:')).length,
    newDirectoryCount: countNewDirectories(changedFiles),
    weight: Math.max(1, (stats.total || 0) + changedFiles.length),
    provider: source.provider,
    visibility: source.visibility,
  };
}

async function fetchJson(fetchImpl, url) {
  const response = await fetchImpl(url);

  if (!response.ok) {
    throw new Error(`public repo adapter request failed: ${response.status} ${url}`);
  }

  return response.json();
}

function detectGitHubCommitEventType(detail) {
  const message = String(detail.commit?.message || '').trim().toLowerCase();
  const parentCount = Array.isArray(detail.parents) ? detail.parents.length : 0;

  if (parentCount > 1 || message.startsWith('merge ')) {
    return 'merge';
  }

  if (message.startsWith('revert ')) {
    return 'revert';
  }

  return 'commit';
}

function countNewDirectories(changedFiles) {
  const directories = new Set();
  changedFiles
    .filter((path) => path.startsWith('new:'))
    .forEach((path) => {
      const normalizedPath = path.replace(/^new:/, '');
      const [topLevelDirectory] = normalizedPath.split('/');
      if (topLevelDirectory) {
        directories.add(topLevelDirectory);
      }
    });
  return directories.size;
}
