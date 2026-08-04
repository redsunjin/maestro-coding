import React, { startTransition, useEffect, useState } from 'react';
import GoldenListeningPanel from './components/GoldenListeningPanel.jsx';
import ExtensionPublicLauncher from './components/ExtensionPublicLauncher.jsx';
import PlayerDeckTabs from './components/PlayerDeckTabs.jsx';
import PlayerRunPanel from './components/PlayerRunPanel.jsx';
import ReplayEventTimeline from './components/ReplayEventTimeline.jsx';
import ScoreHistoryPanel from './components/ScoreHistoryPanel.jsx';
import SourceModeTabs from './components/SourceModeTabs.jsx';
import SourceInputPanel from './components/SourceInputPanel.jsx';
import SourceModeGuide from './components/SourceModeGuide.jsx';
import ReplayStatusPanel from './components/ReplayStatusPanel.jsx';
import { createConnectedAccountRepoSource, listConnectedRepositories, loadConnectedAccountReplayEvents } from './lib/accountRepoAdapter.js';
import { createChartFromMusicPlan } from './lib/chartMapper.js';
import { loadCollaborationOverlayEvents } from './lib/collaborationOverlayAdapter.js';
import { hasLocalRepoBridge, loadLocalRepoReplayEvents } from './lib/localRepoBridge.js';
import {
  getPlayerCopy,
  PLAYER_LANGUAGES,
  resolveInitialPlayerLanguage,
} from './lib/playerI18n.js';
import { appendPerformanceRecord, loadPerformanceHistory } from './lib/performanceHistoryStore.js';
import { loadPublicRepoReplayEvents, createPublicRepoSource } from './lib/publicRepoAdapter.js';
import { buildMusicPlan } from './lib/musicIntentMapper.js';
import { buildGoldenListeningPackEntries, buildGoldenListeningSource } from './lib/goldenListeningPack.js';
import { registerLocalRepoSource } from './lib/sourceRegistry.js';
import './styles.css';

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
    provider: 'github',
    token: '',
    repoSlug: '',
    branch: 'main',
  },
};

export default function App({ bootstrap = null }) {
  const resolvedBootstrap = resolveAppBootstrap(bootstrap, globalThis.navigator?.language);
  const isExtensionSurface = resolvedBootstrap.surface === 'extension';
  const [language, setLanguage] = useState(() => resolvedBootstrap.initialLanguage);
  const [sourceMode, setSourceMode] = useState(() => resolvedBootstrap.initialSourceMode);
  const [drafts, setDrafts] = useState(() => resolvedBootstrap.initialDrafts);
  const [activeSource, setActiveSource] = useState(null);
  const [loadedEvents, setLoadedEvents] = useState([]);
  const [musicPlan, setMusicPlan] = useState([]);
  const [chart, setChart] = useState(null);
  const [accountRepositories, setAccountRepositories] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isRepoListLoading, setIsRepoListLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [loadErrorCode, setLoadErrorCode] = useState('');
  const [performanceHistory, setPerformanceHistory] = useState(() => loadPerformanceHistory(globalThis));
  const [pendingRunRequest, setPendingRunRequest] = useState(null);
  const [runRequest, setRunRequest] = useState(null);
  const [bootstrapAutoLoadPending, setBootstrapAutoLoadPending] = useState(() => resolvedBootstrap.autoLoadPublicReplay);
  const [deckTab, setDeckTab] = useState('source');
  const localBridgeAvailable = hasLocalRepoBridge(globalThis);
  const copy = getPlayerCopy(language);
  const modeDefinitions = copy.modeDefinitions;
  const goldenListeningEntries = buildGoldenListeningPackEntries();

  const latestEvents = loadedEvents.slice(-6).reverse();

  const replaySummary = (() => {
    const mergeCount = loadedEvents.filter((event) => event.eventType === 'merge').length;
    const reviewCount = loadedEvents.filter((event) => event.eventType.startsWith('review')).length;

    return {
      eventCount: loadedEvents.length,
      commitCount: loadedEvents.filter((event) => event.eventType === 'commit').length,
      mergeCount,
      reviewCount,
      loadedAt: activeSource ? new Date().toISOString() : null,
    };
  })();

  const chartSummary = (() => {
    if (!activeSource) {
      return null;
    }

    const hasNotes = Boolean(chart?.notes?.length);
    return {
      noteCount: chart?.notes?.length || 0,
      laneCount: chart?.laneCount || 4,
      phraseCount: musicPlan.length,
      durationLabel: hasNotes
        ? copy.app.beats(Math.max(...chart.notes.map((note) => note.beatOffset + note.durationBeats)).toFixed(1))
        : copy.common.pending,
      tempoLabel: musicPlan[0]?.tempo ? `${musicPlan[0].tempo} BPM` : copy.common.pending,
      maxDensity: hasNotes ? copy.app.density(Math.max(...summarizeBeatDensity(chart.notes))) : copy.common.pending,
    };
  })();

  const sourceGuideState = buildSourceGuideState({
    activeSource,
    replaySummary,
    drafts,
    accountRepositories,
    localBridgeAvailable,
    language,
  });

  const activeSourceKey = buildPerformanceSourceKey(activeSource);

  const activeChartId = buildPerformanceChartId(activeSourceKey, chart, loadedEvents, musicPlan);
  const activeGoldenScenarioId = activeSource?.sourceType === 'golden-listening-demo' ? activeSource.targetPathOrId || '' : '';

  const visiblePerformanceHistory = (() => {
    if (!performanceHistory.length) {
      return [];
    }

    if (!activeSourceKey) {
      return performanceHistory.slice(0, 6);
    }

    return performanceHistory
      .filter((record) => record.sourceKey === activeSourceKey)
      .slice(0, 6);
  })();

  useEffect(() => {
    if (!pendingRunRequest || !activeSource || !chart?.notes?.length) {
      return;
    }

    if (activeSource.sourceType !== 'golden-listening-demo') {
      return;
    }

    if (activeSource.targetPathOrId !== pendingRunRequest.scenarioId) {
      return;
    }

    setRunRequest({
      requestId: pendingRunRequest.requestId,
      playMode: 'auto',
      autoStart: true,
    });
    setPendingRunRequest(null);
  }, [activeSource, chart?.notes?.length, pendingRunRequest]);

  useEffect(() => {
    if (!bootstrapAutoLoadPending) {
      return;
    }

    if (sourceMode !== 'public' || !drafts.public.url?.trim()) {
      return;
    }

    setBootstrapAutoLoadPending(false);
    void handleLoadReplay();
  }, [bootstrapAutoLoadPending, drafts.public.branch, drafts.public.url, sourceMode]);

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
    setLoadErrorCode('');
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

        setErrorMessage(copy.app.errors.localBridgeNeeded);
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
          provider: source.provider,
        });
        applyReplayResult(source, mergeReplayEvents(replayEvents, overlayEvents));
        return;
      }

      const selectedRepository = accountRepositories.find(
        (repository) => repository.repoSlug === drafts.account.repoSlug,
      );

      if (!selectedRepository) {
        throw new Error(copy.app.errors.selectRepositoryFirst);
      }

      const source = createConnectedAccountRepoSource({
        ...selectedRepository,
        accountId: `connected-${drafts.account.provider}-account`,
        branchName: drafts.account.branch || selectedRepository.defaultBranch || 'main',
        sourceLabel: `${selectedRepository.repo} (${language === 'ko' ? '연결된 계정' : 'connected account'})`,
      });
      const replayEvents = await loadConnectedAccountReplayEvents({
        ...selectedRepository,
        provider: drafts.account.provider,
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
        provider: drafts.account.provider,
      });
      applyReplayResult(source, mergeReplayEvents(replayEvents, overlayEvents));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : copy.app.errors.loadReplayFailed);
      setLoadErrorCode(error?.code || '');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefreshRepositories = async () => {
    setErrorMessage('');
    setIsRepoListLoading(true);

    try {
      const repositories = await listConnectedRepositories({
        provider: drafts.account.provider,
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
      setErrorMessage(error instanceof Error ? error.message : copy.app.errors.refreshRepositoriesFailed);
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

    if (normalizedEvents.length === 0) {
      // 재생할 이력이 없으면 플레이 탭으로 점프하지 않는다 (G2 스펙 §1 EMPTY_HISTORY)
      startTransition(() => {
        setActiveSource(source);
        setLoadedEvents([]);
        setMusicPlan(nextMusicPlan);
        setChart(nextChart);
      });
      setLoadErrorCode('EMPTY_HISTORY');
      return;
    }

    startTransition(() => {
      setActiveSource(source);
      setLoadedEvents(normalizedEvents);
      setMusicPlan(nextMusicPlan);
      setChart(nextChart);
      setDeckTab('play'); // 로드 성공 = 재생 준비 — 플레이 탭으로 자동 전환 (스펙 §1)
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
      sourceLabel: activeSource.sourceLabel || activeSource.repoSlug || activeSource.targetPathOrId || copy.app.sourceLabelFallback,
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

  const handleAutoplayGoldenScenario = (entry) => {
    setErrorMessage('');
    setLoadErrorCode('');
    const source = buildGoldenListeningSource(entry);
    applyReplayResult(source, entry.events);
    setPendingRunRequest({
      scenarioId: entry.id,
      requestId: `golden:${entry.id}:${Date.now()}`,
    });
  };

  return (
    <div className={`player-shell${isExtensionSurface ? ' player-shell--extension' : ''}`}>
      <div className="player-shell__inner">
        <header className="player-hero player-hero--compact">
          <div className="player-hero__content">
            <p className="player-kicker">{copy.hero.eyebrow}</p>
            <h1 className="player-title">{renderHeroTitle(copy, language)}</h1>
          </div>
          <div className="player-hero__controls">
            <span className="player-language-switch__label">{copy.languageLabel}</span>
            <div className="player-language-switch" role="group" aria-label={copy.languageLabel}>
              {PLAYER_LANGUAGES.map((item) => {
                const isActive = language === item.id;

                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`player-language-switch__button${isActive ? ' is-active' : ''}`}
                    aria-pressed={isActive}
                    onClick={() => setLanguage(item.id)}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
          </div>
        </header>

        <main className="player-deck">
          <PlayerDeckTabs
            activeTab={deckTab}
            onSelect={setDeckTab}
            language={language}
            indicators={{
              play: Boolean(chart?.notes?.length),
              session: Boolean(activeSource),
              records: visiblePerformanceHistory.length > 0,
            }}
          />
          {loadErrorCode || errorMessage ? (
            <div className="player-deck__error" role="alert">
              <span>
                {(loadErrorCode && copy.app.errors.publicLoad[loadErrorCode]) || errorMessage || copy.app.errors.loadReplayFailed}
              </span>
              <button
                type="button"
                className="player-deck__retry"
                onClick={() => {
                  void handleLoadReplay();
                }}
              >
                {copy.app.errors.retryLabel}
              </button>
            </div>
          ) : null}
          <section hidden={deckTab !== 'source'} className="player-deck__panel">
            <div className="player-grid">
              <div className="player-column">
                {isExtensionSurface ? (
              <ExtensionPublicLauncher
                language={language}
                publicUrl={drafts.public.url}
                branchName={drafts.public.branch}
                onPublicUrlChange={(value) => handleDraftChange('public', 'url', value)}
                onBranchNameChange={(value) => handleDraftChange('public', 'branch', value)}
                onSubmit={handleLoadReplay}
                isSubmitting={isLoading}
              />
            ) : (
              <>
                <SourceModeTabs
                  mode={sourceMode}
                  modes={modeDefinitions}
                  onModeChange={setSourceMode}
                  ariaLabel={language === 'ko' ? '리플레이 소스 모드' : 'Replay source mode'}
                />
                <p className="source-mode-caption">
                  {modeDefinitions.find((item) => item.id === sourceMode)?.description}
                </p>
                <details className="player-collapsible">
                  <summary className="player-collapsible__summary">{copy.sourceGuide.toggleLabel}</summary>
                  <SourceModeGuide
                    mode={sourceMode}
                    sourceState={sourceGuideState}
                    language={language}
                  />
                </details>
                <SourceInputPanel
                  mode={sourceMode}
                  language={language}
                  repoPath={drafts.local.repoPath}
                  publicUrl={drafts.public.url}
                  branchName={drafts[sourceMode].branch}
                  accountProvider={drafts.account.provider}
                  accountToken={drafts.account.token}
                  selectedRepo={drafts.account.repoSlug}
                  repositories={accountRepositories}
                  onRepoPathChange={(value) => handleDraftChange('local', 'repoPath', value)}
                  onPublicUrlChange={(value) => handleDraftChange('public', 'url', value)}
                  onBranchNameChange={(value) => handleDraftChange(sourceMode, 'branch', value)}
                  onAccountProviderChange={(value) => {
                    setAccountRepositories([]);
                    setDrafts((currentDrafts) => ({
                      ...currentDrafts,
                      account: {
                        ...currentDrafts.account,
                        provider: value,
                        repoSlug: '',
                        branch: 'main',
                      },
                    }));
                  }}
                  onAccountTokenChange={(value) => handleDraftChange('account', 'token', value)}
                  onSelectedRepoChange={(value) => handleDraftChange('account', 'repoSlug', value)}
                  onRefreshRepositories={handleRefreshRepositories}
                  onSubmit={handleLoadReplay}
                  submitLabel={copy.sourceInput.buttons.submit}
                  isSubmitting={isLoading}
                  isRefreshingRepositories={isRepoListLoading}
                />
              </>
            )}
              </div>
              <div className="player-column">
                <GoldenListeningPanel
                  entries={goldenListeningEntries}
                  activeScenarioId={activeGoldenScenarioId}
                  onAutoplay={handleAutoplayGoldenScenario}
                  language={language}
                  compact={isExtensionSurface}
                />
              </div>
            </div>
          </section>
          <section hidden={deckTab !== 'play'} className="player-deck__panel">
            <PlayerRunPanel
              chart={chart}
              tempo={musicPlan[0]?.tempo || 120}
              onRunComplete={handleRunComplete}
              language={language}
              runRequest={runRequest}
            />
          </section>
          <section hidden={deckTab !== 'session'} className="player-deck__panel">
            <ReplayStatusPanel
              activeSource={activeSource}
              replaySummary={replaySummary}
              chartSummary={chartSummary}
              latestError={errorMessage}
              language={language}
            />
            <ReplayEventTimeline
              events={latestEvents}
              title={copy.app.latestEventsTitle}
              emptyMessage={copy.app.latestEventsEmpty}
              maxItems={6}
              language={language}
            />
          </section>
          <section hidden={deckTab !== 'records'} className="player-deck__panel">
            <ScoreHistoryPanel
              activeSource={activeSource}
              records={visiblePerformanceHistory}
              language={language}
            />
          </section>
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
  language,
}) {
  return {
    local: buildLocalGuideState(drafts.local, activeSource, replaySummary, localBridgeAvailable, language),
    public: buildPublicGuideState(drafts.public, activeSource, replaySummary, language),
    account: buildAccountGuideState(drafts.account, accountRepositories, activeSource, replaySummary, language),
  };
}

function resolveAppBootstrap(bootstrap, navigatorLanguage) {
  const initialLanguage = bootstrap?.initialLanguage || resolveInitialPlayerLanguage(navigatorLanguage);
  const initialSourceMode = normalizeInitialSourceMode(bootstrap?.initialSourceMode);
  const initialDrafts = mergeInitialDrafts(bootstrap?.initialDrafts);

  return {
    surface: bootstrap?.surface === 'extension' ? 'extension' : 'web',
    initialLanguage,
    initialSourceMode,
    initialDrafts,
    autoLoadPublicReplay: Boolean(bootstrap?.autoLoadPublicReplay && initialDrafts.public.url?.trim()),
  };
}

function normalizeInitialSourceMode(sourceMode) {
  return ['local', 'public', 'account'].includes(sourceMode) ? sourceMode : 'public';
}

function mergeInitialDrafts(initialDrafts) {
  return {
    local: {
      ...INITIAL_DRAFTS.local,
      ...(initialDrafts?.local || {}),
    },
    public: {
      ...INITIAL_DRAFTS.public,
      ...(initialDrafts?.public || {}),
    },
    account: {
      ...INITIAL_DRAFTS.account,
      ...(initialDrafts?.account || {}),
    },
  };
}

function buildLocalGuideState(localDraft, activeSource, replaySummary, localBridgeAvailable, language = 'en') {
  const copy = getPlayerCopy(language);
  const branchName = localDraft.branch || 'main';
  const repoPath = localDraft.repoPath?.trim();

  if (activeSource?.sourceType === 'git-local') {
    return {
      readiness: language === 'ko' ? '불러옴' : 'Loaded',
      readinessTone: 'ready',
      cue: language === 'ko'
        ? `로컬 브리지에서 ${replaySummary?.eventCount || 0}개 이벤트를 매핑했습니다.`
        : `Replay mapped from the local bridge: ${replaySummary?.eventCount || 0} events.`,
      summary: language === 'ko'
        ? `선택한 로컬 저장소를 ${activeSource.branchName || branchName} 브랜치에서 불러왔습니다.`
        : `Loaded the selected local repository on ${activeSource.branchName || branchName}.`,
    };
  }

  if (localBridgeAvailable) {
    return {
      readiness: language === 'ko' ? '즉시 사용 가능' : 'Ready now',
      readinessTone: 'ready',
      cue: language === 'ko'
        ? `로컬 브리지가 감지되었습니다. ${repoPath ? '선택한 저장소를' : '저장소 경로를 선택하고'} ${branchName} 브랜치에서 불러오세요.`
        : `Local bridge detected. ${repoPath ? 'Load the selected repository' : 'Select a repository path'} on ${branchName}.`,
      risks: language === 'ko'
        ? [
          '경로 접근은 여전히 데스크톱 브리지 구현에 의존합니다.',
          '머신별 저장소 유무가 리플레이를 막을 수 있습니다.',
        ]
        : [
          'Path access still depends on the desktop bridge implementation.',
          'Machine-specific repo availability can still block replay.',
        ],
    };
  }

  if (repoPath) {
    return {
      cue: language === 'ko'
        ? `${repoPath} 경로를 ${branchName} 브랜치 기준으로 준비했습니다. 실제 로딩에는 데스크톱 또는 서버 브리지가 더 필요합니다.`
        : `Prepared ${repoPath} on ${branchName}. Live loading still needs a desktop or server bridge.`,
    };
  }

  return {
    readiness: copy.sourceGuide.modes.local.readiness,
  };
}

function buildPublicGuideState(publicDraft, activeSource, replaySummary, language = 'en') {
  const copy = getPlayerCopy(language);
  const branchName = publicDraft.branch || 'main';
  const publicUrl = publicDraft.url?.trim();

  if (activeSource?.sourceType === 'git-public-url') {
    const reviewSuffix = replaySummary?.reviewCount
      ? language === 'ko'
        ? `, 리뷰 이벤트 ${replaySummary.reviewCount}개 포함`
        : `, including ${replaySummary.reviewCount} review events`
      : '';
    return {
      readiness: language === 'ko' ? '불러옴' : 'Loaded',
      readinessTone: 'ready',
      cue: language === 'ko'
        ? `선택한 공개 소스에서 ${replaySummary?.eventCount || 0}개 이벤트를 매핑했습니다${reviewSuffix}.`
        : `Replay mapped from the selected public source: ${replaySummary?.eventCount || 0} events${reviewSuffix}.`,
      summary: language === 'ko'
        ? `선택한 ${activeSource.provider || 'public'} 저장소에서 ${activeSource.branchName || branchName} 브랜치를 불러왔습니다.`
        : `Loaded ${activeSource.branchName || branchName} from the selected ${activeSource.provider || 'public'} repository.`,
    };
  }

  if (publicUrl) {
    return {
      cue: language === 'ko'
        ? `${publicUrl} 을(를) ${branchName} 브랜치에서 불러올 준비가 됐습니다.`
        : `Ready to load ${publicUrl} on ${branchName}.`,
    };
  }

  return {
    readiness: copy.sourceGuide.modes.public.readiness,
  };
}

function buildAccountGuideState(accountDraft, accountRepositories, activeSource, replaySummary, language = 'en') {
  const copy = getPlayerCopy(language);
  const branchName = accountDraft.branch || 'main';
  const providerLabel = accountDraft.provider === 'gitlab' ? 'GitLab' : 'GitHub';

  if (activeSource?.sourceType === 'git-account') {
    const reviewSuffix = replaySummary?.reviewCount
      ? language === 'ko'
        ? `, 리뷰 이벤트 ${replaySummary.reviewCount}개 포함`
        : `, including ${replaySummary.reviewCount} review events`
      : '';
    return {
      readiness: language === 'ko' ? '불러옴' : 'Loaded',
      readinessTone: 'ready',
      cue: language === 'ko'
        ? `연결된 저장소에서 ${replaySummary?.eventCount || 0}개 이벤트를 매핑했습니다${reviewSuffix}.`
        : `Replay mapped from the connected repository: ${replaySummary?.eventCount || 0} events${reviewSuffix}.`,
      summary: language === 'ko'
        ? `${activeSource.provider || providerLabel} 리플레이를 ${activeSource.branchName || branchName} 브랜치에서 불러왔습니다.`
        : `${activeSource.provider || providerLabel} replay loaded on ${activeSource.branchName || branchName}.`,
    };
  }

  if (accountDraft.token && accountRepositories.length > 0) {
    return {
      readiness: language === 'ko' ? '연결됨' : 'Connected',
      readinessTone: 'ready',
      cue: language === 'ko'
        ? `${providerLabel} 저장소 ${accountRepositories.length}개를 사용할 수 있습니다. 하나를 선택하고 리플레이를 불러오세요.`
        : `${accountRepositories.length} ${providerLabel} repositories available. Select one and load replay.`,
    };
  }

  if (accountDraft.token) {
    return {
      readiness: language === 'ko' ? '연결됨' : 'Connected',
      readinessTone: 'ready',
      cue: language === 'ko'
        ? `${providerLabel} 토큰이 추가되었습니다. 저장소 목록을 새로고침해 선택기를 채우세요.`
        : `${providerLabel} token added. Refresh repositories to populate the picker.`,
    };
  }

  return {
    readiness: language === 'ko' ? '토큰 필요' : 'Token needed',
    cue: language === 'ko'
      ? `${providerLabel} 토큰을 추가하면 저장소 목록을 불러오고 비공개 리플레이까지 열 수 있습니다.`
      : `Add a ${providerLabel} token to list repositories and unlock private replay.`,
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

async function loadOverlayEventsSafe({
  owner,
  repo,
  branchName,
  accessToken,
  fetchImpl,
  canonicalUrl,
  sourceLabel,
  visibility,
  provider,
}) {
  try {
    return await loadCollaborationOverlayEvents({
      owner,
      repo,
      branchName,
      accessToken,
      fetchImpl,
      canonicalUrl,
      sourceLabel,
      visibility,
      provider,
    });
  } catch {
    return [];
  }
}

function mergeReplayEvents(replayEvents, overlayEvents) {
  return [...replayEvents, ...overlayEvents]
    .filter(Boolean)
    .sort((left, right) => String(left.timestamp || '').localeCompare(String(right.timestamp || '')));
}

function buildPerformanceSourceKey(source) {
  if (!source) {
    return '';
  }

  return [
    source.sourceType || 'unknown',
    source.provider || 'unknown',
    source.repoSlug || source.targetPathOrId || source.sourceLabel || 'unknown',
    source.branchName || 'main',
  ].join(':');
}

function buildPerformanceChartId(sourceKey, chart, loadedEvents, musicPlan) {
  if (!sourceKey) {
    return '';
  }

  return [
    sourceKey,
    chart?.notes?.length || 0,
    loadedEvents.length,
    musicPlan.length,
  ].join(':');
}

function renderHeroTitle(copy, language) {
  if (language === 'ko') {
    return (
      <>
        {copy.hero.titleLead}
        <span>{copy.hero.titleAccent}</span>
        {copy.hero.titleTail}
      </>
    );
  }

  return (
    <>
      {copy.hero.titleLead}
      {' '}
      <span>{copy.hero.titleAccent}</span>
      .
    </>
  );
}
