import test from 'node:test';
import assert from 'node:assert/strict';

import { createBrowserMetronomeDriver, createPulseDescriptor } from '../src/lib/metronomeEngine.js';

test('createPulseDescriptor marks downbeats and subdivisions deterministically', () => {
  assert.deepEqual(
    createPulseDescriptor({ stepIndex: 0, beatsPerBar: 4, subdivision: 2 }),
    {
      stepIndex: 0,
      beatInBar: 1,
      isDownbeat: true,
      isPrimaryBeat: true,
      isSubdivision: false,
    },
  );

  assert.deepEqual(
    createPulseDescriptor({ stepIndex: 1, beatsPerBar: 4, subdivision: 2 }),
    {
      stepIndex: 1,
      beatInBar: 1,
      isDownbeat: false,
      isPrimaryBeat: false,
      isSubdivision: true,
    },
  );

  assert.equal(
    createPulseDescriptor({ stepIndex: 6, beatsPerBar: 4, subdivision: 2 }).beatInBar,
    4,
  );
});

test('createBrowserMetronomeDriver primes audio contexts and emits pulses', async () => {
  const audioHarness = createAudioHarness();
  const driver = createBrowserMetronomeDriver({
    AudioContext: audioHarness.AudioContext,
  });

  assert.equal(driver.isSupported(), true);
  assert.equal(await driver.prime(), true);
  assert.equal(audioHarness.resumeCalls, 1);

  assert.equal(driver.pulse({
    pulse: createPulseDescriptor({ stepIndex: 0, beatsPerBar: 4, subdivision: 2 }),
  }), true);

  assert.equal(audioHarness.oscillatorStarts.length, 1);
  assert.equal(audioHarness.frequencyValues[0], 880);

  driver.stop();
  assert.equal(audioHarness.suspendCalls, 1);
});

test('createBrowserMetronomeDriver degrades safely without AudioContext support', async () => {
  const driver = createBrowserMetronomeDriver({});

  assert.equal(driver.isSupported(), false);
  assert.equal(await driver.prime(), false);
  assert.equal(driver.pulse({
    pulse: createPulseDescriptor({ stepIndex: 2 }),
  }), false);
});

function createAudioHarness() {
  const oscillatorStarts = [];
  const oscillatorStops = [];
  const frequencyValues = [];
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
          oscillatorStarts.push(time);
        },
        stop(time) {
          oscillatorStops.push(time);
        },
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
    oscillatorStarts,
    oscillatorStops,
    frequencyValues,
    get resumeCalls() {
      return resumeCalls;
    },
    get suspendCalls() {
      return suspendCalls;
    },
  };
}
