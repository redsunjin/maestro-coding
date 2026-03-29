import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import {
  setupAppUiEnvironment,
  startLiveSession,
  teardownAppUiEnvironment,
} from './test/appUiHarness.jsx';

describe('App UI regression - header layout controls', () => {
  beforeEach(() => {
    setupAppUiEnvironment();
  });

  afterEach(() => {
    teardownAppUiEnvironment();
  });

  test('collapses panel toggles into a menu on narrower viewports', async () => {
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      writable: true,
      value: 1320,
    });

    await startLiveSession();

    expect(screen.getByRole('button', { name: '패널 메뉴 토글' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '프로젝트 전환 패널 토글' })).not.toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '패널 메뉴 토글' }));
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '프로젝트 전환 패널 토글' }));
    });

    await waitFor(() => {
      expect(screen.getByText('Workspace Repo')).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: '패널 메뉴 토글' })).toHaveAttribute('aria-expanded', 'false');
  });

  test('panel offset tracks measured header height', async () => {
    const originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;
    const rectSpy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function mockRect() {
      if (this.tagName === 'HEADER') {
        return {
          x: 0,
          y: 0,
          top: 0,
          left: 0,
          right: 1440,
          bottom: 140,
          width: 1440,
          height: 140,
          toJSON() {
            return this;
          },
        };
      }

      return originalGetBoundingClientRect.call(this);
    });

    await startLiveSession();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '프로젝트 전환 패널 토글' }));
    });

    await waitFor(() => {
      expect(screen.getByTestId('project-registry-panel')).toHaveStyle({
        '--panel-top-offset': '152px',
      });
    });

    rectSpy.mockRestore();
  });
});
