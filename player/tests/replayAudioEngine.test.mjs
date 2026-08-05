import test from 'node:test';
import assert from 'node:assert/strict';

import { createBrowserReplayAudioDriver, createReplayCuePlan } from '../src/lib/replayAudioEngine.js';

test('createReplayCuePlan groups notes into deterministic cue batches', () => {
  const batches = createReplayCuePlan([
    { noteId: 'n-1', laneIndex: 1, beatOffset: 0, noteType: 'tap' },
    { noteId: 'n-2', laneIndex: 3, beatOffset: 0, noteType: 'accent' },
    { noteId: 'n-3', laneIndex: 2, beatOffset: 0.5, noteType: 'hold' },
  ], { laneCount: 4 });

  assert.equal(batches.length, 2);
  assert.equal(batches[0].stepIndex, 0);
  assert.equal(batches[0].cues.length, 2);
  assert.equal(batches[0].summary, 'Cue L1 tap · L3 accent');
  assert.equal(batches[1].cues[0].waveform, 'sawtooth');
});

test('createBrowserReplayAudioDriver primes audio context and plays cue batches', async () => {
  const harness = createAudioHarness();
  const driver = createBrowserReplayAudioDriver({
    AudioContext: harness.AudioContext,
  });

  assert.equal(driver.isSupported(), true);
  assert.equal(await driver.prime(), true);
  assert.equal(harness.resumeCalls, 1);

  const played = driver.playCueBatch({
    batch: {
      cues: [
        { frequencyHz: 220, durationSeconds: 0.12, gainMultiplier: 1, waveform: 'sine' },
        { frequencyHz: 440, durationSeconds: 0.18, gainMultiplier: 1.1, waveform: 'triangle' },
      ],
    },
  });

  assert.equal(played, true);
  assert.deepEqual(harness.frequencyValues, [220, 440]);
  assert.equal(harness.starts.length, 2);

  driver.stop();
  assert.equal(harness.suspendCalls, 1);
});

test('createBrowserReplayAudioDriver degrades safely without audio support', async () => {
  const driver = createBrowserReplayAudioDriver({});

  assert.equal(driver.isSupported(), false);
  assert.equal(await driver.prime(), false);
  assert.equal(driver.playCueBatch({ batch: { cues: [] } }), false);
});

function createAudioHarness() {
  const frequencyValues = [];
  const starts = [];
  const filterCutoffs = [];
  let resumeCalls = 0;
  let suspendCalls = 0;

  class FakeAudioContext {
    constructor() {
      this.currentTime = 0;
      this.destination = {};
      this.state = 'suspended';
    }

    async resume() {
      this.state = 'running';
      resumeCalls += 1;
    }

    async suspend() {
      this.state = 'suspended';
      suspendCalls += 1;
    }

    createOscillator() {
      return {
        type: 'sine',
        frequency: {
          setValueAtTime(value) {
            frequencyValues.push(value);
          },
        },
        connect() {},
        start(time) {
          starts.push(time);
        },
        stop() {},
      };
    }

    createBiquadFilter() {
      return {
        type: 'lowpass',
        frequency: {
          setValueAtTime(value) {
            filterCutoffs.push(value);
          },
        },
        connect() {},
      };
    }

    createGain() {
      return {
        gain: {
          setValueAtTime() {},
          exponentialRampToValueAtTime() {},
        },
        connect() {},
      };
    }
  }

  return {
    AudioContext: FakeAudioContext,
    frequencyValues,
    starts,
    filterCutoffs,
    get resumeCalls() {
      return resumeCalls;
    },
    get suspendCalls() {
      return suspendCalls;
    },
  };
}

test('chordFrequencies가 있는 cue는 화음 오실레이터를 추가로 울린다', async () => {
  const harness = createAudioHarness();
  const driver = createBrowserReplayAudioDriver({ AudioContext: harness.AudioContext });
  await driver.prime();

  const played = driver.playCueBatch({
    batch: {
      cues: [
        {
          frequencyHz: 440,
          durationSeconds: 0.18,
          gainMultiplier: 1,
          waveform: 'triangle',
          chordFrequencies: [110, 220, 277.18],
        },
      ],
    },
  });

  assert.equal(played, true);
  assert.equal(harness.starts.length, 4); // 메인 1 + 화음 3
  assert.deepEqual(harness.frequencyValues, [440, 110, 220, 277.18]);
});

test('createReplayCuePlan은 chordMidis를 chordFrequencies로 변환한다', () => {
  const [batch] = createReplayCuePlan([
    { noteId: 'n1', laneIndex: 4, beatOffset: 0, durationBeats: 1, noteType: 'accent', pitchMidi: 60, chordMidis: [36, 48, 51, 55] },
  ], { laneCount: 4 });

  const cue = batch.cues[0];
  assert.equal(cue.chordFrequencies.length, 4);
  assert.equal(Math.round(cue.chordFrequencies[0]), 65); // C2 베이스
});

test('cue는 velocity 반영 게인과 type별 엔벨로프·컷오프를 갖는다', () => {
  const [batch] = createReplayCuePlan([
    { noteId: 'v1', laneIndex: 1, beatOffset: 0, durationBeats: 1, noteType: 'accent', pitchMidi: 60, velocity: 1.1 },
    { noteId: 'v2', laneIndex: 2, beatOffset: 0, durationBeats: 1, noteType: 'tap', pitchMidi: 62, velocity: 0.7 },
    { noteId: 'v3', laneIndex: 3, beatOffset: 0, durationBeats: 1, noteType: 'hold', pitchMidi: 48, velocity: 0.8 },
  ], { laneCount: 4 });
  const [accent, tap, hold] = batch.cues;

  assert.equal(accent.gainMultiplier, Math.round(1.15 * 1.1 * 100) / 100);
  assert.equal(tap.gainMultiplier, Math.round(0.92 * 0.7 * 100) / 100);
  assert.deepEqual([accent.attackSeconds, accent.releaseSeconds], [0.005, 0.12]);
  assert.deepEqual([tap.attackSeconds, tap.releaseSeconds], [0.008, 0.06]);
  assert.deepEqual([hold.attackSeconds, hold.releaseSeconds], [0.03, 0.2]);
  assert.equal(hold.filterCutoffHz, 1400);
  assert.equal(accent.filterCutoffHz, 2600);
  assert.equal(tap.filterCutoffHz, 3200);
});

test('드라이버는 voice마다 로우패스 필터를 연결한다 (미지원 mock은 폴백)', async () => {
  const harness = createAudioHarness();
  const driver = createBrowserReplayAudioDriver({ AudioContext: harness.AudioContext });
  await driver.prime();

  driver.playCueBatch({
    batch: {
      cues: [{
        frequencyHz: 440,
        durationSeconds: 0.18,
        gainMultiplier: 1,
        waveform: 'triangle',
        filterCutoffHz: 2600,
        attackSeconds: 0.005,
        releaseSeconds: 0.12,
        chordFrequencies: [110, 220],
      }],
    },
  });

  // 메인 1 + 화음 2 = 3 voice, 각각 필터 1개
  assert.equal(harness.starts.length, 3);
  assert.equal(harness.filterCutoffs.length, 3);
  assert.equal(harness.filterCutoffs[0], 2600);
  assert.ok(harness.filterCutoffs[1] <= 1400); // 화음 패드는 더 어둡게
});
