import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createConnectedAccountRepoSource,
  listConnectedRepositories,
  listConnectedGithubRepositories,
  listConnectedGitlabRepositories,
  loadConnectedAccountReplayEvents,
} from '../src/lib/accountRepoAdapter.js';
import { GITHUB_COMMIT_DETAIL_FIXTURES, GITHUB_COMMIT_LIST_FIXTURE } from './fixtures/publicGitHubFixture.mjs';
import { GITHUB_ACCOUNT_REPOS_FIXTURE } from './fixtures/githubAccountFixture.mjs';
import {
  GITLAB_COMMIT_DETAIL_FIXTURES,
  GITLAB_COMMIT_DIFF_FIXTURES,
  GITLAB_COMMIT_LIST_FIXTURE,
} from './fixtures/publicGitLabFixture.mjs';
import { GITLAB_ACCOUNT_REPOS_FIXTURE } from './fixtures/gitlabAccountFixture.mjs';

test('listConnectedGithubRepositories normalizes repo selections from the connected account', async () => {
  const capturedRequests = [];
  const repositories = await listConnectedGithubRepositories({
    accessToken: 'test-token',
    fetchImpl: async (url, options) => {
      capturedRequests.push({ url, options });
      return {
        ok: true,
        json: async () => GITHUB_ACCOUNT_REPOS_FIXTURE,
      };
    },
  });

  assert.equal(repositories.length, 2);
  assert.equal(repositories[0].repoSlug, 'agent/private-player-repo');
  assert.equal(repositories[0].visibility, 'private');
  assert.equal(repositories[1].defaultBranch, 'develop');
  assert.equal(capturedRequests[0].options.headers.authorization, 'Bearer test-token');
});

test('listConnectedRepositories dispatches gitlab repo listing and normalizes namespace paths', async () => {
  const capturedRequests = [];
  const repositories = await listConnectedRepositories({
    provider: 'gitlab',
    accessToken: 'gitlab-token',
    fetchImpl: async (url, options) => {
      capturedRequests.push({ url, options });
      return {
        ok: true,
        json: async () => GITLAB_ACCOUNT_REPOS_FIXTURE,
      };
    },
  });

  assert.equal(repositories.length, 2);
  assert.equal(repositories[0].provider, 'gitlab');
  assert.equal(repositories[1].repoSlug, 'agent/platform/group-player-repo');
  assert.equal(capturedRequests[0].options.headers['PRIVATE-TOKEN'], 'gitlab-token');
});

test('listConnectedGitlabRepositories lists gitlab projects with a private token header', async () => {
  const repositories = await listConnectedGitlabRepositories({
    accessToken: 'gitlab-token',
    fetchImpl: async () => ({
      ok: true,
      json: async () => GITLAB_ACCOUNT_REPOS_FIXTURE,
    }),
  });

  assert.equal(repositories[0].owner, 'agent');
  assert.equal(repositories[1].defaultBranch, 'develop');
});

test('createConnectedAccountRepoSource creates a git-account replay source', () => {
  const source = createConnectedAccountRepoSource({
    owner: 'agent',
    repo: 'private-player-repo',
    repoId: 101,
    accountId: 'github-user-1',
    defaultBranch: 'main',
    visibility: 'private',
  });

  assert.equal(source.sourceType, 'git-account');
  assert.equal(source.provider, 'github');
  assert.equal(source.visibility, 'private');
  assert.equal(source.repoSlug, 'agent/private-player-repo');
  assert.equal(source.branchName, 'main');
});

test('createConnectedAccountRepoSource preserves gitlab provider metadata', () => {
  const source = createConnectedAccountRepoSource({
    provider: 'gitlab',
    owner: 'agent/platform',
    repo: 'group-player-repo',
    repoId: 502,
    accountId: 'gitlab-user-1',
    defaultBranch: 'develop',
    visibility: 'internal',
  });

  assert.equal(source.sourceType, 'git-account');
  assert.equal(source.provider, 'gitlab');
  assert.equal(source.visibility, 'internal');
  assert.equal(source.repoSlug, 'agent/platform/group-player-repo');
  assert.equal(source.branchName, 'develop');
});

test('loadConnectedAccountReplayEvents loads replay events with authenticated github requests', async () => {
  const capturedRequests = [];
  const fetchImpl = async (url, options) => {
    capturedRequests.push({ url, options });

    if (String(url).includes('/commits?')) {
      return {
        ok: true,
        json: async () => GITHUB_COMMIT_LIST_FIXTURE,
      };
    }

    const sha = String(url).split('/').at(-1);
    return {
      ok: true,
      json: async () => GITHUB_COMMIT_DETAIL_FIXTURES[sha],
    };
  };

  const replayEvents = await loadConnectedAccountReplayEvents({
    owner: 'agent',
    repo: 'private-player-repo',
    branchName: 'main',
    visibility: 'private',
    accessToken: 'test-token',
    fetchImpl,
    maxCommits: 2,
  });

  assert.equal(replayEvents.length, 2);
  assert.equal(replayEvents[0].sourceType, 'git-account');
  assert.equal(replayEvents[0].visibility, 'private');
  assert.equal(replayEvents[1].eventType, 'merge');
  assert.ok(capturedRequests.every((request) => request.options.headers.authorization === 'Bearer test-token'));
});

test('loadConnectedAccountReplayEvents loads gitlab replay events with private token authentication', async () => {
  const capturedRequests = [];
  const fetchImpl = async (url, options) => {
    capturedRequests.push({ url, options });

    if (String(url).includes('/repository/commits?')) {
      return {
        ok: true,
        json: async () => GITLAB_COMMIT_LIST_FIXTURE,
      };
    }

    if (String(url).endsWith('/diff')) {
      const sha = String(url).split('/').at(-2).split('?')[0];
      return {
        ok: true,
        json: async () => GITLAB_COMMIT_DIFF_FIXTURES[sha],
      };
    }

    const sha = String(url).split('/').at(-1).split('?')[0];
    return {
      ok: true,
      json: async () => GITLAB_COMMIT_DETAIL_FIXTURES[sha],
    };
  };

  const replayEvents = await loadConnectedAccountReplayEvents({
    provider: 'gitlab',
    owner: 'agent/platform',
    repo: 'group-player-repo',
    branchName: 'develop',
    visibility: 'internal',
    accessToken: 'gitlab-token',
    fetchImpl,
    maxCommits: 2,
  });

  assert.equal(replayEvents.length, 2);
  assert.equal(replayEvents[0].sourceType, 'git-account');
  assert.equal(replayEvents[0].provider, 'gitlab');
  assert.equal(replayEvents[1].eventType, 'merge');
  assert.ok(capturedRequests.every((request) => request.options.headers['PRIVATE-TOKEN'] === 'gitlab-token'));
});
