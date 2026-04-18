import { createReplaySource } from './sourceRegistry.js';
import { normalizeTimestamp } from './types.js';

const GITHUB_API_BASE_URL = 'https://api.github.com';

export function createCollaborationOverlaySource(input) {
  const provider = input.provider || 'github';
  const owner = String(input.owner || '').trim();
  const repo = String(input.repo || '').trim();

  if (!owner || !repo) {
    throw new Error('collaboration overlay source requires owner and repo');
  }

  const branchName = String(input.branchName || input.defaultBranch || 'main').trim() || 'main';
  const repoSlug = `${owner}/${repo}`;
  const visibility = input.visibility || (input.accessToken ? 'private' : 'public');

  return createReplaySource({
    sourceType: 'forge-collaboration',
    provider,
    visibility,
    owner,
    repo,
    repoSlug,
    branchName,
    canonicalUrl: input.canonicalUrl || `https://github.com/${repoSlug}`,
    sourceLabel: input.sourceLabel || repoSlug,
    targetPathOrId: input.targetPathOrId || repoSlug,
    metadata: {
      apiBaseUrl: input.apiBaseUrl || `${GITHUB_API_BASE_URL}/repos/${repoSlug}`,
      defaultBranch: input.defaultBranch || branchName,
    },
  });
}

export async function loadCollaborationOverlayEvents(input) {
  const fetchImpl = input.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') {
    throw new Error('collaboration overlay adapter requires a fetch implementation');
  }

  const source = createCollaborationOverlaySource(input);
  const maxPullRequests = toPositiveInteger(input.maxPullRequests, 10);
  const apiBaseUrl = source.metadata.apiBaseUrl || `${GITHUB_API_BASE_URL}/repos/${source.repoSlug}`;
  const headers = buildHeaders(input.accessToken);
  const pullsUrl = `${apiBaseUrl}/pulls?state=all&sort=updated&direction=desc&head=${encodeURIComponent(`${source.owner}:${source.branchName}`)}&per_page=${maxPullRequests}`;
  const pulls = await fetchJson(fetchImpl, pullsUrl, headers, 'collaboration overlay pull listing failed');

  const matchingPulls = pulls
    .filter((pull) => isMatchingPullRequest(pull, source))
    .sort(compareByCreatedAtDesc);

  const eventGroups = await Promise.all(
    matchingPulls.map(async (pullRequest) => {
      const [reviews, issueComments, reviewComments] = await Promise.all([
        fetchJson(
          fetchImpl,
          `${apiBaseUrl}/pulls/${pullRequest.number}/reviews?per_page=${toPositiveInteger(input.maxReviewsPerPullRequest, 100)}`,
          headers,
          `collaboration overlay reviews failed for pr ${pullRequest.number}`,
        ),
        fetchJson(
          fetchImpl,
          `${apiBaseUrl}/issues/${pullRequest.number}/comments?per_page=${toPositiveInteger(input.maxIssueCommentsPerPullRequest, 100)}`,
          headers,
          `collaboration overlay issue comments failed for pr ${pullRequest.number}`,
        ),
        fetchJson(
          fetchImpl,
          `${apiBaseUrl}/pulls/${pullRequest.number}/comments?per_page=${toPositiveInteger(input.maxReviewCommentsPerPullRequest, 100)}`,
          headers,
          `collaboration overlay review comments failed for pr ${pullRequest.number}`,
        ),
      ]);

      return [
        mapPullRequestToOverlayEvent(pullRequest, source),
        ...reviews.map((review) => mapReviewToOverlayEvent(review, pullRequest, source)).filter(Boolean),
        ...issueComments.map((comment) => mapIssueCommentToOverlayEvent(comment, pullRequest, source)),
        ...reviewComments.map((comment) => mapReviewCommentToOverlayEvent(comment, pullRequest, source)),
      ];
    }),
  );

  return eventGroups
    .flat()
    .sort(compareOverlayEvents);
}

export function mapPullRequestToOverlayEvent(pullRequest, source) {
  const timestamp = normalizeTimestamp(pullRequest.created_at);
  return {
    eventId: `github:pr-open:${pullRequest.id || pullRequest.number}`,
    sourceType: 'forge-collaboration',
    repoId: source.repoSlug,
    sourceLabel: source.sourceLabel,
    eventType: 'pr-open',
    timestamp,
    actor: pullRequest.user?.login || 'unknown',
    branchName: pullRequest.head?.ref || source.branchName,
    prNumber: pullRequest.number,
    title: pullRequest.title || `Pull request #${pullRequest.number}`,
    message: pullRequest.body || pullRequest.title || `Pull request #${pullRequest.number}`,
    changedFiles: [],
    filesChanged: 0,
    linesAdded: 0,
    linesDeleted: 0,
    provider: source.provider,
    visibility: source.visibility,
    sourceUrl: pullRequest.html_url || `${source.canonicalUrl}/pull/${pullRequest.number}`,
    reviewDecision: null,
    weight: 1.25,
  };
}

export function mapReviewToOverlayEvent(review, pullRequest, source) {
  const eventType = mapGitHubReviewState(review.state);
  if (!eventType) {
    return null;
  }

  const timestamp = normalizeTimestamp(review.submitted_at || review.updated_at || review.created_at);
  const message = String(review.body || '').trim() || review.state || 'review';

  return {
    eventId: `github:${eventType}:${review.id}`,
    sourceType: 'forge-collaboration',
    repoId: source.repoSlug,
    sourceLabel: source.sourceLabel,
    eventType,
    timestamp,
    actor: review.user?.login || 'unknown',
    branchName: pullRequest.head?.ref || source.branchName,
    prNumber: pullRequest.number,
    title: pullRequest.title || `Pull request #${pullRequest.number}`,
    message,
    changedFiles: [],
    filesChanged: 0,
    linesAdded: 0,
    linesDeleted: 0,
    provider: source.provider,
    visibility: source.visibility,
    sourceUrl: review.html_url || pullRequest.html_url || `${source.canonicalUrl}/pull/${pullRequest.number}`,
    reviewDecision: review.state || null,
    weight: eventType === 'review-approve' ? 1.2 : 1.1,
  };
}

export function mapIssueCommentToOverlayEvent(comment, pullRequest, source) {
  const timestamp = normalizeTimestamp(comment.created_at || comment.updated_at);
  const message = String(comment.body || '').trim() || 'comment';

  return {
    eventId: `github:review-comment:issue-${comment.id}`,
    sourceType: 'forge-collaboration',
    repoId: source.repoSlug,
    sourceLabel: source.sourceLabel,
    eventType: 'review-comment',
    timestamp,
    actor: comment.user?.login || 'unknown',
    branchName: pullRequest.head?.ref || source.branchName,
    prNumber: pullRequest.number,
    title: pullRequest.title || `Pull request #${pullRequest.number}`,
    message,
    changedFiles: [],
    filesChanged: 0,
    linesAdded: 0,
    linesDeleted: 0,
    provider: source.provider,
    visibility: source.visibility,
    sourceUrl: comment.html_url || pullRequest.html_url || `${source.canonicalUrl}/pull/${pullRequest.number}`,
    reviewDecision: null,
    weight: 1,
  };
}

export function mapReviewCommentToOverlayEvent(comment, pullRequest, source) {
  const timestamp = normalizeTimestamp(comment.created_at || comment.updated_at);
  const message = String(comment.body || '').trim() || 'comment';
  const changedFiles = comment.path ? [comment.path] : [];

  return {
    eventId: `github:review-comment:review-${comment.id}`,
    sourceType: 'forge-collaboration',
    repoId: source.repoSlug,
    sourceLabel: source.sourceLabel,
    eventType: 'review-comment',
    timestamp,
    actor: comment.user?.login || 'unknown',
    branchName: pullRequest.head?.ref || source.branchName,
    prNumber: pullRequest.number,
    title: pullRequest.title || `Pull request #${pullRequest.number}`,
    message,
    changedFiles,
    filesChanged: changedFiles.length,
    linesAdded: 0,
    linesDeleted: 0,
    provider: source.provider,
    visibility: source.visibility,
    sourceUrl: comment.html_url || pullRequest.html_url || `${source.canonicalUrl}/pull/${pullRequest.number}`,
    reviewDecision: null,
    weight: 1.05,
  };
}

function buildHeaders(accessToken) {
  const headers = {
    accept: 'application/vnd.github+json',
  };

  if (accessToken) {
    headers.authorization = `Bearer ${accessToken}`;
  }

  return headers;
}

async function fetchJson(fetchImpl, url, headers, errorPrefix) {
  const response = await fetchImpl(url, { headers });
  if (!response.ok) {
    throw new Error(`${errorPrefix}: ${response.status}`);
  }

  return response.json();
}

function isMatchingPullRequest(pullRequest, source) {
  return pullRequest?.head?.ref === source.branchName
    && pullRequest?.head?.repo?.full_name === source.repoSlug;
}

function mapGitHubReviewState(state) {
  const normalizedState = String(state || '').trim().toUpperCase();

  if (normalizedState === 'APPROVED') {
    return 'review-approve';
  }

  if (normalizedState === 'CHANGES_REQUESTED') {
    return 'review-request-changes';
  }

  if (normalizedState === 'COMMENTED') {
    return 'review-comment';
  }

  return null;
}

function compareByCreatedAtDesc(left, right) {
  return new Date(right.created_at || 0).getTime() - new Date(left.created_at || 0).getTime();
}

function compareOverlayEvents(left, right) {
  const timestampDelta = new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime();
  if (timestampDelta !== 0) {
    return timestampDelta;
  }

  return String(left.eventId).localeCompare(String(right.eventId));
}

function toPositiveInteger(value, fallback) {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}
