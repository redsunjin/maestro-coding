import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createConnectedAccountRepoSource,
  listConnectedGithubRepositories,
  loadConnectedAccountReplayEvents,
} from '../src/lib/accountRepoAdapter.js';
import { GITHUB_COMMIT_DETAIL_FIXTURES, GITHUB_COMMIT_LIST_FIXTURE } from './fixtures/publicGitHubFixture.mjs';
import { GITHUB_ACCOUNT_REPOS_FIXTURE } from './fixtures/githubAccountFixture.mjs';

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
