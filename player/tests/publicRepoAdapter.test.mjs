import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createPublicRepoSource,
  loadPublicRepoReplayEvents,
  mapGitHubCommitToReplayEvent,
  parsePublicRepositoryUrl,
} from '../src/lib/publicRepoAdapter.js';
import { GITHUB_COMMIT_DETAIL_FIXTURES, GITHUB_COMMIT_LIST_FIXTURE } from './fixtures/publicGitHubFixture.mjs';

test('parsePublicRepositoryUrl normalizes github public repository URLs', () => {
  const parsed = parsePublicRepositoryUrl('https://github.com/openai/maestro-player/tree/main');

  assert.equal(parsed.provider, 'github');
  assert.equal(parsed.owner, 'openai');
  assert.equal(parsed.repo, 'maestro-player');
  assert.equal(parsed.branchName, 'main');
  assert.equal(parsed.canonicalUrl, 'https://github.com/openai/maestro-player');
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
