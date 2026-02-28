import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  WS_URL,
  BACH_CHANNEL_STORAGE_KEY,
  BACH_VOLUME_STORAGE_KEY,
  DEFAULT_BACH_CHANNEL_URL,
  YOUTUBE_URL_HELP_TEXT,
  LANES,
  PROJECTS,
  BASE_BOTTOM,
  NOTE_STATUS,
  LANE_HIT_FREQS,
} from './constants/maestro.js';
import { clamp, getStoredString, getStoredNumber, setStoredValue } from './utils/storage.js';
import { ensureSfxAudioContext, playBeep } from './utils/audio.js';
import {
  resolveYouTubeTarget,
  cueYouTubeTarget,
  loadYouTubeTarget,
  loadYouTubeIframeAPI,
} from './utils/youtube.js';
import useMaestroRealtime from './hooks/useMaestroRealtime.js';
import useMaestroGameLoop from './hooks/useMaestroGameLoop.js';
import useMaestroKeyboardControls from './hooks/useMaestroKeyboardControls.js';
import MaestroHeader from './components/maestro/MaestroHeader.jsx';
import ProjectTabs from './components/maestro/ProjectTabs.jsx';
import LaneBoard from './components/maestro/LaneBoard.jsx';
import FooterHelp from './components/maestro/FooterHelp.jsx';
import PreviewModal from './components/maestro/PreviewModal.jsx';

export default function App() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeProjectId, setActiveProjectId] = useState(PROJECTS[0].id);
  const [notes, setNotes] = useState([]);
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [maxCombo, setMaxCombo] = useState(0);
  const [feedbacks, setFeedbacks] = useState([]);
  const [sfxBursts, setSfxBursts] = useState([]);
  const [previewNote, setPreviewNote] = useState(null);

  const [bachChannelUrl, setBachChannelUrl] = useState(() => getStoredString(BACH_CHANNEL_STORAGE_KEY, DEFAULT_BACH_CHANNEL_URL));
  const [bachChannelInput, setBachChannelInput] = useState(() => getStoredString(BACH_CHANNEL_STORAGE_KEY, DEFAULT_BACH_CHANNEL_URL));
  const [bachVolume, setBachVolume] = useState(() => getStoredNumber(BACH_VOLUME_STORAGE_KEY, 35));
  const [isBachReady, setIsBachReady] = useState(false);
  const [isBachPlaying, setIsBachPlaying] = useState(false);
  const [isBachPlaybackRequested, setIsBachPlaybackRequested] = useState(false);
  const [bachVizHz, setBachVizHz] = useState(0);
  const [isBachPanelOpen, setIsBachPanelOpen] = useState(false);
  const [bachError, setBachError] = useState('');

  const notesRef = useRef([]);
  const activeProjectRef = useRef(activeProjectId);
  const bachPlayerHostRef = useRef(null);
  const bachPlayerRef = useRef(null);
  const bachPlayingRef = useRef(false);
  const bachVizTickRef = useRef(0);

  useEffect(() => {
    notesRef.current = notes;
  }, [notes]);

  useEffect(() => {
    activeProjectRef.current = activeProjectId;
  }, [activeProjectId]);

  useEffect(() => {
    bachPlayingRef.current = isBachPlaying;
  }, [isBachPlaying]);

  const showFeedback = useCallback((projectId, lane, text, color) => {
    const id = Date.now() + Math.random();
    setFeedbacks((prev) => [...prev, { id, projectId, lane, text, color }]);
    setTimeout(() => {
      setFeedbacks((prev) => prev.filter((feedback) => feedback.id !== id));
    }, 500);
  }, []);

  const showSfxBurst = useCallback((lane, freq) => {
    const id = Date.now() + Math.random();
    setSfxBursts((prev) => [...prev, { id, lane, label: `${freq.toFixed(2)}Hz` }]);
    setTimeout(() => {
      setSfxBursts((prev) => prev.filter((effect) => effect.id !== id));
    }, 280);
  }, []);

  const {
    wsStatus,
    connectWebSocket,
    disconnectWebSocket,
    sendSocketAction,
  } = useMaestroRealtime({
    wsUrl: WS_URL,
    activeProjectRef,
    notesRef,
    setNotes,
    setScore,
    setCombo,
    setMaxCombo,
    showFeedback,
  });

  useMaestroGameLoop({
    isPlaying,
    wsStatus,
    setNotes,
  });

  useEffect(() => {
    setStoredValue(BACH_CHANNEL_STORAGE_KEY, bachChannelUrl);
  }, [bachChannelUrl]);

  useEffect(() => {
    setStoredValue(BACH_VOLUME_STORAGE_KEY, String(bachVolume));
    if (isBachReady && bachPlayerRef.current && typeof bachPlayerRef.current.setVolume === 'function') {
      bachPlayerRef.current.setVolume(bachVolume);
    }
  }, [bachVolume, isBachReady]);

  useEffect(() => {
    if (!isBachPlaying && !isBachPlaybackRequested) {
      bachVizTickRef.current = 0;
      setBachVizHz(0);
      return;
    }

    const updateHz = () => {
      bachVizTickRef.current += 1;
      const tick = bachVizTickRef.current;
      const base = 220 + Math.round((bachVolume / 100) * 180);
      const visualizedHz = Math.round(base + Math.abs(Math.sin(tick / 3)) * 320);
      setBachVizHz(visualizedHz);
    };

    updateHz();
    const timerId = setInterval(updateHz, 140);
    return () => clearInterval(timerId);
  }, [isBachPlaying, isBachPlaybackRequested, bachVolume]);

  useEffect(() => {
    let isDisposed = false;

    loadYouTubeIframeAPI()
      .then((YT) => {
        if (isDisposed || !bachPlayerHostRef.current) return;

        const player = new YT.Player(bachPlayerHostRef.current, {
          width: '1',
          height: '1',
          playerVars: {
            autoplay: 0,
            controls: 0,
            disablekb: 1,
            fs: 0,
            rel: 0,
            modestbranding: 1,
            playsinline: 1,
          },
          events: {
            onReady: (event) => {
              if (isDisposed) return;
              const target = resolveYouTubeTarget(bachChannelUrl) || resolveYouTubeTarget(DEFAULT_BACH_CHANNEL_URL);

              if (typeof event.target.setVolume === 'function') {
                event.target.setVolume(bachVolume);
              }
              if (target) cueYouTubeTarget(event.target, target);

              setIsBachReady(true);
              setBachError('');
            },
            onStateChange: (event) => {
              const playerState = window.YT?.PlayerState;
              if (!playerState) return;

              if (event.data === playerState.PLAYING) {
                setIsBachPlaying(true);
                setIsBachPlaybackRequested(true);
              }
              if (event.data === playerState.PAUSED || event.data === playerState.ENDED || event.data === playerState.CUED) {
                setIsBachPlaying(false);
                if (event.data !== playerState.CUED) {
                  setIsBachPlaybackRequested(false);
                }
              }
            },
            onError: () => {
              if (isDisposed) return;
              setIsBachPlaying(false);
              setIsBachPlaybackRequested(false);
              setBachError('재생에 실패했습니다. 채널/영상 URL을 확인해주세요.');
            },
          },
        });

        bachPlayerRef.current = player;
      })
      .catch(() => {
        if (isDisposed) return;
        setBachError('YouTube 플레이어를 로드하지 못했습니다.');
      });

    return () => {
      isDisposed = true;
      if (bachPlayerRef.current && typeof bachPlayerRef.current.destroy === 'function') {
        bachPlayerRef.current.destroy();
      }
      bachPlayerRef.current = null;
      setIsBachReady(false);
      setIsBachPlaying(false);
      setIsBachPlaybackRequested(false);
    };
  }, []);

  useEffect(() => {
    const target = resolveYouTubeTarget(bachChannelUrl);
    if (!target) {
      setBachError(YOUTUBE_URL_HELP_TEXT);
      return;
    }

    if (!isBachReady || !bachPlayerRef.current) return;

    if (bachPlayingRef.current) {
      loadYouTubeTarget(bachPlayerRef.current, target);
      return;
    }

    cueYouTubeTarget(bachPlayerRef.current, target);
  }, [bachChannelUrl, isBachReady]);

  const triggerLaneAction = useCallback((laneId, options = {}) => {
    const { isRejectAction = false, promptFeedback = false } = options;
    if (!isPlaying || previewNote) return;

    const laneMatch = LANES.find((lane) => lane.id === laneId);
    if (!laneMatch) return;

    const currentProjectId = activeProjectRef.current;
    const selectedFreq = LANE_HIT_FREQS[laneMatch.id];
    playBeep(selectedFreq, 'triangle');
    showSfxBurst(laneMatch.id, selectedFreq);

    const currentNotes = notesRef.current;
    const laneNotes = currentNotes.filter(
      (note) => note.lane === laneMatch.id
        && note.projectId === currentProjectId
        && note.status === NOTE_STATUS.READY,
    );
    const hasPendingLaneNote = currentNotes.some(
      (note) => note.lane === laneMatch.id
        && note.projectId === currentProjectId
        && note.status !== NOTE_STATUS.READY,
    );

    if (laneNotes.length === 0) {
      if (hasPendingLaneNote) {
        showFeedback(currentProjectId, laneMatch.id, 'PENDING', 'text-yellow-400');
      } else {
        showFeedback(currentProjectId, laneMatch.id, 'EMPTY', 'text-gray-500');
        setCombo(0);
      }
      return;
    }

    const targetNote = laneNotes[0];
    let rejectFeedback = '';

    if (isRejectAction && promptFeedback && typeof window !== 'undefined' && typeof window.prompt === 'function') {
      const input = window.prompt('반려 사유를 입력하세요 (선택, 취소 시 반려 취소)', '');
      if (input === null) {
        showFeedback(currentProjectId, laneMatch.id, 'REJECT CANCELED', 'text-gray-400');
        return;
      }
      rejectFeedback = input.trim().slice(0, 300);
    }

    const sent = sendSocketAction({
      action: isRejectAction ? 'REJECT' : 'APPROVE',
      requestId: targetNote.requestId,
      branchName: targetNote.branchName,
      laneIndex: laneMatch.id + 1,
      feedback: isRejectAction ? (rejectFeedback || 'Rejected from dashboard') : '',
    });

    if (sent) {
      setNotes((prev) => prev.map((note) => (
        note.id === targetNote.id
          ? { ...note, status: isRejectAction ? NOTE_STATUS.REJECTING : NOTE_STATUS.APPROVING }
          : note
      )));
      showFeedback(
        currentProjectId,
        laneMatch.id,
        isRejectAction ? 'REJECTING...' : 'APPROVING...',
        isRejectAction ? 'text-orange-300' : 'text-yellow-300',
      );
      return;
    }

    setNotes((prev) => prev.filter((note) => note.id !== targetNote.id));
    if (isRejectAction) {
      setCombo(0);
      showFeedback(
        currentProjectId,
        laneMatch.id,
        rejectFeedback ? 'REJECTED (WITH FEEDBACK)' : 'REJECTED',
        'text-orange-300',
      );
      return;
    }

    setScore((prevScore) => prevScore + 100);
    setCombo((prevCombo) => {
      const nextCombo = prevCombo + 1;
      setMaxCombo((currentMax) => Math.max(currentMax, nextCombo));
      return nextCombo;
    });
    showFeedback(currentProjectId, laneMatch.id, 'MERGED!', 'text-green-400');
  }, [isPlaying, previewNote, sendSocketAction, showFeedback, showSfxBurst]);

  const triggerUndoAction = useCallback(() => {
    if (!isPlaying || previewNote) return;

    const currentProjectId = activeProjectRef.current;
    const sent = sendSocketAction({ action: 'UNDO' });
    if (sent) {
      showFeedback(currentProjectId, -1, 'ROLLBACK REQUESTED', 'text-yellow-400');
      return;
    }

    showFeedback(currentProjectId, -1, '⏪ ROLLBACK EXECUTED', 'text-yellow-400');
    setScore((prevScore) => Math.max(0, prevScore - 100));
    setCombo(0);
  }, [isPlaying, previewNote, sendSocketAction, showFeedback]);

  useMaestroKeyboardControls({
    isPlaying,
    previewNote,
    setPreviewNote,
    setIsBachPanelOpen,
    setActiveProjectId,
    triggerUndoAction,
    triggerLaneAction,
  });

  const startGame = () => {
    ensureSfxAudioContext();
    setNotes([]);
    setSfxBursts([]);
    setScore(0);
    setCombo(0);
    setIsPlaying(true);
    connectWebSocket();
  };

  const stopGame = () => {
    setIsPlaying(false);
    setNotes([]);
    setSfxBursts([]);
    setIsBachPlaybackRequested(false);
    disconnectWebSocket();
  };

  const playBach = useCallback(() => {
    setIsBachPlaybackRequested(true);
    if (!isBachReady || !bachPlayerRef.current) {
      setBachError('YouTube 플레이어 준비 중입니다.');
      return;
    }

    const target = resolveYouTubeTarget(bachChannelUrl);
    if (!target) {
      setBachError(YOUTUBE_URL_HELP_TEXT);
      return;
    }

    setBachError('');
    loadYouTubeTarget(bachPlayerRef.current, target);
  }, [bachChannelUrl, isBachReady]);

  const pauseBach = useCallback(() => {
    if (!isBachReady || !bachPlayerRef.current) return;
    if (typeof bachPlayerRef.current.pauseVideo === 'function') {
      bachPlayerRef.current.pauseVideo();
    }
    setIsBachPlaying(false);
    setIsBachPlaybackRequested(false);
  }, [isBachReady]);

  const toggleBachPlayback = useCallback(() => {
    if (isBachPlaying) {
      pauseBach();
      return;
    }
    playBach();
  }, [isBachPlaying, pauseBach, playBach]);

  const saveBachChannel = () => {
    const target = resolveYouTubeTarget(bachChannelInput);
    if (!target) {
      setBachError(YOUTUBE_URL_HELP_TEXT);
      return;
    }

    setBachChannelUrl(target.canonicalUrl);
    setBachChannelInput(target.canonicalUrl);
    setBachError('');
    setIsBachPanelOpen(false);
  };

  const resetBachChannel = () => {
    setBachChannelUrl(DEFAULT_BACH_CHANNEL_URL);
    setBachChannelInput(DEFAULT_BACH_CHANNEL_URL);
    setBachError('');
  };

  const handleBachVolumeChange = useCallback((value) => {
    setBachVolume(clamp(value, 0, 100));
  }, []);

  const handleBachPanelToggle = useCallback(() => {
    setIsBachPanelOpen((open) => !open);
  }, []);

  const handleBachPanelClose = useCallback(() => {
    setBachChannelInput(bachChannelUrl);
    setIsBachPanelOpen(false);
  }, [bachChannelUrl]);

  return (
    <div className="flex flex-col h-screen bg-gray-950 text-white font-sans overflow-hidden selection:bg-purple-500/30">
      <div
        ref={bachPlayerHostRef}
        aria-hidden="true"
        className="absolute -left-[9999px] top-0 h-px w-px overflow-hidden"
      />

      <MaestroHeader
        isBachPlaying={isBachPlaying}
        isBachReady={isBachReady}
        isBachPlaybackRequested={isBachPlaybackRequested}
        bachVizHz={bachVizHz}
        toggleBachPlayback={toggleBachPlayback}
        bachVolume={bachVolume}
        onBachVolumeChange={handleBachVolumeChange}
        isBachPanelOpen={isBachPanelOpen}
        onToggleBachPanel={handleBachPanelToggle}
        bachChannelInput={bachChannelInput}
        onBachChannelInputChange={setBachChannelInput}
        onResetBachChannel={resetBachChannel}
        onCloseBachPanel={handleBachPanelClose}
        onSaveBachChannel={saveBachChannel}
        youtubeUrlHelpText={YOUTUBE_URL_HELP_TEXT}
        bachError={bachError}
        wsStatus={wsStatus}
        isPlaying={isPlaying}
        score={score}
        maxCombo={maxCombo}
        onStartGame={startGame}
        onStopGame={stopGame}
        onUndo={triggerUndoAction}
      />

      <ProjectTabs
        projects={PROJECTS}
        notes={notes}
        activeProjectId={activeProjectId}
        onSelectProject={setActiveProjectId}
      />

      <LaneBoard
        lanes={LANES}
        notes={notes}
        activeProjectId={activeProjectId}
        combo={combo}
        feedbacks={feedbacks}
        sfxBursts={sfxBursts}
        baseBottom={BASE_BOTTOM}
        noteStatus={NOTE_STATUS}
        onPreviewNote={setPreviewNote}
        onLaneAction={triggerLaneAction}
      />

      <FooterHelp />

      <PreviewModal previewNote={previewNote} onClose={() => setPreviewNote(null)} />
    </div>
  );
}
