import React, { startTransition, useMemo, useState } from 'react';
import PlayerRunPanel from './components/PlayerRunPanel.jsx';
import ReplayEventTimeline from './components/ReplayEventTimeline.jsx';
import ScoreHistoryPanel from './components/ScoreHistoryPanel.jsx';
import SourceModeTabs from './components/SourceModeTabs.jsx';
import SourceInputPanel from './components/SourceInputPanel.jsx';
import SourceModeGuide from './components/SourceModeGuide.jsx';
import ReplayStatusPanel from './components/ReplayStatusPanel.jsx';
import { createConnectedAccountRepoSource, listConnectedGithubRepositories, loadConnectedAccountReplayEvents } from './lib/accountRepoAdapter.js';
import { createChartFromMusicPlan } from './lib/chartMapper.js';
import { loadCollaborationOverlayEvents } from './lib/collaborationOverlayAdapter.js';
import { hasLocalRepoBridge, loadLocalRepoReplayEvents } from './lib/localRepoBridge.js';
import { appendPerformanceRecord, loadPerformanceHistory } from './lib/performanceHistoryStore.js';
import { loadPublicRepoReplayEvents, createPublicRepoSource } from './lib/publicRepoAdapter.js';
import { buildMusicPlan } from './lib/musicIntentMapper.js';
import { registerLocalRepoSource } from './lib/sourceRegistry.js';
import './styles.css';

const MODE_DEFINITIONS = [
  { id: 'local', label: 'Local Repo' },
  { id: 'public', label: 'Public Repo URL' },
  { id: 'account', label: 'Connected Account' },
];

const INITIAL_DRAFTS = {
  local: {
    repoPath: '',
    branch: 'main',
  },
  public: {
    url: 'https://github.com/openai/openai-python',
    branch: 'main',
  },
  account: {
    token: '',
    repoSlug: '',
    branch: 'main',
  },
};

export default function App() {
  const [sourceMode, setSourceMode] = useState('public');
  const [drafts, setDrafts] = useState(INITIAL_DRAFTS);
  const [activeSource, setActiveSource] = useState(null);
  const [loadedEvents, setLoadedEvents] = useState([]);
  const [musicPlan, setMusicPlan] = useState([]);
  const [chart, setChart] = useState(null);
  const [accountRepositories, setAccountRepositories] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isRepoListLoading, setIsRepoListLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [performanceHistory, setPerformanceHistory] = useState(() => loadPerformanceHistory(globalThis));
  const localBridgeAvailable = hasLocalRepoBridge(globalThis);

  const latestEvents = useMemo(
    () => loadedEvents.slice(-6).reverse(),
    [loadedEvents],
  );

  const replaySummary = useMemo(() => {
    const mergeCount = loadedEvents.filter((event) => event.eventType === 'merge').length;
    const reviewCount = loadedEvents.filter((event) => event.eventType.startsWith('review')).length;

    return {
      eventCount: loadedEvents.length,
      commitCount: loadedEvents.filter((event) => event.eventType === 'commit').length,
      mergeCount,
      reviewCount,
      loadedAt: activeSource ? new Date().toISOString() : null,
    };
  }, [activeSource, loadedEvents]);

  const chartSummary = useMemo(() => {
    if (!activeSource) {
      return null;
    }

    return {
      noteCount: chart?.notes?.length || 0,
      laneCount: chart?.laneCount || 4,
      phraseCount: musicPlan.length,
      durationLabel: chart?.notes?.length ? `${Math.max(...chart.notes.map((note) => note.beatOffset + note.durationBeats)).toFixed(1)} beats` : 'Pending',
      tempoLabel: musicPlan[0]?.tempo ? `${musicPlan[0].tempo} BPM` : 'Pending',
      maxDensity: chart?.notes?.length ? `${Math.max(...summarizeBeatDensity(chart.notes))}/beat` : 'Pending',
    };
  }, [activeSource, chart, loadedEvents.length, musicPlan]);

  const sourceGuideState = useMemo(() => buildSourceGuideState({
    activeSource,
    replaySummary,
    drafts,
    accountRepositories,
    localBridgeAvailable,
  }), [activeSource, replaySummary, drafts, accountRepositories, localBridgeAvailable]);

  const activeSourceKey = useMemo(
    () => buildPerformanceSourceKey(activeSource),
    [activeSource],
  );

  const activeChartId = useMemo(
    () => buildPerformanceChartId(activeSourceKey, chart, loadedEvents, musicPlan),
    [activeSourceKey, chart, loadedEvents, musicPlan],
  );

  const visiblePerformanceHistory = useMemo(() => {
    if (!performanceHistory.length) {
      return [];
    }

    if (!activeSourceKey) {
      return performanceHistory.slice(0, 6);
    }

    return performanceHistory
      .filter((record) => record.sourceKey === activeSourceKey)
      .slice(0, 6);
  }, [activeSourceKey, performanceHistory]);

  const handleDraftChange = (mode, field, value) => {
    setDrafts((currentDrafts) => ({
      ...currentDrafts,
      [mode]: {
        ...currentDrafts[mode],
        [field]: value,
      },
    }));
  };

  const handleLoadReplay = async () => {
    setErrorMessage('');
    setIsLoading(true);

    try {
      if (sourceMode === 'local') {
        const repoPath = drafts.local.repoPath || '/workspace/local-repo';
        const branchName = drafts.local.branch || 'main';

        if (localBridgeAvailable) {
          const localReplay = await loadLocalRepoReplayEvents({
            globalObject: globalThis,
            repoPath,
            branchName,
            maxCommits: 12,
            sourceLabel: repoPath,
          });
          applyReplayResult(localReplay.source, localReplay.replayEvents);
          return;
        }

        const source = registerLocalRepoSource({
          repoPath,
          branchName,
          sourceLabel: repoPath,
        });

        startTransition(() => {
          setActiveSource(source);
          setLoadedEvents([]);
          setMusicPlan([]);
          setChart({
            laneCount: 4,
            notes: [],
          });
        });

        setErrorMessage('Local Repo Mode is staged in the shell. Live replay loading still needs a desktop or server bridge.');
        return;
      }

      if (sourceMode === 'public') {
        const source = createPublicRepoSource({
          url: drafts.public.url,
          branchName: drafts.public.branch || 'main',
        });
        const replayEvents = await loadPublicRepoReplayEvents({
          url: drafts.public.url,
          branchName: drafts.public.branch || 'main',
          fetchImpl: globalThis.fetch,
          maxCommits: 12,
        });
        const overlayEvents = await loadOverlayEventsSafe({
          owner: source.owner,
          repo: source.repo,
          branchName: source.branchName || drafts.public.branch || 'main',
          fetchImpl: globalThis.fetch,
          canonicalUrl: source.canonicalUrl,
          sourceLabel: source.repoSlug || source.sourceLabel,
          visibility: source.visibility,
        });
        applyReplayResult(source, mergeReplayEvents(replayEvents, overlayEvents));
        return;
      }

      const selectedRepository = accountRepositories.find(
        (repository) => repository.repoSlug === drafts.account.repoSlug,
      );

      if (!selectedRepository) {
        throw new Error('Select a repository from the connected account list before loading replay.');
      }

      const source = createConnectedAccountRepoSource({
        ...selectedRepository,
        accountId: 'connected-github-account',
        branchName: drafts.account.branch || selectedRepository.defaultBranch || 'main',
        sourceLabel: `${selectedRepository.repo} (connected account)`,
      });
      const replayEvents = await loadConnectedAccountReplayEvents({
        ...selectedRepository,
        accessToken: drafts.account.token,
        branchName: drafts.account.branch || selectedRepository.defaultBranch || 'main',
        fetchImpl: globalThis.fetch,
        maxCommits: 12,
      });
      const overlayEvents = await loadOverlayEventsSafe({
        owner: selectedRepository.owner,
        repo: selectedRepository.repo,
        branchName: drafts.account.branch || selectedRepository.defaultBranch || 'main',
        accessToken: drafts.account.token,
        fetchImpl: globalThis.fetch,
        canonicalUrl: selectedRepository.htmlUrl,
        sourceLabel: selectedRepository.repoSlug,
        visibility: selectedRepository.visibility,
      });
      applyReplayResult(source, mergeReplayEvents(replayEvents, overlayEvents));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to load replay source.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefreshRepositories = async () => {
    setErrorMessage('');
    setIsRepoListLoading(true);

    try {
      const repositories = await listConnectedGithubRepositories({
        accessToken: drafts.account.token,
        fetchImpl: globalThis.fetch,
      });
      setAccountRepositories(repositories);
      if (repositories[0] && !drafts.account.repoSlug) {
        setDrafts((currentDrafts) => ({
          ...currentDrafts,
          account: {
            ...currentDrafts.account,
            repoSlug: repositories[0].repoSlug,
            branch: repositories[0].defaultBranch || currentDrafts.account.branch,
          },
        }));
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to refresh connected account repositories.');
    } finally {
      setIsRepoListLoading(false);
    }
  };

  const applyReplayResult = (source, replayEvents) => {
    const normalizedEvents = replayEvents.map((event) => ({
      ...event,
      repoId: event.repoId || source.repoSlug || source.sourceLabel,
      branchName: event.branchName || source.branchName || 'main',
    }));
    const nextMusicPlan = buildMusicPlan(normalizedEvents, { laneCount: 4 });
    const nextChart = createChartFromMusicPlan(nextMusicPlan, {
      laneCount: 4,
      maxNotesPerBeat: 2,
    });

    startTransition(() => {
      setActiveSource(source);
      setLoadedEvents(normalizedEvents);
      setMusicPlan(nextMusicPlan);
      setChart(nextChart);
    });
  };

  const handleRunComplete = (runResult) => {
    if (!activeSource) {
      return;
    }

    const nextRecord = {
      runId: `${activeChartId || 'chart'}:${runResult.runToken}`,
      chartId: activeChartId || 'unknown-chart',
      sourceKey: activeSourceKey || 'unknown-source',
      sourceLabel: activeSource.sourceLabel || activeSource.repoSlug || activeSource.targetPathOrId || 'Unknown source',
      sourceType: activeSource.sourceType || 'unknown',
      branchName: activeSource.branchName || 'main',
      provider: activeSource.provider || 'unknown',
      visibility: activeSource.visibility || 'unknown',
      playMode: runResult.playMode,
      score: runResult.score,
      maxCombo: runResult.maxCombo,
      accuracy: runResult.accuracy,
      notesHit: runResult.notesHit,
      totalNotes: runResult.totalNotes,
      laneCount: runResult.laneCount,
      tempo: runResult.tempo,
      judgments: runResult.judgments,
      finishedAt: runResult.finishedAt,
    };

    startTransition(() => {
      setPerformanceHistory(appendPerformanceRecord(nextRecord, globalThis));
    });
  };

  return (
    <div className="player-shell">
      <div className="player-shell__inner">
        <header className="player-hero">
          <p className="player-eyebrow">Maestro Player</p>
          <h1 className="player-title">Turn repository history into a <span>playable score</span>.</h1>
          <p className="player-subtitle">
            Load a local repo, a public GitHub URL, or a connected account repository and translate commit flow into a rhythm chart.
          </p>
          <div className="player-hero__meta">
          <span>Read-only replay</span>
          <span>Git + PR semantics</span>
          <span>Deterministic motifs</span>
          </div>
        </header>

        <main className="player-grid">
          <div className="player-column">
            <SourceModeTabs
              mode={sourceMode}
              modes={MODE_DEFINITIONS}
              onModeChange={setSourceMode}
            />
            <SourceModeGuide
              mode={sourceMode}
              sourceState={sourceGuideState}
            />
            <SourceInputPanel
              mode={sourceMode}
              repoPath={drafts.local.repoPath}
              publicUrl={drafts.public.url}
              branchName={drafts[sourceMode].branch}
              accountToken={drafts.account.token}
              selectedRepo={drafts.account.repoSlug}
              repositories={accountRepositories}
              onRepoPathChange={(value) => handleDraftChange('local', 'repoPath', value)}
              onPublicUrlChange={(value) => handleDraftChange('public', 'url', value)}
              onBranchNameChange={(value) => handleDraftChange(sourceMode, 'branch', value)}
              onAccountTokenChange={(value) => handleDraftChange('account', 'token', value)}
              onSelectedRepoChange={(value) => handleDraftChange('account', 'repoSlug', value)}
              onRefreshRepositories={handleRefreshRepositories}
              onSubmit={handleLoadReplay}
              isSubmitting={isLoading}
              isRefreshingRepositories={isRepoListLoading}
            />
          </div>
          <div className="player-column">
            <ReplayStatusPanel
              activeSource={activeSource}
              replaySummary={replaySummary}
              chartSummary={chartSummary}
              latestError={errorMessage}
            />
            <PlayerRunPanel
              chart={chart}
              tempo={musicPlan[0]?.tempo || 120}
              onRunComplete={handleRunComplete}
            />
            <ScoreHistoryPanel
              activeSource={activeSource}
              records={visiblePerformanceHistory}
            />
            <ReplayEventTimeline
              events={latestEvents}
              title="Latest mapped events"
              emptyMessage="Load a replay source to preview the incoming event stream."
              maxItems={6}
            />
          </div>
        </main>
      </div>
    </div>
  );
}

function buildSourceGuideState({
  activeSource,
  replaySummary,
  drafts,
  accountRepositories,
  localBridgeAvailable,
}) {
  return {
    local: buildLocalGuideState(drafts.local, activeSource, replaySummary, localBridgeAvailable),
    public: buildPublicGuideState(drafts.public, activeSource, replaySummary),
    account: buildAccountGuideState(drafts.account, accountRepositories, activeSource, replaySummary),
  };
}

function buildLocalGuideState(localDraft, activeSource, replaySummary, localBridgeAvailable) {
  const branchName = localDraft.branch || 'main';
  const repoPath = localDraft.repoPath?.trim();

  if (activeSource?.sourceType === 'git-local') {
    return {
      readiness: 'Loaded',
      readinessTone: 'ready',
      cue: `Replay mapped from the local bridge: ${replaySummary?.eventCount || 0} events.`,
      summary: `Loaded the selected local repository on ${activeSource.branchName || branchName}.`,
    };
  }

  if (localBridgeAvailable) {
    return {
      readiness: 'Ready now',
      readinessTone: 'ready',
      cue: `Local bridge detected. ${repoPath ? 'Load the selected repository' : 'Select a repository path'} on ${branchName}.`,
      risks: [
        'Path access still depends on the desktop bridge implementation.',
        'Machine-specific repo availability can still block replay.',
      ],
    };
  }

  if (repoPath) {
    return {
      cue: `Prepared ${repoPath} on ${branchName}. Live loading still needs a desktop or server bridge.`,
    };
  }

  return {};
}

function buildPublicGuideState(publicDraft, activeSource, replaySummary) {
  const branchName = publicDraft.branch || 'main';
  const publicUrl = publicDraft.url?.trim();

  if (activeSource?.sourceType === 'git-public-url') {
    const reviewSuffix = replaySummary?.reviewCount ? `, including ${replaySummary.reviewCount} review events` : '';
    return {
      readiness: 'Loaded',
      readinessTone: 'ready',
      cue: `Replay mapped from the selected public source: ${replaySummary?.eventCount || 0} events${reviewSuffix}.`,
      summary: `Loaded ${activeSource.branchName || branchName} from the selected public repository.`,
    };
  }

  if (publicUrl) {
    return {
      cue: `Ready to load ${publicUrl} on ${branchName}.`,
    };
  }

  return {};
}

function buildAccountGuideState(accountDraft, accountRepositories, activeSource, replaySummary) {
  const branchName = accountDraft.branch || 'main';

  if (activeSource?.sourceType === 'git-account') {
    const reviewSuffix = replaySummary?.reviewCount ? `, including ${replaySummary.reviewCount} review events` : '';
    return {
      readiness: 'Loaded',
      readinessTone: 'ready',
      cue: `Replay mapped from the connected repository: ${replaySummary?.eventCount || 0} events${reviewSuffix}.`,
      summary: `Connected replay loaded on ${activeSource.branchName || branchName}.`,
    };
  }

  if (accountDraft.token && accountRepositories.length > 0) {
    return {
      readiness: 'Connected',
      readinessTone: 'ready',
      cue: `${accountRepositories.length} repositories available. Select one and load replay.`,
    };
  }

  if (accountDraft.token) {
    return {
      readiness: 'Connected',
      readinessTone: 'ready',
      cue: 'Token added. Refresh repositories to populate the picker.',
    };
  }

  return {
    readiness: 'Token needed',
    cue: 'Add a token to list repositories and unlock private replay.',
  };
}

function summarizeBeatDensity(notes) {
  const bucketCounts = new Map();

  notes.forEach((note) => {
    const bucket = Math.floor(note.beatOffset);
    bucketCounts.set(bucket, (bucketCounts.get(bucket) || 0) + 1);
  });

  return [...bucketCounts.values()];
}

async function loadOverlayEventsSafe(input) {
  try {
    return await loadCollaborationOverlayEvents(input);
  } catch {
    return [];
  }
}

function mergeReplayEvents(primaryEvents, overlayEvents) {
  return [...primaryEvents, ...overlayEvents].sort(compareReplayEvents);
}

function compareReplayEvents(left, right) {
  const leftTimestamp = new Date(left?.timestamp || 0).getTime();
  const rightTimestamp = new Date(right?.timestamp || 0).getTime();
  const timeDelta = leftTimestamp - rightTimestamp;

  if (timeDelta !== 0) {
    return timeDelta;
  }

  return String(left?.eventId || '').localeCompare(String(right?.eventId || ''));
}

function buildPerformanceSourceKey(activeSource) {
  if (!activeSource) {
    return '';
  }

  return [
    activeSource.sourceType || 'unknown',
    activeSource.provider || 'unknown',
    activeSource.repoSlug || activeSource.targetPathOrId || activeSource.sourceLabel || 'unknown',
    activeSource.branchName || 'main',
  ].join(':');
}

function buildPerformanceChartId(sourceKey, chart, loadedEvents, musicPlan) {
  if (!sourceKey || !chart) {
    return '';
  }

  return [
    sourceKey,
    chart.laneCount || 4,
    chart.notes?.length || 0,
    loadedEvents.length,
    musicPlan[0]?.tempo || 0,
  ].join(':');
}
