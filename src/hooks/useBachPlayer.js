import { useCallback, useEffect, useRef, useState } from 'react';
import {
  BACH_CHANNEL_STORAGE_KEY,
  BACH_VOLUME_STORAGE_KEY,
  DEFAULT_BACH_CHANNEL_URL,
  YOUTUBE_URL_HELP_TEXT,
} from '../constants/maestro.js';
import { clamp, getStoredNumber, getStoredString, setStoredValue } from '../utils/storage.js';
import {
  cueYouTubeTarget,
  loadYouTubeIframeAPI,
  loadYouTubeTarget,
  resolveYouTubeTarget,
} from '../utils/youtube.js';

export default function useBachPlayer() {
  const [bachChannelUrl, setBachChannelUrl] = useState(() => getStoredString(BACH_CHANNEL_STORAGE_KEY, DEFAULT_BACH_CHANNEL_URL));
  const [bachChannelInput, setBachChannelInput] = useState(() => getStoredString(BACH_CHANNEL_STORAGE_KEY, DEFAULT_BACH_CHANNEL_URL));
  const [bachVolume, setBachVolume] = useState(() => getStoredNumber(BACH_VOLUME_STORAGE_KEY, 35));
  const [isBachReady, setIsBachReady] = useState(false);
  const [isBachPlaying, setIsBachPlaying] = useState(false);
  const [isBachPlaybackRequested, setIsBachPlaybackRequested] = useState(false);
  const [bachVizHz, setBachVizHz] = useState(0);
  const [bachPlayerStateCode, setBachPlayerStateCode] = useState('INIT');
  const [isBachPanelOpen, setIsBachPanelOpen] = useState(false);
  const [bachError, setBachError] = useState('');

  const bachPlayerHostRef = useRef(null);
  const bachPlayerRef = useRef(null);
  const bachPlayingRef = useRef(false);
  const bachVizTickRef = useRef(0);

  useEffect(() => {
    bachPlayingRef.current = isBachPlaying;
  }, [isBachPlaying]);

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
              setBachPlayerStateCode('READY');
              setBachError('');
            },
            onStateChange: (event) => {
              const playerState = window.YT?.PlayerState;
              if (!playerState) return;

              if (event.data === playerState.PLAYING) {
                setBachPlayerStateCode('PLAYING');
              } else if (event.data === playerState.PAUSED) {
                setBachPlayerStateCode('PAUSED');
              } else if (event.data === playerState.ENDED) {
                setBachPlayerStateCode('ENDED');
              } else if (event.data === playerState.CUED) {
                setBachPlayerStateCode('CUED');
              } else {
                setBachPlayerStateCode(`STATE_${event.data}`);
              }

              if (event.data === playerState.PLAYING) {
                setIsBachPlaying(true);
                setIsBachPlaybackRequested(true);
              }
              if (event.data === playerState.ENDED) {
                // Playback genuinely finished: drop both playing and intent.
                setIsBachPlaying(false);
                setIsBachPlaybackRequested(false);
              } else if (event.data === playerState.PAUSED || event.data === playerState.CUED) {
                // Involuntary pause/cue (e.g. blocked autoplay) must not clear the
                // operator's playback intent — otherwise the Hz indicator collapses
                // back to `standby` even though the operator pressed play (KI-001).
                // A user-initiated pause clears the intent in pauseBach().
                setIsBachPlaying(false);
              }
            },
            onError: () => {
              if (isDisposed) return;
              setIsBachPlaying(false);
              setIsBachPlaybackRequested(false);
              setBachPlayerStateCode('ERROR');
              setBachError('재생에 실패했습니다. 채널/영상 URL을 확인해주세요.');
            },
          },
        });

        bachPlayerRef.current = player;
      })
      .catch(() => {
        if (isDisposed) return;
        setBachPlayerStateCode('LOAD_FAILED');
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
      setBachPlayerStateCode('INIT');
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

  const playBach = useCallback(() => {
    setIsBachPlaybackRequested(true);
    setBachPlayerStateCode(isBachReady ? 'REQUESTED' : 'LOADING');
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
    setBachPlayerStateCode('PAUSED');
  }, [isBachReady]);

  const toggleBachPlayback = useCallback(() => {
    if (isBachPlaying) {
      pauseBach();
      return;
    }
    playBach();
  }, [isBachPlaying, pauseBach, playBach]);

  const saveBachChannel = useCallback(() => {
    const target = resolveYouTubeTarget(bachChannelInput);
    if (!target) {
      setBachError(YOUTUBE_URL_HELP_TEXT);
      return;
    }

    setBachChannelUrl(target.canonicalUrl);
    setBachChannelInput(target.canonicalUrl);
    setBachError('');
    setIsBachPanelOpen(false);
  }, [bachChannelInput]);

  const resetBachChannel = useCallback(() => {
    setBachChannelUrl(DEFAULT_BACH_CHANNEL_URL);
    setBachChannelInput(DEFAULT_BACH_CHANNEL_URL);
    setBachError('');
  }, []);

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

  const bachStatusLabel = bachError
    ? 'error'
    : isBachPlaying
      ? 'playing'
      : isBachPlaybackRequested
        ? 'queued'
        : bachPlayerStateCode === 'PAUSED'
          ? 'paused'
          : bachPlayerStateCode === 'CUED'
            ? 'cued'
            : bachPlayerStateCode === 'ENDED'
              ? 'ended'
              : isBachReady
                ? 'ready'
                : 'booting';
  const bachHzLabel = (isBachPlaying || isBachPlaybackRequested) && bachVizHz > 0
    ? `~${bachVizHz}Hz`
    : 'standby';

  return {
    youtubeUrlHelpText: YOUTUBE_URL_HELP_TEXT,
    bachPlayerHostRef,
    bachChannelInput,
    setBachChannelInput,
    bachVolume,
    isBachReady,
    isBachPlaying,
    isBachPlaybackRequested,
    bachVizHz,
    bachPlayerStateCode,
    bachStatusLabel,
    bachHzLabel,
    isBachPanelOpen,
    setIsBachPanelOpen,
    bachError,
    toggleBachPlayback,
    handleBachVolumeChange,
    handleBachPanelToggle,
    handleBachPanelClose,
    saveBachChannel,
    resetBachChannel,
  };
}
