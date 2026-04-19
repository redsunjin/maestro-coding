import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createCollaborationOverlaySource,
  loadCollaborationOverlayEvents,
  mapPullRequestToOverlayEvent,
  mapReviewCommentToOverlayEvent,
  mapReviewToOverlayEvent,
} from '../src/lib/collaborationOverlayAdapter.js';
import {
  GITHUB_PULL_REQUEST_ISSUE_COMMENT_FIXTURES,
  GITHUB_PULL_REQUEST_LIST_FIXTURE,
  GITHUB_PULL_REQUEST_REVIEW_COMMENT_FIXTURES,
  GITHUB_PULL_REQUEST_REVIEW_FIXTURES,
  GITLAB_MERGE_REQUEST_APPROVAL_FIXTURES,
  GITLAB_MERGE_REQUEST_LIST_FIXTURE,
  GITLAB_MERGE_REQUEST_NOTE_FIXTURES,
} from './fixtures/collaborationOverlayFixture.mjs';

test('createCollaborationOverlaySource registers a forge collaboration source', () => {
  const source = createCollaborationOverlaySource({
    owner: 'openai',
    repo: 'maestro-player',
    branchName: 'feature/cadence',
  });

  assert.equal(source.sourceType, 'forge-collaboration');
  assert.equal(source.provider, 'github');
  assert.equal(source.visibility, 'public');
  assert.equal(source.repoSlug, 'openai/maestro-player');
  assert.equal(source.branchName, 'feature/cadence');
  assert.equal(source.metadata.apiBaseUrl, 'https://api.github.com/repos/openai/maestro-player');
});

test('createCollaborationOverlaySource registers a gitlab collaboration source', () => {
  const source = createCollaborationOverlaySource({
    provider: 'gitlab',
    owner: 'openai/platform',
    repo: 'maestro-player',
    branchName: 'feature/cadence',
  });

  assert.equal(source.sourceType, 'forge-collaboration');
  assert.equal(source.provider, 'gitlab');
  assert.equal(source.visibility, 'public');
  assert.equal(source.repoSlug, 'openai/platform/maestro-player');
  assert.equal(source.branchName, 'feature/cadence');
  assert.equal(source.metadata.apiBaseUrl, 'https://gitlab.com/api/v4/projects/openai%2Fplatform%2Fmaestro-player');
});

test('mapPullRequestToOverlayEvent normalizes PR open events', () => {
  const source = createCollaborationOverlaySource({
    owner: 'openai',
    repo: 'maestro-player',
    branchName: 'feature/cadence',
  });
  const event = mapPullRequestToOverlayEvent(GITHUB_PULL_REQUEST_LIST_FIXTURE[1], source);

  assert.equal(event.eventType, 'pr-open');
  assert.equal(event.actor, 'contributor');
  assert.equal(event.prNumber, 81);
  assert.equal(event.branchName, 'feature/cadence');
  assert.equal(event.timestamp, '2026-04-17T09:00:00.000Z');
});

test('mapPullRequestToOverlayEvent normalizes gitlab merge request open events', () => {
  const source = createCollaborationOverlaySource({
    provider: 'gitlab',
    owner: 'openai',
    repo: 'maestro-player',
    branchName: 'feature/cadence',
  });
  const event = mapPullRequestToOverlayEvent(GITLAB_MERGE_REQUEST_LIST_FIXTURE[1], source);

  assert.equal(event.eventType, 'pr-open');
  assert.equal(event.actor, 'gitlab-contributor');
  assert.equal(event.prNumber, 11);
  assert.equal(event.branchName, 'feature/cadence');
  assert.equal(event.timestamp, '2026-04-17T09:00:00.000Z');
});

test('mapReviewToOverlayEvent maps review states to overlay event types', () => {
  const source = createCollaborationOverlaySource({
    owner: 'openai',
    repo: 'maestro-player',
    branchName: 'feature/cadence',
  });
  const pullRequest = GITHUB_PULL_REQUEST_LIST_FIXTURE[1];

  const requestChangesEvent = mapReviewToOverlayEvent(GITHUB_PULL_REQUEST_REVIEW_FIXTURES[81][0], pullRequest, source);
  const approveEvent = mapReviewToOverlayEvent(GITHUB_PULL_REQUEST_REVIEW_FIXTURES[81][1], pullRequest, source);
  const dismissedEvent = mapReviewToOverlayEvent(GITHUB_PULL_REQUEST_REVIEW_FIXTURES[81][2], pullRequest, source);

  assert.equal(requestChangesEvent.eventType, 'review-request-changes');
  assert.equal(approveEvent.eventType, 'review-approve');
  assert.equal(dismissedEvent, null);
});

test('mapReviewToOverlayEvent maps gitlab approvals to review-approve events', () => {
  const source = createCollaborationOverlaySource({
    provider: 'gitlab',
    owner: 'openai',
    repo: 'maestro-player',
    branchName: 'feature/cadence',
  });
  const mergeRequest = GITLAB_MERGE_REQUEST_LIST_FIXTURE[1];
  const approval = GITLAB_MERGE_REQUEST_APPROVAL_FIXTURES[11].approved_by[0];
  const event = mapReviewToOverlayEvent(approval, mergeRequest, source);

  assert.equal(event.eventType, 'review-approve');
  assert.equal(event.actor, 'gitlab-approver');
  assert.equal(event.prNumber, 11);
});

test('mapReviewCommentToOverlayEvent preserves file context for diff comments', () => {
  const source = createCollaborationOverlaySource({
    owner: 'openai',
    repo: 'maestro-player',
    branchName: 'feature/cadence',
  });
  const pullRequest = GITHUB_PULL_REQUEST_LIST_FIXTURE[1];
  const event = mapReviewCommentToOverlayEvent(
    GITHUB_PULL_REQUEST_REVIEW_COMMENT_FIXTURES[81][0],
    pullRequest,
    source,
  );

  assert.equal(event.eventType, 'review-comment');
  assert.deepEqual(event.changedFiles, ['src/audio/bridge.js']);
  assert.equal(event.filesChanged, 1);
});

test('mapReviewCommentToOverlayEvent maps gitlab notes and preserves file context when present', () => {
  const source = createCollaborationOverlaySource({
    provider: 'gitlab',
    owner: 'openai',
    repo: 'maestro-player',
    branchName: 'feature/cadence',
  });
  const mergeRequest = GITLAB_MERGE_REQUEST_LIST_FIXTURE[1];
  const event = mapReviewCommentToOverlayEvent(
    GITLAB_MERGE_REQUEST_NOTE_FIXTURES[11][2],
    mergeRequest,
    source,
  );

  assert.equal(event.eventType, 'review-comment');
  assert.deepEqual(event.changedFiles, ['src/audio/gitlab-bridge.js']);
  assert.equal(event.filesChanged, 1);
});

test('loadCollaborationOverlayEvents loads deterministic branch-scoped collaboration events without auth', async () => {
  const capturedRequests = [];
  const fetchImpl = async (url, options) => {
    capturedRequests.push({ url, options });

    if (String(url).includes('/pulls?')) {
      return {
        ok: true,
        json: async () => GITHUB_PULL_REQUEST_LIST_FIXTURE,
      };
    }

    if (String(url).includes('/pulls/81/reviews')) {
      return {
        ok: true,
        json: async () => GITHUB_PULL_REQUEST_REVIEW_FIXTURES[81],
      };
    }

    if (String(url).includes('/issues/81/comments')) {
      return {
        ok: true,
        json: async () => GITHUB_PULL_REQUEST_ISSUE_COMMENT_FIXTURES[81],
      };
    }

    if (String(url).includes('/pulls/81/comments')) {
      return {
        ok: true,
        json: async () => GITHUB_PULL_REQUEST_REVIEW_COMMENT_FIXTURES[81],
      };
    }

    throw new Error(`unexpected url: ${url}`);
  };

  const events = await loadCollaborationOverlayEvents({
    owner: 'openai',
    repo: 'maestro-player',
    branchName: 'feature/cadence',
    fetchImpl,
  });

  assert.deepEqual(
    events.map((event) => event.eventType),
    ['pr-open', 'review-request-changes', 'review-comment', 'review-comment', 'review-approve'],
  );
  assert.deepEqual(
    events.map((event) => event.timestamp),
    [
      '2026-04-17T09:00:00.000Z',
      '2026-04-17T09:10:00.000Z',
      '2026-04-17T09:11:00.000Z',
      '2026-04-17T09:12:00.000Z',
      '2026-04-17T09:18:00.000Z',
    ],
  );
  assert.ok(capturedRequests[0].url.includes('head=openai%3Afeature%2Fcadence'));
  assert.equal(capturedRequests[0].options.headers.authorization, undefined);
  assert.ok(events.every((event) => event.branchName === 'feature/cadence'));
});

test('loadCollaborationOverlayEvents loads gitlab merge request notes without auth', async () => {
  const capturedRequests = [];
  const fetchImpl = async (url, options) => {
    capturedRequests.push({ url, options });

    if (String(url).includes('/merge_requests?')) {
      return {
        ok: true,
        json: async () => GITLAB_MERGE_REQUEST_LIST_FIXTURE,
      };
    }

    if (String(url).includes('/merge_requests/11/notes')) {
      return {
        ok: true,
        json: async () => GITLAB_MERGE_REQUEST_NOTE_FIXTURES[11],
      };
    }

    throw new Error(`unexpected url: ${url}`);
  };

  const events = await loadCollaborationOverlayEvents({
    provider: 'gitlab',
    owner: 'openai',
    repo: 'maestro-player',
    branchName: 'feature/cadence',
    fetchImpl,
  });

  assert.deepEqual(
    events.map((event) => event.eventType),
    ['pr-open', 'review-comment', 'review-comment'],
  );
  assert.deepEqual(
    events.map((event) => event.timestamp),
    [
      '2026-04-17T09:00:00.000Z',
      '2026-04-17T09:11:00.000Z',
      '2026-04-17T09:13:00.000Z',
    ],
  );
  assert.ok(capturedRequests[0].url.includes('source_branch=feature%2Fcadence'));
  assert.equal(capturedRequests[0].options.headers['PRIVATE-TOKEN'], undefined);
  assert.ok(events.every((event) => event.branchName === 'feature/cadence'));
});

test('loadCollaborationOverlayEvents adds authorization headers for authenticated github requests', async () => {
  const capturedRequests = [];
  const fetchImpl = async (url, options) => {
    capturedRequests.push({ url, options });

    if (String(url).includes('/pulls?')) {
      return {
        ok: true,
        json: async () => [GITHUB_PULL_REQUEST_LIST_FIXTURE[1]],
      };
    }

    return {
      ok: true,
      json: async () => [],
    };
  };

  const events = await loadCollaborationOverlayEvents({
    owner: 'openai',
    repo: 'maestro-player',
    branchName: 'feature/cadence',
    accessToken: 'secret-token',
    fetchImpl,
  });

  assert.equal(events.length, 1);
  assert.equal(events[0].visibility, 'private');
  assert.ok(capturedRequests.every((request) => request.options.headers.authorization === 'Bearer secret-token'));
});

test('loadCollaborationOverlayEvents loads gitlab approvals with private token authentication', async () => {
  const capturedRequests = [];
  const fetchImpl = async (url, options) => {
    capturedRequests.push({ url, options });

    if (String(url).includes('/merge_requests?')) {
      return {
        ok: true,
        json: async () => [GITLAB_MERGE_REQUEST_LIST_FIXTURE[1]],
      };
    }

    if (String(url).includes('/merge_requests/11/notes')) {
      return {
        ok: true,
        json: async () => GITLAB_MERGE_REQUEST_NOTE_FIXTURES[11],
      };
    }

    if (String(url).includes('/merge_requests/11/approvals')) {
      return {
        ok: true,
        json: async () => GITLAB_MERGE_REQUEST_APPROVAL_FIXTURES[11],
      };
    }

    throw new Error(`unexpected url: ${url}`);
  };

  const events = await loadCollaborationOverlayEvents({
    provider: 'gitlab',
    owner: 'openai',
    repo: 'maestro-player',
    branchName: 'feature/cadence',
    accessToken: 'gitlab-secret',
    fetchImpl,
  });

  assert.deepEqual(
    events.map((event) => event.eventType),
    ['pr-open', 'review-comment', 'review-comment', 'review-approve'],
  );
  assert.equal(events.at(-1).visibility, 'private');
  assert.ok(capturedRequests.every((request) => request.options.headers['PRIVATE-TOKEN'] === 'gitlab-secret'));
});
