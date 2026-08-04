import test from 'node:test';
import assert from 'node:assert/strict';

import {
  maybeParsePublicRepositoryUrl,
  parsePublicRepositoryUrl,
} from '../extension/lib/repoUrl.js';

test('extension repo url helper canonicalizes github pull request URLs', () => {
  const parsed = parsePublicRepositoryUrl('https://github.com/openai/maestro/pull/12/files');

  assert.equal(parsed.provider, 'github');
  assert.equal(parsed.repoSlug, 'openai/maestro');
  assert.equal(parsed.branchName, 'main');
  assert.equal(parsed.canonicalUrl, 'https://github.com/openai/maestro');
});

test('extension repo url helper keeps gitlab subgroup tree branches intact', () => {
  const parsed = parsePublicRepositoryUrl('https://gitlab.com/openai/platform/maestro-player/-/tree/feature/cadence');

  assert.equal(parsed.provider, 'gitlab');
  assert.equal(parsed.repoSlug, 'openai/platform/maestro-player');
  assert.equal(parsed.branchName, 'feature/cadence');
  assert.equal(parsed.canonicalUrl, 'https://gitlab.com/openai/platform/maestro-player');
});

test('extension repo url helper canonicalizes gitlab merge request URLs', () => {
  const parsed = parsePublicRepositoryUrl('https://gitlab.com/openai/platform/maestro-player/-/merge_requests/42');

  assert.equal(parsed.provider, 'gitlab');
  assert.equal(parsed.repoSlug, 'openai/platform/maestro-player');
  assert.equal(parsed.branchName, 'main');
  assert.equal(parsed.canonicalUrl, 'https://gitlab.com/openai/platform/maestro-player');
});

test('extension repo url helper rejects unsupported hosts without throwing from maybeParse', () => {
  const parsed = maybeParsePublicRepositoryUrl('https://example.com/openai/maestro-player');

  assert.equal(parsed, null);
});
