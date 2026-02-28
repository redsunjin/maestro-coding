import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  WS_URL,
  BACH_CHANNEL_STORAGE_KEY,
  BACH_VOLUME_STORAGE_KEY,
  DEFAULT_BACH_CHANNEL_URL,
  YOUTUBE_URL_HELP_TEXT,
  LANES,
  PROJECTS,
  MOCK_COMMITS,
  BASE_BOTTOM,
  NOTE_HEIGHT_OFFSET,
  NOTE_SPEED,
  SPAWN_BOTTOM,
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
  const [previewNote, setPreviewNote] = useState(null); // 코드 미리보기 모달 상태
  // 'disconnected' | 'connecting' | 'connected'
  const [wsStatus, setWsStatus] = useState('disconnected');
  const [bachChannelUrl, setBachChannelUrl] = useState(() => getStoredString(BACH_CHANNEL_STORAGE_KEY, DEFAULT_BACH_CHANNEL_URL));
  const [bachChannelInput, setBachChannelInput] = useState(() => getStoredString(BACH_CHANNEL_STORAGE_KEY, DEFAULT_BACH_CHANNEL_URL));
  const [bachVolume, setBachVolume] = useState(() => getStoredNumber(BACH_VOLUME_STORAGE_KEY, 35));
  const [isBachReady, setIsBachReady] = useState(false);
  const [isBachPlaying, setIsBachPlaying] = useState(false);
  const [isBachPlaybackRequested, setIsBachPlaybackRequested] = useState(false);
  const [bachVizHz, setBachVizHz] = useState(0);
  const [isBachPanelOpen, setIsBachPanelOpen] = useState(false);
  const [bachError, setBachError] = useState('');
  
  const requestRef = useRef();
  const notesRef = useRef([]);
  const activeProjectRef = useRef(activeProjectId);
  const wsRef = useRef(null);
  const bachPlayerHostRef = useRef(null);
  const bachPlayerRef = useRef(null);
  const bachPlayingRef = useRef(false);
  const bachVizTickRef = useRef(0);

  // 상태 동기화를 위한 Ref 업데이트
  useEffect(() => { notesRef.current = notes; }, [notes]);
  useEffect(() => { activeProjectRef.current = activeProjectId; }, [activeProjectId]);
  useEffect(() => { bachPlayingRef.current = isBachPlaying; }, [isBachPlaying]);

  function showFeedback(projectId, lane, text, color) {
    const id = Date.now() + Math.random();
    setFeedbacks(prev => [...prev, { id, projectId, lane, text, color }]);
    setTimeout(() => {
      setFeedbacks(prev => prev.filter(f => f.id !== id));
    }, 500);
  }

  function showSfxBurst(lane, freq) {
    const id = Date.now() + Math.random();
    setSfxBursts(prev => [...prev, { id, lane, label: `${freq.toFixed(2)}Hz` }]);
    setTimeout(() => {
      setSfxBursts(prev => prev.filter(effect => effect.id !== id));
    }, 280);
  }

  // WebSocket 연결 정리 (언마운트 시)
  useEffect(() => {
    return () => { if (wsRef.current) wsRef.current.close(); };
  }, []);

  // function bach 설정 저장
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

  // YouTube 플레이어 초기화 (BGM)
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

  // 채널 URL 갱신 시 플레이어에 반영
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

  // --- WebSocket 연결 (라이브 모드) ---
  const connectWebSocket = useCallback(() => {
    // readyState: 0=CONNECTING, 1=OPEN — 이미 연결 중이거나 연결된 경우 재연결 방지
    if (wsRef.current && wsRef.current.readyState <= WebSocket.OPEN) return;

    setWsStatus('connecting');
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      setWsStatus('connected');
      console.log('🎼 Maestro 서버에 연결됨:', WS_URL);
    };

    ws.onclose = () => {
      setWsStatus('disconnected');
      wsRef.current = null;
    };

    ws.onerror = () => {
      setWsStatus('disconnected');
      wsRef.current = null;
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.event === 'AGENT_TASK_READY') {
          // laneIndex는 서버에서 1-indexed로 옵니다 → 0-indexed로 변환
          const laneIndex = Math.max(0, Math.min(3, (data.laneIndex || 1) - 1));
          const projectId = data.projectId || activeProjectRef.current;

          const newNote = {
            id: data.requestId || (Date.now() + Math.random()),
            requestId: data.requestId,
            branchName: data.branchName || null,
            projectId,
            lane: laneIndex,
            title: data.diffSummary?.title || data.agentId || 'Agent Request',
            diff: data.diffSummary?.shortDescription || '',
            currentBottom: SPAWN_BOTTOM,
            status: NOTE_STATUS.READY,
          };

          setNotes((prev) => {
            const laneNotes = prev.filter(n => n.lane === laneIndex && n.projectId === projectId);
            if (laneNotes.length >= 6) return prev;
            return [...prev, newNote];
          });
          return;
        }

        if (data.event === 'MERGE_SUCCESS') {
          const mergedNote = notesRef.current.find(n => n.requestId === data.requestId);
          if (!mergedNote) return;

          setNotes(prev => prev.filter(n => n.requestId !== data.requestId));
          setScore(s => s + 100);
          setCombo(c => {
            const newCombo = c + 1;
            setMaxCombo(max => Math.max(max, newCombo));
            return newCombo;
          });
          showFeedback(mergedNote.projectId, mergedNote.lane, "MERGED!", "text-green-400");
          return;
        }

        if (data.event === 'MERGE_FAILED') {
          const failedNote = notesRef.current.find(n => n.requestId === data.requestId);
          if (!failedNote) return;

          setNotes(prev => prev.map((note) => (
              note.requestId === data.requestId
                ? { ...note, status: NOTE_STATUS.READY }
                : note
          )));
          setCombo(0);
          showFeedback(failedNote.projectId, failedNote.lane, "MERGE FAILED", "text-red-400");
          return;
        }

        if (data.event === 'AGENT_RESTARTED') {
          const rejectedNote = notesRef.current.find(n => n.requestId === data.requestId);
          if (!rejectedNote) return;

          setNotes(prev => prev.filter(n => n.requestId !== data.requestId));
          setCombo(0);
          showFeedback(rejectedNote.projectId, rejectedNote.lane, "REJECTED", "text-orange-300");
          return;
        }

        if (data.event === 'UNDO_SUCCESS') {
          setScore(s => Math.max(0, s - 100));
          setCombo(0);
          showFeedback(activeProjectRef.current, -1, "⏪ ROLLBACK OK", "text-yellow-400");
          return;
        }

        if (data.event === 'UNDO_FAILED') {
          showFeedback(activeProjectRef.current, -1, "UNDO FAILED", "text-red-400");
        }
      } catch {
        // 파싱 오류 무시
      }
    };
  }, []);

  // --- 게임 루프 (노트 물리 낙하 및 스택 연산) ---
  const updateGame = useCallback(() => {
    if (!isPlaying) return;

    setNotes((prevNotes) => {
      const counts = {}; // { 'projId_laneId': count }
      let hasChanges = false;
      
      const newNotes = prevNotes.map(note => {
        const key = `${note.projectId}_${note.lane}`;
        counts[key] = (counts[key] || 0);
        const index = counts[key]++;
        
        const targetBottom = BASE_BOTTOM + (index * NOTE_HEIGHT_OFFSET);
        
        if (note.currentBottom > targetBottom) {
          hasChanges = true;
          let nextBottom = note.currentBottom - NOTE_SPEED;
          if (nextBottom < targetBottom) nextBottom = targetBottom;
          return { ...note, currentBottom: nextBottom };
        }
        return note;
      });

      return hasChanges ? newNotes : prevNotes;
    });

    requestRef.current = requestAnimationFrame(updateGame);
  }, [isPlaying]);

  // 게임 루프 시작/종료
  useEffect(() => {
    if (isPlaying) {
      requestRef.current = requestAnimationFrame(updateGame);
    } else {
      cancelAnimationFrame(requestRef.current);
    }
    return () => cancelAnimationFrame(requestRef.current);
  }, [isPlaying, updateGame]);

  // --- 노트(에이전트 커밋) 생성기 (Mock 모드 전용) ---
  useEffect(() => {
    if (!isPlaying || wsStatus === 'connected') return; // 라이브 모드에서는 WebSocket 이벤트로 노트 수신

    let timeoutId;
    const spawnNote = () => {
      const laneIndex = Math.floor(Math.random() * 4);
      const commitData = MOCK_COMMITS[Math.floor(Math.random() * MOCK_COMMITS.length)];
      const randomProjectId = PROJECTS[Math.floor(Math.random() * PROJECTS.length)].id;
      
      setNotes(prev => {
        const laneNotes = prev.filter(n => n.lane === laneIndex && n.projectId === randomProjectId);
        if (laneNotes.length >= 6) return prev; // 스택 초과 방지
        
        const newNote = {
          id: Date.now() + Math.random(),
          projectId: randomProjectId,
          lane: laneIndex,
          title: commitData.title,
          diff: commitData.diff,
          currentBottom: SPAWN_BOTTOM,
          status: NOTE_STATUS.READY,
        };
        return [...prev, newNote];
      });
      
      const nextTime = Math.random() * 1000 + 400; // 0.4초 ~ 1.4초 스폰 간격
      timeoutId = setTimeout(spawnNote, nextTime);
    };

    timeoutId = setTimeout(spawnNote, 1000);
    return () => clearTimeout(timeoutId);
  }, [isPlaying, wsStatus]);

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
        && note.status === NOTE_STATUS.READY
    );
    const hasPendingLaneNote = currentNotes.some(
      (note) => note.lane === laneMatch.id
        && note.projectId === currentProjectId
        && note.status !== NOTE_STATUS.READY
    );

    if (laneNotes.length === 0) {
      if (hasPendingLaneNote) {
        showFeedback(currentProjectId, laneMatch.id, "PENDING", "text-yellow-400");
      } else {
        showFeedback(currentProjectId, laneMatch.id, "EMPTY", "text-gray-500");
        setCombo(0);
      }
      return;
    }

    const targetNote = laneNotes[0];
    let rejectFeedback = '';

    if (isRejectAction && promptFeedback && typeof window !== 'undefined' && typeof window.prompt === 'function') {
      const input = window.prompt('반려 사유를 입력하세요 (선택, 취소 시 반려 취소)', '');
      if (input === null) {
        showFeedback(currentProjectId, laneMatch.id, "REJECT CANCELED", "text-gray-400");
        return;
      }
      rejectFeedback = input.trim().slice(0, 300);
    }

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      setNotes((prev) => prev.map((note) => (
        note.id === targetNote.id
          ? { ...note, status: isRejectAction ? NOTE_STATUS.REJECTING : NOTE_STATUS.APPROVING }
          : note
      )));
      showFeedback(
        currentProjectId,
        laneMatch.id,
        isRejectAction ? "REJECTING..." : "APPROVING...",
        isRejectAction ? "text-orange-300" : "text-yellow-300"
      );

      wsRef.current.send(JSON.stringify({
        action: isRejectAction ? 'REJECT' : 'APPROVE',
        requestId: targetNote.requestId,
        branchName: targetNote.branchName,
        laneIndex: laneMatch.id + 1,
        feedback: isRejectAction ? (rejectFeedback || 'Rejected from dashboard') : '',
      }));
      return;
    }

    // Mock 모드에서는 기존 방식으로 즉시 반영
    setNotes((prev) => prev.filter((note) => note.id !== targetNote.id));
    if (isRejectAction) {
      setCombo(0);
      showFeedback(
        currentProjectId,
        laneMatch.id,
        rejectFeedback ? "REJECTED (WITH FEEDBACK)" : "REJECTED",
        "text-orange-300"
      );
      return;
    }

    setScore((prevScore) => prevScore + 100);
    setCombo((prevCombo) => {
      const nextCombo = prevCombo + 1;
      setMaxCombo((currentMax) => Math.max(currentMax, nextCombo));
      return nextCombo;
    });
    showFeedback(currentProjectId, laneMatch.id, "MERGED!", "text-green-400");
  }, [isPlaying, previewNote]);

  const triggerUndoAction = useCallback(() => {
    if (!isPlaying || previewNote) return;

    const currentProjectId = activeProjectRef.current;
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      showFeedback(currentProjectId, -1, "ROLLBACK REQUESTED", "text-yellow-400");
      wsRef.current.send(JSON.stringify({ action: 'UNDO' }));
      return;
    }

    showFeedback(currentProjectId, -1, "⏪ ROLLBACK EXECUTED", "text-yellow-400");
    setScore((prevScore) => Math.max(0, prevScore - 100));
    setCombo(0);
  }, [isPlaying, previewNote]);

  // --- 키보드 입력 처리 (마에스트로의 지휘) ---
  useEffect(() => {
    const handleKeyDown = (e) => {
      // 미리보기 모달이 열려있거나 게임 중지 상태면 키보드 이벤트 무시 (Esc 제외)
      if (e.key === 'Escape') {
        setPreviewNote(null);
        setIsBachPanelOpen(false);
        return;
      }
      if (!isPlaying || previewNote) return;

      const key = e.key.toLowerCase();

      // 프로젝트 전환 (숫자 키 1, 2, 3)
      const projectIndex = parseInt(key) - 1;
      if (projectIndex >= 0 && projectIndex < PROJECTS.length) {
        setActiveProjectId(PROJECTS[projectIndex].id);
        return;
      }

      // 롤백 (Ctrl/Cmd + Z)
      if ((e.ctrlKey || e.metaKey) && key === 'z') {
        e.preventDefault();
        triggerUndoAction();
        return;
      }

      const laneMatch = LANES.find((lane) => lane.key === key);
      if (!laneMatch) return;

      triggerLaneAction(laneMatch.id, {
        isRejectAction: e.shiftKey,
        promptFeedback: e.shiftKey,
      });
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPlaying, previewNote, triggerLaneAction, triggerUndoAction]);

  const startGame = () => {
    ensureSfxAudioContext();
    setNotes([]);
    setSfxBursts([]);
    setScore(0);
    setCombo(0);
    setIsPlaying(true);
    connectWebSocket(); // 라이브 모드 연결 시도 (실패 시 Mock 모드로 자동 폴백)
  };

  const stopGame = () => {
    setIsPlaying(false);
    setNotes([]);
    setSfxBursts([]);
    setIsBachPlaybackRequested(false);
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setWsStatus('disconnected');
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
