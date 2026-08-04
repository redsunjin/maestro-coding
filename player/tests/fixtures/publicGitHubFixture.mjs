export const GITHUB_COMMIT_LIST_FIXTURE = [
  {
    sha: 'public-commit-1',
  },
  {
    sha: 'public-merge-2',
  },
];

export const GITHUB_COMMIT_DETAIL_FIXTURES = {
  'public-commit-1': {
    sha: 'public-commit-1',
    parents: [{ sha: 'root-1' }],
    commit: {
      author: {
        name: 'Open Source Dev',
        date: '2026-04-18T00:00:00Z',
      },
      message: 'feat: add replay intro theme\n\nintroduce branch intro motif',
    },
    stats: {
      total: 42,
      additions: 36,
      deletions: 6,
    },
    files: [
      {
        filename: 'src/player/intro.js',
        status: 'modified',
      },
      {
        filename: 'src/player/motif.js',
        status: 'added',
      },
    ],
  },
  'public-merge-2': {
    sha: 'public-merge-2',
    parents: [{ sha: 'root-2' }, { sha: 'feature-branch-2' }],
    commit: {
      author: {
        name: 'Maintainer',
        date: '2026-04-18T01:00:00Z',
      },
      message: 'Merge pull request #81 from contributor/feature-song',
    },
    stats: {
      total: 12,
      additions: 10,
      deletions: 2,
    },
    files: [
      {
        filename: 'src/player/intro.js',
        status: 'modified',
      },
    ],
  },
};
