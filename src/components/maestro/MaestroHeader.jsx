import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Activity, Play, Pause, Square, Wifi, WifiOff } from 'lucide-react';

export default function MaestroHeader({
  headerRef,
  isBachPlaying,
  isBachReady,
  isBachPlaybackRequested,
  bachVizHz,
  bachHzLabel,
  bachStatusLabel,
  bachPlayerStateCode,
  toggleBachPlayback,
  bachVolume,
  onBachVolumeChange,
  isBachPanelOpen,
  onToggleBachPanel,
  bachChannelInput,
  onBachChannelInputChange,
  onResetBachChannel,
  onCloseBachPanel,
  onSaveBachChannel,
  youtubeUrlHelpText,
  bachError,
  wsStatus,
  isPlaying,
  score,
  mergedCount = 0,
  maxCombo,
  onStartGame,
  onStopGame,
  onUndo,
  currentRuntimeProjectName,
  isProjectPanelOpen,
  onToggleProjectPanel,
  isProjectAuthRequired,
  autoApproveStatusLabel,
  autoApproveEventCount,
  isAutoApproveEnabled,
  isAutoApproveDryRun,
  isAutoApproveAuthRequired,
  isAutoApprovePanelOpen,
  onToggleAutoApprovePanel,
  historyCount,
  isHistoryPanelOpen,
  onToggleHistoryPanel,
  isWorkConsoleOpen,
  onToggleWorkConsole,
  isWorkflowEnabled = false,
  isWorkRequestPanelOpen = false,
  onToggleWorkRequestPanel,
}) {
  const [shouldCollapsePanelControls, setShouldCollapsePanelControls] = useState(() => (
    typeof window !== 'undefined' ? window.innerWidth < 1480 : false
  ));
  const [isPanelMenuOpen, setIsPanelMenuOpen] = useState(false);
  const panelMenuRef = useRef(null);

  useEffect(() => {
    const handleResize = () => {
      setShouldCollapsePanelControls(window.innerWidth < 1480);
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (!shouldCollapsePanelControls) {
      setIsPanelMenuOpen(false);
    }
  }, [shouldCollapsePanelControls]);

  useEffect(() => {
    if (!isPanelMenuOpen) return undefined;

    const handlePointerDown = (event) => {
      if (panelMenuRef.current?.contains(event.target)) return;
      setIsPanelMenuOpen(false);
    };

    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        setIsPanelMenuOpen(false);
      }
    };

    window.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleEscape);
    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleEscape);
    };
  }, [isPanelMenuOpen]);

  const panelControls = useMemo(() => ([
    {
      key: 'work',
      label: 'Work',
      ariaLabel: 'Work Console 패널 토글',
      panelId: 'work-console-panel',
      isExpanded: isWorkConsoleOpen,
      buttonClass: isWorkConsoleOpen
        ? 'border-cyan-400/60 bg-cyan-500/20 text-cyan-100'
        : 'border-gray-700 bg-gray-900/70 text-gray-300 hover:border-cyan-400/50 hover:text-cyan-100',
      onClick: onToggleWorkConsole,
    },
    ...(isWorkflowEnabled ? [{
      key: 'work-request',
      label: 'Requests',
      ariaLabel: '작업 요청 패널 토글',
      panelId: 'work-request-panel',
      isExpanded: isWorkRequestPanelOpen,
      buttonClass: isWorkRequestPanelOpen
        ? 'border-amber-400/60 bg-amber-500/20 text-amber-100'
        : 'border-gray-700 bg-gray-900/70 text-gray-300 hover:border-amber-400/50 hover:text-amber-100',
      onClick: onToggleWorkRequestPanel,
    }] : []),
    {
      key: 'project',
      label: `Repo ${currentRuntimeProjectName || 'runtime'}`,
      ariaLabel: '프로젝트 전환 패널 토글',
      panelId: 'project-registry-panel',
      isExpanded: isProjectPanelOpen,
      buttonClass: isProjectPanelOpen
        ? 'border-cyan-400/60 bg-cyan-500/20 text-cyan-100'
        : isProjectAuthRequired
          ? 'border-amber-500/50 bg-amber-500/10 text-amber-200 hover:border-amber-400/70'
          : 'border-gray-700 bg-gray-900/70 text-gray-300 hover:border-cyan-400/50 hover:text-cyan-100',
      onClick: onToggleProjectPanel,
    },
    {
      key: 'auto-approve',
      label: `AutoOps ${autoApproveStatusLabel} (${autoApproveEventCount})`,
      ariaLabel: '자동승인 운영 패널 토글',
      panelId: 'auto-approve-ops-panel',
      isExpanded: isAutoApprovePanelOpen,
      buttonClass: isAutoApprovePanelOpen
        ? 'border-emerald-400/60 bg-emerald-500/20 text-emerald-100'
        : isAutoApproveAuthRequired
          ? 'border-amber-500/50 bg-amber-500/10 text-amber-200 hover:border-amber-400/70'
          : isAutoApproveEnabled
            ? (isAutoApproveDryRun
              ? 'border-amber-500/40 bg-amber-500/10 text-amber-200 hover:border-amber-400/60'
              : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200 hover:border-emerald-400/60')
            : 'border-gray-700 bg-gray-900/70 text-gray-300 hover:border-emerald-400/40 hover:text-emerald-100',
      onClick: onToggleAutoApprovePanel,
    },
    {
      key: 'history',
      label: `History (${historyCount})`,
      ariaLabel: '히스토리 패널 토글',
      panelId: 'approval-history-panel',
      isExpanded: isHistoryPanelOpen,
      buttonClass: isHistoryPanelOpen
        ? 'border-cyan-400/60 bg-cyan-500/20 text-cyan-100'
        : 'border-gray-700 bg-gray-900/70 text-gray-300 hover:border-cyan-400/50 hover:text-cyan-100',
      onClick: onToggleHistoryPanel,
    },
  ]), [
    autoApproveEventCount,
    autoApproveStatusLabel,
    currentRuntimeProjectName,
    historyCount,
    isAutoApproveAuthRequired,
    isAutoApproveDryRun,
    isAutoApproveEnabled,
    isAutoApprovePanelOpen,
    isHistoryPanelOpen,
    isProjectAuthRequired,
    isProjectPanelOpen,
    isWorkConsoleOpen,
    isWorkflowEnabled,
    isWorkRequestPanelOpen,
    onToggleAutoApprovePanel,
    onToggleHistoryPanel,
    onToggleProjectPanel,
    onToggleWorkConsole,
    onToggleWorkRequestPanel,
  ]);

  const renderPanelControlButton = (control, compact = false) => (
    <button
      key={control.key}
      type="button"
      onClick={() => {
        control.onClick();
        if (compact) {
          setIsPanelMenuOpen(false);
        }
      }}
      aria-label={control.ariaLabel}
      aria-controls={control.panelId}
      aria-expanded={control.isExpanded}
      data-testid={control.key === 'work' ? 'work-console-toggle' : control.key === 'project' ? 'project-panel-toggle' : control.key === 'auto-approve' ? 'auto-approve-toggle' : undefined}
      className={`maestro-touch-control maestro-touch-control--compact rounded-full border px-2 py-1 text-[11px] font-semibold transition-colors ${
        compact ? 'w-full text-left' : ''
      } ${control.buttonClass}`}
    >
      {control.label}
    </button>
  );

  return (
    <header ref={headerRef} className="relative z-50 border-b border-gray-800 bg-gray-900/50 p-4 shadow-lg backdrop-blur-md">
      <div className="flex flex-col gap-3 2xl:flex-row 2xl:items-center 2xl:justify-between">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <Activity className="w-6 h-6 text-purple-500" />
          <h1 className="text-xl font-bold tracking-tight">Maestro <span className="text-purple-400 font-light">Workspace</span></h1>
          <div className="relative block max-w-full">
            <div
              data-testid="function-bach-mini"
              className="flex max-w-full flex-wrap items-center gap-1 rounded-full border border-amber-400/40 bg-gray-900/80 px-2 py-1 text-[11px] text-gray-200 shadow-lg backdrop-blur"
            >
              <span className="shrink-0 font-semibold text-amber-200">function bach</span>
              <span className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${isBachPlaying ? 'bg-green-400' : isBachReady ? 'bg-amber-300' : 'bg-gray-500'}`} />
              <span
                data-testid="function-bach-state"
                aria-label={`재생 상태 ${bachStatusLabel} (YT state: ${bachPlayerStateCode})`}
                className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${
                  bachStatusLabel === 'playing'
                    ? 'border-green-500/40 bg-green-500/10 text-green-200'
                    : bachStatusLabel === 'queued'
                      ? 'border-blue-500/40 bg-blue-500/10 text-blue-200'
                      : bachStatusLabel === 'paused'
                        ? 'border-gray-600 bg-gray-800/90 text-gray-200'
                        : bachStatusLabel === 'error'
                          ? 'border-red-500/40 bg-red-500/10 text-red-200'
                          : 'border-amber-500/30 bg-amber-500/10 text-amber-100'
                }`}
              >
                {bachStatusLabel}
              </span>
              <span
                data-testid="function-bach-hz"
                className={`min-w-[72px] shrink-0 rounded-full border px-1.5 py-0.5 text-center text-[10px] font-mono ${
                  bachHzLabel.includes('Hz')
                    ? 'border-amber-400/40 bg-amber-500/10 text-amber-200'
                    : 'border-gray-700 bg-gray-900/70 text-gray-400'
                }`}
              >
                {bachHzLabel}
              </span>
              <button
                onClick={toggleBachPlayback}
                aria-label={isBachPlaying ? '배경음악 일시정지' : '배경음악 재생'}
                className="maestro-touch-control maestro-touch-control--compact shrink-0 rounded bg-gray-800/90 px-1.5 py-0.5 text-[10px] font-medium text-gray-100 hover:bg-gray-700"
              >
                {isBachPlaying ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3 fill-current" />}
              </button>
              <label className="flex shrink-0 items-center gap-1 pl-1">
                <span className="text-[10px] text-gray-400">Vol</span>
                <input
                  aria-label="배경음악 볼륨"
                  type="range"
                  min="0"
                  max="100"
                  value={bachVolume}
                  onChange={(e) => onBachVolumeChange(Number(e.target.value))}
                  className="h-1 w-16 accent-amber-300"
                />
              </label>
              <button
                onClick={onToggleBachPanel}
                aria-label="배경음악 채널 설정"
                className="maestro-touch-control maestro-touch-control--compact shrink-0 rounded border border-gray-700 px-1.5 py-0.5 text-[10px] text-gray-300 hover:border-amber-300 hover:text-amber-200"
              >
                채널
              </button>
            </div>
            {isBachPanelOpen && (
              <div className="absolute left-0 top-full z-40 mt-2 w-[320px] max-w-[calc(100vw-2rem)] rounded-xl border border-gray-700 bg-gray-900/95 p-3 shadow-2xl">
                <label htmlFor="bach-channel-input" className="text-[11px] text-gray-300">
                  유튜브 채널 경로
                </label>
                <input
                  id="bach-channel-input"
                  type="text"
                  value={bachChannelInput}
                  onChange={(e) => onBachChannelInputChange(e.target.value)}
                  placeholder="https://www.youtube.com/channel/UC..."
                  className="mt-1 w-full rounded-md border border-gray-700 bg-gray-950 px-2 py-1.5 text-xs text-gray-100 outline-none focus:border-amber-300"
                />
                <p className="mt-1 text-[10px] text-gray-400">
                  {youtubeUrlHelpText}
                </p>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <button
                    onClick={onResetBachChannel}
                    className="maestro-touch-control maestro-touch-control--compact rounded-md border border-amber-500/40 px-2 py-1 text-[11px] text-amber-200 hover:bg-amber-500/10"
                  >
                    기본 바흐 채널
                  </button>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={onCloseBachPanel}
                      className="maestro-touch-control maestro-touch-control--compact rounded-md border border-gray-700 px-2 py-1 text-[11px] text-gray-300 hover:bg-gray-800"
                    >
                      닫기
                    </button>
                    <button
                      onClick={onSaveBachChannel}
                      className="maestro-touch-control maestro-touch-control--compact rounded-md bg-amber-500 px-2 py-1 text-[11px] font-semibold text-black hover:bg-amber-400"
                    >
                      저장
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
          {wsStatus === 'connected' && (
            <div className="flex shrink-0 items-center px-2 py-1 bg-green-500/10 border border-green-500/30 rounded-full text-[10px] sm:text-xs text-green-400">
              <Wifi className="w-3 h-3 mr-1" /> LIVE
            </div>
          )}
          {wsStatus === 'connecting' && (
            <div className="flex shrink-0 items-center px-2 py-1 bg-yellow-500/10 border border-yellow-500/30 rounded-full text-[10px] sm:text-xs text-yellow-400 animate-pulse">
              <Wifi className="w-3 h-3 mr-1" /> 연결 중...
            </div>
          )}
          {wsStatus === 'disconnected' && isPlaying && (
            <div className="flex shrink-0 items-center px-2 py-1 bg-gray-800 border border-gray-700 rounded-full text-[10px] sm:text-xs text-gray-500">
              <WifiOff className="w-3 h-3 mr-1" /> Mock
            </div>
          )}
          {bachError && (
            <div className="hidden md:block text-[10px] text-amber-300">
              {bachError}
            </div>
          )}
          {!shouldCollapsePanelControls && (
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              {panelControls.map((control) => renderPanelControlButton(control))}
            </div>
          )}
          {shouldCollapsePanelControls && (
            <div ref={panelMenuRef} className="relative shrink-0">
              <button
                type="button"
                onClick={() => setIsPanelMenuOpen((open) => !open)}
                aria-label="패널 메뉴 토글"
                aria-controls="maestro-panel-overflow-menu"
                aria-expanded={isPanelMenuOpen}
                className="maestro-touch-control maestro-touch-control--compact rounded-full border border-gray-700 bg-gray-900/80 px-3 py-1.5 text-[11px] font-semibold text-gray-200 transition-colors hover:border-cyan-400/50 hover:text-cyan-100"
              >
                Panels
              </button>
              {isPanelMenuOpen && (
                <div
                  id="maestro-panel-overflow-menu"
                  className="absolute left-0 top-full z-50 mt-2 flex w-64 flex-col gap-2 rounded-2xl border border-gray-700/80 bg-gray-900/95 p-3 shadow-2xl"
                >
                  {panelControls.map((control) => renderPanelControlButton(control, true))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex w-full flex-wrap items-center justify-end gap-4 2xl:w-auto">
          <div className="flex flex-col items-end">
            <span className="text-xs text-gray-400 uppercase tracking-wider">Merged PRs</span>
            <span data-testid="merged-count" className="text-2xl font-mono font-bold text-green-400">{mergedCount}</span>
          </div>
          <div className="flex flex-col items-end">
            <span className="text-xs text-gray-400 uppercase tracking-wider">Score</span>
            <span data-testid="rhythm-score" className="text-2xl font-mono font-bold text-amber-300">{score}</span>
          </div>
          <div className="flex flex-col items-end">
            <span className="text-xs text-gray-400 uppercase tracking-wider">Max Combo</span>
            <span className="text-2xl font-mono font-bold text-purple-400">{maxCombo}</span>
          </div>

          {!isPlaying ? (
            <button onClick={onStartGame} className="maestro-touch-control flex items-center px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-md font-medium transition-all shadow-[0_0_15px_rgba(168,85,247,0.5)]">
              <Play className="w-4 h-4 mr-2 fill-current" /> 지휘 시작
            </button>
          ) : (
            <button onClick={onStopGame} className="maestro-touch-control flex items-center px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-md font-medium transition-all">
              <Square className="w-4 h-4 mr-2 fill-current" /> 중지
            </button>
          )}
          {isPlaying && (
            <button
              type="button"
              onClick={onUndo}
              aria-label="롤백 실행"
              className="maestro-touch-control flex items-center rounded-md border border-yellow-500/40 bg-yellow-500/10 px-3 py-2 text-xs font-semibold text-yellow-200 transition-colors hover:bg-yellow-500/20"
            >
              Ctrl+Z / Tap Undo
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
