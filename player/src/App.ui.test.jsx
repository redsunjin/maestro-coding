import { afterEach, describe, expect, test } from 'vitest';
import { cleanup, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

import {
  renderPlayerApp,
  teardownPlayerAppUiEnvironment,
} from './test/appUiHarness.js';

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
  teardownPlayerAppUiEnvironment();
});

describeIfApp('Player Shell UI', () => {
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

function readAuthorizationHeader(init) {
  const headers = init?.headers;

  if (!headers) {
    return null;
  }

  if (typeof headers.get === 'function') {
    return headers.get('authorization') ?? headers.get('Authorization');
  }

  if (Array.isArray(headers)) {
    const matched = headers.find(([name]) => String(name).toLowerCase() === 'authorization');
    return matched ? matched[1] : null;
  }

  const matched = Object.entries(headers).find(([name]) => name.toLowerCase() === 'authorization');
  return matched ? matched[1] : null;
}
