import { registerPublicRepoSource } from './sourceRegistry.js';

const GITHUB_HOSTS = new Set(['github.com', 'www.github.com']);
const GITLAB_HOSTS = new Set(['gitlab.com', 'www.gitlab.com']);

export function parsePublicRepositoryUrl(inputUrl) {
  let parsedUrl;

  try {
    parsedUrl = new URL(inputUrl);
  } catch (error) {
    throw new Error(`invalid public repository url: ${inputUrl}`);
  }

  if (GITHUB_HOSTS.has(parsedUrl.hostname)) {
    return parseGitHubPublicRepositoryUrl(parsedUrl);
  }

  if (GITLAB_HOSTS.has(parsedUrl.hostname)) {
    return parseGitLabPublicRepositoryUrl(parsedUrl);
  }

  throw new Error(`unsupported public repository host: ${parsedUrl.hostname}`);
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

  if (source.provider === 'gitlab') {
    return loadGitLabPublicRepoReplayEvents(source, fetchImpl, maxCommits);
  }

  return loadGitHubPublicRepoReplayEvents(source, fetchImpl, maxCommits);
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

export function mapGitLabCommitToReplayEvent(detail, diffEntries, source) {
  const changedFiles = (diffEntries || [])
    .map((entry) => {
      const filePath = entry?.new_path || entry?.old_path || '';
      if (!filePath) {
        return null;
      }

      return entry?.new_file ? `new:${filePath}` : filePath;
    })
    .filter(Boolean);
  const stats = detail.stats || {};
  const commitSha = detail.id || detail.sha || detail.short_id || 'unknown';
  const title = detail.title || String(detail.message || commitSha).split('\n')[0];

  return {
    eventId: commitSha,
    sourceType: source.sourceType || 'git-public-url',
    repoId: source.repoSlug,
    sourceLabel: source.canonicalUrl || source.sourceLabel,
    eventType: detectGitLabCommitEventType(detail),
    timestamp: detail.authored_date || detail.committed_date || detail.created_at,
    actor: detail.author_name || detail.committer_name || 'unknown',
    branchName: source.branchName,
    commitSha,
    title,
    message: detail.message || title,
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

async function loadGitHubPublicRepoReplayEvents(source, fetchImpl, maxCommits) {
  const commitListUrl = `${source.metadata.apiBaseUrl}/commits?sha=${encodeURIComponent(source.branchName || 'main')}&per_page=${maxCommits}`;
  const commitList = await fetchJson(fetchImpl, commitListUrl);
  const commitDetails = await Promise.all(
    commitList.map((commit) => fetchJson(fetchImpl, `${source.metadata.apiBaseUrl}/commits/${commit.sha}`)),
  );

  return commitDetails.map((detail) => mapGitHubCommitToReplayEvent(detail, source));
}

async function loadGitLabPublicRepoReplayEvents(source, fetchImpl, maxCommits) {
  const commitListUrl = `${source.metadata.apiBaseUrl}/repository/commits?ref_name=${encodeURIComponent(source.branchName || 'main')}&per_page=${maxCommits}`;
  const commitList = await fetchJson(fetchImpl, commitListUrl);
  const commitPayloads = await Promise.all(
    commitList.map(async (commit) => {
      const commitSha = commit.id || commit.sha;
      const [detail, diffEntries] = await Promise.all([
        fetchJson(fetchImpl, `${source.metadata.apiBaseUrl}/repository/commits/${commitSha}?stats=true`),
        fetchJson(fetchImpl, `${source.metadata.apiBaseUrl}/repository/commits/${commitSha}/diff`),
      ]);

      return mapGitLabCommitToReplayEvent(detail, diffEntries, source);
    }),
  );

  return commitPayloads;
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

function detectGitLabCommitEventType(detail) {
  const message = String(detail.message || detail.title || '').trim().toLowerCase();
  const parentCount = Array.isArray(detail.parent_ids) ? detail.parent_ids.length : 0;

  if (parentCount > 1 || message.startsWith('merge ')) {
    return 'merge';
  }

  if (message.startsWith('revert ')) {
    return 'revert';
  }

  return 'commit';
}

function parseGitHubPublicRepositoryUrl(parsedUrl) {
  const pathSegments = parsedUrl.pathname
    .replace(/\.git$/, '')
    .split('/')
    .filter(Boolean);

  if (pathSegments.length < 2) {
    throw new Error(`public repository url is missing owner/repo: ${parsedUrl}`);
  }

  const owner = pathSegments[0];
  const repo = pathSegments[1];
  const treeIndex = pathSegments.findIndex((segment, index) => segment === 'tree' && index >= 2);
  const branchName = treeIndex >= 0 && pathSegments.length > treeIndex + 1
    ? decodeURIComponent(pathSegments.slice(treeIndex + 1).join('/'))
    : 'main';
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

function parseGitLabPublicRepositoryUrl(parsedUrl) {
  const pathSegments = parsedUrl.pathname
    .replace(/\.git$/, '')
    .split('/')
    .filter(Boolean);

  const treeIndex = pathSegments.findIndex((segment, index) => segment === '-' && pathSegments[index + 1] === 'tree');
  const repoSegments = treeIndex >= 0 ? pathSegments.slice(0, treeIndex) : pathSegments;

  if (repoSegments.length < 2) {
    throw new Error(`public repository url is missing owner/repo: ${parsedUrl}`);
  }

  const repo = repoSegments.at(-1);
  const owner = repoSegments.slice(0, -1).join('/');
  const repoSlug = `${owner}/${repo}`;
  const branchName = treeIndex >= 0 && pathSegments.length > treeIndex + 2
    ? decodeURIComponent(pathSegments.slice(treeIndex + 2).join('/'))
    : 'main';
  const canonicalUrl = `https://gitlab.com/${repoSlug}`;

  return {
    provider: 'gitlab',
    owner,
    repo,
    repoSlug,
    branchName,
    canonicalUrl,
    apiBaseUrl: `https://gitlab.com/api/v4/projects/${encodeURIComponent(repoSlug)}`,
  };
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
