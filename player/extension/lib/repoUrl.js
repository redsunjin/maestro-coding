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

export function maybeParsePublicRepositoryUrl(inputUrl) {
  try {
    return parsePublicRepositoryUrl(inputUrl);
  } catch (error) {
    return null;
  }
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

  return {
    provider: 'github',
    owner,
    repo,
    repoSlug: `${owner}/${repo}`,
    branchName,
    canonicalUrl: `https://github.com/${owner}/${repo}`,
  };
}

function parseGitLabPublicRepositoryUrl(parsedUrl) {
  const pathSegments = parsedUrl.pathname
    .replace(/\.git$/, '')
    .split('/')
    .filter(Boolean);
  const dashIndex = pathSegments.indexOf('-');
  const repoSegments = dashIndex >= 0 ? pathSegments.slice(0, dashIndex) : pathSegments;

  if (repoSegments.length < 2) {
    throw new Error(`public repository url is missing owner/repo: ${parsedUrl}`);
  }

  const repo = repoSegments.at(-1);
  const owner = repoSegments.slice(0, -1).join('/');
  const branchName = dashIndex >= 0 && pathSegments[dashIndex + 1] === 'tree' && pathSegments.length > dashIndex + 2
    ? decodeURIComponent(pathSegments.slice(dashIndex + 2).join('/'))
    : 'main';

  return {
    provider: 'gitlab',
    owner,
    repo,
    repoSlug: `${owner}/${repo}`,
    branchName,
    canonicalUrl: `https://gitlab.com/${owner}/${repo}`,
  };
}
