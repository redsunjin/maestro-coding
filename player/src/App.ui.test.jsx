import { afterEach, describe, expect, test } from 'vitest';
import { cleanup, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

import {
  renderPlayerApp,
  teardownPlayerAppUiEnvironment,
} from './test/appUiHarness.js';
import { getPerformanceHistoryStorageKey } from './lib/performanceHistoryStore.js';

let App = null;

try {
  ({ default: App } = await import('./App.jsx'));
} catch (error) {
  if (!isMissingPlayerAppModule(error)) {
    throw error;
  }
}

const describeIfApp = App ? describe : describe.skip;

afterEach(() => {
  cleanup();
  globalThis.localStorage?.clear();
  teardownPlayerAppUiEnvironment();
});

describeIfApp('Player Shell UI', () => {
  test('language toggle switches the shell copy between English and Korean', async () => {
    const { user } = renderPlayerApp(App);

    expect(screen.getByRole('heading', { name: 'Choose the right input path' })).toBeVisible();

    await user.click(screen.getByRole('button', { name: '한국어' }));

    expect(screen.getByRole('heading', { name: '맞는 입력 경로 선택' })).toBeVisible();
    expect(screen.getByRole('button', { name: '리플레이 불러오기' })).toBeVisible();
    expect(screen.getByText('읽기 전용 리플레이')).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'English' }));

    expect(screen.getByRole('heading', { name: 'Choose the right input path' })).toBeVisible();
  });

  test('switching source modes updates the visible form controls', async () => {
    const { user } = renderPlayerApp(App);

    expect(getSourceModeControl('Local Repo')).toBeVisible();
    expect(getSourceModeControl('Public Repo URL')).toBeVisible();
    expect(getSourceModeControl('Connected Account')).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Choose the right input path' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Latest mapped events' })).toBeVisible();

    await user.click(getSourceModeControl('Public Repo URL'));

    expect(screen.getByLabelText('Public Repository URL')).toBeVisible();
    expect(screen.getByLabelText('Branch')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Load Replay' })).toBeVisible();
    expect(screen.queryByLabelText('Account Token')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Repository')).not.toBeInTheDocument();

    await user.click(getSourceModeControl('Connected Account'));

    expect(screen.getByLabelText('Account Token')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Refresh Repositories' })).toBeVisible();
    expect(screen.getByLabelText('Repository')).toBeVisible();
    expect(screen.getByLabelText('Branch')).toBeVisible();
    expect(screen.queryByLabelText('Public Repository URL')).not.toBeInTheDocument();

    await user.click(getSourceModeControl('Local Repo'));

    expect(screen.queryByLabelText('Public Repository URL')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Account Token')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Repository')).not.toBeInTheDocument();
  });

  test('loading a public repo shows the selected source and event count', async () => {
    const { fixtures, user } = renderPlayerApp(App);

    await user.click(getSourceModeControl('Public Repo URL'));
    await user.clear(screen.getByLabelText('Public Repository URL'));
    await user.type(screen.getByLabelText('Public Repository URL'), fixtures.publicRepoUrl);
    await user.clear(screen.getByLabelText('Branch'));
    await user.type(screen.getByLabelText('Branch'), fixtures.publicBranch);
    await user.click(screen.getByRole('button', { name: 'Load Replay' }));

    await waitFor(() => {
      expect(findSourceSummaryText([fixtures.publicRepoUrl, fixtures.publicRepoSlug])).toBeVisible();
      expect(findEventCountSummary(fixtures.publicEventCount)).toBeVisible();
      expect(screen.getByText('feat: add replay intro theme')).toBeVisible();
      expect(screen.getByText('Please tighten the bridge section.')).toBeVisible();
    });
  });

  test('loading a public gitlab repo shows the selected source and gitlab event count', async () => {
    const { fixtures, user } = renderPlayerApp(App, {
      publicProvider: 'gitlab',
      gitlabPublicRepoSlug: 'openai/maestro-player',
      publicRepoUrl: 'https://gitlab.com/openai/maestro-player',
    });

    await user.click(getSourceModeControl('Public Repo URL'));
    await user.clear(screen.getByLabelText('Public Repository URL'));
    await user.type(screen.getByLabelText('Public Repository URL'), fixtures.publicRepoUrl);
    await user.clear(screen.getByLabelText('Branch'));
    await user.type(screen.getByLabelText('Branch'), fixtures.gitlabPublicBranch);
    await user.click(screen.getByRole('button', { name: 'Load Replay' }));

    await waitFor(() => {
      expect(findSourceSummaryText([fixtures.publicRepoUrl, fixtures.gitlabPublicRepoSlug])).toBeVisible();
      expect(findEventCountSummary(fixtures.gitlabPublicEventCount)).toBeVisible();
      expect(screen.getByText('feat: add merge request groove')).toBeVisible();
      expect(screen.getByText('Reopening after retest because the click is still audible.')).toBeVisible();
    });
  });

  test('bootstrap public repo launch preloads the draft and auto-loads the replay', async () => {
    const publicRepoUrl = 'https://gitlab.com/openai/maestro-player';
    const publicBranch = 'feature/cadence';
    const { fixtures, user } = renderPlayerApp(App, {
      publicProvider: 'gitlab',
      gitlabPublicRepoSlug: 'openai/maestro-player',
      publicRepoUrl,
      gitlabPublicBranch: publicBranch,
      appProps: {
        bootstrap: {
          initialSourceMode: 'public',
          initialDrafts: {
            public: {
              url: publicRepoUrl,
              branch: publicBranch,
            },
          },
          autoLoadPublicReplay: true,
        },
      },
    });

    await waitFor(() => {
      expect(findSourceSummaryText([publicRepoUrl, 'openai/maestro-player'])).toBeVisible();
      expect(findEventCountSummary(fixtures.gitlabPublicEventCount)).toBeVisible();
    });

    expect(screen.getByLabelText('Public Repository URL')).toHaveValue(publicRepoUrl);
    expect(screen.getByLabelText('Branch')).toHaveValue(publicBranch);

    await user.click(getSourceModeControl('Connected Account'));
    expect(screen.getByLabelText('Account Token')).toBeVisible();
  });

  test('extension surface keeps the public repo and golden autoplay entries direct', async () => {
    const { user } = renderPlayerApp(App, {
      appProps: {
        bootstrap: {
          surface: 'extension',
          initialSourceMode: 'public',
        },
      },
    });

    expect(screen.getByRole('heading', { name: 'Play a public repository' })).toBeVisible();
    expect(screen.getByLabelText('Public Repository URL')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Load repo replay' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Local Repo' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Connected Account' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Choose the right input path' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Autoplay demo for GitHub Public PR Cadence' }));

    await waitFor(() => {
      expect(screen.getByText('Run active')).toBeVisible();
      expect(screen.getByRole('tab', { name: 'Auto Preview' })).toHaveAttribute('aria-selected', 'true');
    });
  });

  test('loading connected account repos populates the select and then shows replay summary', async () => {
    const { fixtures, requestLog, user } = renderPlayerApp(App);

    await user.click(getSourceModeControl('Connected Account'));
    await user.type(screen.getByLabelText('Account Token'), fixtures.accountToken);
    await user.click(screen.getByRole('button', { name: 'Refresh Repositories' }));

    await waitFor(() => {
      expect(screen.getByRole('option', { name: new RegExp(fixtures.accountRepoSlug) })).toBeInTheDocument();
    });

    await user.selectOptions(screen.getByLabelText('Repository'), fixtures.accountRepoSlug);
    await user.clear(screen.getByLabelText('Branch'));
    await user.type(screen.getByLabelText('Branch'), fixtures.accountBranch);
    await user.click(screen.getByRole('button', { name: 'Load Replay' }));

    await waitFor(() => {
      expect(findSourceSummaryText([fixtures.accountRepoSlug])).toBeVisible();
      expect(findEventCountSummary(fixtures.accountEventCount)).toBeVisible();
    });

    expect(
      requestLog.some(({ init, url }) => (
        url.includes('/user/repos')
        && readAuthorizationHeader(init) === `Bearer ${fixtures.accountToken}`
      )),
    ).toBe(true);
  });

  test('loading connected gitlab account repos populates the select and then shows replay summary', async () => {
    const { fixtures, requestLog, user } = renderPlayerApp(App, {
      accountProvider: 'gitlab',
    });

    await user.click(getSourceModeControl('Connected Account'));
    await user.selectOptions(screen.getByLabelText('Provider'), 'gitlab');
    await user.type(screen.getByLabelText('Account Token'), fixtures.gitlabAccountToken);
    await user.click(screen.getByRole('button', { name: 'Refresh Repositories' }));

    await waitFor(() => {
      expect(screen.getByRole('option', { name: new RegExp(fixtures.gitlabAccountRepoSlug) })).toBeInTheDocument();
    });

    await user.selectOptions(screen.getByLabelText('Repository'), fixtures.gitlabAccountRepoSlug);
    await user.clear(screen.getByLabelText('Branch'));
    await user.type(screen.getByLabelText('Branch'), fixtures.gitlabAccountBranch);
    await user.click(screen.getByRole('button', { name: 'Load Replay' }));

    await waitFor(() => {
      expect(findSourceSummaryText([fixtures.gitlabAccountRepoSlug])).toBeVisible();
      expect(findEventCountSummary(fixtures.gitlabAccountEventCount)).toBeVisible();
    });

    expect(
      requestLog.some(({ init, url }) => (
        url.includes('/api/v4/projects')
        && readAuthorizationHeader(init, 'PRIVATE-TOKEN') === fixtures.gitlabAccountToken
      )),
    ).toBe(true);
  });

  test('loading a local repo uses the injected local bridge and shows replay summary', async () => {
    const { bridgeLog, fixtures, user } = renderPlayerApp(App);

    await user.click(getSourceModeControl('Local Repo'));
    await user.clear(screen.getByLabelText('Repository Path'));
    await user.type(screen.getByLabelText('Repository Path'), fixtures.localRepoPath);
    await user.clear(screen.getByLabelText('Branch'));
    await user.type(screen.getByLabelText('Branch'), fixtures.localBranch);
    await user.click(screen.getByRole('button', { name: 'Load Replay' }));

    await waitFor(() => {
      expect(findSourceSummaryText([fixtures.localRepoPath])).toBeVisible();
      expect(findEventCountSummary(fixtures.localEventCount)).toBeVisible();
      expect(screen.getByText('feat: local bridge playback')).toBeVisible();
    });

    expect(bridgeLog).toHaveLength(1);
    expect(bridgeLog[0]).toMatchObject({
      repoPath: fixtures.localRepoPath,
      branchName: fixtures.localBranch,
      maxCommits: 12,
      sourceLabel: fixtures.localRepoPath,
    });
  });

  test('golden listening autoplay demo loads a fixed scenario and starts the run immediately', async () => {
    const { user } = renderPlayerApp(App);

    await user.click(screen.getByRole('button', { name: 'Autoplay demo for GitHub Public PR Cadence' }));

    await waitFor(() => {
      expect(screen.getByText('GitHub Public PR Cadence', { selector: 'dd' })).toBeVisible();
      expect(screen.getByText('Run active')).toBeVisible();
      expect(screen.getByRole('tab', { name: 'Auto Preview' })).toHaveAttribute('aria-selected', 'true');
      expect(screen.getByText('Active demo')).toBeVisible();
    });
  });

  test('loads persisted score history for the active source', async () => {
    const storedHistory = [
      {
        runId: 'run-public-1',
        chartId: 'chart-public-1',
        sourceKey: `git-public-url:github:${'openai/maestro-player'}:${'feature/cadence'}`,
        sourceLabel: 'openai/maestro-player',
        sourceType: 'git-public-url',
        branchName: 'feature/cadence',
        playMode: 'manual',
        provider: 'github',
        visibility: 'public',
        score: 9870,
        maxCombo: 18,
        accuracy: 96.4,
        notesHit: 18,
        totalNotes: 19,
        tempo: 122,
        laneCount: 4,
        judgments: {
          perfect: 16,
          good: 2,
          miss: 1,
        },
        finishedAt: '2026-04-18T11:00:00Z',
      },
      {
        runId: 'run-other-1',
        chartId: 'chart-other-1',
        sourceKey: 'git-public-url:github:someone/else:main',
        sourceLabel: 'someone/else',
        sourceType: 'git-public-url',
        branchName: 'main',
        playMode: 'auto',
        provider: 'github',
        visibility: 'public',
        score: 1111,
        maxCombo: 4,
        accuracy: 100,
        notesHit: 4,
        totalNotes: 4,
        tempo: 120,
        laneCount: 4,
        judgments: {
          perfect: 4,
          good: 0,
          miss: 0,
        },
        finishedAt: '2026-04-17T11:00:00Z',
      },
    ];

    globalThis.localStorage.setItem(
      getPerformanceHistoryStorageKey(),
      JSON.stringify(storedHistory),
    );

    const { fixtures, user } = renderPlayerApp(App);

    await user.click(getSourceModeControl('Public Repo URL'));
    await user.clear(screen.getByLabelText('Public Repository URL'));
    await user.type(screen.getByLabelText('Public Repository URL'), fixtures.publicRepoUrl);
    await user.clear(screen.getByLabelText('Branch'));
    await user.type(screen.getByLabelText('Branch'), fixtures.publicBranch);
    await user.click(screen.getByRole('button', { name: 'Load Replay' }));

    await waitFor(() => {
      expect(screen.getByText('Filtered')).toBeVisible();
      expect(screen.getByRole('heading', { name: 'Recent score history' })).toBeVisible();
      expect(screen.getByText('9,870 pts')).toBeVisible();
      expect(screen.getByText('18 max combo')).toBeVisible();
      expect(screen.getByText(/18 \/ 19 notes, 1 misses/i)).toBeVisible();
    });

    expect(screen.queryByText('1,111 pts')).not.toBeInTheDocument();
  });
});

function getSourceModeControl(name) {
  return screen.queryByRole('tab', { name }) || screen.getByRole('button', { name });
}

function findSourceSummaryText(candidates) {
  return screen.getByText((content) => candidates.some((candidate) => content.includes(candidate)));
}

function findEventCountSummary(eventCount) {
  return screen.getByText((content, node) => {
    const normalized = content.replace(/\s+/g, ' ').trim();
    if (normalized.includes(`${eventCount} events loaded`)) {
      return true;
    }

    if (normalized === String(eventCount)) {
      const metricCard = node?.closest('.status-metric');
      return metricCard?.textContent?.includes('Events') || false;
    }

    return false;
  });
}

function isMissingPlayerAppModule(error) {
  const message = String(error?.message || error);
  return (
    message.includes('Failed to resolve import "./App.jsx"')
    || message.includes("Cannot find module './App.jsx'")
    || message.includes('/player/src/App.jsx')
  );
}

function readAuthorizationHeader(init, headerName = 'authorization') {
  const headers = init?.headers;
  const normalizedHeaderName = headerName.toLowerCase();

  if (!headers) {
    return null;
  }

  if (typeof headers.get === 'function') {
    return headers.get(headerName) ?? headers.get(normalizedHeaderName);
  }

  if (Array.isArray(headers)) {
    const matched = headers.find(([name]) => String(name).toLowerCase() === normalizedHeaderName);
    return matched ? matched[1] : null;
  }

  const matched = Object.entries(headers).find(([name]) => name.toLowerCase() === normalizedHeaderName);
  return matched ? matched[1] : null;
}
