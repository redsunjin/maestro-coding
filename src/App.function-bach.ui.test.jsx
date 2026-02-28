import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App.jsx';
import { setupAppUiEnvironment, teardownAppUiEnvironment } from './test/appUiHarness.jsx';

describe('App UI regression - function bach', () => {
  beforeEach(() => {
    setupAppUiEnvironment();
  });

  afterEach(() => {
    teardownAppUiEnvironment();
  });

  test('function bach mini player keeps top compact controls and persists channel URL', async () => {
    const playerInstances = [];

    class MockYTPlayer {
      constructor(_element, options) {
        this.options = options;
        this.cuePlaylist = vi.fn();
        this.loadPlaylist = vi.fn(() => {
          this.options.events.onStateChange({ data: window.YT.PlayerState.PLAYING });
        });
        this.cueVideoById = vi.fn();
        this.loadVideoById = vi.fn(() => {
          this.options.events.onStateChange({ data: window.YT.PlayerState.PLAYING });
        });
        this.pauseVideo = vi.fn(() => {
          this.options.events.onStateChange({ data: window.YT.PlayerState.PAUSED });
        });
        this.setVolume = vi.fn();
        this.destroy = vi.fn();
        playerInstances.push(this);
        this.options.events.onReady({ target: this });
      }
    }

    window.YT = {
      Player: MockYTPlayer,
      PlayerState: {
        ENDED: 0,
        PLAYING: 1,
        PAUSED: 2,
        CUED: 5,
      },
    };

    render(<App />);

    const miniPlayer = screen.getByTestId('function-bach-mini');
    expect(miniPlayer).toBeInTheDocument();
    expect(miniPlayer.className).toContain('rounded-full');

    await userEvent.click(screen.getByRole('button', { name: '배경음악 재생' }));
    expect(playerInstances[0].loadPlaylist).toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.getByTestId('function-bach-hz')).toHaveTextContent(/Hz/);
    });

    await userEvent.click(screen.getByRole('button', { name: '배경음악 일시정지' }));
    expect(playerInstances[0].pauseVideo).toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('배경음악 볼륨'), { target: { value: '20' } });
    expect(playerInstances[0].setVolume).toHaveBeenCalledWith(20);

    await userEvent.click(screen.getByRole('button', { name: '배경음악 채널 설정' }));
    const channelInput = screen.getByLabelText('유튜브 채널 경로');
    await userEvent.clear(channelInput);
    await userEvent.type(channelInput, 'https://www.youtube.com/channel/UC2kF6qdHRTM_hDYfEmzkS9w');
    await userEvent.click(screen.getByRole('button', { name: '저장' }));

    expect(window.localStorage.getItem('maestro.function-bach.channel-url')).toBe('https://www.youtube.com/channel/UC2kF6qdHRTM_hDYfEmzkS9w');
  });
});
