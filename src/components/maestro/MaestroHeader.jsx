import React from 'react';
import { Activity, Play, Pause, Square, Wifi, WifiOff } from 'lucide-react';

export default function MaestroHeader({
  isBachPlaying,
  isBachReady,
  isBachPlaybackRequested,
  bachVizHz,
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
  maxCombo,
  onStartGame,
  onStopGame,
  onUndo,
  historyCount,
  isHistoryPanelOpen,
  onToggleHistoryPanel,
}) {
  return (
    <header className="flex items-center justify-between p-4 border-b border-gray-800 bg-gray-900/50 backdrop-blur-md z-50 shadow-lg relative">
      <div className="flex items-center space-x-3">
        <Activity className="w-6 h-6 text-purple-500" />
        <h1 className="text-xl font-bold tracking-tight">Maestro <span className="text-purple-400 font-light">Workspace</span></h1>
        <div className="relative ml-3 block">
          <div
            data-testid="function-bach-mini"
            className="flex items-center gap-1 rounded-full border border-amber-400/40 bg-gray-900/80 px-2 py-1 text-[11px] text-gray-200 shadow-lg backdrop-blur"
          >
            <span className="font-semibold text-amber-200">function bach</span>
            <span className={`inline-block h-1.5 w-1.5 rounded-full ${isBachPlaying ? 'bg-green-400' : isBachReady ? 'bg-amber-300' : 'bg-gray-500'}`} />
            {(isBachPlaying || isBachPlaybackRequested) && (
              <span data-testid="function-bach-hz" className="rounded-full border border-amber-400/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-mono text-amber-200">
                ~{bachVizHz}Hz
              </span>
            )}
            <button
              onClick={toggleBachPlayback}
              aria-label={isBachPlaying ? '배경음악 일시정지' : '배경음악 재생'}
              className="rounded bg-gray-800/90 px-1.5 py-0.5 text-[10px] font-medium text-gray-100 hover:bg-gray-700"
            >
              {isBachPlaying ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3 fill-current" />}
            </button>
            <label className="flex items-center gap-1 pl-1">
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
              className="rounded border border-gray-700 px-1.5 py-0.5 text-[10px] text-gray-300 hover:border-amber-300 hover:text-amber-200"
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
                  className="rounded-md border border-amber-500/40 px-2 py-1 text-[11px] text-amber-200 hover:bg-amber-500/10"
                >
                  기본 바흐 채널
                </button>
                <div className="flex items-center gap-2">
                  <button
                    onClick={onCloseBachPanel}
                    className="rounded-md border border-gray-700 px-2 py-1 text-[11px] text-gray-300 hover:bg-gray-800"
                  >
                    닫기
                  </button>
                  <button
                    onClick={onSaveBachChannel}
                    className="rounded-md bg-amber-500 px-2 py-1 text-[11px] font-semibold text-black hover:bg-amber-400"
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
        <button
          type="button"
          onClick={onToggleHistoryPanel}
          aria-label="히스토리 패널 토글"
          className={`ml-2 rounded-full border px-2 py-1 text-[11px] font-semibold transition-colors ${
            isHistoryPanelOpen
              ? 'border-cyan-400/60 bg-cyan-500/20 text-cyan-100'
              : 'border-gray-700 bg-gray-900/70 text-gray-300 hover:border-cyan-400/50 hover:text-cyan-100'
          }`}
        >
          History ({historyCount})
        </button>
      </div>

      <div className="flex items-center space-x-6">
        <div className="flex flex-col items-end">
          <span className="text-xs text-gray-400 uppercase tracking-wider">Merged PRs</span>
          <span className="text-2xl font-mono font-bold text-green-400">{score / 100}</span>
        </div>
        <div className="flex flex-col items-end">
          <span className="text-xs text-gray-400 uppercase tracking-wider">Max Combo</span>
          <span className="text-2xl font-mono font-bold text-purple-400">{maxCombo}</span>
        </div>

        {!isPlaying ? (
          <button onClick={onStartGame} className="flex items-center px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-md font-medium transition-all shadow-[0_0_15px_rgba(168,85,247,0.5)]">
            <Play className="w-4 h-4 mr-2 fill-current" /> 지휘 시작
          </button>
        ) : (
          <button onClick={onStopGame} className="flex items-center px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-md font-medium transition-all">
            <Square className="w-4 h-4 mr-2 fill-current" /> 중지
          </button>
        )}
        {isPlaying && (
          <button
            type="button"
            onClick={onUndo}
            aria-label="롤백 실행"
            className="flex items-center rounded-md border border-yellow-500/40 bg-yellow-500/10 px-3 py-2 text-xs font-semibold text-yellow-200 transition-colors hover:bg-yellow-500/20 touch-manipulation"
          >
            Ctrl+Z / Tap Undo
          </button>
        )}
      </div>
    </header>
  );
}
