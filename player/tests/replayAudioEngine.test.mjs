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
    get resumeCalls() {
      return resumeCalls;
    },
    get suspendCalls() {
      return suspendCalls;
    },
  };
}
