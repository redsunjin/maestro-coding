import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createPublicRepoSource,
  loadPublicRepoReplayEvents,
  mapGitHubCommitToReplayEvent,
  mapGitLabCommitToReplayEvent,
  parsePublicRepositoryUrl,
} from '../src/lib/publicRepoAdapter.js';
import { GITHUB_COMMIT_DETAIL_FIXTURES, GITHUB_COMMIT_LIST_FIXTURE } from './fixtures/publicGitHubFixture.mjs';
import {
  GITLAB_COMMIT_DETAIL_FIXTURES,
  GITLAB_COMMIT_DIFF_FIXTURES,
  GITLAB_COMMIT_LIST_FIXTURE,
} from './fixtures/publicGitLabFixture.mjs';

test('parsePublicRepositoryUrl normalizes github public repository URLs', () => {
  const parsed = parsePublicRepositoryUrl('https://github.com/openai/maestro-player/tree/main');

  assert.equal(parsed.provider, 'github');
  assert.equal(parsed.owner, 'openai');
  assert.equal(parsed.repo, 'maestro-player');
  assert.equal(parsed.branchName, 'main');
  assert.equal(parsed.canonicalUrl, 'https://github.com/openai/maestro-player');
});

test('parsePublicRepositoryUrl normalizes gitlab public repository URLs with subgroup paths', () => {
  const parsed = parsePublicRepositoryUrl('https://gitlab.com/openai/platform/maestro-player/-/tree/feature/cadence');

  assert.equal(parsed.provider, 'gitlab');
  assert.equal(parsed.owner, 'openai/platform');
  assert.equal(parsed.repo, 'maestro-player');
  assert.equal(parsed.repoSlug, 'openai/platform/maestro-player');
  assert.equal(parsed.branchName, 'feature/cadence');
  assert.equal(parsed.canonicalUrl, 'https://gitlab.com/openai/platform/maestro-player');
});

test('parsePublicRepositoryUrl normalizes gitlab merge request URLs back to the repository root', () => {
  const parsed = parsePublicRepositoryUrl('https://gitlab.com/openai/platform/maestro-player/-/merge_requests/42');

  assert.equal(parsed.provider, 'gitlab');
  assert.equal(parsed.owner, 'openai/platform');
  assert.equal(parsed.repo, 'maestro-player');
  assert.equal(parsed.repoSlug, 'openai/platform/maestro-player');
  assert.equal(parsed.branchName, 'main');
  assert.equal(parsed.canonicalUrl, 'https://gitlab.com/openai/platform/maestro-player');
});

test('createPublicRepoSource registers a public replay source', () => {
  const source = createPublicRepoSource({
    url: 'https://github.com/openai/maestro-player',
  });

  assert.equal(source.sourceType, 'git-public-url');
  assert.equal(source.provider, 'github');
  assert.equal(source.visibility, 'public');
  assert.equal(source.repoSlug, 'openai/maestro-player');
  assert.equal(source.branchName, 'main');
});

test('createPublicRepoSource registers a gitlab public replay source', () => {
  const source = createPublicRepoSource({
    url: 'https://gitlab.com/openai/platform/maestro-player',
  });

  assert.equal(source.sourceType, 'git-public-url');
  assert.equal(source.provider, 'gitlab');
  assert.equal(source.visibility, 'public');
  assert.equal(source.repoSlug, 'openai/platform/maestro-player');
  assert.equal(source.branchName, 'main');
});

test('mapGitHubCommitToReplayEvent creates normalized replay events for public repos', () => {
  const source = createPublicRepoSource({
    url: 'https://github.com/openai/maestro-player',
  });
  const replayEvent = mapGitHubCommitToReplayEvent(GITHUB_COMMIT_DETAIL_FIXTURES['public-commit-1'], source);

  assert.equal(replayEvent.sourceType, 'git-public-url');
  assert.equal(replayEvent.eventType, 'commit');
  assert.equal(replayEvent.actor, 'Open Source Dev');
  assert.equal(replayEvent.filesChanged, 2);
  assert.equal(replayEvent.newFileCount, 1);
  assert.ok(replayEvent.changedFiles.includes('new:src/player/motif.js'));
});

test('mapGitLabCommitToReplayEvent creates normalized replay events for public repos', () => {
  const source = createPublicRepoSource({
    url: 'https://gitlab.com/openai/platform/maestro-player',
  });
  const replayEvent = mapGitLabCommitToReplayEvent(
    GITLAB_COMMIT_DETAIL_FIXTURES['gitlab-public-commit-1'],
    GITLAB_COMMIT_DIFF_FIXTURES['gitlab-public-commit-1'],
    source,
  );

  assert.equal(replayEvent.sourceType, 'git-public-url');
  assert.equal(replayEvent.eventType, 'commit');
  assert.equal(replayEvent.actor, 'GitLab Dev');
  assert.equal(replayEvent.filesChanged, 2);
  assert.equal(replayEvent.newFileCount, 1);
  assert.ok(replayEvent.changedFiles.includes('new:src/player/mr-theme.js'));
});

test('loadPublicRepoReplayEvents loads commit and merge events through mocked github responses', async () => {
  const requestedUrls = [];
  const fetchImpl = async (url) => {
    requestedUrls.push(url);

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

  const replayEvents = await loadPublicRepoReplayEvents({
    url: 'https://github.com/openai/maestro-player',
    maxCommits: 2,
    fetchImpl,
  });

  assert.equal(replayEvents.length, 2);
  assert.equal(replayEvents[0].eventType, 'commit');
  assert.equal(replayEvents[1].eventType, 'merge');
  assert.ok(requestedUrls[0].includes('https://api.github.com/repos/openai/maestro-player/commits?sha=main&per_page=2'));
});

test('loadPublicRepoReplayEvents loads commit and merge events through mocked gitlab responses', async () => {
  const requestedUrls = [];
  const fetchImpl = async (url) => {
    requestedUrls.push(url);

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

  const replayEvents = await loadPublicRepoReplayEvents({
    url: 'https://gitlab.com/openai/platform/maestro-player',
    maxCommits: 2,
    fetchImpl,
  });

  assert.equal(replayEvents.length, 2);
  assert.equal(replayEvents[0].eventType, 'commit');
  assert.equal(replayEvents[1].eventType, 'merge');
  assert.ok(requestedUrls[0].includes('https://gitlab.com/api/v4/projects/openai%2Fplatform%2Fmaestro-player/repository/commits?ref_name=main&per_page=2'));
});
