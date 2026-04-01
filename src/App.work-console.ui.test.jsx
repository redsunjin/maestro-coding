import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { screen, act, fireEvent, waitFor } from '@testing-library/react';
import {
  setupAppUiEnvironment,
  teardownAppUiEnvironment,
  startLiveSession,
} from './test/appUiHarness.jsx';

describe('App UI regression - work console shell', () => {
  beforeEach(() => {
    setupAppUiEnvironment();
  });

  afterEach(() => {
    teardownAppUiEnvironment();
  });

  test('work console toggles, focuses close button, and preserves dock selection', async () => {
    await startLiveSession();

    const toggleButton = screen.getByRole('button', { name: 'Work Console 패널 토글' });
    const panel = screen.getByTestId('work-console-panel');

    expect(toggleButton).toHaveAttribute('aria-expanded', 'false');
    expect(panel).toHaveAttribute('aria-hidden', 'true');

    await act(async () => {
      fireEvent.click(toggleButton);
    });

    expect(toggleButton).toHaveAttribute('aria-expanded', 'true');
    expect(panel).toHaveAttribute('aria-hidden', 'false');
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Work Console 닫기' })).toHaveFocus();
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Work Console 왼쪽으로 이동' }));
    });

    expect(window.localStorage.getItem('maestro.work-console.dock-side')).toBe('left');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Work Console 닫기' }));
    });

    expect(window.localStorage.getItem('maestro.work-console.open')).toBe('false');
    expect(panel).toHaveAttribute('aria-hidden', 'true');
  });

  test('work console restores saved state and can stay open with history panel', async () => {
    window.localStorage.setItem('maestro.work-console.open', 'true');
    window.localStorage.setItem('maestro.work-console.dock-side', 'left');

    await startLiveSession();

    const workPanel = screen.getByTestId('work-console-panel');
    const historyPanel = screen.getByTestId('history-panel');

    expect(workPanel).toHaveAttribute('aria-hidden', 'false');
    expect(screen.getByRole('button', { name: 'Work Console 패널 토글' })).toHaveAttribute('aria-expanded', 'true');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '히스토리 패널 토글' }));
    });

    expect(workPanel).toHaveAttribute('aria-hidden', 'false');
    expect(historyPanel).toHaveAttribute('aria-hidden', 'false');
  });
});
