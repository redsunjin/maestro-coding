export const GITHUB_PULL_REQUEST_LIST_FIXTURE = [
  {
    id: 9002,
    number: 82,
    title: 'Older branch draft',
    body: 'Older branch work.',
    html_url: 'https://github.com/openai/maestro-player/pull/82',
    created_at: '2026-04-16T08:00:00Z',
    user: {
      login: 'other-contributor',
    },
    head: {
      ref: 'feature/other-branch',
      repo: {
        full_name: 'openai/maestro-player',
      },
    },
  },
  {
    id: 9001,
    number: 81,
    title: 'Feature cadence polish',
    body: 'Improves branch cadence transitions.',
    html_url: 'https://github.com/openai/maestro-player/pull/81',
    created_at: '2026-04-17T09:00:00Z',
    user: {
      login: 'contributor',
    },
    head: {
      ref: 'feature/cadence',
      repo: {
        full_name: 'openai/maestro-player',
      },
    },
  },
];

export const GITHUB_PULL_REQUEST_REVIEW_FIXTURES = {
  81: [
    {
      id: 301,
      state: 'CHANGES_REQUESTED',
      body: 'Please tighten the bridge section.',
      submitted_at: '2026-04-17T09:10:00Z',
      html_url: 'https://github.com/openai/maestro-player/pull/81#pullrequestreview-301',
      user: {
        login: 'reviewer-a',
      },
    },
    {
      id: 302,
      state: 'APPROVED',
      body: 'Looks good now.',
      submitted_at: '2026-04-17T09:18:00Z',
      html_url: 'https://github.com/openai/maestro-player/pull/81#pullrequestreview-302',
      user: {
        login: 'reviewer-b',
      },
    },
    {
      id: 303,
      state: 'DISMISSED',
      body: 'Outdated review.',
      submitted_at: '2026-04-17T09:19:00Z',
      html_url: 'https://github.com/openai/maestro-player/pull/81#pullrequestreview-303',
      user: {
        login: 'reviewer-c',
      },
    },
  ],
};

export const GITHUB_PULL_REQUEST_ISSUE_COMMENT_FIXTURES = {
  81: [
    {
      id: 401,
      body: 'Can you add one more playback example?',
      created_at: '2026-04-17T09:11:00Z',
      html_url: 'https://github.com/openai/maestro-player/pull/81#issuecomment-401',
      user: {
        login: 'reviewer-a',
      },
    },
  ],
};

export const GITHUB_PULL_REQUEST_REVIEW_COMMENT_FIXTURES = {
  81: [
    {
      id: 501,
      body: 'This needs a smoother release.',
      path: 'src/audio/bridge.js',
      created_at: '2026-04-17T09:12:00Z',
      html_url: 'https://github.com/openai/maestro-player/pull/81#discussion_r501',
      user: {
        login: 'reviewer-b',
      },
    },
  ],
};

export const GITLAB_MERGE_REQUEST_LIST_FIXTURE = [
  {
    id: 1202,
    iid: 12,
    title: 'Older GitLab branch',
    description: 'Older branch work.',
    web_url: 'https://gitlab.com/openai/maestro-player/-/merge_requests/12',
    created_at: '2026-04-16T08:00:00Z',
    source_branch: 'feature/other-branch',
    references: {
      full: 'openai/maestro-player!12',
    },
    author: {
      username: 'other-gitlab-contributor',
      name: 'Other Contributor',
    },
  },
  {
    id: 1201,
    iid: 11,
    title: 'GitLab cadence polish',
    description: 'Improves merge request cadence transitions.',
    web_url: 'https://gitlab.com/openai/maestro-player/-/merge_requests/11',
    created_at: '2026-04-17T09:00:00Z',
    source_branch: 'feature/cadence',
    references: {
      full: 'openai/maestro-player!11',
    },
    author: {
      username: 'gitlab-contributor',
      name: 'GitLab Contributor',
    },
  },
];

export const GITLAB_MERGE_REQUEST_NOTE_FIXTURES = {
  11: [
    {
      id: 601,
      body: 'Please smooth out the cadence handoff.',
      created_at: '2026-04-17T09:11:00Z',
      system: false,
      author: {
        username: 'gitlab-reviewer-a',
        name: 'GitLab Reviewer A',
      },
    },
    {
      id: 602,
      body: 'mentioned in commit 123',
      created_at: '2026-04-17T09:12:00Z',
      system: true,
      author: {
        username: 'gitlab-system',
        name: 'GitLab System',
      },
    },
    {
      id: 603,
      body: 'Consider tightening the synth release.',
      created_at: '2026-04-17T09:13:00Z',
      system: false,
      resolvable: true,
      position: {
        new_path: 'src/audio/gitlab-bridge.js',
      },
      author: {
        username: 'gitlab-reviewer-b',
        name: 'GitLab Reviewer B',
      },
    },
  ],
};

export const GITLAB_MERGE_REQUEST_APPROVAL_FIXTURES = {
  11: {
    id: 1201,
    iid: 11,
    approved_by: [
      {
        user: {
          id: 701,
          username: 'gitlab-approver',
          name: 'GitLab Approver',
          web_url: 'https://gitlab.com/gitlab-approver',
        },
        approved_at: '2026-04-17T09:16:00Z',
      },
    ],
  },
};
