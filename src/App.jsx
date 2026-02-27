import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Play, Pause, Square, GitMerge, GitCommit, Activity, Code, X, Wifi, WifiOff } from 'lucide-react';

// WebSocket 서버 주소 (maestro-server.js 가 실행되는 호스트)
// 환경변수 VITE_WS_URL 로 재정의할 수 있습니다.
const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8080';

const BACH_CHANNEL_STORAGE_KEY = 'maestro.function-bach.channel-url';
const BACH_VOLUME_STORAGE_KEY = 'maestro.function-bach.volume';
const DEFAULT_BACH_CHANNEL_URL = 'https://www.youtube.com/channel/UC2kF6qdHRTM_hDYfEmzkS9w';
const YOUTUBE_URL_HELP_TEXT = '채널 URL은 /channel/UC... 형식 또는 재생목록/영상 URL을 사용하세요.';

let youtubeIframeApiPromise = null;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const getStoredString = (key, fallbackValue) => {
  if (typeof window === 'undefined' || !window.localStorage) return fallbackValue;
  const value = window.localStorage.getItem(key);
  return value ? value : fallbackValue;
};

const getStoredNumber = (key, fallbackValue) => {
  if (typeof window === 'undefined' || !window.localStorage) return fallbackValue;
  const value = Number(window.localStorage.getItem(key));
  if (Number.isNaN(value)) return fallbackValue;
  return clamp(value, 0, 100);
};

const setStoredValue = (key, value) => {
  if (typeof window === 'undefined' || !window.localStorage) return;
  window.localStorage.setItem(key, value);
};

const resolveYouTubeTarget = (rawInput) => {
  const input = String(rawInput || '').trim();
  if (!input) return null;

  if (/^UC[\w-]{22}$/.test(input)) {
    return {
      type: 'playlist',
      value: `UU${input.slice(2)}`,
      canonicalUrl: `https://www.youtube.com/channel/${input}`,
    };
  }

  if (/^(PL|UU|OLAK5uy_)[\w-]+$/.test(input)) {
    return {
      type: 'playlist',
      value: input,
      canonicalUrl: `https://www.youtube.com/playlist?list=${input}`,
    };
  }

  if (/^[\w-]{11}$/.test(input)) {
    return {
      type: 'video',
      value: input,
      canonicalUrl: `https://www.youtube.com/watch?v=${input}`,
    };
  }

  const normalizedInput = /^https?:\/\//i.test(input) ? input : `https://${input}`;

  let parsedUrl;
  try {
    parsedUrl = new URL(normalizedInput);
  } catch {
    return null;
  }

  const host = parsedUrl.hostname.replace(/^www\./, '').toLowerCase();

  if (host === 'youtu.be') {
    const videoId = parsedUrl.pathname.split('/').filter(Boolean)[0];
    if (!videoId) return null;
    return {
      type: 'video',
      value: videoId,
      canonicalUrl: `https://youtu.be/${videoId}`,
    };
  }

  const allowedHosts = ['youtube.com', 'm.youtube.com', 'music.youtube.com'];
  if (!allowedHosts.includes(host)) return null;

  const listId = parsedUrl.searchParams.get('list');
  if (listId) {
    return {
      type: 'playlist',
      value: listId,
      canonicalUrl: `https://www.youtube.com/playlist?list=${listId}`,
    };
  }

  const videoId = parsedUrl.searchParams.get('v');
  if (videoId) {
    return {
      type: 'video',
      value: videoId,
      canonicalUrl: `https://www.youtube.com/watch?v=${videoId}`,
    };
  }

  const parts = parsedUrl.pathname.split('/').filter(Boolean);
  if (parts[0] === 'channel' && /^UC[\w-]{22}$/.test(parts[1] || '')) {
    const channelId = parts[1];
    return {
      type: 'playlist',
      value: `UU${channelId.slice(2)}`,
      canonicalUrl: `https://www.youtube.com/channel/${channelId}`,
    };
  }

  if ((parts[0] === 'shorts' || parts[0] === 'embed' || parts[0] === 'live') && parts[1]) {
    return {
      type: 'video',
      value: parts[1],
      canonicalUrl: `https://www.youtube.com/watch?v=${parts[1]}`,
    };
  }

  return null;
};

const cueYouTubeTarget = (player, target) => {
  if (!player || !target) return;

  if (target.type === 'playlist' && typeof player.cuePlaylist === 'function') {
    player.cuePlaylist({ listType: 'playlist', list: target.value, index: 0 });
    return;
  }

  if (target.type === 'video' && typeof player.cueVideoById === 'function') {
    player.cueVideoById(target.value);
  }
};

const loadYouTubeTarget = (player, target) => {
  if (!player || !target) return;

  if (target.type === 'playlist' && typeof player.loadPlaylist === 'function') {
    player.loadPlaylist({ listType: 'playlist', list: target.value, index: 0 });
    return;
  }

  if (target.type === 'video' && typeof player.loadVideoById === 'function') {
    player.loadVideoById(target.value);
  }
};

const loadYouTubeIframeAPI = () => {
  if (typeof window === 'undefined') return Promise.reject(new Error('browser-only'));
  if (window.YT && typeof window.YT.Player === 'function') return Promise.resolve(window.YT);
  if (youtubeIframeApiPromise) return youtubeIframeApiPromise;

  youtubeIframeApiPromise = new Promise((resolve, reject) => {
    const previousReadyHandler = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (typeof previousReadyHandler === 'function') previousReadyHandler();
      if (window.YT && typeof window.YT.Player === 'function') {
        resolve(window.YT);
        return;
      }
      youtubeIframeApiPromise = null;
      reject(new Error('youtube-api-missing'));
    };

    const existingScript = document.querySelector('script[data-maestro-youtube-api="true"]');
    if (existingScript) return;

    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    script.async = true;
    script.dataset.maestroYoutubeApi = 'true';
    script.onerror = () => {
      youtubeIframeApiPromise = null;
      reject(new Error('youtube-api-load-failed'));
    };
    document.head.appendChild(script);
  });

  return youtubeIframeApiPromise;
};

// --- 상수 및 데이터 설정 ---
const LANES = [
  { id: 0, name: 'Frontend Agent', color: 'text-blue-400', border: 'border-blue-500', bg: 'bg-blue-900/30', key: 'd' },
  { id: 1, name: 'Backend Agent', color: 'text-green-400', border: 'border-green-500', bg: 'bg-green-900/30', key: 'f' },
  { id: 2, name: 'Database Agent', color: 'text-yellow-400', border: 'border-yellow-500', bg: 'bg-yellow-900/30', key: 'j' },
  { id: 3, name: 'AI Model Agent', color: 'text-purple-400', border: 'border-purple-500', bg: 'bg-purple-900/30', key: 'k' },
];

const PROJECTS = [
  { id: 'proj_b2c', name: '🚀 B2C Service App' },
  { id: 'proj_admin', name: '⚙️ Admin Backoffice' },
  { id: 'proj_api', name: '🔌 Core API Gateway' },
];

const MOCK_COMMITS = [
  { title: "JWT 토큰 검증 최적화", diff: "@@ -45,8 +45,12 @@\n- const verify = (token) => { return jwt.decode(token); }\n+ const verify = async (token) => {\n+   const decoded = await jwt.verify(token, process.env.SECRET);\n+   return decoded;\n+ }" },
  { title: "React 렌더링 개선", diff: "@@ -12,4 +12,5 @@\n- export default UserList;\n+ export default React.memo(UserList);" },
  { title: "사용자 테이블 인덱스", diff: "@@ -1,3 +1,4 @@\n CREATE TABLE users (\n   id INT PRIMARY KEY,\n-  email VARCHAR(255)\n+  email VARCHAR(255),\n+  INDEX idx_email (email)\n );" },
  { title: "프롬프트 시스템 미세조정", diff: "@@ -88,2 +88,2 @@\n- const prompt = `You are a helpful assistant.`;\n+ const prompt = `You are an expert developer. Always output valid JSON.`;" },
  { title: "모바일 네비게이션 픽스", diff: "@@ -20,3 +20,3 @@\n- <nav className=\"hidden md:flex\">\n+ <nav className=\"flex flex-col md:flex-row\">\n    <Links />\n  </nav>" },
  { title: "Redis 캐싱 레이어 도입", diff: "@@ -50,2 +50,5 @@\n  const data = await db.query(sql);\n+ await redis.set(cacheKey, JSON.stringify(data), 'EX', 3600);\n  return data;" },
];

const BASE_BOTTOM = 180; // 기준선 위치 (화면 하단 기준 픽셀)
const NOTE_HEIGHT_OFFSET = 85; // 노트가 쌓이는 간격
const NOTE_SPEED = 14; // 노트 낙하 속도 (픽셀/프레임)
const SPAWN_BOTTOM = 1000; // 노트 시작 위치 (바닥 기준)
const NOTE_STATUS = {
  READY: 'ready',
  APPROVING: 'approving',
  REJECTING: 'rejecting',
};

// --- Web Audio API (타격음 생성기) ---
let sfxAudioContext = null;
let sfxMasterGain = null;

const ensureSfxAudioContext = () => {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return null;

  if (!sfxAudioContext) {
    sfxAudioContext = new AudioContext();
    sfxMasterGain = sfxAudioContext.createGain();
    sfxMasterGain.gain.value = 0.8;
    sfxMasterGain.connect(sfxAudioContext.destination);
  }

  if (sfxAudioContext.state === 'suspended') {
    sfxAudioContext.resume().catch(() => {
      // 브라우저 정책으로 실패 가능
    });
  }

  return sfxAudioContext;
};

const playBeep = (freq, type = 'sine') => {
  try {
    const ctx = ensureSfxAudioContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();
    
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    
    gainNode.gain.setValueAtTime(0.0001, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + 0.01);
    gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
    
    osc.connect(gainNode);
    gainNode.connect(sfxMasterGain || ctx.destination);
    
    osc.start();
    osc.stop(ctx.currentTime + 0.13);
  } catch (e) {
    // Audio 방어 코드
  }
};

export default function App() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeProjectId, setActiveProjectId] = useState(PROJECTS[0].id);
  const [notes, setNotes] = useState([]);
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [maxCombo, setMaxCombo] = useState(0);
  const [feedbacks, setFeedbacks] = useState([]);
  const [previewNote, setPreviewNote] = useState(null); // 코드 미리보기 모달 상태
  // 'disconnected' | 'connecting' | 'connected'
  const [wsStatus, setWsStatus] = useState('disconnected');
  const [bachChannelUrl, setBachChannelUrl] = useState(() => getStoredString(BACH_CHANNEL_STORAGE_KEY, DEFAULT_BACH_CHANNEL_URL));
  const [bachChannelInput, setBachChannelInput] = useState(() => getStoredString(BACH_CHANNEL_STORAGE_KEY, DEFAULT_BACH_CHANNEL_URL));
  const [bachVolume, setBachVolume] = useState(() => getStoredNumber(BACH_VOLUME_STORAGE_KEY, 35));
  const [isBachReady, setIsBachReady] = useState(false);
  const [isBachPlaying, setIsBachPlaying] = useState(false);
  const [isBachPanelOpen, setIsBachPanelOpen] = useState(false);
  const [bachError, setBachError] = useState('');
  
  const requestRef = useRef();
  const notesRef = useRef([]);
  const activeProjectRef = useRef(activeProjectId);
  const wsRef = useRef(null);
  const bachPlayerHostRef = useRef(null);
  const bachPlayerRef = useRef(null);
  const bachPlayingRef = useRef(false);

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

              if (event.data === playerState.PLAYING) setIsBachPlaying(true);
              if (event.data === playerState.PAUSED || event.data === playerState.ENDED || event.data === playerState.CUED) {
                setIsBachPlaying(false);
              }
            },
            onError: () => {
              if (isDisposed) return;
              setIsBachPlaying(false);
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
      const currentProjectId = activeProjectRef.current;

      // 프로젝트 전환 (숫자 키 1, 2, 3)
      const projectIndex = parseInt(key) - 1;
      if (projectIndex >= 0 && projectIndex < PROJECTS.length) {
        setActiveProjectId(PROJECTS[projectIndex].id);
        return;
      }

      const laneMatch = LANES.find(l => l.key === key);
      
      if (laneMatch) {
        const freqs = [261.63, 329.63, 392.00, 523.25]; // 도미솔도
        playBeep(freqs[laneMatch.id], 'triangle');

        const currentNotes = notesRef.current;
        const laneNotes = currentNotes.filter(
          n => n.lane === laneMatch.id
            && n.projectId === currentProjectId
            && n.status === NOTE_STATUS.READY
        );
        const hasPendingLaneNote = currentNotes.some(
          n => n.lane === laneMatch.id
            && n.projectId === currentProjectId
            && n.status !== NOTE_STATUS.READY
        );
        
        if (laneNotes.length > 0) {
          const targetNote = laneNotes[0]; // 가장 아래에 쌓인 노트
          const isRejectAction = e.shiftKey;
          let rejectFeedback = '';

          if (isRejectAction && typeof window !== 'undefined' && typeof window.prompt === 'function') {
            const input = window.prompt('반려 사유를 입력하세요 (선택, 취소 시 반려 취소)', '');
            if (input === null) {
              showFeedback(currentProjectId, laneMatch.id, "REJECT CANCELED", "text-gray-400");
              return;
            }
            rejectFeedback = input.trim().slice(0, 300);
          }

          // 라이브 모드: 서버에 승인 이벤트 전송
          if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            // 서버 확인 응답 전까지 처리중 상태 유지
            setNotes(prev => prev.map((note) => (
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
          } else {
            // Mock 모드에서는 기존 방식으로 즉시 반영
            setNotes(prev => prev.filter(n => n.id !== targetNote.id));
            if (isRejectAction) {
              setCombo(0);
              showFeedback(
                currentProjectId,
                laneMatch.id,
                rejectFeedback ? "REJECTED (WITH FEEDBACK)" : "REJECTED",
                "text-orange-300"
              );
            } else {
              setScore(s => s + 100);
              setCombo(c => {
                const newCombo = c + 1;
                setMaxCombo(max => Math.max(max, newCombo));
                return newCombo;
              });
              showFeedback(currentProjectId, laneMatch.id, "MERGED!", "text-green-400");
            }
          }
        } else if (hasPendingLaneNote) {
          showFeedback(currentProjectId, laneMatch.id, "PENDING", "text-yellow-400");
        } else {
          showFeedback(currentProjectId, laneMatch.id, "EMPTY", "text-gray-500");
          setCombo(0);
        }
      }

      // 롤백 (Ctrl + Z)
      if ((e.ctrlKey || e.metaKey) && key === 'z') {
        e.preventDefault();

        // 라이브 모드: 서버에 롤백 이벤트 전송
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          showFeedback(currentProjectId, -1, "ROLLBACK REQUESTED", "text-yellow-400");
          wsRef.current.send(JSON.stringify({ action: 'UNDO' }));
        } else {
          showFeedback(currentProjectId, -1, "⏪ ROLLBACK EXECUTED", "text-yellow-400");
          setScore(s => Math.max(0, s - 100));
          setCombo(0);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPlaying, previewNote]); // previewNote 상태 의존성 추가

  const startGame = () => {
    ensureSfxAudioContext();
    setNotes([]);
    setScore(0);
    setCombo(0);
    setIsPlaying(true);
    connectWebSocket(); // 라이브 모드 연결 시도 (실패 시 Mock 모드로 자동 폴백)
  };

  const stopGame = () => {
    setIsPlaying(false);
    setNotes([]);
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setWsStatus('disconnected');
  };

  const playBach = useCallback(() => {
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

  return (
    <div className="flex flex-col h-screen bg-gray-950 text-white font-sans overflow-hidden selection:bg-purple-500/30">
      <div
        ref={bachPlayerHostRef}
        aria-hidden="true"
        className="absolute -left-[9999px] top-0 h-px w-px overflow-hidden"
      />
      
      {/* --- 상단 헤더 --- */}
      <header className="flex items-center justify-between p-4 border-b border-gray-800 bg-gray-900/50 backdrop-blur-md z-50 shadow-lg relative">
        <div className="flex items-center space-x-3">
          <Activity className="w-6 h-6 text-purple-500" />
          <h1 className="text-xl font-bold tracking-tight">Maestro <span className="text-purple-400 font-light">Workspace</span></h1>
          <div className="relative ml-4 hidden sm:block">
            <div
              data-testid="function-bach-mini"
              className="flex items-center gap-1 rounded-full border border-amber-400/40 bg-gray-900/80 px-2 py-1 text-[11px] text-gray-200 shadow-lg backdrop-blur"
            >
              <span className="font-semibold text-amber-200">function bach</span>
              <span className={`inline-block h-1.5 w-1.5 rounded-full ${isBachPlaying ? 'bg-green-400' : isBachReady ? 'bg-amber-300' : 'bg-gray-500'}`} />
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
                  onChange={(e) => setBachVolume(clamp(Number(e.target.value), 0, 100))}
                  className="h-1 w-16 accent-amber-300"
                />
              </label>
              <button
                onClick={() => setIsBachPanelOpen((open) => !open)}
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
                  onChange={(e) => setBachChannelInput(e.target.value)}
                  placeholder="https://www.youtube.com/channel/UC..."
                  className="mt-1 w-full rounded-md border border-gray-700 bg-gray-950 px-2 py-1.5 text-xs text-gray-100 outline-none focus:border-amber-300"
                />
                <p className="mt-1 text-[10px] text-gray-400">
                  {YOUTUBE_URL_HELP_TEXT}
                </p>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <button
                    onClick={resetBachChannel}
                    className="rounded-md border border-amber-500/40 px-2 py-1 text-[11px] text-amber-200 hover:bg-amber-500/10"
                  >
                    기본 바흐 채널
                  </button>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        setBachChannelInput(bachChannelUrl);
                        setIsBachPanelOpen(false);
                      }}
                      className="rounded-md border border-gray-700 px-2 py-1 text-[11px] text-gray-300 hover:bg-gray-800"
                    >
                      닫기
                    </button>
                    <button
                      onClick={saveBachChannel}
                      className="rounded-md bg-amber-500 px-2 py-1 text-[11px] font-semibold text-black hover:bg-amber-400"
                    >
                      저장
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
          {/* WebSocket 연결 상태 배지 */}
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
            <button onClick={startGame} className="flex items-center px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-md font-medium transition-all shadow-[0_0_15px_rgba(168,85,247,0.5)]">
              <Play className="w-4 h-4 mr-2 fill-current" /> 지휘 시작
            </button>
          ) : (
            <button onClick={stopGame} className="flex items-center px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-md font-medium transition-all">
              <Square className="w-4 h-4 mr-2 fill-current" /> 중지
            </button>
          )}
        </div>
      </header>

      {/* --- 프로젝트 탭 바 --- */}
      <div className="flex bg-gray-900 border-b border-gray-800 px-4 overflow-x-auto z-10">
        {PROJECTS.map((project, idx) => {
          const pendingCount = notes.filter(n => n.projectId === project.id).length;
          const isActive = activeProjectId === project.id;
          return (
            <button
              key={project.id}
              onClick={() => setActiveProjectId(project.id)}
              className={`flex items-center px-6 py-3 border-b-2 font-medium text-sm transition-colors relative ${
                isActive ? 'border-purple-500 text-purple-400 bg-gray-800/50' : 'border-transparent text-gray-400 hover:text-gray-300 hover:bg-gray-800/30'
              }`}
            >
              <kbd className="hidden sm:inline-block mr-2 text-[10px] bg-gray-800 border border-gray-700 rounded px-1 text-gray-500">{idx + 1}</kbd>
              {project.name}
              {pendingCount > 0 && (
                <span className={`ml-3 px-2 py-0.5 rounded-full text-xs font-bold ${isActive ? 'bg-purple-500/20 text-purple-300' : 'bg-red-500/20 text-red-400 animate-pulse'}`}>
                  {pendingCount}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* --- 메인 스테이지 --- */}
      <main className="flex-1 relative bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-gray-900 via-gray-950 to-black">
        
        {combo > 2 && (
          <div className="absolute top-1/4 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-0 opacity-20 pointer-events-none flex flex-col items-center">
            <span className="text-8xl font-black italic">{combo}</span>
            <span className="text-2xl tracking-widest">COMBO</span>
          </div>
        )}

        {feedbacks.filter(f => f.lane === -1 && f.projectId === activeProjectId).map(feedback => (
          <div key={feedback.id} className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-50 animate-bounce">
            <span className={`text-3xl font-bold bg-black/80 px-6 py-3 rounded-lg border border-yellow-500 shadow-[0_0_30px_rgba(234,179,8,0.5)] ${feedback.color}`}>
              {feedback.text}
            </span>
          </div>
        ))}

        {/* 4개의 레인 */}
        <div className="absolute inset-0 flex justify-center max-w-5xl mx-auto px-4">
          {LANES.map((lane) => (
            <div key={lane.id} className="relative flex-1 flex flex-col border-r border-l border-gray-800/50 bg-gray-900/10 backdrop-blur-[2px]">
              
              <div className="absolute top-0 w-full p-4 text-center z-10 bg-gradient-to-b from-gray-900 to-transparent">
                <span className={`text-sm font-semibold tracking-wider ${lane.color}`}>{lane.name}</span>
              </div>

              {/* 쌓여있는 노트들 렌더링 */}
              {notes.filter(n => n.lane === lane.id && n.projectId === activeProjectId).map((note) => (
                <div 
                  key={note.id}
                  onClick={() => setPreviewNote(note)} // 클릭 시 코드 미리보기
                  className={`absolute left-4 right-4 p-3 rounded-lg border shadow-lg transition-colors duration-200 cursor-pointer group ${
                    note.status === NOTE_STATUS.APPROVING
                      ? 'bg-yellow-900/20 border-yellow-500/70 opacity-80 animate-pulse'
                      : note.status === NOTE_STATUS.REJECTING
                        ? 'bg-orange-900/20 border-orange-500/70 opacity-80 animate-pulse'
                      : `${lane.bg} ${lane.border} hover:brightness-125`
                  }`}
                  style={{ bottom: `${note.currentBottom}px` }}
                >
                  <div className="flex justify-between items-start">
                    <div className="flex items-start space-x-2 overflow-hidden">
                      <GitCommit className={`w-4 h-4 mt-0.5 shrink-0 ${
                        note.status === NOTE_STATUS.APPROVING
                          ? 'text-yellow-300'
                          : note.status === NOTE_STATUS.REJECTING
                            ? 'text-orange-300'
                            : lane.color
                      }`} />
                      <div className="flex flex-col overflow-hidden">
                        <span className={`text-xs truncate ${
                          note.status === NOTE_STATUS.APPROVING
                            ? 'text-yellow-300'
                            : note.status === NOTE_STATUS.REJECTING
                              ? 'text-orange-300'
                              : 'text-gray-400'
                        }`}>
                          {note.status === NOTE_STATUS.APPROVING
                            ? 'Merge pending...'
                            : note.status === NOTE_STATUS.REJECTING
                              ? 'Reject pending...'
                              : 'Agent proposed:'}
                        </span>
                        <span className="text-sm font-medium truncate group-hover:underline">{note.title}</span>
                      </div>
                    </div>
                    <Code className="w-4 h-4 text-gray-500 group-hover:text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </div>
              ))}

              {/* 피드백 텍스트 */}
              {feedbacks.filter(f => f.lane === lane.id && f.projectId === activeProjectId).map(feedback => (
                <div 
                  key={feedback.id} 
                  className={`absolute w-full text-center z-50 font-bold text-xl tracking-widest animate-pulse ${feedback.color}`}
                  style={{ bottom: `${BASE_BOTTOM}px` }}
                >
                  {feedback.text}
                </div>
              ))}

              {/* 하단 판정선 및 단축키 안내 */}
              <div className="absolute w-full bottom-0 h-48 bg-gradient-to-t from-gray-900 to-transparent border-t border-gray-800 flex flex-col items-center justify-end pb-8">
                <div className={`absolute w-full h-1 bg-gray-700 shadow-[0_0_10px_rgba(255,255,255,0.1)]`} style={{ bottom: `${BASE_BOTTOM - 15}px` }} />
                
                <div className="relative">
                  <div className={`w-16 h-16 rounded-xl border-2 flex items-center justify-center bg-gray-900 ${lane.border} shadow-[0_0_15px_rgba(0,0,0,0.5)]`}>
                    <span className={`text-2xl font-bold uppercase ${lane.color}`}>{lane.key}</span>
                  </div>
                </div>
                
                <div className="mt-4 text-xs text-gray-500 font-mono">
                  <GitMerge className="w-3 h-3 inline mr-1" /> Approve
                </div>
              </div>

            </div>
          ))}
        </div>
      </main>

      {/* --- 하단 툴바 --- */}
      <footer className="p-3 bg-gray-900 border-t border-gray-800 text-xs text-gray-500 flex justify-between items-center z-10">
        <div>
          Tip: 떨어지는 노트를 <strong className="text-gray-300">클릭</strong>하여 코드 수정 내역(Diff)을 살짝 엿볼 수 있습니다.
        </div>
        <div className="flex space-x-4">
          <span className="flex items-center"><kbd className="bg-gray-800 px-1.5 py-0.5 rounded border border-gray-700 mx-1">1</kbd><kbd className="bg-gray-800 px-1.5 py-0.5 rounded border border-gray-700 mr-1">2</kbd><kbd className="bg-gray-800 px-1.5 py-0.5 rounded border border-gray-700">3</kbd> 프로젝트 전환</span>
          <span className="flex items-center"><kbd className="bg-gray-800 px-1.5 py-0.5 rounded border border-gray-700 mx-1 text-gray-300">D F J K</kbd> 승인</span>
          <span className="flex items-center"><kbd className="bg-gray-800 px-1.5 py-0.5 rounded border border-gray-700 mx-1 text-gray-300">Shift + D F J K</kbd> 반려(피드백)</span>
          <span className="flex items-center"><kbd className="bg-gray-800 px-1.5 py-0.5 rounded border border-gray-700 mr-1 text-gray-300">Ctrl+Z</kbd> 취소</span>
        </div>
      </footer>

      {/* --- 코드 미리보기 (Diff Peek) 모달 --- */}
      {previewNote && (
        <div className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="flex justify-between items-center p-4 border-b border-gray-800 bg-gray-800/50">
              <div className="flex items-center space-x-2">
                <GitCommit className="w-5 h-5 text-purple-400" />
                <h3 className="font-semibold text-gray-100">{previewNote.title}</h3>
              </div>
              <button onClick={() => setPreviewNote(null)} className="text-gray-400 hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 bg-gray-950 font-mono text-sm overflow-x-auto whitespace-pre">
              {previewNote.diff.split('\n').map((line, i) => {
                let colorClass = "text-gray-300";
                let bgClass = "";
                if (line.startsWith('+')) { colorClass = "text-green-400"; bgClass = "bg-green-900/20 w-full inline-block"; }
                if (line.startsWith('-')) { colorClass = "text-red-400"; bgClass = "bg-red-900/20 w-full inline-block"; }
                if (line.startsWith('@@')) { colorClass = "text-blue-400"; }
                
                return (
                  <span key={i} className={`${colorClass} ${bgClass} block px-2`}>
                    {line}
                  </span>
                );
              })}
            </div>
            <div className="p-3 border-t border-gray-800 bg-gray-900 text-right">
              <span className="text-xs text-gray-500 mr-4"><kbd className="bg-gray-800 px-1.5 py-0.5 rounded">Esc</kbd> 로 닫기</span>
              <button onClick={() => setPreviewNote(null)} className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded text-sm transition-colors">
                확인
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
