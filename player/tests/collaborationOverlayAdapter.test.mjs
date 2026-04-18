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
