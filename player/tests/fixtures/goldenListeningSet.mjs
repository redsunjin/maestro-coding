import {
  mapDiscussionToOverlayEvents,
  mapIssueCommentToOverlayEvent,
  mapPullRequestToOverlayEvent,
  mapReviewCommentToOverlayEvent,
  mapReviewToOverlayEvent,
  createCollaborationOverlaySource,
} from '../../src/lib/collaborationOverlayAdapter.js';
import {
  createPublicRepoSource,
  mapGitHubCommitToReplayEvent,
  mapGitLabCommitToReplayEvent,
} from '../../src/lib/publicRepoAdapter.js';
import {
  GITHUB_PULL_REQUEST_ISSUE_COMMENT_FIXTURES,
  GITHUB_PULL_REQUEST_LIST_FIXTURE,
  GITHUB_PULL_REQUEST_REVIEW_COMMENT_FIXTURES,
  GITHUB_PULL_REQUEST_REVIEW_FIXTURES,
  GITLAB_MERGE_REQUEST_APPROVAL_FIXTURES,
  GITLAB_MERGE_REQUEST_DISCUSSION_FIXTURES,
  GITLAB_MERGE_REQUEST_LIST_FIXTURE,
} from './collaborationOverlayFixture.mjs';
import { GITHUB_COMMIT_DETAIL_FIXTURES } from './publicGitHubFixture.mjs';
import {
  GITLAB_COMMIT_DETAIL_FIXTURES,
  GITLAB_COMMIT_DIFF_FIXTURES,
} from './publicGitLabFixture.mjs';

export function buildGoldenListeningScenarios() {
  return [
    {
      id: 'github-public-pr-cadence',
      label: 'GitHub Public PR Cadence',
      provider: 'github',
      sourceUrl: 'https://github.com/openai/maestro-player/tree/feature/cadence',
      listeningFocus: [
        'Feature intro motif should establish quickly.',
        'Request-changes should create the clearest tension peak.',
        'Approval and merge should sound like separate release stages.',
      ],
      events: buildGitHubPublicCadenceEvents(),
    },
    {
      id: 'gitlab-public-discussion-resolution',
      label: 'GitLab Public Discussion Resolution',
      provider: 'gitlab',
      sourceUrl: 'https://gitlab.com/openai/maestro-player/-/tree/feature/cadence',
      listeningFocus: [
        'Discussion reopen should feel like tension returning after partial release.',
        'Resolved discussion should be softer than final merge closure.',
        'Approval should not overshadow the final merge cadence.',
      ],
      events: buildGitLabPublicDiscussionEvents(),
    },
    {
      id: 'transition-overlay-practice',
      label: 'Transition Overlay Practice',
      provider: 'hybrid',
      sourceUrl: 'fixture://transition-overlay-practice',
      listeningFocus: [
        'Push should behave like a short fill, not a new melody lead.',
        'Sync should sound like re-centering rather than escalation.',
        'Merge should still dominate as the clearest ending.',
      ],
      events: buildTransitionValidationFixture(),
    },
  ];
}

export function buildTransitionValidationFixture() {
  return [
    {
      eventId: 'mv-commit-1',
      eventType: 'commit',
      repoId: 'maestro-player-validation',
      branchName: 'feature/validation-song',
      prNumber: 142,
      timestamp: '2026-04-20T01:00:00.000Z',
      message: 'feat: add harmonic replay opening',
      changedFiles: ['src/audio/opening.js', 'src/audio/theme.js', 'new:src/audio/fills.js'],
      filesChanged: 3,
      linesAdded: 84,
      linesDeleted: 12,
      newFileCount: 1,
      newDirectoryCount: 1,
    },
    {
      eventId: 'mv-push-1',
      eventType: 'push',
      repoId: 'maestro-player-validation',
      branchName: 'feature/validation-song',
      prNumber: 142,
      timestamp: '2026-04-20T01:04:00.000Z',
      message: 'push latest branch build',
      changedFiles: ['src/audio/fills.js'],
      filesChanged: 1,
      linesAdded: 8,
      linesDeleted: 0,
    },
    {
      eventId: 'mv-review-1',
      eventType: 'review-request-changes',
      repoId: 'maestro-player-validation',
      branchName: 'feature/validation-song',
      prNumber: 142,
      timestamp: '2026-04-20T01:07:00.000Z',
      message: 'needs stronger tension before merge',
      changedFiles: ['src/audio/theme.js'],
      filesChanged: 1,
      linesAdded: 4,
      linesDeleted: 14,
    },
    {
      eventId: 'mv-resolve-1',
      eventType: 'review-resolve',
      repoId: 'maestro-player-validation',
      branchName: 'feature/validation-song',
      prNumber: 142,
      timestamp: '2026-04-20T01:10:00.000Z',
      message: 'resolved after cadence fix',
      changedFiles: ['src/audio/theme.js'],
      filesChanged: 1,
      linesAdded: 6,
      linesDeleted: 2,
    },
    {
      eventId: 'mv-sync-1',
      eventType: 'sync',
      repoId: 'maestro-player-validation',
      branchName: 'feature/validation-song',
      prNumber: 142,
      timestamp: '2026-04-20T01:12:00.000Z',
      message: 'sync latest main before approval',
      changedFiles: ['src/audio/theme.js', 'src/chart/view.js'],
      filesChanged: 2,
      linesAdded: 5,
      linesDeleted: 3,
    },
    {
      eventId: 'mv-approve-1',
      eventType: 'review-approve',
      repoId: 'maestro-player-validation',
      branchName: 'feature/validation-song',
      prNumber: 142,
      timestamp: '2026-04-20T01:15:00.000Z',
      message: 'approved after retest',
      successfulChecks: 4,
      changedFiles: ['src/audio/theme.js'],
      filesChanged: 1,
      linesAdded: 2,
      linesDeleted: 1,
    },
    {
      eventId: 'mv-merge-1',
      eventType: 'merge',
      repoId: 'maestro-player-validation',
      branchName: 'main',
      prNumber: 142,
      timestamp: '2026-04-20T01:18:00.000Z',
      message: 'Merge pull request #142 from feature/validation-song',
      changedFiles: ['src/audio/opening.js', 'src/audio/theme.js'],
      filesChanged: 2,
      linesAdded: 9,
      linesDeleted: 2,
    },
  ];
}

function buildGitHubPublicCadenceEvents() {
  const source = createPublicRepoSource({
    url: 'https://github.com/openai/maestro-player/tree/feature/cadence',
  });
  const overlaySource = createCollaborationOverlaySource({
    provider: 'github',
    owner: 'openai',
    repo: 'maestro-player',
    branchName: 'feature/cadence',
    canonicalUrl: source.canonicalUrl,
  });
  const pullRequest = GITHUB_PULL_REQUEST_LIST_FIXTURE[1];
  const commitEvents = Object.values(GITHUB_COMMIT_DETAIL_FIXTURES).map((detail) => (
    mapGitHubCommitToReplayEvent(detail, source)
  ));
  const overlayEvents = [
    mapPullRequestToOverlayEvent(pullRequest, overlaySource),
    ...GITHUB_PULL_REQUEST_REVIEW_FIXTURES[81]
      .map((review) => mapReviewToOverlayEvent(review, pullRequest, overlaySource))
      .filter(Boolean),
    ...GITHUB_PULL_REQUEST_ISSUE_COMMENT_FIXTURES[81]
      .map((comment) => mapIssueCommentToOverlayEvent(comment, pullRequest, overlaySource)),
    ...GITHUB_PULL_REQUEST_REVIEW_COMMENT_FIXTURES[81]
      .map((comment) => mapReviewCommentToOverlayEvent(comment, pullRequest, overlaySource)),
  ];

  return sortEvents([...commitEvents, ...overlayEvents]);
}

function buildGitLabPublicDiscussionEvents() {
  const source = createPublicRepoSource({
    url: 'https://gitlab.com/openai/maestro-player/-/tree/feature/cadence',
  });
  const overlaySource = createCollaborationOverlaySource({
    provider: 'gitlab',
    owner: 'openai',
    repo: 'maestro-player',
    branchName: 'feature/cadence',
    canonicalUrl: source.canonicalUrl,
  });
  const mergeRequest = GITLAB_MERGE_REQUEST_LIST_FIXTURE[1];
  const commitEvents = Object.entries(GITLAB_COMMIT_DETAIL_FIXTURES).map(([sha, detail]) => (
    mapGitLabCommitToReplayEvent(detail, GITLAB_COMMIT_DIFF_FIXTURES[sha], source)
  ));
  const discussionEvents = GITLAB_MERGE_REQUEST_DISCUSSION_FIXTURES[11]
    .flatMap((discussion) => mapDiscussionToOverlayEvents(discussion, mergeRequest, overlaySource))
    .filter(Boolean);
  const approvalEvents = GITLAB_MERGE_REQUEST_APPROVAL_FIXTURES[11]
    .approved_by
    .map((approval, index) => mapReviewToOverlayEvent(approval, mergeRequest, overlaySource, index))
    .filter(Boolean);
  const overlayEvents = [
    mapPullRequestToOverlayEvent(mergeRequest, overlaySource),
    ...discussionEvents,
    ...approvalEvents,
  ];

  return sortEvents([...commitEvents, ...overlayEvents]);
}

function sortEvents(events) {
  return [...events].sort((left, right) => String(left.timestamp || '').localeCompare(String(right.timestamp || '')));
}
