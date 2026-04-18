import { createElement } from 'react';
import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';

import { GITHUB_ACCOUNT_REPOS_FIXTURE } from '../../tests/fixtures/githubAccountFixture.mjs';
import {
  GITHUB_PULL_REQUEST_ISSUE_COMMENT_FIXTURES,
  GITHUB_PULL_REQUEST_LIST_FIXTURE,
  GITHUB_PULL_REQUEST_REVIEW_COMMENT_FIXTURES,
  GITHUB_PULL_REQUEST_REVIEW_FIXTURES,
} from '../../tests/fixtures/collaborationOverlayFixture.mjs';
import {
  GITHUB_COMMIT_DETAIL_FIXTURES,
  GITHUB_COMMIT_LIST_FIXTURE,
} from '../../tests/fixtures/publicGitHubFixture.mjs';

const originalFetch = globalThis.fetch;
const originalLocalRepoBridgeEntries = new Map();
const GITHUB_API_ORIGIN = 'https://api.github.com';
const LOCAL_REPO_BRIDGE_KEYS = [
  '__MAESTRO_PLAYER_LOCAL_REPO_BRIDGE__',
  'maestroPlayerLocalRepoBridge',
  'maestroLocalRepoBridge',
];

function cloneFixture(value) {
  return JSON.parse(JSON.stringify(value));
}

function createFetchJsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => cloneFixture(body),
  };
}

function getHeader(init, name) {
  const headers = init?.headers;
  const normalizedName = name.toLowerCase();

  if (!headers) {
    return null;
  }

  if (typeof headers.get === 'function') {
    return headers.get(name) ?? headers.get(normalizedName);
  }

  if (Array.isArray(headers)) {
    const matched = headers.find(([headerName]) => String(headerName).toLowerCase() === normalizedName);
    return matched ? matched[1] : null;
  }

  const matched = Object.entries(headers).find(([headerName]) => headerName.toLowerCase() === normalizedName);
  return matched ? matched[1] : null;
}

function matchGithubRepoRoute(url) {
  const pathSegments = url.pathname.split('/').filter(Boolean);

  if (pathSegments.length === 4 && pathSegments[0] === 'repos' && pathSegments[3] === 'pulls') {
    return {
      type: 'pull-list',
      repoSlug: `${pathSegments[1]}/${pathSegments[2]}`,
      head: url.searchParams.get('head'),
    };
  }

  if (pathSegments.length === 4 && pathSegments[0] === 'repos' && pathSegments[3] === 'commits') {
    return {
      type: 'commit-list',
      repoSlug: `${pathSegments[1]}/${pathSegments[2]}`,
    };
  }

  if (pathSegments.length === 5 && pathSegments[0] === 'repos' && pathSegments[3] === 'commits') {
    return {
      type: 'commit-detail',
      repoSlug: `${pathSegments[1]}/${pathSegments[2]}`,
      sha: pathSegments[4],
    };
  }

  if (pathSegments.length === 6 && pathSegments[0] === 'repos' && pathSegments[3] === 'pulls' && pathSegments[5] === 'reviews') {
    return {
      type: 'pull-reviews',
      repoSlug: `${pathSegments[1]}/${pathSegments[2]}`,
      pullNumber: Number(pathSegments[4]),
    };
  }

  if (pathSegments.length === 6 && pathSegments[0] === 'repos' && pathSegments[3] === 'issues' && pathSegments[5] === 'comments') {
    return {
      type: 'issue-comments',
      repoSlug: `${pathSegments[1]}/${pathSegments[2]}`,
      pullNumber: Number(pathSegments[4]),
    };
  }

  if (pathSegments.length === 6 && pathSegments[0] === 'repos' && pathSegments[3] === 'pulls' && pathSegments[5] === 'comments') {
    return {
      type: 'review-comments',
      repoSlug: `${pathSegments[1]}/${pathSegments[2]}`,
      pullNumber: Number(pathSegments[4]),
    };
  }

  return null;
}

export function createPlayerAppUiHarness(options = {}) {
  const fixtures = {
    publicRepoSlug: options.publicRepoSlug || 'openai/maestro-player',
    publicBranch: options.publicBranch || 'feature/cadence',
    accountToken: options.accountToken || 'ghp_test_token',
    accountRepos: cloneFixture(options.accountRepos || GITHUB_ACCOUNT_REPOS_FIXTURE),
    commitList: cloneFixture(options.commitList || GITHUB_COMMIT_LIST_FIXTURE),
    commitDetails: cloneFixture(options.commitDetails || GITHUB_COMMIT_DETAIL_FIXTURES),
    pullRequests: cloneFixture(options.pullRequests || GITHUB_PULL_REQUEST_LIST_FIXTURE),
    pullRequestReviews: cloneFixture(options.pullRequestReviews || GITHUB_PULL_REQUEST_REVIEW_FIXTURES),
    pullRequestIssueComments: cloneFixture(options.pullRequestIssueComments || GITHUB_PULL_REQUEST_ISSUE_COMMENT_FIXTURES),
    pullRequestReviewComments: cloneFixture(options.pullRequestReviewComments || GITHUB_PULL_REQUEST_REVIEW_COMMENT_FIXTURES),
    localRepoPath: options.localRepoPath || '/Users/Agent/projects/local-player',
    localBranch: options.localBranch || 'feature/local-bridge',
    localBridgeEvents: cloneFixture(options.localBridgeEvents || [
      {
        eventId: 'local-commit-1',
        eventType: 'commit',
        timestamp: '2026-04-18T03:00:00Z',
        actor: 'Local Agent',
        branchName: 'feature/local-bridge',
        commitSha: 'local-abc123',
        title: 'feat: local bridge playback',
        message: 'feat: local bridge playback',
        changedFiles: ['src/local/bridge.js'],
        filesChanged: 1,
        linesAdded: 12,
        linesDeleted: 3,
      },
      {
        eventId: 'local-merge-2',
        eventType: 'merge',
        timestamp: '2026-04-18T03:10:00Z',
        actor: 'Local Agent',
        branchName: 'feature/local-bridge',
        commitSha: 'local-def456',
        title: 'Merge local playback branch',
        message: 'Merge local playback branch',
        changedFiles: ['src/local/bridge.js', 'src/local/theme.js'],
        filesChanged: 2,
        linesAdded: 8,
        linesDeleted: 1,
      },
    ]),
  };

  fixtures.publicRepoUrl = options.publicRepoUrl || `https://github.com/${fixtures.publicRepoSlug}`;
  fixtures.accountRepoSlug = options.accountRepoSlug || fixtures.accountRepos[1]?.full_name || fixtures.accountRepos[0]?.full_name;
  fixtures.accountBranch = options.accountBranch
    || fixtures.accountRepos.find((repository) => repository.full_name === fixtures.accountRepoSlug)?.default_branch
    || 'main';
  fixtures.publicEventCount = fixtures.commitList.length + countOverlayEventsForBranch(fixtures.publicRepoSlug, fixtures.publicBranch, fixtures);
  fixtures.accountEventCount = fixtures.commitList.length + countOverlayEventsForBranch(fixtures.accountRepoSlug, fixtures.accountBranch, fixtures);
  fixtures.localEventCount = fixtures.localBridgeEvents.length;

  const requestLog = [];
  const bridgeLog = [];
  const privateRepoSlugs = new Set(fixtures.accountRepos.map((repository) => repository.full_name));
  const localRepoBridge = {
    async loadLocalRepoReplayEvents(request) {
      bridgeLog.push(request);
      return {
        source: {
          repoPath: request.repoPath,
          branchName: request.branchName || fixtures.localBranch,
          repoId: 'local-player',
          sourceLabel: request.sourceLabel || request.repoPath,
          name: 'ui-harness-local-bridge',
          version: '0.1.0-test',
        },
        events: fixtures.localBridgeEvents.map((event) => ({
          ...event,
          branchName: request.branchName || event.branchName,
        })),
      };
    },
  };

  const fetchMock = vi.fn(async (input, init = {}) => {
    const requestUrl = typeof input === 'string' ? input : input?.url || String(input);
    const parsedUrl = new URL(requestUrl);
    requestLog.push({
      url: parsedUrl.toString(),
      init,
    });

    if (parsedUrl.origin !== GITHUB_API_ORIGIN) {
      return createFetchJsonResponse({ message: `unhandled fetch origin: ${parsedUrl.origin}` }, 404);
    }

    if (parsedUrl.pathname === '/user/repos') {
      const authorization = getHeader(init, 'authorization');
      if (authorization !== `Bearer ${fixtures.accountToken}`) {
        return createFetchJsonResponse({ message: 'Unauthorized' }, 401);
      }

      return createFetchJsonResponse(fixtures.accountRepos);
    }

    const repoRoute = matchGithubRepoRoute(parsedUrl);
    if (!repoRoute) {
      return createFetchJsonResponse({ message: `unhandled github route: ${parsedUrl.pathname}` }, 404);
    }

    if (privateRepoSlugs.has(repoRoute.repoSlug)) {
      const authorization = getHeader(init, 'authorization');
      if (authorization !== `Bearer ${fixtures.accountToken}`) {
        return createFetchJsonResponse({ message: 'Unauthorized' }, 401);
      }
    }

    if (repoRoute.type === 'commit-list') {
      return createFetchJsonResponse(fixtures.commitList);
    }

    if (repoRoute.type === 'pull-list') {
      return createFetchJsonResponse(selectPullRequestsForRoute(repoRoute, fixtures));
    }

    if (repoRoute.type === 'pull-reviews') {
      return createFetchJsonResponse(fixtures.pullRequestReviews[repoRoute.pullNumber] || []);
    }

    if (repoRoute.type === 'issue-comments') {
      return createFetchJsonResponse(fixtures.pullRequestIssueComments[repoRoute.pullNumber] || []);
    }

    if (repoRoute.type === 'review-comments') {
      return createFetchJsonResponse(fixtures.pullRequestReviewComments[repoRoute.pullNumber] || []);
    }

    const detailFixture = fixtures.commitDetails[repoRoute.sha];
    if (!detailFixture) {
      return createFetchJsonResponse({ message: `missing commit detail fixture: ${repoRoute.sha}` }, 404);
    }

    return createFetchJsonResponse(detailFixture);
  });

  return {
    fixtures,
    fetchMock,
    requestLog,
    bridgeLog,
    localRepoBridge,
  };
}

export function setupPlayerAppUiEnvironment(options = {}) {
  const harness = createPlayerAppUiHarness(options);
  globalThis.fetch = harness.fetchMock;
  LOCAL_REPO_BRIDGE_KEYS.forEach((key) => {
    originalLocalRepoBridgeEntries.set(key, globalThis[key]);
    globalThis[key] = harness.localRepoBridge;
  });
  return harness;
}

export function teardownPlayerAppUiEnvironment() {
  vi.restoreAllMocks();
  globalThis.fetch = originalFetch;
  LOCAL_REPO_BRIDGE_KEYS.forEach((key) => {
    const originalValue = originalLocalRepoBridgeEntries.get(key);
    if (typeof originalValue === 'undefined') {
      delete globalThis[key];
    } else {
      globalThis[key] = originalValue;
    }
  });
  originalLocalRepoBridgeEntries.clear();
}

export function renderPlayerApp(AppComponent, options = {}) {
  const harness = setupPlayerAppUiEnvironment(options);

  return {
    ...harness,
    user: userEvent.setup(),
    ...render(createElement(AppComponent)),
  };
}

function selectPullRequestsForRoute(route, fixtures) {
  const head = String(route.head || '');
  const [, branchName = ''] = head.split(':');

  return fixtures.pullRequests.filter((pullRequest) => (
    pullRequest.head?.repo?.full_name === route.repoSlug
    && pullRequest.head?.ref === branchName
  ));
}

function countOverlayEventsForBranch(repoSlug, branchName, fixtures) {
  const matchingPullRequests = fixtures.pullRequests.filter((pullRequest) => (
    pullRequest.head?.repo?.full_name === repoSlug
    && pullRequest.head?.ref === branchName
  ));

  return matchingPullRequests.reduce((count, pullRequest) => {
    const reviews = (fixtures.pullRequestReviews[pullRequest.number] || []).filter((review) => (
      ['APPROVED', 'CHANGES_REQUESTED', 'COMMENTED'].includes(String(review.state || '').toUpperCase())
    ));
    const issueComments = fixtures.pullRequestIssueComments[pullRequest.number] || [];
    const reviewComments = fixtures.pullRequestReviewComments[pullRequest.number] || [];

    return count + 1 + reviews.length + issueComments.length + reviewComments.length;
  }, 0);
}
