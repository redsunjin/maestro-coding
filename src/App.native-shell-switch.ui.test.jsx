import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from './App.jsx';
import {
  setupAppUiEnvironment,
  teardownAppUiEnvironment,
} from './test/appUiHarness.jsx';

describe('App UI - native shell 전환 버튼', () => {
  beforeEach(() => {
    setupAppUiEnvironment();
  });

  afterEach(() => {
    teardownAppUiEnvironment();
    delete window.Capacitor;
  });

  test('네이티브 셸에서는 Player 전환 버튼이 보인다', () => {
    window.Capacitor = { isNativePlatform: () => true };
    render(<App />);

    expect(screen.getByRole('button', { name: 'Player로 전환' })).toBeVisible();
  });

  test('웹 배포(Capacitor 없음)에서는 전환 버튼이 없다', () => {
    render(<App />);
    expect(screen.queryByRole('button', { name: 'Player로 전환' })).toBeNull();
  });
});
