import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { screen, fireEvent, act } from '@testing-library/react';
import {
  setupAppUiEnvironment,
  teardownAppUiEnvironment,
  startLiveSession,
} from './test/appUiHarness.jsx';

describe('App UI regression - key hit sfx', () => {
  beforeEach(() => {
    setupAppUiEnvironment();
  });

  afterEach(() => {
    teardownAppUiEnvironment();
  });

  test('key hit still triggers SFX oscillator while playing', async () => {
    const instances = [];
    const oscillators = [];

    class MockAudioContext {
      constructor() {
        this.currentTime = 0;
        this.state = 'running';
        this.destination = {};
        instances.push(this);
      }

      createOscillator() {
        const osc = {
          type: 'sine',
          frequency: { setValueAtTime: () => {} },
          connect: () => {},
          start: () => {},
          stop: () => {},
        };
        oscillators.push(osc);
        return osc;
      }

      createGain() {
        return {
          gain: {
            value: 0,
            setValueAtTime: () => {},
            exponentialRampToValueAtTime: () => {},
          },
          connect: () => {},
        };
      }

      resume() {
        return Promise.resolve();
      }
    }

    window.AudioContext = MockAudioContext;
    window.webkitAudioContext = undefined;

    await startLiveSession();

    await act(async () => {
      fireEvent.keyDown(window, { key: 'd' });
    });

    expect(instances.length).toBe(1);
    expect(oscillators.length).toBe(1);
    expect(screen.getByText(/261\.63Hz/)).toBeInTheDocument();
  });
});
