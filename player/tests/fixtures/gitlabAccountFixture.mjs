export const GITLAB_ACCOUNT_REPOS_FIXTURE = [
  {
    id: 501,
    path: 'private-player-repo',
    path_with_namespace: 'agent/private-player-repo',
    visibility: 'private',
    default_branch: 'main',
    web_url: 'https://gitlab.com/agent/private-player-repo',
    namespace: {
      full_path: 'agent',
    },
  },
  {
    id: 502,
    path: 'group-player-repo',
    path_with_namespace: 'agent/platform/group-player-repo',
    visibility: 'internal',
    default_branch: 'develop',
    web_url: 'https://gitlab.com/agent/platform/group-player-repo',
    namespace: {
      full_path: 'agent/platform',
    },
  },
];
