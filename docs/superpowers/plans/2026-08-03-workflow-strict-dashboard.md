# Maestro Workflow 엄격 모드 대시보드 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Workflow MVP의 알려진 한계 3종(토큰 모드 대시보드 부재, WS 무인증, WS 재연결 없음)을 해소한다.

**Architecture:** 서버는 WS 첫 메시지 인증(`WORKFLOW_AUTH`/`WORKFLOW_AUTH_OK`, 실패·타임아웃 시 close 4401)을 추가하고 브로드캐스트를 인가 소켓으로 제한한다. 대시보드는 localStorage 기반 서버 토큰 상태를 api.js에 두고, 401/4401 시 TokenGate 오버레이로 토큰을 받으며, WS는 지수 백오프로 자동 재연결한다.

**Tech Stack:** Node http + ws(서버), React 19 + vitest + testing-library(UI), node:test(서버 테스트).

**스펙:** `docs/superpowers/specs/2026-08-03-workflow-strict-dashboard-design.md`

## Global Constraints

- 수정 범위는 `workflow/` 와 `docs/maestro-workflow/` 하위만. 본체(`src/`, `tests/`, `maestro-server.js`, `hooks/`)는 불가침.
- 본체 코드 import 금지 (필요 로직은 복사·일반화).
- WS 인증 타임아웃 env 이름: `MAESTRO_WORKFLOW_WS_AUTH_TIMEOUT_MS` (기본 5000).
- localStorage 키: `maestro-workflow-server-token`.
- close 코드 4401 = 인증 실패/타임아웃. 4401이면 클라이언트는 재연결하지 않는다.
- 재연결 백오프: 1s → 2s → 4s … 최대 15s. `WORKFLOW_AUTH_OK` 수신 시 카운터 리셋.
- 커밋 메시지는 한국어 본문 + `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

---

### Task 1: 서버 WS 인증 핸드셰이크 + 인가 소켓 한정 브로드캐스트

**Files:**
- Modify: `workflow/tests/helpers.mjs` (startServer에 extraEnv)
- Create: `workflow/tests/ws-auth.test.mjs`
- Modify: `workflow/server/config.js` (WS_AUTH_TIMEOUT_MS)
- Modify: `workflow/server.js` (connection 핸들러 + broadcast 필터)

**Interfaces:**
- Consumes: 기존 `startServer({ serverToken })`, `authHeaders(token)`.
- Produces: WS 프로토콜 — 클라 첫 메시지 `{type:'WORKFLOW_AUTH', token}`, 서버 응답 `{type:'WORKFLOW_AUTH_OK'}`, 실패 시 close 4401. Task 4의 App이 이 프로토콜을 사용.

- [ ] **Step 1: helpers.mjs에 extraEnv 추가**

`startServer` 시그니처를 `{ serverToken = '', tempDir = null, extraEnv = {} }`로 바꾸고 spawn env 마지막에 `...extraEnv` 병합.

- [ ] **Step 2: 실패하는 테스트 작성 (`workflow/tests/ws-auth.test.mjs`)**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { startServer, cleanupDataDir, authHeaders } from './helpers.mjs';

function openSocket(port) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    ws.on('open', () => resolve(ws));
    ws.on('error', reject);
  });
}

// type이 일치하는 메시지가 올 때까지 수집 (REQUEST_CREATED 뒤 HISTORY_APPEND 등 순서 완충)
function waitForType(ws, type, timeoutMs = 2000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`no ${type} within ${timeoutMs}ms`)), timeoutMs);
    const onMessage = (raw) => {
      const data = JSON.parse(raw.toString());
      if (data.type === type) {
        clearTimeout(timer);
        ws.off('message', onMessage);
        resolve(data);
      }
    };
    ws.on('message', onMessage);
  });
}

function waitForClose(ws, timeoutMs = 2000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('close timeout')), timeoutMs);
    ws.on('close', (code) => { clearTimeout(timer); resolve(code); });
  });
}

async function registerActor(port, serverToken) {
  const res = await fetch(`http://127.0.0.1:${port}/api/actors/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(serverToken) },
    body: JSON.stringify({ actorId: 'agent_ws' }),
  });
  assert.equal(res.status, 200);
  return (await res.json()).actorToken;
}

async function createRequest(port, token = '') {
  const res = await fetch(`http://127.0.0.1:${port}/api/decision-requests`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
    body: JSON.stringify({ actorId: 'agent_ws', subjectType: 'spend', subject: { title: 'WS 인증 테스트' } }),
  });
  assert.equal(res.status, 200);
}

test('open 모드: 무인증 소켓도 브로드캐스트를 받고 WORKFLOW_AUTH에 AUTH_OK가 온다', async () => {
  const server = await startServer();
  const silent = await openSocket(server.port);
  const authed = await openSocket(server.port);
  try {
    authed.send(JSON.stringify({ type: 'WORKFLOW_AUTH', token: '' }));
    await waitForType(authed, 'WORKFLOW_AUTH_OK');
    const received = waitForType(silent, 'WORKFLOW_REQUEST_CREATED');
    await createRequest(server.port);
    assert.equal((await received).item.subject.title, 'WS 인증 테스트');
  } finally {
    silent.close();
    authed.close();
    await server.stop();
    cleanupDataDir(server.dataDir);
  }
});

test('엄격 모드: 올바른 토큰은 AUTH_OK 후 브로드캐스트를 받는다', async () => {
  const server = await startServer({ serverToken: 'wf-secret' });
  const ws = await openSocket(server.port);
  try {
    ws.send(JSON.stringify({ type: 'WORKFLOW_AUTH', token: 'wf-secret' }));
    await waitForType(ws, 'WORKFLOW_AUTH_OK');
    const actorToken = await registerActor(server.port, 'wf-secret');
    const received = waitForType(ws, 'WORKFLOW_REQUEST_CREATED');
    await createRequest(server.port, actorToken);
    assert.equal((await received).item.subject.title, 'WS 인증 테스트');
  } finally {
    ws.close();
    await server.stop();
    cleanupDataDir(server.dataDir);
  }
});

test('엄격 모드: 틀린 토큰은 4401로 닫힌다', async () => {
  const server = await startServer({ serverToken: 'wf-secret' });
  const ws = await openSocket(server.port);
  try {
    ws.send(JSON.stringify({ type: 'WORKFLOW_AUTH', token: 'wrong' }));
    assert.equal(await waitForClose(ws), 4401);
  } finally {
    await server.stop();
    cleanupDataDir(server.dataDir);
  }
});

test('엄격 모드: 미인가 소켓은 브로드캐스트를 못 받고 타임아웃 시 4401로 닫힌다', async () => {
  const server = await startServer({
    serverToken: 'wf-secret',
    extraEnv: { MAESTRO_WORKFLOW_WS_AUTH_TIMEOUT_MS: '300' },
  });
  const ws = await openSocket(server.port);
  const leaked = [];
  ws.on('message', (raw) => leaked.push(JSON.parse(raw.toString())));
  try {
    const actorToken = await registerActor(server.port, 'wf-secret');
    await createRequest(server.port, actorToken);
    assert.equal(await waitForClose(ws), 4401);
    assert.deepEqual(leaked, []);
  } finally {
    await server.stop();
    cleanupDataDir(server.dataDir);
  }
});
```

- [ ] **Step 3: 실패 확인**

Run: `cd workflow && node --test tests/ws-auth.test.mjs`
Expected: FAIL — open 모드 AUTH_OK 미응답, 엄격 모드 무인증 수신/미종료.

- [ ] **Step 4: config.js에 타임아웃 추가**

```js
export const WS_AUTH_TIMEOUT_MS = Number(process.env.MAESTRO_WORKFLOW_WS_AUTH_TIMEOUT_MS || 5000);
```

- [ ] **Step 5: server.js 구현**

import에 `SERVER_TOKEN, WS_AUTH_TIMEOUT_MS` 추가 후 WS 구간 교체:

```js
const wss = new WebSocketServer({ server });

// WS 첫 메시지 인증 (스펙 §2): 엄격 모드에서 미인가 소켓은 브로드캐스트 대상이 아니다.
wss.on('connection', (socket) => {
  socket.isAuthorized = !SERVER_TOKEN;
  const authTimer = SERVER_TOKEN
    ? setTimeout(() => {
        if (!socket.isAuthorized) socket.close(4401, 'AUTH_TIMEOUT');
      }, WS_AUTH_TIMEOUT_MS)
    : null;
  socket.on('message', (raw) => {
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      return; // 비JSON은 무시 — 미인가라면 타임아웃이 정리한다
    }
    if (!data || data.type !== 'WORKFLOW_AUTH') return;
    if (!SERVER_TOKEN || data.token === SERVER_TOKEN) {
      socket.isAuthorized = true;
      if (authTimer) clearTimeout(authTimer);
      socket.send(JSON.stringify({ type: 'WORKFLOW_AUTH_OK' }));
    } else {
      socket.close(4401, 'UNAUTHORIZED');
    }
  });
  socket.on('close', () => {
    if (authTimer) clearTimeout(authTimer);
  });
});

function broadcast(data) {
  const message = JSON.stringify(data);
  wss.clients.forEach((client) => {
    if (client.readyState === WSWebSocket.OPEN && client.isAuthorized) {
      client.send(message);
    }
  });
}
```

- [ ] **Step 6: 통과 확인**

Run: `cd workflow && node --test tests/ws-auth.test.mjs` → PASS 4건.
Run: `cd workflow && npm run test:server` → 기존 서버 테스트 무회귀.

- [ ] **Step 7: 커밋** — `feat(workflow): WS 첫 메시지 인증 핸드셰이크 + 인가 소켓 한정 브로드캐스트`

---

### Task 2: api.js 서버 토큰 상태 + 401 식별

**Files:**
- Create: `workflow/src/lib/api.token.test.js`
- Modify: `workflow/src/lib/api.js`

**Interfaces:**
- Produces: `loadServerToken(): string`, `setServerToken(token: string): void`, `getServerToken(): string`, `TOKEN_STORAGE_KEY`. 401 실패 Error에 `code === 'UNAUTHORIZED'`. Task 3~4가 사용.

- [ ] **Step 1: 실패하는 테스트 작성 (`workflow/src/lib/api.token.test.js`)**

```js
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  TOKEN_STORAGE_KEY,
  fetchPendingRequests,
  getServerToken,
  loadServerToken,
  setServerToken,
} from './api.js';

describe('서버 토큰 상태', () => {
  beforeEach(() => {
    window.localStorage.clear();
    setServerToken('');
  });

  it('setServerToken은 localStorage에 저장하고 loadServerToken이 복원한다', () => {
    setServerToken('wf-secret');
    expect(window.localStorage.getItem(TOKEN_STORAGE_KEY)).toBe('wf-secret');
    setServerToken('');
    expect(window.localStorage.getItem(TOKEN_STORAGE_KEY)).toBeNull();
    window.localStorage.setItem(TOKEN_STORAGE_KEY, 'restored');
    expect(loadServerToken()).toBe('restored');
    expect(getServerToken()).toBe('restored');
  });

  it('토큰이 있으면 Authorization 헤더를 붙인다', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ items: [] }) });
    vi.stubGlobal('fetch', fetchMock);
    setServerToken('wf-secret');
    await fetchPendingRequests();
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer wf-secret');
  });

  it('401 실패는 code UNAUTHORIZED로 식별된다', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: 'Unauthorized' }),
    }));
    await expect(fetchPendingRequests()).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });
});
```

- [ ] **Step 2: 실패 확인** — `cd workflow && npx vitest run src/lib/api.token.test.js` → FAIL (export 없음).

- [ ] **Step 3: api.js 구현**

```js
export const TOKEN_STORAGE_KEY = 'maestro-workflow-server-token';
let serverToken = '';

// localStorage 불가 환경(사파리 프라이빗 등)은 메모리 토큰만 사용한다.
export function loadServerToken() {
  try {
    serverToken = window.localStorage.getItem(TOKEN_STORAGE_KEY) || '';
  } catch {
    serverToken = '';
  }
  return serverToken;
}

export function setServerToken(token) {
  serverToken = (token || '').trim();
  try {
    if (serverToken) window.localStorage.setItem(TOKEN_STORAGE_KEY, serverToken);
    else window.localStorage.removeItem(TOKEN_STORAGE_KEY);
  } catch {
    // 저장 실패 무시
  }
}

export function getServerToken() {
  return serverToken;
}

async function requestJson(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (serverToken) headers.Authorization = `Bearer ${serverToken}`;
  const res = await fetch(`${SERVER_URL}${path}`, { ...options, headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const error = new Error(body.error || `HTTP ${res.status}`);
    if (res.status === 401) error.code = 'UNAUTHORIZED';
    throw error;
  }
  return res.json();
}
```

- [ ] **Step 4: 통과 확인** — `cd workflow && npx vitest run src/lib/api.token.test.js` → PASS.
- [ ] **Step 5: 커밋** — `feat(workflow): api.js 서버 토큰 상태와 401 UNAUTHORIZED 식별`

---

### Task 3: TokenGate 컴포넌트

**Files:**
- Create: `workflow/src/components/TokenGate.test.jsx`
- Create: `workflow/src/components/TokenGate.jsx`

**Interfaces:**
- Produces: `<TokenGate onSubmit={(token: string) => void} />`. Task 4가 사용.

- [ ] **Step 1: 실패하는 테스트 작성**

```jsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TokenGate from './TokenGate.jsx';

describe('TokenGate', () => {
  it('입력한 토큰(trim)으로 onSubmit을 호출한다', async () => {
    const onSubmit = vi.fn();
    render(<TokenGate onSubmit={onSubmit} />);
    await userEvent.type(screen.getByLabelText('서버 토큰'), '  wf-secret  ');
    await userEvent.click(screen.getByRole('button', { name: '연결' }));
    expect(onSubmit).toHaveBeenCalledWith('wf-secret');
  });

  it('빈 값이면 연결 버튼이 비활성화된다', () => {
    render(<TokenGate onSubmit={vi.fn()} />);
    expect(screen.getByRole('button', { name: '연결' })).toBeDisabled();
  });
});
```

- [ ] **Step 2: 실패 확인** — `npx vitest run src/components/TokenGate.test.jsx` → FAIL.
- [ ] **Step 3: 구현 (`workflow/src/components/TokenGate.jsx`)**

```jsx
import { useState } from 'react';

// 엄격 모드 토큰 게이트: 운영자 서버 토큰을 받아 저장·재연결을 트리거한다 (스펙 §1).
export default function TokenGate({ onSubmit }) {
  const [token, setToken] = useState('');
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6">
      <form
        className="w-full max-w-sm rounded-2xl bg-slate-900 p-6"
        onSubmit={(event) => {
          event.preventDefault();
          if (token.trim()) onSubmit(token.trim());
        }}
      >
        <h2 className="text-lg font-semibold">서버 토큰 필요</h2>
        <p className="mt-1 text-sm text-slate-400">
          엄격 모드 서버입니다. MAESTRO_WORKFLOW_SERVER_TOKEN 값을 입력하세요.
        </p>
        <input
          type="password"
          value={token}
          onChange={(event) => setToken(event.target.value)}
          placeholder="서버 토큰"
          aria-label="서버 토큰"
          className="mt-4 w-full rounded-lg bg-slate-800 px-3 py-3 text-sm"
        />
        <button
          type="submit"
          disabled={!token.trim()}
          className="mt-4 min-h-[44px] w-full rounded-xl bg-indigo-600 font-semibold transition active:scale-95 disabled:opacity-40"
        >
          연결
        </button>
      </form>
    </div>
  );
}
```

- [ ] **Step 4: 통과 확인** — PASS.
- [ ] **Step 5: 커밋** — `feat(workflow): TokenGate 토큰 입력 오버레이`

---

### Task 4: App 통합 — WS 인증·자동 재연결·토큰 게이트

**Files:**
- Create: `workflow/src/App.auth.test.jsx`
- Create: `workflow/src/App.reconnect.test.jsx`
- Modify: `workflow/src/App.jsx`

**Interfaces:**
- Consumes: Task 1 WS 프로토콜, Task 2 토큰 API, Task 3 TokenGate.

- [ ] **Step 1: 실패하는 테스트 작성 (`workflow/src/App.auth.test.jsx`)**

```jsx
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const fetchPendingRequests = vi.fn();
const setServerToken = vi.fn();
vi.mock('./lib/api.js', () => ({
  WS_URL: 'ws://test',
  fetchPendingRequests: (...args) => fetchPendingRequests(...args),
  fetchHistory: vi.fn().mockResolvedValue([]),
  decideRequest: vi.fn(),
  loadServerToken: vi.fn().mockReturnValue(''),
  getServerToken: vi.fn().mockReturnValue(''),
  setServerToken: (...args) => setServerToken(...args),
}));

import App from './App.jsx';

class FakeWebSocket {
  constructor() {
    FakeWebSocket.instance = this;
  }
  send() {}
  close() {}
}

describe('App 토큰 게이트', () => {
  beforeEach(() => {
    vi.stubGlobal('WebSocket', FakeWebSocket);
    fetchPendingRequests.mockReset();
    setServerToken.mockReset();
  });

  it('UNAUTHORIZED 조회 실패 시 게이트를 띄우고 제출하면 토큰 저장 후 재조회한다', async () => {
    fetchPendingRequests.mockRejectedValue(Object.assign(new Error('Unauthorized'), { code: 'UNAUTHORIZED' }));
    render(<App />);
    await screen.findByText('서버 토큰 필요');

    fetchPendingRequests.mockResolvedValue([]);
    await userEvent.type(screen.getByLabelText('서버 토큰'), 'wf-secret');
    await userEvent.click(screen.getByRole('button', { name: '연결' }));
    expect(setServerToken).toHaveBeenCalledWith('wf-secret');
    expect(screen.queryByText('서버 토큰 필요')).not.toBeInTheDocument();
    expect(fetchPendingRequests.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('WS가 4401로 닫히면 게이트를 띄운다', async () => {
    fetchPendingRequests.mockResolvedValue([]);
    render(<App />);
    await screen.findByText('🎼 Maestro Workflow');
    FakeWebSocket.instance.onclose({ code: 4401 });
    await screen.findByText('서버 토큰 필요');
  });
});
```

- [ ] **Step 2: 실패하는 테스트 작성 (`workflow/src/App.reconnect.test.jsx`)**

```jsx
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';

vi.mock('./lib/api.js', () => ({
  WS_URL: 'ws://test',
  fetchPendingRequests: vi.fn().mockResolvedValue([]),
  fetchHistory: vi.fn().mockResolvedValue([]),
  decideRequest: vi.fn(),
  loadServerToken: vi.fn().mockReturnValue(''),
  getServerToken: vi.fn().mockReturnValue(''),
  setServerToken: vi.fn(),
}));

import App from './App.jsx';

class FakeWebSocket {
  static instances = [];
  constructor() {
    FakeWebSocket.instances.push(this);
    this.sent = [];
  }
  send(data) {
    this.sent.push(data);
  }
  close() {}
}

describe('App WS 재연결', () => {
  beforeEach(() => {
    FakeWebSocket.instances = [];
    vi.stubGlobal('WebSocket', FakeWebSocket);
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('AUTH_OK를 받아야 연결 표시가 되고, 이상 종료 후 백오프 재연결한다', async () => {
    render(<App />);
    const first = FakeWebSocket.instances[0];
    await act(async () => {
      first.onopen();
    });
    expect(JSON.parse(first.sent[0]).type).toBe('WORKFLOW_AUTH');
    expect(screen.getByText('연결 대기')).toBeInTheDocument();
    await act(async () => {
      first.onmessage({ data: JSON.stringify({ type: 'WORKFLOW_AUTH_OK' }) });
    });
    expect(screen.getByText('실시간 연결됨')).toBeInTheDocument();

    await act(async () => {
      first.onclose({ code: 1006 });
    });
    expect(screen.getByText('연결 대기')).toBeInTheDocument();
    expect(FakeWebSocket.instances).toHaveLength(1);
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    expect(FakeWebSocket.instances).toHaveLength(2);
  });

  it('4401 종료는 재연결을 예약하지 않는다', async () => {
    render(<App />);
    const first = FakeWebSocket.instances[0];
    await act(async () => {
      first.onclose({ code: 4401 });
    });
    await act(async () => {
      vi.advanceTimersByTime(60000);
    });
    expect(FakeWebSocket.instances).toHaveLength(1);
  });
});
```

- [ ] **Step 3: 실패 확인** — `npx vitest run src/App.auth.test.jsx src/App.reconnect.test.jsx` → FAIL.

- [ ] **Step 4: App.jsx 구현**

```jsx
import { useCallback, useEffect, useState } from 'react';
import ChannelBoard from './components/ChannelBoard.jsx';
import DecisionSheet from './components/DecisionSheet.jsx';
import HistoryPanel from './components/HistoryPanel.jsx';
import TokenGate from './components/TokenGate.jsx';
import {
  WS_URL,
  decideRequest,
  fetchHistory,
  fetchPendingRequests,
  getServerToken,
  loadServerToken,
  setServerToken,
} from './lib/api.js';

const MAX_RECONNECT_DELAY_MS = 15000;

// Maestro Workflow 대시보드 셸: 채널 보드 + WS 실시간 갱신 + 엄격 모드 토큰 게이트.
export default function App() {
  const [requests, setRequests] = useState([]);
  const [selected, setSelected] = useState(null);
  const [connected, setConnected] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState([]);
  const [authRequired, setAuthRequired] = useState(false);
  const [wsEpoch, setWsEpoch] = useState(0);
  useState(() => loadServerToken());

  const reload = useCallback(() => {
    fetchPendingRequests()
      .then(setRequests)
      .catch((error) => {
        if (error && error.code === 'UNAUTHORIZED') setAuthRequired(true);
      });
    fetchHistory().then(setHistory).catch(() => {});
  }, []);

  useEffect(() => {
    reload();
    let disposed = false;
    let ws = null;
    let reconnectTimer = null;
    let attempt = 0;

    const connect = () => {
      ws = new WebSocket(WS_URL);
      ws.onopen = () => {
        ws.send(JSON.stringify({ type: 'WORKFLOW_AUTH', token: getServerToken() }));
      };
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'WORKFLOW_AUTH_OK') {
            attempt = 0;
            setConnected(true);
            reload(); // 끊김 동안의 변경분 재동기화
            return;
          }
          if (
            data.type === 'WORKFLOW_REQUEST_CREATED'
            || data.type === 'WORKFLOW_DECIDED'
            || data.type === 'WORKFLOW_HISTORY_APPEND'
          ) {
            reload();
          }
        } catch {
          // 무시
        }
      };
      ws.onclose = (event) => {
        setConnected(false);
        if (disposed) return;
        if (event && event.code === 4401) {
          setAuthRequired(true);
          return;
        }
        const delay = Math.min(1000 * 2 ** attempt, MAX_RECONNECT_DELAY_MS);
        attempt += 1;
        reconnectTimer = setTimeout(connect, delay);
      };
    };

    connect();
    return () => {
      disposed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (ws) ws.close();
    };
  }, [reload, wsEpoch]);

  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
        <h1 className="text-lg font-semibold">🎼 Maestro Workflow</h1>
        <button
          type="button"
          onClick={() => setShowHistory((value) => !value)}
          className="min-h-[44px] rounded-lg bg-slate-800 px-4 text-sm transition active:scale-95"
        >
          {showHistory ? '보드' : '이력'}
        </button>
        <span className={`text-xs ${connected ? 'text-emerald-400' : 'text-slate-500'}`}>
          {connected ? '실시간 연결됨' : '연결 대기'}
        </span>
      </header>
      {showHistory ? (
        <HistoryPanel entries={history} />
      ) : (
        <ChannelBoard requests={requests} onSelect={setSelected} />
      )}
      {selected ? (
        <DecisionSheet
          request={selected}
          onClose={() => setSelected(null)}
          onDecide={(decision, comment) => {
            decideRequest(selected.requestId, { decision, comment })
              .catch(() => {})
              .finally(() => {
                setSelected(null);
                reload();
              });
          }}
        />
      ) : null}
      {authRequired ? (
        <TokenGate
          onSubmit={(token) => {
            setServerToken(token);
            setAuthRequired(false);
            setWsEpoch((value) => value + 1); // effect 재실행 → 재조회 + WS 재접속
          }}
        />
      ) : null}
    </div>
  );
}
```

- [ ] **Step 5: 통과 확인** — `cd workflow && npx vitest run` → 신규 포함 전체 PASS (기존 App.reload.test.jsx는 mock에 `loadServerToken`/`getServerToken`/`setServerToken`와 FakeWebSocket `send`가 없으면 보강).
- [ ] **Step 6: 커밋** — `feat(workflow): 대시보드 토큰 게이트 + WS 인증·자동 재연결`

---

### Task 5: 문서 갱신 + 최종 게이트

**Files:**
- Modify: `workflow/README.md` (알려진 한계 개정)
- Modify: `workflow/.env.example` (WS 타임아웃)
- Modify: `docs/maestro-workflow/README.md` (범위 요약 갱신)

- [ ] **Step 1: README "알려진 한계 (MVP)" 교체**

해소된 3종을 제거하고 남은 전제로 교체:

```markdown
## 엄격 모드 (서버 토큰)

`MAESTRO_WORKFLOW_SERVER_TOKEN`을 설정하면 운영자 API와 WebSocket 모두 토큰을 요구한다.
대시보드는 401/WS 4401을 만나면 토큰 입력 게이트를 띄우고, 입력값을
localStorage(`maestro-workflow-server-token`)에 저장한 뒤 재연결한다.
WebSocket은 접속 직후 `{"type":"WORKFLOW_AUTH","token":"…"}` 첫 메시지로 인증하며
(`WORKFLOW_AUTH_OK` 응답), 미인가 소켓은 브로드캐스트를 받지 못하고
`MAESTRO_WORKFLOW_WS_AUTH_TIMEOUT_MS`(기본 5000ms) 후 4401로 닫힌다.
끊긴 WS는 1s→2s→4s…(최대 15s) 백오프로 자동 재연결한다 (4401 제외).

## 알려진 한계 (MVP)

- 토큰은 localStorage에 평문 저장된다 — 로컬 신뢰 기기 전제. TLS 없음, 기본
  `HOST=127.0.0.1` 로컬 전용 전제를 유지하라.
- WS 구독은 운영자(서버 토큰) 전용이다. actor 토큰의 WS 구독, 다중 운영자/권한
  분리는 후속 스펙으로 예약한다.
```

- [ ] **Step 2: .env.example에 추가**

```bash
# WS 첫 메시지 인증 대기 시간 (ms, 엄격 모드 전용)
# MAESTRO_WORKFLOW_WS_AUTH_TIMEOUT_MS=5000
```

- [ ] **Step 3: docs/maestro-workflow/README.md 범위 요약에 한 줄 추가**

`- 엄격 모드 대시보드: 토큰 게이트 + WS 첫 메시지 인증 + 자동 재연결 (2026-08-03 스펙)`

- [ ] **Step 4: 최종 게이트** — `cd workflow && npm test` 전체 PASS + 본체 무회귀(`npm test` 루트, 본체 파일 무변경 확인 `git status`).
- [ ] **Step 5: 커밋 + PR** — `docs(workflow): 엄격 모드 문서화 및 알려진 한계 개정`, PR 생성 후 CI 확인.
