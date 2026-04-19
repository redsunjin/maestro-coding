import { createElement } from 'react';
import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';

import { GITHUB_ACCOUNT_REPOS_FIXTURE } from '../../tests/fixtures/githubAccountFixture.mjs';
import { GITLAB_ACCOUNT_REPOS_FIXTURE } from '../../tests/fixtures/gitlabAccountFixture.mjs';
import {
  GITHUB_PULL_REQUEST_ISSUE_COMMENT_FIXTURES,
  GITHUB_PULL_REQUEST_LIST_FIXTURE,
  GITHUB_PULL_REQUEST_REVIEW_COMMENT_FIXTURES,
  GITHUB_PULL_REQUEST_REVIEW_FIXTURES,
  GITLAB_MERGE_REQUEST_APPROVAL_FIXTURES,
  GITLAB_MERGE_REQUEST_LIST_FIXTURE,
  GITLAB_MERGE_REQUEST_NOTE_FIXTURES,
} from '../../tests/fixtures/collaborationOverlayFixture.mjs';
import {
  GITHUB_COMMIT_DETAIL_FIXTURES,
  GITHUB_COMMIT_LIST_FIXTURE,
} from '../../tests/fixtures/publicGitHubFixture.mjs';
import {
  GITLAB_COMMIT_DETAIL_FIXTURES,
  GITLAB_COMMIT_DIFF_FIXTURES,
  GITLAB_COMMIT_LIST_FIXTURE,
} from '../../tests/fixtures/publicGitLabFixture.mjs';

const originalFetch = globalThis.fetch;
const originalLocalRepoBridgeEntries = new Map();
const GITHUB_API_ORIGIN = 'https://api.github.com';
const GITLAB_API_ORIGIN = 'https://gitlab.com';
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

function matchGitlabProjectRoute(url) {
  const pathSegments = url.pathname.split('/').filter(Boolean);

  if (pathSegments[0] !== 'api' || pathSegments[1] !== 'v4' || pathSegments[2] !== 'projects') {
    return null;
  }

  if (pathSegments.length === 3) {
    return {
      type: 'project-list',
    };
  }

  const projectPath = decodeURIComponent(pathSegments[3] || '');

  if (pathSegments.length === 5 && pathSegments[4] === 'merge_requests') {
    return {
      type: 'merge-request-list',
      repoSlug: projectPath,
      branchName: url.searchParams.get('source_branch'),
    };
  }

  if (pathSegments.length === 6 && pathSegments[4] === 'repository' && pathSegments[5] === 'commits') {
    return {
      type: 'commit-list',
      repoSlug: projectPath,
    };
  }

  if (pathSegments.length === 7 && pathSegments[4] === 'repository' && pathSegments[5] === 'commits') {
    return {
      type: 'commit-detail',
      repoSlug: projectPath,
      sha: decodeURIComponent(pathSegments[6]).split('?')[0],
    };
  }

  if (pathSegments.length === 8 && pathSegments[4] === 'repository' && pathSegments[5] === 'commits' && pathSegments[7] === 'diff') {
    return {
      type: 'commit-diff',
      repoSlug: projectPath,
      sha: decodeURIComponent(pathSegments[6]).split('?')[0],
    };
  }

  if (pathSegments.length === 7 && pathSegments[4] === 'merge_requests' && pathSegments[6] === 'notes') {
    return {
      type: 'merge-request-notes',
      repoSlug: projectPath,
      mergeRequestIid: Number(pathSegments[5]),
    };
  }

  if (pathSegments.length === 7 && pathSegments[4] === 'merge_requests' && pathSegments[6] === 'approvals') {
    return {
      type: 'merge-request-approvals',
      repoSlug: projectPath,
      mergeRequestIid: Number(pathSegments[5]),
    };
  }

  return null;
}

export function createPlayerAppUiHarness(options = {}) {
  const fixtures = {
    publicRepoSlug: options.publicRepoSlug || 'openai/maestro-player',
    publicBranch: options.publicBranch || 'feature/cadence',
    publicProvider: options.publicProvider || 'github',
    gitlabPublicRepoSlug: options.gitlabPublicRepoSlug || 'openai/platform/maestro-player',
    gitlabPublicBranch: options.gitlabPublicBranch || 'feature/cadence',
    accountToken: options.accountToken || 'ghp_test_token',
    accountProvider: options.accountProvider || 'github',
    gitlabAccountToken: options.gitlabAccountToken || 'glpat_test_token',
    accountRepos: cloneFixture(options.accountRepos || GITHUB_ACCOUNT_REPOS_FIXTURE),
    gitlabAccountRepos: cloneFixture(options.gitlabAccountRepos || GITLAB_ACCOUNT_REPOS_FIXTURE),
    commitList: cloneFixture(options.commitList || GITHUB_COMMIT_LIST_FIXTURE),
    commitDetails: cloneFixture(options.commitDetails || GITHUB_COMMIT_DETAIL_FIXTURES),
    gitlabCommitList: cloneFixture(options.gitlabCommitList || GITLAB_COMMIT_LIST_FIXTURE),
    gitlabCommitDetails: cloneFixture(options.gitlabCommitDetails || GITLAB_COMMIT_DETAIL_FIXTURES),
    gitlabCommitDiffs: cloneFixture(options.gitlabCommitDiffs || GITLAB_COMMIT_DIFF_FIXTURES),
    pullRequests: cloneFixture(options.pullRequests || GITHUB_PULL_REQUEST_LIST_FIXTURE),
    pullRequestReviews: cloneFixture(options.pullRequestReviews || GITHUB_PULL_REQUEST_REVIEW_FIXTURES),
    pullRequestIssueComments: cloneFixture(options.pullRequestIssueComments || GITHUB_PULL_REQUEST_ISSUE_COMMENT_FIXTURES),
    pullRequestReviewComments: cloneFixture(options.pullRequestReviewComments || GITHUB_PULL_REQUEST_REVIEW_COMMENT_FIXTURES),
    gitlabMergeRequests: cloneFixture(options.gitlabMergeRequests || GITLAB_MERGE_REQUEST_LIST_FIXTURE),
    gitlabMergeRequestNotes: cloneFixture(options.gitlabMergeRequestNotes || GITLAB_MERGE_REQUEST_NOTE_FIXTURES),
    gitlabMergeRequestApprovals: cloneFixture(options.gitlabMergeRequestApprovals || GITLAB_MERGE_REQUEST_APPROVAL_FIXTURES),
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

  fixtures.publicRepoUrl = options.publicRepoUrl || (
    fixtures.publicProvider === 'gitlab'
      ? `https://gitlab.com/${fixtures.gitlabPublicRepoSlug}`
      : `https://github.com/${fixtures.publicRepoSlug}`
  );
  fixtures.accountRepoSlug = options.accountRepoSlug || fixtures.accountRepos[1]?.full_name || fixtures.accountRepos[0]?.full_name;
  fixtures.gitlabAccountRepoSlug = options.gitlabAccountRepoSlug
    || fixtures.gitlabAccountRepos[1]?.path_with_namespace
    || fixtures.gitlabAccountRepos[0]?.path_with_namespace;
  fixtures.accountBranch = options.accountBranch
    || fixtures.accountRepos.find((repository) => repository.full_name === fixtures.accountRepoSlug)?.default_branch
    || 'main';
  fixtures.gitlabAccountBranch = options.gitlabAccountBranch
    || fixtures.gitlabAccountRepos.find((repository) => repository.path_with_namespace === fixtures.gitlabAccountRepoSlug)?.default_branch
    || 'main';
  fixtures.publicEventCount = fixtures.commitList.length + countOverlayEventsForBranch(fixtures.publicRepoSlug, fixtures.publicBranch, fixtures);
  fixtures.accountEventCount = fixtures.commitList.length + countOverlayEventsForBranch(fixtures.accountRepoSlug, fixtures.accountBranch, fixtures);
  fixtures.gitlabPublicEventCount = fixtures.gitlabCommitList.length + countGitlabOverlayEventsForBranch(fixtures.gitlabPublicRepoSlug, fixtures.gitlabPublicBranch, fixtures, false);
  fixtures.gitlabAccountEventCount = fixtures.gitlabCommitList.length + countGitlabOverlayEventsForBranch(fixtures.gitlabAccountRepoSlug, fixtures.gitlabAccountBranch, fixtures, true);
  fixtures.localEventCount = fixtures.localBridgeEvents.length;

  const requestLog = [];
  const bridgeLog = [];
  const privateRepoSlugs = new Set(fixtures.accountRepos.map((repository) => repository.full_name));
  const privateGitlabRepoSlugs = new Set(
    fixtures.gitlabAccountRepos
      .filter((repository) => repository.visibility !== 'public')
      .map((repository) => repository.path_with_namespace),
  );
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

    if (parsedUrl.origin === GITHUB_API_ORIGIN && parsedUrl.pathname === '/user/repos') {
      const authorization = getHeader(init, 'authorization');
      if (authorization !== `Bearer ${fixtures.accountToken}`) {
        return createFetchJsonResponse({ message: 'Unauthorized' }, 401);
      }

      return createFetchJsonResponse(fixtures.accountRepos);
    }

    if (parsedUrl.origin === GITHUB_API_ORIGIN) {
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
    }

    if (parsedUrl.origin === GITLAB_API_ORIGIN) {
      const projectRoute = matchGitlabProjectRoute(parsedUrl);
      if (!projectRoute) {
        return createFetchJsonResponse({ message: `unhandled gitlab route: ${parsedUrl.pathname}` }, 404);
      }

      if (projectRoute.type === 'project-list') {
        const privateToken = getHeader(init, 'PRIVATE-TOKEN');
        if (privateToken !== fixtures.gitlabAccountToken) {
          return createFetchJsonResponse({ message: 'Unauthorized' }, 401);
        }

        return createFetchJsonResponse(fixtures.gitlabAccountRepos);
      }

      if (privateGitlabRepoSlugs.has(projectRoute.repoSlug)) {
        const privateToken = getHeader(init, 'PRIVATE-TOKEN');
        if (privateToken !== fixtures.gitlabAccountToken) {
          return createFetchJsonResponse({ message: 'Unauthorized' }, 401);
        }
      }

      if (projectRoute.type === 'commit-list') {
        return createFetchJsonResponse(fixtures.gitlabCommitList);
      }

      if (projectRoute.type === 'commit-detail') {
        return createFetchJsonResponse(fixtures.gitlabCommitDetails[projectRoute.sha]);
      }

      if (projectRoute.type === 'commit-diff') {
        return createFetchJsonResponse(fixtures.gitlabCommitDiffs[projectRoute.sha] || []);
      }

      if (projectRoute.type === 'merge-request-list') {
        return createFetchJsonResponse(selectGitlabMergeRequestsForRoute(projectRoute, fixtures));
      }

      if (projectRoute.type === 'merge-request-notes') {
        return createFetchJsonResponse(fixtures.gitlabMergeRequestNotes[projectRoute.mergeRequestIid] || []);
      }

      if (projectRoute.type === 'merge-request-approvals') {
        return createFetchJsonResponse(fixtures.gitlabMergeRequestApprovals[projectRoute.mergeRequestIid] || { approved_by: [] });
      }

      return createFetchJsonResponse({ message: `unhandled gitlab route: ${parsedUrl.pathname}` }, 404);
    }

    return createFetchJsonResponse({ message: `unhandled fetch origin: ${parsedUrl.origin}` }, 404);
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

function selectGitlabMergeRequestsForRoute(route, fixtures) {
  return fixtures.gitlabMergeRequests.filter((mergeRequest) => (
    mergeRequest.source_branch === route.branchName
    && String(mergeRequest.web_url || '').startsWith(`https://gitlab.com/${route.repoSlug}/-/merge_requests/`)
  ));
}

function countGitlabOverlayEventsForBranch(repoSlug, branchName, fixtures, includeApprovals) {
  const matchingMergeRequests = fixtures.gitlabMergeRequests.filter((mergeRequest) => (
    mergeRequest.source_branch === branchName
    && String(mergeRequest.web_url || '').startsWith(`https://gitlab.com/${repoSlug}/-/merge_requests/`)
  ));

  return matchingMergeRequests.reduce((count, mergeRequest) => {
    const notes = (fixtures.gitlabMergeRequestNotes[mergeRequest.iid] || []).filter((note) => !note.system);
    const approvals = includeApprovals
      ? (fixtures.gitlabMergeRequestApprovals[mergeRequest.iid]?.approved_by || []).length
      : 0;

    return count + 1 + notes.length + approvals;
  }, 0);
}
