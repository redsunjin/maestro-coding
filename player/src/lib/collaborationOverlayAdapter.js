import { createReplaySource } from './sourceRegistry.js';
import { normalizeTimestamp } from './types.js';

const GITHUB_API_BASE_URL = 'https://api.github.com';
const GITLAB_API_BASE_URL = 'https://gitlab.com/api/v4';

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
    canonicalUrl: input.canonicalUrl || buildCanonicalUrl(provider, repoSlug),
    sourceLabel: input.sourceLabel || repoSlug,
    targetPathOrId: input.targetPathOrId || repoSlug,
    metadata: {
      apiBaseUrl: input.apiBaseUrl || buildOverlayApiBaseUrl(provider, repoSlug),
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
  if (source.provider === 'gitlab') {
    return loadGitLabCollaborationOverlayEvents(source, input, fetchImpl);
  }

  return loadGitHubCollaborationOverlayEvents(source, input, fetchImpl);
}

export function mapPullRequestToOverlayEvent(pullRequest, source) {
  if (source.provider === 'gitlab') {
    return mapGitLabMergeRequestToOverlayEvent(pullRequest, source);
  }

  return mapGitHubPullRequestToOverlayEvent(pullRequest, source);
}

export function mapReviewToOverlayEvent(review, pullRequest, source) {
  if (source.provider === 'gitlab') {
    return mapGitLabApprovalToOverlayEvent(review, pullRequest, source);
  }

  return mapGitHubReviewToOverlayEvent(review, pullRequest, source);
}

export function mapIssueCommentToOverlayEvent(comment, pullRequest, source) {
  if (source.provider === 'gitlab') {
    return mapGitLabNoteToOverlayEvent(comment, pullRequest, source);
  }

  return mapGitHubIssueCommentToOverlayEvent(comment, pullRequest, source);
}

export function mapReviewCommentToOverlayEvent(comment, pullRequest, source) {
  if (source.provider === 'gitlab') {
    return mapGitLabNoteToOverlayEvent(comment, pullRequest, source);
  }

  return mapGitHubReviewCommentToOverlayEvent(comment, pullRequest, source);
}

export function mapDiscussionToOverlayEvents(discussion, pullRequest, source) {
  if (source.provider === 'gitlab') {
    return mapGitLabDiscussionToOverlayEvents(discussion, pullRequest, source);
  }

  return [];
}

async function loadGitHubCollaborationOverlayEvents(source, input, fetchImpl) {
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

async function loadGitLabCollaborationOverlayEvents(source, input, fetchImpl) {
  const maxPullRequests = toPositiveInteger(input.maxPullRequests, 10);
  const apiBaseUrl = source.metadata.apiBaseUrl || `${GITLAB_API_BASE_URL}/projects/${encodeURIComponent(source.repoSlug)}`;
  const headers = buildHeaders(input.accessToken, source.provider);
  const mergeRequestsUrl = `${apiBaseUrl}/merge_requests?state=all&source_branch=${encodeURIComponent(source.branchName)}&per_page=${maxPullRequests}&order_by=created_at&sort=desc`;
  const mergeRequests = await fetchJson(fetchImpl, mergeRequestsUrl, headers, 'collaboration overlay merge request listing failed');

  const matchingMergeRequests = mergeRequests
    .filter((mergeRequest) => isMatchingGitLabMergeRequest(mergeRequest, source))
    .sort(compareByCreatedAtDesc);

  const eventGroups = await Promise.all(
    matchingMergeRequests.map(async (mergeRequest) => {
      const discussionPromise = fetchJson(
        fetchImpl,
        `${apiBaseUrl}/merge_requests/${mergeRequest.iid}/discussions?per_page=${toPositiveInteger(input.maxIssueCommentsPerPullRequest, 100)}`,
        headers,
        `collaboration overlay discussions failed for mr ${mergeRequest.iid}`,
      );
      const approvalPromise = input.accessToken
        ? fetchJson(
          fetchImpl,
          `${apiBaseUrl}/merge_requests/${mergeRequest.iid}/approvals`,
          headers,
          `collaboration overlay approvals failed for mr ${mergeRequest.iid}`,
        ).catch(() => ({ approved_by: [] }))
        : Promise.resolve({ approved_by: [] });
      const [discussions, approvals] = await Promise.all([discussionPromise, approvalPromise]);

      return [
        mapGitLabMergeRequestToOverlayEvent(mergeRequest, source),
        ...discussions
          .flatMap((discussion) => mapGitLabDiscussionToOverlayEvents(discussion, mergeRequest, source))
          .filter(Boolean),
        ...normalizeGitLabApprovedBy(approvals)
          .map((approval, index) => mapGitLabApprovalToOverlayEvent(approval, mergeRequest, source, index))
          .filter(Boolean),
      ];
    }),
  );

  return eventGroups
    .flat()
    .sort(compareOverlayEvents);
}

function mapGitHubPullRequestToOverlayEvent(pullRequest, source) {
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

function mapGitHubReviewToOverlayEvent(review, pullRequest, source) {
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

function mapGitHubIssueCommentToOverlayEvent(comment, pullRequest, source) {
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

function mapGitHubReviewCommentToOverlayEvent(comment, pullRequest, source) {
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

function mapGitLabMergeRequestToOverlayEvent(mergeRequest, source) {
  const timestamp = normalizeTimestamp(mergeRequest.created_at);
  return {
    eventId: `gitlab:pr-open:${mergeRequest.id || mergeRequest.iid}`,
    sourceType: 'forge-collaboration',
    repoId: source.repoSlug,
    sourceLabel: source.sourceLabel,
    eventType: 'pr-open',
    timestamp,
    actor: mergeRequest.author?.username || mergeRequest.author?.name || 'unknown',
    branchName: mergeRequest.source_branch || source.branchName,
    prNumber: mergeRequest.iid,
    title: mergeRequest.title || `Merge request !${mergeRequest.iid}`,
    message: mergeRequest.description || mergeRequest.title || `Merge request !${mergeRequest.iid}`,
    changedFiles: [],
    filesChanged: 0,
    linesAdded: 0,
    linesDeleted: 0,
    provider: source.provider,
    visibility: source.visibility,
    sourceUrl: mergeRequest.web_url || `${source.canonicalUrl}/-/merge_requests/${mergeRequest.iid}`,
    reviewDecision: mergeRequest.state || null,
    weight: 1.25,
  };
}

function mapGitLabNoteToOverlayEvent(note, mergeRequest, source) {
  if (!note || note.system) {
    return null;
  }

  const timestamp = normalizeTimestamp(note.created_at || note.updated_at);
  const message = String(note.body || '').trim() || 'comment';
  const changedFiles = note.position?.new_path ? [note.position.new_path] : [];

  return {
    eventId: `gitlab:review-comment:${note.id}`,
    sourceType: 'forge-collaboration',
    repoId: source.repoSlug,
    sourceLabel: source.sourceLabel,
    eventType: 'review-comment',
    timestamp,
    actor: note.author?.username || note.author?.name || 'unknown',
    branchName: mergeRequest.source_branch || source.branchName,
    prNumber: mergeRequest.iid,
    title: mergeRequest.title || `Merge request !${mergeRequest.iid}`,
    message,
    changedFiles,
    filesChanged: changedFiles.length,
    linesAdded: 0,
    linesDeleted: 0,
    provider: source.provider,
    visibility: source.visibility,
    sourceUrl: `${source.canonicalUrl}/-/merge_requests/${mergeRequest.iid}#note_${note.id}`,
    reviewDecision: null,
    weight: changedFiles.length ? 1.05 : 1,
  };
}

function mapGitLabDiscussionToOverlayEvents(discussion, mergeRequest, source) {
  const visibleNotes = coerceNotes(discussion?.notes)
    .filter((note) => note && !note.system)
    .sort(compareByCreatedAtAsc);

  if (visibleNotes.length === 0) {
    return [];
  }

  const resolvableNotes = visibleNotes.filter((note) => note.resolvable);
  if (resolvableNotes.length === 0) {
    return visibleNotes
      .map((note) => mapGitLabNoteToOverlayEvent(note, mergeRequest, source))
      .filter(Boolean);
  }

  const firstResolvable = resolvableNotes[0];
  const events = [
    createGitLabDiscussionStateEvent(firstResolvable, mergeRequest, source, 'review-request-changes'),
  ];

  visibleNotes.forEach((note) => {
    if (!note.resolvable && note.id !== firstResolvable.id) {
      const commentEvent = mapGitLabNoteToOverlayEvent(note, mergeRequest, source);
      if (commentEvent) {
        events.push(commentEvent);
      }
    }
  });

  let currentResolved = false;
  resolvableNotes.forEach((note, index) => {
    const nextResolved = Boolean(note.resolved);

    if (index === 0) {
      if (nextResolved) {
        events.push(createGitLabDiscussionStateEvent(note, mergeRequest, source, 'review-resolve'));
      }
      currentResolved = nextResolved;
      return;
    }

    if (!currentResolved && nextResolved) {
      events.push(createGitLabDiscussionStateEvent(note, mergeRequest, source, 'review-resolve'));
    } else if (currentResolved && !nextResolved) {
      events.push(createGitLabDiscussionStateEvent(note, mergeRequest, source, 'review-reopen'));
    }

    currentResolved = nextResolved;
  });

  return events
    .filter(Boolean)
    .sort(compareOverlayEvents);
}

function createGitLabDiscussionStateEvent(note, mergeRequest, source, eventType) {
  const changedFiles = note?.position?.new_path ? [note.position.new_path] : [];
  const isResolve = eventType === 'review-resolve';
  const timestamp = normalizeTimestamp(
    isResolve
      ? note?.resolved_at || note?.updated_at || note?.created_at
      : note?.created_at || note?.updated_at,
  );
  const actor = isResolve
    ? note?.resolved_by?.username || note?.resolved_by?.name || note?.author?.username || note?.author?.name || 'unknown'
    : note?.author?.username || note?.author?.name || 'unknown';
  const weight = eventType === 'review-request-changes'
    ? 1.12
    : eventType === 'review-reopen'
      ? 1.09
      : 1.15;
  const reviewDecision = eventType === 'review-resolve'
    ? 'RESOLVED'
    : eventType === 'review-reopen'
      ? 'REOPENED'
      : 'CHANGES_REQUESTED';

  return {
    eventId: `gitlab:${eventType}:${note?.id || hashDiscussionEventId(note, mergeRequest, eventType)}`,
    sourceType: 'forge-collaboration',
    repoId: source.repoSlug,
    sourceLabel: source.sourceLabel,
    eventType,
    timestamp,
    actor,
    branchName: mergeRequest.source_branch || source.branchName,
    prNumber: mergeRequest.iid,
    title: mergeRequest.title || `Merge request !${mergeRequest.iid}`,
    message: String(note?.body || '').trim() || defaultDiscussionMessage(eventType),
    changedFiles,
    filesChanged: changedFiles.length,
    linesAdded: 0,
    linesDeleted: 0,
    provider: source.provider,
    visibility: source.visibility,
    sourceUrl: `${source.canonicalUrl}/-/merge_requests/${mergeRequest.iid}#note_${note?.id}`,
    reviewDecision,
    weight,
  };
}

function mapGitLabApprovalToOverlayEvent(approval, mergeRequest, source, fallbackIndex = 0) {
  const approvedBy = approval?.user || approval;
  const timestamp = normalizeTimestamp(approval?.approved_at || approval?.created_at, fallbackIndex);

  return {
    eventId: `gitlab:review-approve:${approval?.id || approvedBy?.id || approvedBy?.username || fallbackIndex}`,
    sourceType: 'forge-collaboration',
    repoId: source.repoSlug,
    sourceLabel: source.sourceLabel,
    eventType: 'review-approve',
    timestamp,
    actor: approvedBy?.username || approvedBy?.name || 'unknown',
    branchName: mergeRequest.source_branch || source.branchName,
    prNumber: mergeRequest.iid,
    title: mergeRequest.title || `Merge request !${mergeRequest.iid}`,
    message: approval?.body || 'Approved merge request',
    changedFiles: [],
    filesChanged: 0,
    linesAdded: 0,
    linesDeleted: 0,
    provider: source.provider,
    visibility: source.visibility,
    sourceUrl: approvedBy?.web_url || `${source.canonicalUrl}/-/merge_requests/${mergeRequest.iid}`,
    reviewDecision: 'APPROVED',
    weight: 1.2,
  };
}

function buildHeaders(accessToken, provider = 'github') {
  const headers = provider === 'gitlab'
    ? {}
    : { accept: 'application/vnd.github+json' };

  if (accessToken) {
    if (provider === 'gitlab') {
      headers['PRIVATE-TOKEN'] = accessToken;
    } else {
      headers.authorization = `Bearer ${accessToken}`;
    }
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

function isMatchingGitLabMergeRequest(mergeRequest, source) {
  return mergeRequest?.source_branch === source.branchName
    && String(mergeRequest?.web_url || '').startsWith(`${source.canonicalUrl}/-/merge_requests/`);
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

function compareByCreatedAtAsc(left, right) {
  return new Date(left.created_at || 0).getTime() - new Date(right.created_at || 0).getTime();
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

function normalizeGitLabApprovedBy(approvalsPayload) {
  const approvedBy = approvalsPayload?.approved_by;
  return Array.isArray(approvedBy) ? approvedBy : [];
}

function coerceNotes(value) {
  return Array.isArray(value) ? value : [];
}

function hashDiscussionEventId(note, mergeRequest, eventType) {
  return [
    mergeRequest?.iid || 'mr',
    note?.discussion_id || note?.id || 'note',
    eventType,
  ].join(':');
}

function defaultDiscussionMessage(eventType) {
  if (eventType === 'review-resolve') {
    return 'Resolved discussion thread';
  }

  if (eventType === 'review-reopen') {
    return 'Reopened discussion thread';
  }

  return 'Discussion requires changes';
}

function buildCanonicalUrl(provider, repoSlug) {
  if (provider === 'gitlab') {
    return `https://gitlab.com/${repoSlug}`;
  }

  return `https://github.com/${repoSlug}`;
}

function buildOverlayApiBaseUrl(provider, repoSlug) {
  if (provider === 'gitlab') {
    return `${GITLAB_API_BASE_URL}/projects/${encodeURIComponent(repoSlug)}`;
  }

  return `${GITHUB_API_BASE_URL}/repos/${repoSlug}`;
}
