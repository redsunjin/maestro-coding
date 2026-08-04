import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createBrowserMetronomeDriver, createPulseDescriptor } from '../lib/metronomeEngine.js';
import { createBrowserReplayAudioDriver, createReplayCuePlan } from '../lib/replayAudioEngine.js';
import { getPlayerCopy } from '../lib/playerI18n.js';

const TICK_MS = 160;
const BEAT_STEP = 0.5;
const PERFECT_WINDOW = 0.18;
const GREAT_WINDOW = 0.26;
const GOOD_WINDOW = 0.4;
const VIEW_BEATS = 6;

const SCORE_BY_NOTE_TYPE = Object.freeze({
  tap: 100,
  accent: 140,
  hold: 160,
});

const JUDGMENT_MULTIPLIERS = Object.freeze({
  perfect: 1,
  great: 0.85,
  good: 0.7,
});

const PLAY_MODES = Object.freeze([
  { id: 'manual' },
  { id: 'auto' },
]);

const LANE_KEYS = Object.freeze(['A', 'S', 'D', 'F', 'J', 'K']);

export default function PlayerRunPanel({
  chart = null,
  tempo = 120,
  onRunComplete = null,
  audioDriver = null,
  bgmDriver = null,
  language = 'en',
  runRequest = null,
}) {
  const copy = getPlayerCopy(language);
  const notes = useMemo(
    () => [...(chart?.notes || [])].sort((left, right) => left.beatOffset - right.beatOffset),
    [chart],
  );
  const laneCount = chart?.laneCount || 4;
  const totalBeats = useMemo(
    () => (notes.length ? Math.max(...notes.map((note) => note.beatOffset + note.durationBeats)) : 0),
    [notes],
  );
  const [playMode, setPlayMode] = useState('manual');
  const [runState, setRunState] = useState(createEmptyRunState());
  const [clickTrackEnabled, setClickTrackEnabled] = useState(true);
  const [bgmEnabled, setBgmEnabled] = useState(true);
  const [pulseIndicator, setPulseIndicator] = useState(null);
  const [activeCueSummary, setActiveCueSummary] = useState('');
  const lastReportedRunTokenRef = useRef('');
  const lastRunRequestIdRef = useRef('');
  const lastPulseStepRef = useRef(-1);
  const lastCueStepRef = useRef(-1);
  const metronomeDriver = useMemo(
    () => audioDriver || createBrowserMetronomeDriver(globalThis),
    [audioDriver],
  );
  const replayAudioDriver = useMemo(
    () => bgmDriver || createBrowserReplayAudioDriver(globalThis),
    [bgmDriver],
  );
  const cuePlan = useMemo(
    () => createReplayCuePlan(notes, { laneCount }),
    [laneCount, notes],
  );
  const cuePlanByStep = useMemo(
    () => new Map(cuePlan.map((batch) => [batch.stepIndex, batch])),
    [cuePlan],
  );
  const audioSupported = metronomeDriver?.isSupported?.() ?? false;
  const bgmSupported = replayAudioDriver?.isSupported?.() ?? false;

  const resetPanelEphemera = () => {
    setPulseIndicator(null);
    setActiveCueSummary('');
    lastPulseStepRef.current = -1;
    lastCueStepRef.current = -1;
  };

  const resetRunState = () => {
    resetPanelEphemera();
    setRunState(createEmptyRunState());
  };

  useEffect(() => {
    resetRunState();
  }, [chart, totalBeats, notes.length]);

  useEffect(() => {
    if (!runRequest?.requestId || notes.length === 0) {
      return;
    }

    if (lastRunRequestIdRef.current === runRequest.requestId) {
      return;
    }

    lastRunRequestIdRef.current = runRequest.requestId;
    const nextPlayMode = runRequest.playMode || 'auto';
    const shouldAutoStart = runRequest.autoStart !== false;

    if (nextPlayMode !== playMode) {
      setPlayMode(nextPlayMode);
    }

    if (shouldAutoStart) {
      if (audioSupported) {
        metronomeDriver?.prime?.();
      }
      if (bgmSupported) {
        replayAudioDriver?.prime?.();
      }
    }

    resetPanelEphemera();
    setRunState({
      ...createEmptyRunState(),
      status: shouldAutoStart ? 'running' : 'idle',
    });
  }, [
    audioSupported,
    bgmSupported,
    metronomeDriver,
    notes.length,
    playMode,
    replayAudioDriver,
    runRequest,
  ]);

  useEffect(() => {
    if (runState.status !== 'running' || notes.length === 0) {
      return undefined;
    }

    const timerId = window.setInterval(() => {
      setRunState((previousState) => (
        playMode === 'auto'
          ? advanceAutoRunState(previousState, notes, totalBeats, language)
          : advanceManualRunState(previousState, notes, totalBeats, language)
      ));
    }, TICK_MS);

    return () => {
      window.clearInterval(timerId);
    };
  }, [notes, playMode, runState.status, totalBeats]);

  useEffect(() => {
    if (playMode !== 'manual' || runState.status !== 'running') {
      return undefined;
    }

    const handleKeyDown = (event) => {
      const laneIndex = resolveLaneFromKey(event.key, laneCount);
      if (!laneIndex) {
        return;
      }

      event.preventDefault();
      setRunState((previousState) => resolveManualLaneHit(previousState, laneIndex, notes, totalBeats, tempo, language));
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [laneCount, notes, playMode, runState.status, tempo, totalBeats]);

  useEffect(() => {
    if (runState.status !== 'complete' || !onRunComplete) {
      return;
    }

    if (lastReportedRunTokenRef.current === runState.runToken) {
      return;
    }

    lastReportedRunTokenRef.current = runState.runToken;
    onRunComplete({
      runToken: runState.runToken,
      playMode,
      score: runState.score,
      maxCombo: runState.maxCombo,
      accuracy: notes.length ? (runState.notesHit / notes.length) * 100 : 0,
      notesHit: runState.notesHit,
      totalNotes: notes.length,
      laneCount,
      tempo,
      judgments: runState.judgments,
      finishedAt: new Date().toISOString(),
    });
  }, [laneCount, notes.length, onRunComplete, playMode, runState, tempo]);

  useEffect(() => {
    if (runState.status !== 'running') {
      if (runState.status !== 'paused') {
        setPulseIndicator(null);
      }
      metronomeDriver?.stop?.();
      return;
    }

    if (!clickTrackEnabled || !audioSupported) {
      return;
    }

    const nextStepIndex = Math.round(runState.currentBeat / BEAT_STEP);
    if (nextStepIndex === lastPulseStepRef.current) {
      return;
    }

    lastPulseStepRef.current = nextStepIndex;
    const pulse = createPulseDescriptor({
      stepIndex: nextStepIndex,
      beatsPerBar: 4,
      subdivision: Math.round(1 / BEAT_STEP),
    });

    setPulseIndicator(pulse);
    metronomeDriver?.pulse?.({ pulse, tempo });
  }, [audioSupported, clickTrackEnabled, metronomeDriver, runState.currentBeat, runState.status, tempo]);

  useEffect(() => {
    if (runState.status !== 'running') {
      if (runState.status !== 'paused') {
        setActiveCueSummary('');
      }
      replayAudioDriver?.stop?.();
      return;
    }

    if (!bgmEnabled || !bgmSupported) {
      return;
    }

    const nextStepIndex = Math.round(runState.currentBeat / BEAT_STEP);
    if (nextStepIndex === lastCueStepRef.current) {
      return;
    }

    lastCueStepRef.current = nextStepIndex;
    const nextBatch = cuePlanByStep.get(nextStepIndex);

    if (!nextBatch) {
      setActiveCueSummary('BGM armed');
      return;
    }

    setActiveCueSummary(nextBatch.summary);
    replayAudioDriver?.playCueBatch?.({
      batch: nextBatch,
      tempo,
    });
  }, [bgmEnabled, bgmSupported, cuePlanByStep, replayAudioDriver, runState.currentBeat, runState.status, tempo]);

  const processedNoteIds = runState.processedNoteIds;
  const progressPercent = totalBeats > 0
    ? Math.min(100, Math.round((runState.currentBeat / totalBeats) * 100))
    : 0;
  const upcomingNotes = notes
    .filter((note) => !processedNoteIds.includes(note.noteId) && note.beatOffset >= runState.currentBeat)
    .slice(0, 4);
  const visibleNotes = notes.filter((note) => (
    !processedNoteIds.includes(note.noteId) && note.beatOffset >= runState.currentBeat - GOOD_WINDOW
    && note.beatOffset <= runState.currentBeat + VIEW_BEATS
  ));
  const accuracyLabel = notes.length
    ? `${Math.round((runState.notesHit / notes.length) * 100)}%`
    : '0%';
  const averageOffsetLabel = runState.timedHitCount
    ? formatAverageOffsetLabel(runState.timingOffsetTotalMs / runState.timedHitCount, language)
    : copy.runPanel.noTimingData;
  const activeBeatInBar = pulseIndicator?.beatInBar || ((Math.floor(runState.currentBeat) % 4) + 1);
  const audioSyncLabel = !audioSupported
    ? copy.runPanel.sync.audioUnavailable
    : clickTrackEnabled
      ? pulseIndicator?.isDownbeat
        ? copy.runPanel.sync.downbeat(pulseIndicator.beatInBar)
        : pulseIndicator
          ? copy.runPanel.sync.beat(pulseIndicator.beatInBar, pulseIndicator.isSubdivision)
          : copy.runPanel.sync.clickArmed
      : copy.runPanel.sync.clickMuted;
  const bgmStatusLabel = !bgmSupported
    ? copy.runPanel.sync.bgmUnavailable
    : bgmEnabled
      ? activeCueSummary || copy.runPanel.sync.bgmArmed
      : copy.runPanel.sync.bgmMuted;
  const nextQueuedNote = upcomingNotes[0] || null;
  const nextHitLabel = nextQueuedNote
    ? copy.runPanel.stage.nextHit(copy.runPanel.laneLabel(nextQueuedNote.laneIndex), nextQueuedNote.beatOffset.toFixed(2))
    : copy.runPanel.stage.noNextHit;
  const judgmentTiers = [
    { id: 'perfect', label: copy.runPanel.judgments.perfect, value: runState.judgments.perfect },
    { id: 'great', label: copy.runPanel.judgments.great, value: runState.judgments.great },
    { id: 'good', label: copy.runPanel.judgments.good, value: runState.judgments.good },
    { id: 'miss', label: copy.runPanel.judgments.miss, value: runState.judgments.miss },
  ];

  const handleStartOrResume = () => {
    const shouldResume = runState.status === 'paused';

    if (audioSupported) {
      metronomeDriver?.prime?.();
    }
    if (bgmSupported) {
      replayAudioDriver?.prime?.();
    }

    if (!shouldResume) {
      resetPanelEphemera();
    }

    setRunState((previousState) => {
      if (shouldResume) {
        return {
          ...previousState,
          status: 'running',
        };
      }

      return {
        ...createEmptyRunState(),
        status: 'running',
      };
    });
  };

  const handleModeChange = (nextPlayMode) => {
    if (nextPlayMode === playMode) {
      return;
    }

    setPlayMode(nextPlayMode);
    resetRunState();
  };

  if (!chart || notes.length === 0) {
    return (
      <section className="player-card" aria-labelledby="player-run-panel-title">
        <div className="player-card__header">
          <div>
            <p className="player-kicker">{copy.runPanel.kicker}</p>
            <h2 id="player-run-panel-title" className="player-section-title">{copy.runPanel.title}</h2>
          </div>
          <span className="player-pill">{copy.runPanel.noChart}</span>
        </div>
        <p className="status-empty">
          {copy.runPanel.noChartMessage}
        </p>
      </section>
    );
  }

  return (
    <section className={`player-card player-run-panel is-${runState.status}`} aria-labelledby="player-run-panel-title">
      <div className="player-card__header">
        <div>
          <p className="player-kicker">{copy.runPanel.kicker}</p>
          <h2 id="player-run-panel-title" className="player-section-title">{copy.runPanel.title}</h2>
        </div>
        <div className="player-run-panel__header-pills">
          <span className="player-pill">{copy.runPanel.playModes[playMode]}</span>
          <span className={`player-pill${runState.status === 'complete' ? ' is-live' : ''}`}>
            {getRunStatusLabel(runState.status, language)}
          </span>
        </div>
      </div>

      <div className="player-run-panel__hero">
        <div>
          <p className="player-run-panel__tempo">{playMode === 'manual' ? copy.runPanel.tempoManual(tempo) : copy.runPanel.tempoAuto(tempo)}</p>
          {playMode === 'manual' ? (
            <p className="player-run-panel__subtitle">{copy.runPanel.subtitles.manual}</p>
          ) : null}
        </div>
        <div className="player-run-panel__sync">
          <div className="player-run-panel__sync-meta">
            <span className={`player-pill${clickTrackEnabled && audioSupported ? ' is-live' : ''}`}>
              {audioSupported ? (clickTrackEnabled ? copy.runPanel.sync.clickOn : copy.runPanel.sync.clickOff) : copy.runPanel.sync.clickPending}
            </span>
            {audioSupported && clickTrackEnabled && pulseIndicator ? (
              <span className="player-run-panel__sync-label">{audioSyncLabel}</span>
            ) : null}
          </div>
          <div className="player-run-panel__sync-meta">
            <span className={`player-pill${bgmEnabled && bgmSupported ? ' is-live' : ''}`}>
              {bgmSupported ? (bgmEnabled ? copy.runPanel.sync.bgmOn : copy.runPanel.sync.bgmOff) : copy.runPanel.sync.bgmPending}
            </span>
            {bgmSupported && bgmEnabled && activeCueSummary ? (
              <span className="player-run-panel__sync-label">{bgmStatusLabel}</span>
            ) : null}
          </div>
          <div className="player-run-panel__meter" aria-label={language === 'ko' ? '비트 미터' : 'Beat meter'}>
            {Array.from({ length: 4 }, (_, beatOffset) => {
              const beat = beatOffset + 1;
              const isActive = activeBeatInBar === beat;
              const isDownbeat = beat === 1;

              return (
                <span
                  key={beat}
                  className={`player-run-panel__meter-step${isActive ? ' is-active' : ''}${isDownbeat ? ' is-downbeat' : ''}`}
                >
                  {beat}
                </span>
              );
            })}
          </div>
        </div>
        <div className="player-run-panel__mode-switch" role="tablist" aria-label={language === 'ko' ? '플레이 모드' : 'Play mode'}>
          {PLAY_MODES.map((mode) => (
            <button
              key={mode.id}
              className={`source-mode-tab${playMode === mode.id ? ' is-active' : ''}`}
              type="button"
              role="tab"
              aria-selected={playMode === mode.id}
              onClick={() => handleModeChange(mode.id)}
            >
              <span className="source-mode-tab__label">{copy.runPanel.playModes[mode.id]}</span>
              <span className="source-mode-tab__description" />
            </button>
          ))}
        </div>
        <div className="player-run-panel__actions">
          <button
            className="player-button"
            type="button"
            disabled={runState.status === 'running'}
            onClick={handleStartOrResume}
          >
            {runState.status === 'idle' ? copy.runPanel.controls.start : runState.status === 'paused' ? copy.runPanel.controls.resume : copy.runPanel.controls.replay}
          </button>
          <button
            className="player-button player-button--secondary"
            type="button"
            disabled={!audioSupported}
            onClick={() => {
              setClickTrackEnabled((enabled) => !enabled);
            }}
          >
            {clickTrackEnabled ? copy.runPanel.controls.muteClick : copy.runPanel.controls.enableClick}
          </button>
          <button
            className="player-button player-button--secondary"
            type="button"
            disabled={!bgmSupported}
            onClick={() => {
              setBgmEnabled((enabled) => !enabled);
            }}
          >
            {bgmEnabled ? copy.runPanel.controls.muteBgm : copy.runPanel.controls.enableBgm}
          </button>
          <button
            className="player-button player-button--secondary"
            type="button"
            disabled={runState.status !== 'running'}
            onClick={() => {
              setRunState((previousState) => ({
                ...previousState,
                status: 'paused',
              }));
            }}
          >
            {copy.runPanel.controls.pause}
          </button>
          <button
            className="player-button player-button--secondary"
            type="button"
            disabled={runState.status === 'idle'}
            onClick={() => {
              resetRunState();
            }}
          >
            {copy.runPanel.controls.retry}
          </button>
        </div>
      </div>

      <div className="player-run-panel__progress">
        <div className="player-run-panel__progress-meta">
          <span>{copy.runPanel.beatProgress(runState.currentBeat.toFixed(1), totalBeats.toFixed(1))}</span>
          <span>{progressPercent}%</span>
        </div>
        <div className="player-run-panel__progress-bar" aria-hidden="true">
          <span className="player-run-panel__progress-fill" style={{ width: `${progressPercent}%` }} />
        </div>
      </div>

      <div className="player-run-panel__cockpit">
        <div className="player-run-panel__now">
          <span>{copy.runPanel.stage.now}</span>
          <strong>{runState.currentBeat.toFixed(1)}</strong>
          <em>{nextHitLabel}</em>
        </div>
        <div
          className="player-run-panel__judgment-track"
          aria-label={copy.runPanel.stage.judgmentRail}
        >
          {judgmentTiers.map((tier) => (
            <span
              key={tier.id}
              className={`player-run-panel__judgment-chip is-${tier.id}${tier.value ? ' has-value' : ''}`}
            >
              {`${tier.label} ${tier.value}`}
            </span>
          ))}
          <span className="player-run-panel__judgment-chip is-last">
            {runState.lastJudgment || audioSyncLabel}
          </span>
        </div>
      </div>

      <div className="status-metrics">
        <article className="status-metric">
          <span className="status-metric__label">{copy.runPanel.metrics.score}</span>
          <strong>{runState.score}</strong>
        </article>
        <article className="status-metric">
          <span className="status-metric__label">{copy.runPanel.metrics.combo}</span>
          <strong>{runState.combo}</strong>
        </article>
        <article className="status-metric">
          <span className="status-metric__label">{copy.runPanel.metrics.maxCombo}</span>
          <strong>{runState.maxCombo}</strong>
        </article>
        <article className="status-metric">
          <span className="status-metric__label">{copy.runPanel.metrics.accuracy}</span>
          <strong>{accuracyLabel}</strong>
        </article>
      </div>

      {playMode === 'manual' ? (
        <p className="player-run-panel__timing-note">{copy.runPanel.timingBias(averageOffsetLabel)}</p>
      ) : null}

      <div className="player-run-panel__lanes" aria-label={language === 'ko' ? '차트 레인' : 'Chart lanes'}>
        {Array.from({ length: laneCount }, (_, laneOffset) => {
          const laneIndex = laneOffset + 1;
          const laneNotes = visibleNotes.filter((note) => note.laneIndex === laneIndex);
          const laneKey = resolveLaneKey(laneIndex);

          return (
            <div key={laneIndex} className={`player-run-panel__lane${runState.status === 'running' ? ' is-armed' : ''}`}>
              <div className="player-run-panel__lane-label">
                <span>{copy.runPanel.laneLabel(laneIndex)}</span>
                <kbd>{laneKey}</kbd>
              </div>
              <div className="player-run-panel__lane-track">
                <span className="player-run-panel__lane-radar" aria-hidden="true" />
                {laneNotes.map((note) => (
                  <span
                    key={note.noteId}
                    className={`player-run-panel__note is-${note.noteType}`}
                    style={buildNoteStyle(note, runState.currentBeat)}
                    title={`${note.noteType} @ ${note.beatOffset.toFixed(2)}`}
                  />
                ))}
                <span className="player-run-panel__hit-line" />
              </div>
              <button
                className="player-button player-button--secondary"
                type="button"
                disabled={playMode !== 'manual' || runState.status !== 'running'}
                onClick={() => {
                  setRunState((previousState) => resolveManualLaneHit(previousState, laneIndex, notes, totalBeats, tempo, language));
                }}
              >
                {copy.runPanel.controls.hit(laneKey)}
              </button>
            </div>
          );
        })}
      </div>

      <div className="player-run-panel__queue">
        <div className="status-section__title">{copy.runPanel.upcomingTitle}</div>
        {upcomingNotes.length > 0 ? (
          <ol className="player-run-panel__queue-list">
            {upcomingNotes.map((note) => (
              <li key={note.noteId} className="player-run-panel__queue-item">
                <span className="player-run-panel__queue-lane">{copy.runPanel.laneLabel(note.laneIndex)}</span>
                <span>{note.noteType}</span>
                <span>{copy.runPanel.queueNoteBeat(note.beatOffset.toFixed(2))}</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="status-empty">{copy.runPanel.queueEmpty}</p>
        )}
      </div>

      {runState.status === 'complete' ? (
        <div className="status-item status-item--wide">
          <dt>{language === 'ko' ? '런 결과' : 'Run result'}</dt>
          <dd>
            {playMode === 'manual'
              ? copy.runPanel.resultManual({
                notesHit: runState.notesHit,
                totalNotes: notes.length,
                maxCombo: runState.maxCombo,
                misses: runState.judgments.miss,
                score: runState.score,
              })
              : copy.runPanel.resultAuto({
                notesHit: runState.notesHit,
                totalNotes: notes.length,
                maxCombo: runState.maxCombo,
                misses: runState.judgments.miss,
                score: runState.score,
              })}
          </dd>
        </div>
      ) : null}
    </section>
  );
}

function createEmptyRunState() {
  return {
    runToken: createRunToken(),
    status: 'idle',
    currentBeat: 0,
    score: 0,
    combo: 0,
    maxCombo: 0,
    notesHit: 0,
    judgments: {
      perfect: 0,
      great: 0,
      good: 0,
      miss: 0,
    },
    timedHitCount: 0,
    timingOffsetTotalMs: 0,
    processedNoteIds: [],
    lastJudgment: '',
  };
}

let runTokenCounter = 0;

function createRunToken() {
  runTokenCounter += 1;
  return `run-${runTokenCounter}`;
}

function advanceAutoRunState(previousState, notes, totalBeats, language = 'en') {
  const copy = getPlayerCopy(language);
  if (previousState.status !== 'running') {
    return previousState;
  }

  const processedNoteIds = new Set(previousState.processedNoteIds);
  const nextBeat = Math.min(totalBeats, previousState.currentBeat + BEAT_STEP);
  const resolvedNotes = notes.filter((note) => (
    !processedNoteIds.has(note.noteId) && note.beatOffset <= nextBeat + 0.0001
  ));

  resolvedNotes.forEach((note) => {
    processedNoteIds.add(note.noteId);
  });

  const scoreDelta = resolvedNotes.reduce((total, note) => total + scoreNote(note), 0);
  const nextCombo = previousState.combo + resolvedNotes.length;
  const nextMaxCombo = Math.max(previousState.maxCombo, nextCombo);
  const nextNotesHit = previousState.notesHit + resolvedNotes.length;
  const isComplete = nextBeat >= totalBeats && processedNoteIds.size >= notes.length;

  return {
    ...previousState,
    status: isComplete ? 'complete' : 'running',
    currentBeat: nextBeat,
    score: previousState.score + scoreDelta,
    combo: nextCombo,
    maxCombo: nextMaxCombo,
    notesHit: nextNotesHit,
    processedNoteIds: [...processedNoteIds],
    judgments: {
      ...previousState.judgments,
      perfect: previousState.judgments.perfect + resolvedNotes.length,
    },
    lastJudgment: resolvedNotes.length ? copy.runPanel.autoResolved(resolvedNotes.length) : previousState.lastJudgment,
  };
}

function advanceManualRunState(previousState, notes, totalBeats, language = 'en') {
  const copy = getPlayerCopy(language);
  if (previousState.status !== 'running') {
    return previousState;
  }

  const processedNoteIds = new Set(previousState.processedNoteIds);
  const nextBeat = Math.min(totalBeats, previousState.currentBeat + BEAT_STEP);
  const missedNotes = notes.filter((note) => (
    !processedNoteIds.has(note.noteId) && note.beatOffset < nextBeat - GOOD_WINDOW
  ));

  missedNotes.forEach((note) => {
    processedNoteIds.add(note.noteId);
  });

  const isComplete = nextBeat >= totalBeats && processedNoteIds.size >= notes.length;

  return {
    ...previousState,
    status: isComplete ? 'complete' : 'running',
    currentBeat: nextBeat,
    combo: missedNotes.length ? 0 : previousState.combo,
    processedNoteIds: [...processedNoteIds],
    judgments: {
      ...previousState.judgments,
      miss: previousState.judgments.miss + missedNotes.length,
    },
    lastJudgment: missedNotes.length ? copy.runPanel.missedNotes(missedNotes.length) : previousState.lastJudgment,
  };
}

function resolveManualLaneHit(previousState, laneIndex, notes, totalBeats, tempo = 120, language = 'en') {
  const copy = getPlayerCopy(language);
  if (previousState.status !== 'running') {
    return previousState;
  }

  const processedNoteIds = new Set(previousState.processedNoteIds);
  const candidate = notes
    .filter((note) => !processedNoteIds.has(note.noteId) && note.laneIndex === laneIndex)
    .map((note) => ({
      note,
      distance: Math.abs(note.beatOffset - previousState.currentBeat),
    }))
    .filter((entry) => entry.distance <= GOOD_WINDOW)
    .sort((left, right) => left.distance - right.distance)[0];

  if (!candidate) {
    return {
      ...previousState,
      combo: 0,
      lastJudgment: copy.runPanel.laneMiss(laneIndex),
    };
  }

  processedNoteIds.add(candidate.note.noteId);

  const judgment = candidate.distance <= PERFECT_WINDOW
    ? 'perfect'
    : candidate.distance <= GREAT_WINDOW
      ? 'great'
      : 'good';
  const beatDurationMs = 60000 / Math.max(1, tempo);
  const signedOffsetMs = Math.round((previousState.currentBeat - candidate.note.beatOffset) * beatDurationMs);
  const scoreDelta = Math.round(scoreNote(candidate.note) * (JUDGMENT_MULTIPLIERS[judgment] || JUDGMENT_MULTIPLIERS.good));
  const nextCombo = previousState.combo + 1;
  const nextMaxCombo = Math.max(previousState.maxCombo, nextCombo);
  const nextNotesHit = previousState.notesHit + 1;
  const isComplete = previousState.currentBeat >= Math.max(0, totalBeats - GOOD_WINDOW) && processedNoteIds.size >= notes.length;

  return {
    ...previousState,
    status: isComplete ? 'complete' : previousState.status,
    score: previousState.score + scoreDelta,
    combo: nextCombo,
    maxCombo: nextMaxCombo,
    notesHit: nextNotesHit,
    processedNoteIds: [...processedNoteIds],
    judgments: {
      ...previousState.judgments,
      [judgment]: previousState.judgments[judgment] + 1,
    },
    timedHitCount: previousState.timedHitCount + 1,
    timingOffsetTotalMs: previousState.timingOffsetTotalMs + signedOffsetMs,
    lastJudgment: `${formatJudgmentLabel(judgment, language)} ${formatSignedOffsetLabel(signedOffsetMs, language)} ${copy.runPanel.laneLabel(laneIndex)}`,
  };
}

function buildNoteStyle(note, currentBeat) {
  const delta = note.beatOffset - currentBeat;
  const normalized = clamp(1 - (delta / VIEW_BEATS), 0, 1);
  const top = 8 + (normalized * 72);
  const height = note.noteType === 'hold'
    ? Math.max(16, note.durationBeats * 22)
    : 16;

  return {
    top: `${top}%`,
    height: `${height}px`,
    opacity: String(0.38 + (normalized * 0.62)),
    transform: `scale(${0.94 + (normalized * 0.06)})`,
  };
}

function resolveLaneFromKey(key, laneCount) {
  const normalizedKey = String(key || '').trim().toUpperCase();
  const laneIndex = LANE_KEYS.findIndex((laneKey) => laneKey === normalizedKey);

  if (laneIndex === -1 || laneIndex + 1 > laneCount) {
    return null;
  }

  return laneIndex + 1;
}

function resolveLaneKey(laneIndex) {
  return LANE_KEYS[laneIndex - 1] || String(laneIndex);
}

function scoreNote(note) {
  return SCORE_BY_NOTE_TYPE[note.noteType] || SCORE_BY_NOTE_TYPE.tap;
}

function getRunStatusLabel(status, language = 'en') {
  const copy = getPlayerCopy(language);
  if (status === 'running') {
    return copy.runPanel.statuses.running;
  }

  if (status === 'paused') {
    return copy.runPanel.statuses.paused;
  }

  if (status === 'complete') {
    return copy.runPanel.statuses.complete;
  }

  return copy.runPanel.statuses.idle;
}

function formatAverageOffsetLabel(offsetMs, language = 'en') {
  const copy = getPlayerCopy(language);
  const roundedOffsetMs = Math.round(offsetMs);

  if (Math.abs(roundedOffsetMs) <= 8) {
    return copy.runPanel.centered;
  }

  if (roundedOffsetMs < 0) {
    return copy.runPanel.avgEarly(Math.abs(roundedOffsetMs));
  }

  return copy.runPanel.avgLate(roundedOffsetMs);
}

function formatSignedOffsetLabel(offsetMs, language = 'en') {
  const copy = getPlayerCopy(language);
  const roundedOffsetMs = Math.round(offsetMs);

  if (Math.abs(roundedOffsetMs) <= 8) {
    return copy.runPanel.onTime;
  }

  if (roundedOffsetMs < 0) {
    return copy.runPanel.early(Math.abs(roundedOffsetMs));
  }

  return copy.runPanel.late(roundedOffsetMs);
}

function formatJudgmentLabel(judgment, language = 'en') {
  const copy = getPlayerCopy(language);
  if (judgment === 'perfect') {
    return copy.runPanel.judgments.perfect;
  }

  if (judgment === 'great') {
    return copy.runPanel.judgments.great;
  }

  return copy.runPanel.judgments.good;
}

function clamp(value, min = 0, max = 1) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return min;
  }

  if (numericValue < min) {
    return min;
  }

  if (numericValue > max) {
    return max;
  }

  return numericValue;
}
