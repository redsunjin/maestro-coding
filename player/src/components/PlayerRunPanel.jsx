import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createBrowserMetronomeDriver, createPulseDescriptor } from '../lib/metronomeEngine.js';
import { createBrowserReplayAudioDriver, createReplayCuePlan } from '../lib/replayAudioEngine.js';

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
  { id: 'manual', label: 'Manual Play' },
  { id: 'auto', label: 'Auto Preview' },
]);

const LANE_KEYS = Object.freeze(['A', 'S', 'D', 'F', 'J', 'K']);

export default function PlayerRunPanel({
  chart = null,
  tempo = 120,
  onRunComplete = null,
  audioDriver = null,
  bgmDriver = null,
}) {
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

  useEffect(() => {
    setRunState(createEmptyRunState());
    setPulseIndicator(null);
    setActiveCueSummary('');
    lastPulseStepRef.current = -1;
    lastCueStepRef.current = -1;
  }, [chart, totalBeats, notes.length, playMode]);

  useEffect(() => {
    if (runState.status !== 'running' || notes.length === 0) {
      return undefined;
    }

    const timerId = window.setInterval(() => {
      setRunState((previousState) => (
        playMode === 'auto'
          ? advanceAutoRunState(previousState, notes, totalBeats)
          : advanceManualRunState(previousState, notes, totalBeats)
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
      setRunState((previousState) => resolveManualLaneHit(previousState, laneIndex, notes, totalBeats, tempo));
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
    ? formatAverageOffsetLabel(runState.timingOffsetTotalMs / runState.timedHitCount)
    : 'No timing data';
  const activeBeatInBar = pulseIndicator?.beatInBar || ((Math.floor(runState.currentBeat) % 4) + 1);
  const audioSyncLabel = !audioSupported
    ? 'Audio unavailable'
    : clickTrackEnabled
      ? pulseIndicator?.isDownbeat
        ? `Downbeat on beat ${pulseIndicator.beatInBar}`
        : pulseIndicator
          ? `Beat ${pulseIndicator.beatInBar}${pulseIndicator.isSubdivision ? ' subdivision' : ''}`
          : 'Click track armed'
      : 'Click track muted';
  const bgmStatusLabel = !bgmSupported
    ? 'BGM unavailable'
    : bgmEnabled
      ? activeCueSummary || 'BGM armed'
      : 'BGM muted';

  if (!chart || notes.length === 0) {
    return (
      <section className="player-card" aria-labelledby="player-run-panel-title">
        <div className="player-card__header">
          <div>
            <p className="player-kicker">Run Session</p>
            <h2 id="player-run-panel-title" className="player-section-title">Play the chart</h2>
          </div>
          <span className="player-pill">No chart loaded</span>
        </div>
        <p className="status-empty">
          Load a replay source to generate a playable chart. The run panel will then expose play, pause, retry, lane input, and result summary.
        </p>
      </section>
    );
  }

  return (
    <section className="player-card player-run-panel" aria-labelledby="player-run-panel-title">
      <div className="player-card__header">
        <div>
          <p className="player-kicker">Run Session</p>
          <h2 id="player-run-panel-title" className="player-section-title">Play the chart</h2>
        </div>
        <div className="player-run-panel__header-pills">
          <span className="player-pill">{PLAY_MODES.find((mode) => mode.id === playMode)?.label}</span>
          <span className={`player-pill${runState.status === 'complete' ? ' is-live' : ''}`}>
            {getRunStatusLabel(runState.status)}
          </span>
        </div>
      </div>

      <div className="player-run-panel__hero">
        <div>
          <p className="player-run-panel__tempo">{tempo} BPM {playMode === 'manual' ? 'manual run' : 'autoplay preview'}</p>
          <p className="player-run-panel__subtitle">
            {playMode === 'manual'
              ? 'Use the lane buttons or A/S/D/F to hit notes inside the timing window.'
              : 'Auto mode resolves notes automatically so the shell can verify combo and result handling.'}
          </p>
        </div>
        <div className="player-run-panel__sync">
          <div className="player-run-panel__sync-meta">
            <span className={`player-pill${clickTrackEnabled && audioSupported ? ' is-live' : ''}`}>
              {audioSupported ? (clickTrackEnabled ? 'Click Track On' : 'Click Track Off') : 'Audio Pending'}
            </span>
            <span className="player-run-panel__sync-label">{audioSyncLabel}</span>
          </div>
          <div className="player-run-panel__sync-meta">
            <span className={`player-pill${bgmEnabled && bgmSupported ? ' is-live' : ''}`}>
              {bgmSupported ? (bgmEnabled ? 'BGM Layer On' : 'BGM Layer Off') : 'BGM Pending'}
            </span>
            <span className="player-run-panel__sync-label">{bgmStatusLabel}</span>
          </div>
          <div className="player-run-panel__meter" aria-label="Beat meter">
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
        <div className="player-run-panel__mode-switch" role="tablist" aria-label="Play mode">
          {PLAY_MODES.map((mode) => (
            <button
              key={mode.id}
              className={`source-mode-tab${playMode === mode.id ? ' is-active' : ''}`}
              type="button"
              role="tab"
              aria-selected={playMode === mode.id}
              onClick={() => setPlayMode(mode.id)}
            >
              <span className="source-mode-tab__label">{mode.label}</span>
              <span className="source-mode-tab__description" />
            </button>
          ))}
        </div>
        <div className="player-run-panel__actions">
          <button
            className="player-button"
            type="button"
            disabled={runState.status === 'running'}
            onClick={() => {
              if (audioSupported) {
                metronomeDriver?.prime?.();
              }
              if (bgmSupported) {
                replayAudioDriver?.prime?.();
              }

              setRunState((previousState) => {
                if (previousState.status === 'complete') {
                  return {
                    ...createEmptyRunState(),
                    status: 'running',
                  };
                }

                return {
                  ...previousState,
                  status: 'running',
                };
              });
            }}
          >
            {runState.status === 'idle' ? 'Start Run' : runState.status === 'paused' ? 'Resume Run' : 'Replay Run'}
          </button>
          <button
            className="player-button player-button--secondary"
            type="button"
            disabled={!audioSupported}
            onClick={() => {
              setClickTrackEnabled((enabled) => !enabled);
            }}
          >
            {clickTrackEnabled ? 'Mute Click Track' : 'Enable Click Track'}
          </button>
          <button
            className="player-button player-button--secondary"
            type="button"
            disabled={!bgmSupported}
            onClick={() => {
              setBgmEnabled((enabled) => !enabled);
            }}
          >
            {bgmEnabled ? 'Mute BGM Layer' : 'Enable BGM Layer'}
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
            Pause Run
          </button>
          <button
            className="player-button player-button--secondary"
            type="button"
            disabled={runState.status === 'idle'}
            onClick={() => {
              setRunState(createEmptyRunState());
              setActiveCueSummary('');
            }}
          >
            Retry Run
          </button>
        </div>
      </div>

      <div className="player-run-panel__progress">
        <div className="player-run-panel__progress-meta">
          <span>Beat {runState.currentBeat.toFixed(1)} / {totalBeats.toFixed(1)}</span>
          <span>{progressPercent}%</span>
        </div>
        <div className="player-run-panel__progress-bar" aria-hidden="true">
          <span className="player-run-panel__progress-fill" style={{ width: `${progressPercent}%` }} />
        </div>
      </div>

      <div className="status-metrics">
        <article className="status-metric">
          <span className="status-metric__label">Score</span>
          <strong>{runState.score}</strong>
        </article>
        <article className="status-metric">
          <span className="status-metric__label">Combo</span>
          <strong>{runState.combo}</strong>
        </article>
        <article className="status-metric">
          <span className="status-metric__label">Max Combo</span>
          <strong>{runState.maxCombo}</strong>
        </article>
        <article className="status-metric">
          <span className="status-metric__label">Accuracy</span>
          <strong>{accuracyLabel}</strong>
        </article>
      </div>

      <div className="player-run-panel__judgment-row">
        <span>Perfect {runState.judgments.perfect}</span>
        <span>Great {runState.judgments.great}</span>
        <span>Good {runState.judgments.good}</span>
        <span>Miss {runState.judgments.miss}</span>
        <span>{runState.lastJudgment || audioSyncLabel}</span>
      </div>
      <p className="player-run-panel__timing-note">
        {playMode === 'manual' ? `Timing bias: ${averageOffsetLabel}` : 'Timing bias: Auto mode resolves notes without human timing.'}
      </p>
      <p className="player-run-panel__timing-note">{`BGM state: ${bgmStatusLabel}`}</p>

      <div className="player-run-panel__lanes" aria-label="Chart lanes">
        {Array.from({ length: laneCount }, (_, laneOffset) => {
          const laneIndex = laneOffset + 1;
          const laneNotes = visibleNotes.filter((note) => note.laneIndex === laneIndex);
          const laneKey = resolveLaneKey(laneIndex);

          return (
            <div key={laneIndex} className="player-run-panel__lane">
              <div className="player-run-panel__lane-label">
                <span>Lane {laneIndex}</span>
                <kbd>{laneKey}</kbd>
              </div>
              <div className="player-run-panel__lane-track">
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
                  setRunState((previousState) => resolveManualLaneHit(previousState, laneIndex, notes, totalBeats, tempo));
                }}
              >
                Hit {laneKey}
              </button>
            </div>
          );
        })}
      </div>

      <div className="player-run-panel__queue">
        <div className="status-section__title">Upcoming Notes</div>
        {upcomingNotes.length > 0 ? (
          <ol className="player-run-panel__queue-list">
            {upcomingNotes.map((note) => (
              <li key={note.noteId} className="player-run-panel__queue-item">
                <span className="player-run-panel__queue-lane">Lane {note.laneIndex}</span>
                <span>{note.noteType}</span>
                <span>@ {note.beatOffset.toFixed(2)} beat</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="status-empty">No queued notes remain in this run.</p>
        )}
      </div>

      {runState.status === 'complete' ? (
        <div className="status-item status-item--wide">
          <dt>Run result</dt>
          <dd>
            Completed {playMode === 'manual' ? 'manual play' : 'autoplay preview'} with {runState.notesHit} / {notes.length}
            {' '}notes resolved, {runState.maxCombo} max combo, {runState.judgments.miss} misses, and {runState.score} score.
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

function advanceAutoRunState(previousState, notes, totalBeats) {
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
    lastJudgment: resolvedNotes.length ? `Auto resolved ${resolvedNotes.length} note${resolvedNotes.length > 1 ? 's' : ''}` : previousState.lastJudgment,
  };
}

function advanceManualRunState(previousState, notes, totalBeats) {
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
    lastJudgment: missedNotes.length ? `Missed ${missedNotes.length} note${missedNotes.length > 1 ? 's' : ''}` : previousState.lastJudgment,
  };
}

function resolveManualLaneHit(previousState, laneIndex, notes, totalBeats, tempo = 120) {
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
      lastJudgment: `Lane ${laneIndex} miss`,
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
    lastJudgment: `${formatJudgmentLabel(judgment)} ${formatSignedOffsetLabel(signedOffsetMs)} on lane ${laneIndex}`,
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

function getRunStatusLabel(status) {
  if (status === 'running') {
    return 'Run active';
  }

  if (status === 'paused') {
    return 'Run paused';
  }

  if (status === 'complete') {
    return 'Run complete';
  }

  return 'Ready to play';
}

function formatAverageOffsetLabel(offsetMs) {
  const roundedOffsetMs = Math.round(offsetMs);

  if (Math.abs(roundedOffsetMs) <= 8) {
    return 'Centered';
  }

  if (roundedOffsetMs < 0) {
    return `Avg early ${Math.abs(roundedOffsetMs)}ms`;
  }

  return `Avg late ${roundedOffsetMs}ms`;
}

function formatSignedOffsetLabel(offsetMs) {
  const roundedOffsetMs = Math.round(offsetMs);

  if (Math.abs(roundedOffsetMs) <= 8) {
    return 'on time';
  }

  if (roundedOffsetMs < 0) {
    return `early ${Math.abs(roundedOffsetMs)}ms`;
  }

  return `late ${roundedOffsetMs}ms`;
}

function formatJudgmentLabel(judgment) {
  if (judgment === 'perfect') {
    return 'Perfect';
  }

  if (judgment === 'great') {
    return 'Great';
  }

  return 'Good';
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
