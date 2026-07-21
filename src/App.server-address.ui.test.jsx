import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App.jsx';
import {
  MockWebSocket,
  setupAppUiEnvironment,
  teardownAppUiEnvironment,
} from './test/appUiHarness.jsx';
import { SERVER_WS_URL_STORAGE_KEY } from './utils/server-address.js';

describe('App UI - server address panel', () => {
  beforeEach(() => {
    setupAppUiEnvironment();
  });

  afterEach(() => {
    teardownAppUiEnvironment();
  });

  test('header button opens panel with current address prefilled', async () => {
    render(<App />);

    await userEvent.click(screen.getByRole('button', { name: '서버 주소 설정' }));

    expect(screen.getByTestId('server-address-panel')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: '서버 주소 입력' })).toHaveValue('ws://localhost:8080');
  });

  test('rejects invalid address and keeps storage clean', async () => {
    render(<App />);

    await userEvent.click(screen.getByRole('button', { name: '서버 주소 설정' }));
    const input = screen.getByRole('textbox', { name: '서버 주소 입력' });
    await userEvent.clear(input);
    await userEvent.type(input, 'ws://host:8080/path');
    await userEvent.click(screen.getByRole('button', { name: '서버 주소 저장' }));

    expect(screen.getByText(/주소 형식이 올바르지 않습니다/)).toBeInTheDocument();
    expect(window.localStorage.getItem(SERVER_WS_URL_STORAGE_KEY)).toBeNull();
    expect(screen.getByTestId('server-address-panel')).toBeInTheDocument();
  });

  test('saves address, closes panel, and connects to the new address', async () => {
    render(<App />);

    await userEvent.click(screen.getByRole('button', { name: '서버 주소 설정' }));
    const input = screen.getByRole('textbox', { name: '서버 주소 입력' });
    await userEvent.clear(input);
    await userEvent.type(input, '192.168.0.42:9000');
    await userEvent.click(screen.getByRole('button', { name: '서버 주소 저장' }));

    expect(window.localStorage.getItem(SERVER_WS_URL_STORAGE_KEY)).toBe('ws://192.168.0.42:9000');
    await waitFor(() => {
      expect(screen.queryByTestId('server-address-panel')).not.toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole('button', { name: '지휘 시작' }));
    await waitFor(() => {
      expect(MockWebSocket.instances.length).toBeGreaterThan(0);
    });
    expect(MockWebSocket.instances.at(-1).url).toBe('ws://192.168.0.42:9000');
  });

  test('connection test reports success against a reachable socket', async () => {
    render(<App />);

    await userEvent.click(screen.getByRole('button', { name: '서버 주소 설정' }));
    await userEvent.click(screen.getByRole('button', { name: '연결 테스트' }));

    await waitFor(() => {
      expect(screen.getByTestId('server-address-test-result')).toHaveTextContent('연결 성공');
    });
  });

  test('native shell without stored address auto-opens setup when default is unreachable', async () => {
    window.Capacitor = { isNativePlatform: () => true };
    class FailingWebSocket {
      constructor(url) {
        this.url = url;
        setTimeout(() => this.onerror?.(), 0);
      }

      close() {}
    }
    globalThis.WebSocket = FailingWebSocket;

    try {
      render(<App />);
      await waitFor(() => {
        expect(screen.getByTestId('server-address-panel')).toBeInTheDocument();
      });
    } finally {
      delete window.Capacitor;
    }
  });

  test('reset restores default address and clears stored value', async () => {
    window.localStorage.setItem(SERVER_WS_URL_STORAGE_KEY, 'ws://10.0.0.7:8080');
    render(<App />);

    await userEvent.click(screen.getByRole('button', { name: '서버 주소 설정' }));
    expect(screen.getByRole('textbox', { name: '서버 주소 입력' })).toHaveValue('ws://10.0.0.7:8080');

    await userEvent.click(screen.getByRole('button', { name: '기본 주소 복원' }));

    expect(window.localStorage.getItem(SERVER_WS_URL_STORAGE_KEY)).toBeNull();
    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: '서버 주소 입력' })).toHaveValue('ws://localhost:8080');
    });
  });
});
