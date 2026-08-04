export const GITLAB_COMMIT_LIST_FIXTURE = [
  {
    id: 'gitlab-public-commit-1',
  },
  {
    id: 'gitlab-public-merge-2',
  },
];

export const GITLAB_COMMIT_DETAIL_FIXTURES = {
  'gitlab-public-commit-1': {
    id: 'gitlab-public-commit-1',
    short_id: 'gitlabpub1',
    title: 'feat: add merge request groove',
    message: 'feat: add merge request groove\n\nintroduce gitlab motif layer',
    authored_date: '2026-04-18T02:00:00Z',
    committed_date: '2026-04-18T02:00:00Z',
    author_name: 'GitLab Dev',
    parent_ids: ['gl-root-1'],
    stats: {
      total: 26,
      additions: 20,
      deletions: 6,
    },
  },
  'gitlab-public-merge-2': {
    id: 'gitlab-public-merge-2',
    short_id: 'gitlabpub2',
    title: "Merge branch 'feature/cadence' into 'main'",
    message: "Merge branch 'feature/cadence' into 'main'",
    authored_date: '2026-04-18T03:00:00Z',
    committed_date: '2026-04-18T03:00:00Z',
    author_name: 'GitLab Maintainer',
    parent_ids: ['gl-root-2', 'gl-feature-2'],
    stats: {
      total: 9,
      additions: 7,
      deletions: 2,
    },
  },
};

export const GITLAB_COMMIT_DIFF_FIXTURES = {
  'gitlab-public-commit-1': [
    {
      new_path: 'src/player/glide.js',
      old_path: 'src/player/glide.js',
      new_file: false,
    },
    {
      new_path: 'src/player/mr-theme.js',
      old_path: 'src/player/mr-theme.js',
      new_file: true,
    },
  ],
  'gitlab-public-merge-2': [
    {
      new_path: 'src/player/glide.js',
      old_path: 'src/player/glide.js',
      new_file: false,
    },
  ],
};
