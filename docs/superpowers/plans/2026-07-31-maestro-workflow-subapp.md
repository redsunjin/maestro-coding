# Maestro Workflow Subapp Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `workflow/` 서브앱(Maestro Workflow)을 신설한다 — 범용 승인·결정·이력 서비스: actor 토큰 인증, subjectType 자유 문자열의 DecisionRequest, record-only Decision(pull+ack), append-only 이력, 레인(결정 채널) 대시보드.

**Architecture:** 본체 `maestro-server.js`의 검증된 패턴(sha256 토큰 해시, 원자적 JSON 파일 영속화, raw `node:http` 라우팅, `ws` 브로드캐스트)을 `workflow/` 안에 복사·일반화한다. 서버는 책임별 모듈(`server/config.js`, `persist.js`, `actors.js`, `auth.js`, `decisions.js`, `history.js`)로 나누고 `server.js`가 라우팅만 담당한다. 대시보드는 React+Vite+Tailwind, 컴포넌트 단위 vitest 테스트.

**Tech Stack:** Node 20 ESM, `node:http`, `ws`, `node --test`(서버), React 19, Vite 6, Tailwind 4(`@tailwindcss/vite`), vitest+jsdom+testing-library(UI).

**Spec:** [`docs/superpowers/specs/2026-07-31-maestro-workflow-subapp-design.md`](../specs/2026-07-31-maestro-workflow-subapp-design.md)

## Global Constraints

- **경계**: 생성/수정은 `workflow/`와 `docs/maestro-workflow/` 아래에서만. 예외는 Task 9의 세 파일뿐: `.github/workflows/qa-gate.yml`(잡 추가), 루트 `README.md`(Harmony 섹션 추가), 루트 `.gitignore`(1줄 추가). 본체 `src/`, `tests/`, `maestro-server.js`, `hooks/`는 절대 수정 금지.
- **본체 코드 import 금지**: 필요한 로직은 `workflow/` 안으로 복사한다.
- 서버 포트 기본 `8090`(`MAESTRO_WORKFLOW_PORT`), 호스트 기본 `127.0.0.1`. Vite dev 포트 `5273`.
- `executorAction`은 항상 `'none'`(record-only). git/외부 실행 코드를 절대 넣지 않는다.
- decision 어휘: `approve | reject | revise | ask | cancel` (본체와 동일).
- 인증: 서버 토큰 미설정 시 전부 허용(open, 로컬 dev). 설정 시 **엄격 per-actor** — 본체의 server-grace 경로를 만들지 않는다.
- 토큰은 발급 시 1회만 평문 반환, 저장은 sha256 `tokenHash`만. API 응답에 `tokenHash` 노출 금지.
- 모든 스토어 파일 경로는 env로 재정의 가능해야 한다(테스트 격리용): `MAESTRO_WORKFLOW_ACTOR_STORE_PATH`, `MAESTRO_WORKFLOW_DECISION_STORE_PATH`, `MAESTRO_WORKFLOW_HISTORY_STORE_PATH`.
- UI 카피는 본체처럼 한국어. 리듬게임 요소(판정등급·콤보·타격음·햅틱·BGM) 금지.
- 커밋은 태스크마다. 커밋 메시지 끝에 `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- 전체 게이트: `npm test --prefix workflow` (서버+UI). 본체 `npm run qa`는 건드린 적 없음을 확인하는 용도로 마지막에 1회.

---

### Task 1: 서브앱 스캐폴드 + `/health`

**Files:**
- Create: `workflow/package.json`
- Create: `workflow/.env.example`
- Create: `workflow/README.md`
- Create: `workflow/server/config.js`
- Create: `workflow/server.js`
- Test: `workflow/tests/helpers.mjs`, `workflow/tests/health.test.mjs`

**Interfaces:**
- Consumes: 없음 (첫 태스크)
- Produces:
  - `config.js` exports: `ROOT_DIR`, `PORT:number`, `HOST:string`, `SERVER_TOKEN:string`, `ACTOR_STORE_PATH:string`, `DECISION_STORE_PATH:string`, `HISTORY_STORE_PATH:string`, `ALLOWED_ORIGINS:string[]`
  - `tests/helpers.mjs` exports: `WORKFLOW_DIR`, `randomPort()`, `waitForHealth(port, timeoutMs?)`, `startServer({serverToken?, tempDir?}) → Promise<{port, dataDir, proc, stop():Promise<void>}>`, `cleanupDataDir(dataDir)`, `authHeaders(token) → object`
  - `server.js`: `GET /health` → `200 {status:'ok', app:'maestro-workflow', pendingRequests:number}`

- [ ] **Step 1: 디렉토리와 package.json 생성**

`workflow/package.json` (버전 핀은 player/루트 선례 그대로):

```json
{
  "name": "@maestro/workflow",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "description": "Maestro Workflow — universal approval/decision/record service (Maestro Harmony)",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "server": "node server.js",
    "test": "npm run test:server && npm run test:ui",
    "test:server": "node --test tests/*.test.mjs",
    "test:ui": "vitest run --passWithNoTests"
  },
  "dependencies": {
    "react": "^19.1.0",
    "react-dom": "^19.1.0",
    "ws": "^8.19.0"
  },
  "devDependencies": {
    "@tailwindcss/vite": "^4.1.6",
    "@testing-library/jest-dom": "^6.9.1",
    "@testing-library/react": "^16.3.2",
    "@testing-library/user-event": "^14.6.1",
    "@vitejs/plugin-react": "^4.4.1",
    "jsdom": "^28.1.0",
    "tailwindcss": "^4.1.6",
    "vite": "^6.3.5",
    "vitest": "^4.0.18"
  }
}
```

`workflow/.env.example`:

```bash
# Maestro Workflow 서버 설정 (본체 8080과 분리된 개별 서비스)
MAESTRO_WORKFLOW_PORT=8090
MAESTRO_WORKFLOW_HOST=127.0.0.1
# 설정 시 엄격 per-actor 인증 활성화 (grace 경로 없음)
MAESTRO_WORKFLOW_SERVER_TOKEN=
MAESTRO_WORKFLOW_ALLOWED_ORIGINS=http://localhost:5273,http://127.0.0.1:5273
# 스토어 파일 경로 (기본: workflow/ 루트)
# MAESTRO_WORKFLOW_ACTOR_STORE_PATH=.maestro-workflow-actors.json
# MAESTRO_WORKFLOW_DECISION_STORE_PATH=.maestro-workflow-decisions.json
# MAESTRO_WORKFLOW_HISTORY_STORE_PATH=.maestro-workflow-history.json
```

`workflow/README.md`:

```markdown
# Maestro Workflow

Maestro Harmony 제품군의 범용 승인·결정·이력(system of record) 앱.
코드가 아닌 모든 결정(지출, 외부 발송, …)을 요청받아 사람이 승인/반려하고,
결정을 record-only로 기록·전달한다. **아무것도 실행하지 않는다** (`executorAction`은 항상 `none`).

- 스펙: [`docs/superpowers/specs/2026-07-31-maestro-workflow-subapp-design.md`](../docs/superpowers/specs/2026-07-31-maestro-workflow-subapp-design.md)
- 비전: [`docs/vision/2026-07-21-universal-approval-record-service.md`](../docs/vision/2026-07-21-universal-approval-record-service.md)

## 작업 경계 (player/ 선례 계승)

- 구현은 `workflow/` 아래에서만, 문서는 `docs/maestro-workflow/` 아래에서만.
- 본체 경로(`src/`, `tests/`, `maestro-server.js`, `hooks/`)는 수정하지 않는다.
- 본체 코드를 import하지 않는다 (필요 로직은 복사·일반화).
- 전용 브랜치 `feat/maestro-workflow-foundation`에서 작업한다.

## 실행

    npm install          # workflow/ 안에서
    npm run server       # 결정 서버 (기본 http://127.0.0.1:8090)
    npm run dev          # 대시보드 (기본 http://localhost:5273)
    npm test             # 서버 회귀 + UI 테스트
```

- [ ] **Step 2: config.js 작성**

`workflow/server/config.js`:

```js
// Maestro Workflow 서버 설정. 모든 값은 env로 재정의 가능 (테스트 격리 포함).
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT_DIR = path.resolve(__dirname, '..');

export const PORT = Number(process.env.MAESTRO_WORKFLOW_PORT || 8090);
export const HOST = process.env.MAESTRO_WORKFLOW_HOST || '127.0.0.1';
export const SERVER_TOKEN = process.env.MAESTRO_WORKFLOW_SERVER_TOKEN || '';

export const ACTOR_STORE_PATH = path.resolve(
  ROOT_DIR,
  process.env.MAESTRO_WORKFLOW_ACTOR_STORE_PATH || '.maestro-workflow-actors.json',
);
export const DECISION_STORE_PATH = path.resolve(
  ROOT_DIR,
  process.env.MAESTRO_WORKFLOW_DECISION_STORE_PATH || '.maestro-workflow-decisions.json',
);
export const HISTORY_STORE_PATH = path.resolve(
  ROOT_DIR,
  process.env.MAESTRO_WORKFLOW_HISTORY_STORE_PATH || '.maestro-workflow-history.json',
);

export const ALLOWED_ORIGINS = (
  process.env.MAESTRO_WORKFLOW_ALLOWED_ORIGINS
  || 'http://localhost:5273,http://127.0.0.1:5273'
)
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
```

- [ ] **Step 3: 실패하는 테스트 작성 (helpers + health)**

`workflow/tests/helpers.mjs`:

```js
import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const WORKFLOW_DIR = resolve(__dirname, '..');
const SERVER_ENTRY = resolve(WORKFLOW_DIR, 'server.js');

export function randomPort() {
  return 18000 + Math.floor(Math.random() * 2000);
}

export async function waitForHealth(port, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`);
      if (res.ok) return;
    } catch {
      // 준비될 때까지 무시
    }
    await delay(100);
  }
  throw new Error(`workflow server did not become healthy on port ${port}`);
}

// tempDir를 넘기면 같은 스토어로 재시작할 수 있다 (영속화 테스트용).
export async function startServer({ serverToken = '', tempDir = null } = {}) {
  const dataDir = tempDir || mkdtempSync(resolve(os.tmpdir(), 'maestro-workflow-test-'));
  const port = randomPort();
  const proc = spawn(process.execPath, [SERVER_ENTRY], {
    cwd: WORKFLOW_DIR,
    env: {
      ...process.env,
      MAESTRO_WORKFLOW_PORT: String(port),
      MAESTRO_WORKFLOW_HOST: '127.0.0.1',
      MAESTRO_WORKFLOW_SERVER_TOKEN: serverToken,
      MAESTRO_WORKFLOW_ACTOR_STORE_PATH: resolve(dataDir, 'actors.json'),
      MAESTRO_WORKFLOW_DECISION_STORE_PATH: resolve(dataDir, 'decisions.json'),
      MAESTRO_WORKFLOW_HISTORY_STORE_PATH: resolve(dataDir, 'history.json'),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  await waitForHealth(port);
  return {
    port,
    dataDir,
    proc,
    stop: async () => {
      proc.kill('SIGTERM');
      await delay(150);
    },
  };
}

export function cleanupDataDir(dataDir) {
  rmSync(dataDir, { recursive: true, force: true });
}

export function authHeaders(token) {
  return token ? { Authorization: `Bearer ${token}` } : {};
}
```

`workflow/tests/health.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, cleanupDataDir } from './helpers.mjs';

test('GET /health responds with app identity and pending count', async () => {
  const server = await startServer();
  try {
    const res = await fetch(`http://127.0.0.1:${server.port}/health`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, 'ok');
    assert.equal(body.app, 'maestro-workflow');
    assert.equal(body.pendingRequests, 0);
  } finally {
    await server.stop();
    cleanupDataDir(server.dataDir);
  }
});
```

- [ ] **Step 4: 의존성 설치 후 테스트가 실패하는지 확인**

Run: `cd workflow && npm install && npm run test:server`
Expected: FAIL — `server.js`가 없어 `waitForHealth` 타임아웃 (`workflow server did not become healthy`)

- [ ] **Step 5: 최소 server.js 구현**

`workflow/server.js`:

```js
// Maestro Workflow 결정 서버 (Maestro Harmony).
// 범용 DecisionRequest를 수신해 사람이 결정하고, record-only로 기록·전달한다.
// 실행: node server.js  (기본 http://127.0.0.1:8090)
import http from 'node:http';
import { PORT, HOST, ALLOWED_ORIGINS } from './server/config.js';

export function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function applyCors(req, res) {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  }
}

const server = http.createServer((req, res) => {
  applyCors(req, res);
  const { pathname } = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === 'GET' && pathname === '/health') {
    sendJson(res, 200, { status: 'ok', app: 'maestro-workflow', pendingRequests: 0 });
    return;
  }

  sendJson(res, 404, { error: 'NOT_FOUND' });
});

server.listen(PORT, HOST, () => {
  console.log(`🎼 Maestro Workflow server on http://${HOST}:${PORT}`);
});
```

- [ ] **Step 6: 테스트 통과 확인**

Run: `cd workflow && npm run test:server`
Expected: PASS (1 test)

- [ ] **Step 7: 커밋 (package-lock.json 포함 — CI의 `npm ci`에 필요)**

```bash
git add workflow/package.json workflow/package-lock.json workflow/.env.example workflow/README.md workflow/server/config.js workflow/server.js workflow/tests/helpers.mjs workflow/tests/health.test.mjs
git commit -m "feat(workflow): scaffold Maestro Workflow subapp with /health

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: 원자적 JSON 스토어 유틸

**Files:**
- Create: `workflow/server/persist.js`
- Test: `workflow/tests/persist.test.mjs`

**Interfaces:**
- Consumes: 없음
- Produces: `saveStore(storePath:string, payload:object) → boolean` (임시파일+rename 원자 쓰기, `{version:1, updatedAt, ...payload}` 래핑), `loadStore(storePath:string) → object|null` (없거나 손상 시 null)

- [ ] **Step 1: 실패하는 테스트 작성**

`workflow/tests/persist.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import os from 'node:os';
import { saveStore, loadStore } from '../server/persist.js';

function withTempDir(fn) {
  const dir = mkdtempSync(resolve(os.tmpdir(), 'maestro-workflow-persist-'));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('saveStore writes and loadStore reads round-trip', () => {
  withTempDir((dir) => {
    const storePath = resolve(dir, 'store.json');
    assert.equal(saveStore(storePath, { items: [{ id: 'a' }] }), true);
    const loaded = loadStore(storePath);
    assert.equal(loaded.version, 1);
    assert.deepEqual(loaded.items, [{ id: 'a' }]);
    // 임시 파일이 남지 않아야 한다
    assert.deepEqual(readdirSync(dir), ['store.json']);
  });
});

test('loadStore returns null for missing or corrupt files', () => {
  withTempDir((dir) => {
    assert.equal(loadStore(resolve(dir, 'missing.json')), null);
    const corruptPath = resolve(dir, 'corrupt.json');
    writeFileSync(corruptPath, '{not json', 'utf8');
    assert.equal(loadStore(corruptPath), null);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd workflow && npm run test:server`
Expected: FAIL — `Cannot find module '../server/persist.js'`

- [ ] **Step 3: 구현 (본체 `persistHistoryStore` 패턴 이식)**

`workflow/server/persist.js`:

```js
// 원자적 JSON 파일 스토어 (본체 persistHistoryStore 패턴 이식: temp 쓰기 후 rename).
import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';

export function saveStore(storePath, payload) {
  const tempPath = `${storePath}.${process.pid}.${Date.now()}.tmp`;
  try {
    writeFileSync(
      tempPath,
      `${JSON.stringify({ version: 1, updatedAt: new Date().toISOString(), ...payload }, null, 2)}\n`,
      'utf8',
    );
    renameSync(tempPath, storePath);
    return true;
  } catch (error) {
    try {
      rmSync(tempPath, { force: true });
    } catch {}
    console.error(`store save failed (${storePath}): ${error.message}`);
    return false;
  }
}

export function loadStore(storePath) {
  if (!existsSync(storePath)) return null;
  try {
    return JSON.parse(readFileSync(storePath, 'utf8'));
  } catch (error) {
    console.error(`store load failed (${storePath}): ${error.message}`);
    return null;
  }
}
```

- [ ] **Step 4: 통과 확인**

Run: `cd workflow && npm run test:server`
Expected: PASS (health 1 + persist 2)

- [ ] **Step 5: 커밋**

```bash
git add workflow/server/persist.js workflow/tests/persist.test.mjs
git commit -m "feat(workflow): atomic JSON store utility

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Actor 레지스트리 + per-actor 인증

**Files:**
- Create: `workflow/server/actors.js`
- Create: `workflow/server/auth.js`
- Modify: `workflow/server.js` (라우트 추가)
- Test: `workflow/tests/actors.test.mjs`

**Interfaces:**
- Consumes: `persist.js`의 `saveStore/loadStore`, `config.js`의 `SERVER_TOKEN`/`ACTOR_STORE_PATH`
- Produces:
  - `actors.js`: `initActorStore(path)`, `registerActor({actorId, displayName?, actorType?, metadata?}) → {actor, actorToken:string}` (재등록=토큰 회전), `findActorByToken(token) → actor|null`, `heartbeatActor(actorId) → actor|null`, `revokeActor(actorId) → actor|null` (tokenHash=null), `getActor(actorId)`, `listActors() → publicActor[]`, `toPublicActor(actor)` (tokenHash 제거), `sanitizeText(value, maxLength) → string`
  - `auth.js`: `extractBearerToken(headerValue) → string|null`, `isServerAuthorized(req) → boolean`, `resolveActorAuth(req) → {ok:true, mode:'open'|'actor', actorId:string|null} | {ok:false, status:number, error:string}`, `authorizeActor(req, res, expectedActorId?) → auth|null` (실패 시 응답까지 쓰고 null 반환; actor 불일치는 `403 ACTOR_MISMATCH`)
  - 라우트: `POST /api/actors/register`(서버 토큰) → `200 {success, item, actorToken}`; `GET /api/actors`(서버 토큰) → `{items}`; `POST /api/actors/:id/heartbeat`(actor 토큰, id 일치); `POST /api/actors/:id/revoke`(서버 토큰)
  - `server.js`에 `readJsonBody(req) → Promise<object>` 헬퍼 (파싱 실패 시 reject)

- [ ] **Step 1: 실패하는 테스트 작성**

`workflow/tests/actors.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, cleanupDataDir, authHeaders } from './helpers.mjs';

const SERVER_TOKEN = 'wf-server-secret';

async function registerActor(server, actorId, token = SERVER_TOKEN) {
  const res = await fetch(`http://127.0.0.1:${server.port}/api/actors/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
    body: JSON.stringify({ actorId, displayName: `Actor ${actorId}`, actorType: 'agent' }),
  });
  return { res, body: res.status === 200 ? await res.json() : await res.json().catch(() => ({})) };
}

test('register issues one-time token and stores only hash', async () => {
  const server = await startServer({ serverToken: SERVER_TOKEN });
  try {
    const { res, body } = await registerActor(server, 'agent_a');
    assert.equal(res.status, 200);
    assert.equal(body.success, true);
    assert.match(body.actorToken, /^[0-9a-f]{48}$/);
    assert.equal(body.item.actorId, 'agent_a');
    assert.equal(body.item.tokenHash, undefined);

    const listRes = await fetch(`http://127.0.0.1:${server.port}/api/actors`, {
      headers: authHeaders(SERVER_TOKEN),
    });
    const list = await listRes.json();
    assert.equal(list.items.length, 1);
    assert.equal(list.items[0].tokenHash, undefined);
  } finally {
    await server.stop();
    cleanupDataDir(server.dataDir);
  }
});

test('register requires server token; heartbeat requires matching actor token', async () => {
  const server = await startServer({ serverToken: SERVER_TOKEN });
  try {
    const denied = await fetch(`http://127.0.0.1:${server.port}/api/actors/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actorId: 'agent_x' }),
    });
    assert.equal(denied.status, 401);

    const { body: a } = await registerActor(server, 'agent_a');
    const { body: b } = await registerActor(server, 'agent_b');

    const ok = await fetch(`http://127.0.0.1:${server.port}/api/actors/agent_a/heartbeat`, {
      method: 'POST',
      headers: authHeaders(a.actorToken),
    });
    assert.equal(ok.status, 200);

    // 남의 토큰으로 heartbeat → 403 (id 불일치)
    const mismatch = await fetch(`http://127.0.0.1:${server.port}/api/actors/agent_a/heartbeat`, {
      method: 'POST',
      headers: authHeaders(b.actorToken),
    });
    assert.equal(mismatch.status, 403);

    // 서버 토큰은 actor 엔드포인트에서 grace 통과되지 않는다 (엄격 모드 전용)
    const graceDenied = await fetch(`http://127.0.0.1:${server.port}/api/actors/agent_a/heartbeat`, {
      method: 'POST',
      headers: authHeaders(SERVER_TOKEN),
    });
    assert.equal(graceDenied.status, 401);
  } finally {
    await server.stop();
    cleanupDataDir(server.dataDir);
  }
});

test('revoke invalidates token; re-register rotates it; store survives restart', async () => {
  const first = await startServer({ serverToken: SERVER_TOKEN });
  const dataDir = first.dataDir;
  try {
    const { body: a } = await registerActor(first, 'agent_a');

    const revoke = await fetch(`http://127.0.0.1:${first.port}/api/actors/agent_a/revoke`, {
      method: 'POST',
      headers: authHeaders(SERVER_TOKEN),
    });
    assert.equal(revoke.status, 200);

    const afterRevoke = await fetch(`http://127.0.0.1:${first.port}/api/actors/agent_a/heartbeat`, {
      method: 'POST',
      headers: authHeaders(a.actorToken),
    });
    assert.equal(afterRevoke.status, 401);

    // 재등록 = 토큰 회전
    const { body: rotated } = await registerActor(first, 'agent_a');
    assert.notEqual(rotated.actorToken, a.actorToken);

    await first.stop();

    // 같은 dataDir로 재시작 → 회전된 토큰이 계속 유효
    const second = await startServer({ serverToken: SERVER_TOKEN, tempDir: dataDir });
    try {
      const alive = await fetch(`http://127.0.0.1:${second.port}/api/actors/agent_a/heartbeat`, {
        method: 'POST',
        headers: authHeaders(rotated.actorToken),
      });
      assert.equal(alive.status, 200);
    } finally {
      await second.stop();
    }
  } finally {
    cleanupDataDir(dataDir);
  }
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd workflow && npm run test:server`
Expected: FAIL — register가 404 (`NOT_FOUND`) 응답

- [ ] **Step 3: actors.js 구현 (본체 agent registry 패턴 이식)**

`workflow/server/actors.js`:

```js
// Actor 레지스트리 (본체 Agent Registry + per-agent 토큰 패턴 이식).
// 토큰은 발급 시 1회만 평문 반환, 레코드에는 sha256 해시만 저장.
import crypto from 'node:crypto';
import { loadStore, saveStore } from './persist.js';

const actorsById = new Map();
let storePath = null;

// 제어문자 제거 + 공백 정규화 (본체 sanitizeHistoryText 패턴 이식)
export function sanitizeText(value, maxLength = 120) {
  if (typeof value !== 'string') return '';
  const normalized = value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  return normalized.slice(0, maxLength);
}

function generateActorToken() {
  return crypto.randomBytes(24).toString('hex');
}

function hashActorToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function persist() {
  if (storePath) saveStore(storePath, { items: Array.from(actorsById.values()) });
}

export function initActorStore(path) {
  storePath = path;
  actorsById.clear();
  const data = loadStore(path);
  for (const item of data?.items || []) {
    if (item && typeof item.actorId === 'string' && item.actorId) {
      actorsById.set(item.actorId, item);
    }
  }
}

// 재등록(upsert) = 무조건 토큰 회전 (본체 스펙 §4와 동일).
export function registerActor({ actorId, displayName = '', actorType = 'agent', metadata = {} } = {}) {
  const id = sanitizeText(actorId, 80);
  if (!id) return null;
  const token = generateActorToken();
  const now = new Date().toISOString();
  const existing = actorsById.get(id) || null;
  const actor = {
    actorId: id,
    actorType: actorType === 'human' ? 'human' : 'agent',
    displayName: sanitizeText(displayName, 120),
    metadata: metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? metadata : {},
    tokenHash: hashActorToken(token),
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    lastHeartbeatAt: existing?.lastHeartbeatAt || null,
  };
  actorsById.set(id, actor);
  persist();
  return { actor, actorToken: token };
}

export function findActorByToken(token) {
  if (!token) return null;
  const tokenHash = hashActorToken(token);
  return (
    Array.from(actorsById.values()).find((actor) => actor.tokenHash && actor.tokenHash === tokenHash)
    || null
  );
}

export function heartbeatActor(actorId) {
  const actor = actorsById.get(actorId);
  if (!actor) return null;
  actor.lastHeartbeatAt = new Date().toISOString();
  actor.updatedAt = actor.lastHeartbeatAt;
  persist();
  return actor;
}

export function revokeActor(actorId) {
  const actor = actorsById.get(actorId);
  if (!actor) return null;
  actor.tokenHash = null;
  actor.updatedAt = new Date().toISOString();
  persist();
  return actor;
}

export function getActor(actorId) {
  return actorsById.get(actorId) || null;
}

// 응답에는 토큰 해시를 절대 노출하지 않는다.
export function toPublicActor(actor) {
  if (!actor) return actor;
  const { tokenHash, ...publicActor } = actor;
  return publicActor;
}

export function listActors() {
  return Array.from(actorsById.values()).map(toPublicActor);
}
```

- [ ] **Step 4: auth.js 구현**

`workflow/server/auth.js`:

```js
// 인증 경계 (스펙 §3): 서버 토큰(운영자) vs actor 토큰(요청자).
// 본체와 달리 grace 경로 없음 — 엄격 per-actor 전용.
import { SERVER_TOKEN } from './config.js';
import { findActorByToken } from './actors.js';

export function extractBearerToken(headerValue) {
  if (typeof headerValue !== 'string') return null;
  const prefix = 'Bearer ';
  if (!headerValue.startsWith(prefix)) return null;
  const token = headerValue.slice(prefix.length).trim();
  return token || null;
}

export function isServerAuthorized(req) {
  if (!SERVER_TOKEN) return true;
  return extractBearerToken(req.headers.authorization) === SERVER_TOKEN;
}

export function resolveActorAuth(req) {
  if (!SERVER_TOKEN) return { ok: true, mode: 'open', actorId: null };
  const token = extractBearerToken(req.headers.authorization);
  if (!token) return { ok: false, status: 401, error: 'Unauthorized' };
  const actor = findActorByToken(token);
  if (actor) return { ok: true, mode: 'actor', actorId: actor.actorId };
  return { ok: false, status: 401, error: 'Unauthorized' };
}

// expectedActorId가 주어지면 토큰 주인과의 일치를 검증한다 (open 모드는 제외).
// 실패 시 응답을 직접 쓰고 null을 반환한다.
export function authorizeActor(req, res, expectedActorId = null) {
  const auth = resolveActorAuth(req);
  if (!auth.ok) {
    res.writeHead(auth.status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: auth.error }));
    return null;
  }
  if (auth.mode === 'actor' && expectedActorId && auth.actorId !== expectedActorId) {
    res.writeHead(403, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'ACTOR_MISMATCH' }));
    return null;
  }
  return auth;
}
```

- [ ] **Step 5: server.js에 라우트 추가**

`workflow/server.js`를 아래로 교체:

```js
// Maestro Workflow 결정 서버 (Maestro Harmony).
// 범용 DecisionRequest를 수신해 사람이 결정하고, record-only로 기록·전달한다.
// 실행: node server.js  (기본 http://127.0.0.1:8090)
import http from 'node:http';
import { PORT, HOST, ALLOWED_ORIGINS, ACTOR_STORE_PATH } from './server/config.js';
import {
  getActor,
  heartbeatActor,
  initActorStore,
  listActors,
  registerActor,
  revokeActor,
  toPublicActor,
} from './server/actors.js';
import { authorizeActor, isServerAuthorized } from './server/auth.js';

initActorStore(ACTOR_STORE_PATH);

export function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function readJsonBody(req) {
  return new Promise((resolvePromise, rejectPromise) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      try {
        resolvePromise(body.trim() ? JSON.parse(body) : {});
      } catch {
        rejectPromise(new Error('INVALID_JSON'));
      }
    });
    req.on('error', rejectPromise);
  });
}

function applyCors(req, res) {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  }
}

const server = http.createServer(async (req, res) => {
  applyCors(req, res);
  const { pathname } = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === 'GET' && pathname === '/health') {
    sendJson(res, 200, { status: 'ok', app: 'maestro-workflow', pendingRequests: 0 });
    return;
  }

  // ── Actor 레지스트리 (서버 토큰) ─────────────────────────────────────────
  if (req.method === 'POST' && pathname === '/api/actors/register') {
    if (!isServerAuthorized(req)) {
      sendJson(res, 401, { error: 'Unauthorized' });
      return;
    }
    let data;
    try {
      data = await readJsonBody(req);
    } catch {
      sendJson(res, 400, { error: 'Invalid JSON body' });
      return;
    }
    const registered = registerActor(data);
    if (!registered) {
      sendJson(res, 400, { error: 'ACTOR_ID_REQUIRED' });
      return;
    }
    sendJson(res, 200, {
      success: true,
      item: toPublicActor(registered.actor),
      actorToken: registered.actorToken,
    });
    return;
  }

  if (req.method === 'GET' && pathname === '/api/actors') {
    if (!isServerAuthorized(req)) {
      sendJson(res, 401, { error: 'Unauthorized' });
      return;
    }
    sendJson(res, 200, { items: listActors() });
    return;
  }

  const actorHeartbeatMatch = pathname.match(/^\/api\/actors\/([^/]+)\/heartbeat$/);
  if (req.method === 'POST' && actorHeartbeatMatch) {
    const actorId = decodeURIComponent(actorHeartbeatMatch[1]);
    const auth = authorizeActor(req, res, actorId);
    if (!auth) return;
    const actor = heartbeatActor(actorId);
    if (!actor) {
      sendJson(res, 404, { error: 'ACTOR_NOT_FOUND' });
      return;
    }
    sendJson(res, 200, { success: true, item: toPublicActor(actor) });
    return;
  }

  const actorRevokeMatch = pathname.match(/^\/api\/actors\/([^/]+)\/revoke$/);
  if (req.method === 'POST' && actorRevokeMatch) {
    if (!isServerAuthorized(req)) {
      sendJson(res, 401, { error: 'Unauthorized' });
      return;
    }
    const actorId = decodeURIComponent(actorRevokeMatch[1]);
    const actor = revokeActor(actorId);
    if (!actor) {
      sendJson(res, 404, { error: 'ACTOR_NOT_FOUND' });
      return;
    }
    sendJson(res, 200, { success: true, item: toPublicActor(actor) });
    return;
  }

  sendJson(res, 404, { error: 'NOT_FOUND' });
});

server.listen(PORT, HOST, () => {
  console.log(`🎼 Maestro Workflow server on http://${HOST}:${PORT}`);
});
```

- [ ] **Step 6: 통과 확인**

Run: `cd workflow && npm run test:server`
Expected: PASS (health 1 + persist 2 + actors 3)

- [ ] **Step 7: 커밋**

```bash
git add workflow/server/actors.js workflow/server/auth.js workflow/server.js workflow/tests/actors.test.mjs
git commit -m "feat(workflow): actor registry with per-actor token auth (strict, no grace)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: DecisionRequest 생성 + 목록 + WS 브로드캐스트

**Files:**
- Create: `workflow/server/decisions.js`
- Modify: `workflow/server.js` (라우트 + WebSocket)
- Test: `workflow/tests/decision-requests.test.mjs`

**Interfaces:**
- Consumes: `persist.js`, `auth.js`의 `authorizeActor/isServerAuthorized`, `actors.js`의 `sanitizeText`
- Produces:
  - `decisions.js`: `initDecisionStore(path)`, `createDecisionRequest({actorId, subjectType, subject?, source?}) → request` (검증 실패 시 `error.code = 'SUBJECT_TYPE_REQUIRED' | 'SUBJECT_TITLE_REQUIRED'` throw), `listRequests({status?}) → request[]` (최신순), `getRequest(requestId) → request|null`, `countPendingRequests() → number`
  - request 형태: `{requestId:'dcr_...', actorId, subjectType(소문자), subject:{title, summary, payload:object}, status:'pending_decision', source, createdAt, updatedAt}`
  - 라우트: `POST /api/decision-requests`(actor 토큰; actor 모드면 body.actorId 불일치 시 403, 비었으면 토큰 주인으로 채움) → `200 {success, item}`; `GET /api/decision-requests?status=`(서버 토큰) → `{items}`
  - WS: 요청 생성 시 `{type:'WORKFLOW_REQUEST_CREATED', item}` 브로드캐스트. `server.js`에 `broadcast(data)` 추가. `/health`의 `pendingRequests`가 실측값으로 변경.

- [ ] **Step 1: 실패하는 테스트 작성**

`workflow/tests/decision-requests.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { WebSocket } from 'ws';
import { startServer, cleanupDataDir, authHeaders } from './helpers.mjs';

const SERVER_TOKEN = 'wf-server-secret';

async function setupActor(server, actorId) {
  const res = await fetch(`http://127.0.0.1:${server.port}/api/actors/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(SERVER_TOKEN) },
    body: JSON.stringify({ actorId }),
  });
  const body = await res.json();
  return body.actorToken;
}

function postRequest(server, token, payload) {
  return fetch(`http://127.0.0.1:${server.port}/api/decision-requests`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
    body: JSON.stringify(payload),
  });
}

test('creates generic decision request and lists it pending', async () => {
  const server = await startServer({ serverToken: SERVER_TOKEN });
  try {
    const token = await setupActor(server, 'agent_a');
    const res = await postRequest(server, token, {
      subjectType: 'Spend',
      subject: {
        title: 'API 크레딧 $30 구매',
        summary: '리서치 작업용 크레딧 충전',
        payload: { amount: 30, currency: 'USD', purpose: 'research-api' },
      },
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.match(body.item.requestId, /^dcr_/);
    assert.equal(body.item.subjectType, 'spend'); // 소문자 정규화
    assert.equal(body.item.actorId, 'agent_a'); // 토큰 주인으로 채움
    assert.equal(body.item.status, 'pending_decision');
    assert.equal(body.item.subject.payload.amount, 30);

    const listRes = await fetch(
      `http://127.0.0.1:${server.port}/api/decision-requests?status=pending_decision`,
      { headers: authHeaders(SERVER_TOKEN) },
    );
    const list = await listRes.json();
    assert.equal(list.items.length, 1);

    const health = await (await fetch(`http://127.0.0.1:${server.port}/health`)).json();
    assert.equal(health.pendingRequests, 1);
  } finally {
    await server.stop();
    cleanupDataDir(server.dataDir);
  }
});

test('validates subjectType/title and rejects actorId spoofing', async () => {
  const server = await startServer({ serverToken: SERVER_TOKEN });
  try {
    const token = await setupActor(server, 'agent_a');

    const noType = await postRequest(server, token, { subject: { title: '제목' } });
    assert.equal(noType.status, 400);
    assert.equal((await noType.json()).error, 'SUBJECT_TYPE_REQUIRED');

    const noTitle = await postRequest(server, token, { subjectType: 'spend', subject: {} });
    assert.equal(noTitle.status, 400);
    assert.equal((await noTitle.json()).error, 'SUBJECT_TITLE_REQUIRED');

    const spoofed = await postRequest(server, token, {
      actorId: 'someone_else',
      subjectType: 'spend',
      subject: { title: '제목' },
    });
    assert.equal(spoofed.status, 403);
  } finally {
    await server.stop();
    cleanupDataDir(server.dataDir);
  }
});

test('broadcasts WORKFLOW_REQUEST_CREATED over WebSocket', async () => {
  const server = await startServer({ serverToken: SERVER_TOKEN });
  try {
    const token = await setupActor(server, 'agent_a');
    const ws = new WebSocket(`ws://127.0.0.1:${server.port}`);
    await once(ws, 'open');
    const messagePromise = once(ws, 'message');
    await postRequest(server, token, { subjectType: 'publish', subject: { title: '보고서 발송' } });
    const [raw] = await messagePromise;
    const event = JSON.parse(raw.toString());
    assert.equal(event.type, 'WORKFLOW_REQUEST_CREATED');
    assert.equal(event.item.subjectType, 'publish');
    ws.close();
  } finally {
    await server.stop();
    cleanupDataDir(server.dataDir);
  }
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd workflow && npm run test:server`
Expected: FAIL — `/api/decision-requests`가 404

- [ ] **Step 3: decisions.js 구현 (요청 부분)**

`workflow/server/decisions.js`:

```js
// DecisionRequest / Decision 스토어 (본체 ApprovalRequest/Decision의 일반화).
// subjectType은 자유 문자열 — 서버는 유형을 등록제로 제한하지 않는다 (record-only라 안전).
import { loadStore, saveStore } from './persist.js';
import { sanitizeText } from './actors.js';

const requestsById = new Map();
const decisionsByRequestId = new Map();
let storePath = null;

function persist() {
  if (!storePath) return;
  saveStore(storePath, {
    requests: Array.from(requestsById.values()),
    decisions: Array.from(decisionsByRequestId.values()),
  });
}

export function initDecisionStore(path) {
  storePath = path;
  requestsById.clear();
  decisionsByRequestId.clear();
  const data = loadStore(path);
  for (const item of data?.requests || []) {
    if (item && typeof item.requestId === 'string' && item.requestId) {
      requestsById.set(item.requestId, item);
    }
  }
  for (const item of data?.decisions || []) {
    if (item && typeof item.requestId === 'string' && item.requestId) {
      decisionsByRequestId.set(item.requestId, item);
    }
  }
}

export function createDecisionRequest({ actorId, subjectType, subject = {}, source = 'agent' } = {}) {
  const type = sanitizeText(subjectType, 40).toLowerCase();
  if (!type) {
    const error = new Error('SUBJECT_TYPE_REQUIRED');
    error.code = 'SUBJECT_TYPE_REQUIRED';
    throw error;
  }
  const title = sanitizeText(subject?.title, 120);
  if (!title) {
    const error = new Error('SUBJECT_TITLE_REQUIRED');
    error.code = 'SUBJECT_TITLE_REQUIRED';
    throw error;
  }
  const now = new Date().toISOString();
  const request = {
    requestId: `dcr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    actorId: sanitizeText(actorId, 80) || 'unknown',
    subjectType: type,
    subject: {
      title,
      summary: sanitizeText(subject?.summary, 400),
      payload:
        subject?.payload && typeof subject.payload === 'object' && !Array.isArray(subject.payload)
          ? subject.payload
          : {},
    },
    status: 'pending_decision',
    source: sanitizeText(source, 20) || 'agent',
    createdAt: now,
    updatedAt: now,
  };
  requestsById.set(request.requestId, request);
  persist();
  return request;
}

export function getRequest(requestId) {
  return requestsById.get(requestId) || null;
}

export function listRequests({ status = null } = {}) {
  const items = Array.from(requestsById.values());
  const filtered = status ? items.filter((item) => item.status === status) : items;
  return filtered.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export function countPendingRequests() {
  return listRequests({ status: 'pending_decision' }).length;
}
```

- [ ] **Step 4: server.js에 라우트와 WebSocket 추가**

`workflow/server.js` 수정 — import에 추가:

```js
import { WebSocketServer, WebSocket as WSWebSocket } from 'ws';
import { PORT, HOST, ALLOWED_ORIGINS, ACTOR_STORE_PATH, DECISION_STORE_PATH } from './server/config.js';
import {
  countPendingRequests,
  createDecisionRequest,
  initDecisionStore,
  listRequests,
} from './server/decisions.js';
```

`initActorStore(ACTOR_STORE_PATH);` 아래에:

```js
initDecisionStore(DECISION_STORE_PATH);
```

`/health` 핸들러의 `pendingRequests: 0`을 실측값으로 교체:

```js
    sendJson(res, 200, { status: 'ok', app: 'maestro-workflow', pendingRequests: countPendingRequests() });
```

actor revoke 라우트 뒤, 404 응답 앞에 라우트 2개 추가:

```js
  // ── DecisionRequest (actor 토큰) ─────────────────────────────────────────
  if (req.method === 'POST' && pathname === '/api/decision-requests') {
    const auth = authorizeActor(req, res);
    if (!auth) return;
    let data;
    try {
      data = await readJsonBody(req);
    } catch {
      sendJson(res, 400, { error: 'Invalid JSON body' });
      return;
    }
    // actor 토큰 호출은 body.actorId가 토큰 주인과 일치해야 한다 (비어 있으면 채움)
    if (auth.mode === 'actor') {
      if (data.actorId && data.actorId !== auth.actorId) {
        sendJson(res, 403, { error: 'ACTOR_MISMATCH' });
        return;
      }
      data.actorId = auth.actorId;
    }
    try {
      const request = createDecisionRequest(data);
      console.log(`📨 결정 요청 수신: [${request.actorId}] (${request.subjectType}) ${request.subject.title}`);
      broadcast({ type: 'WORKFLOW_REQUEST_CREATED', item: request });
      sendJson(res, 200, { success: true, item: request });
    } catch (error) {
      if (error.code === 'SUBJECT_TYPE_REQUIRED' || error.code === 'SUBJECT_TITLE_REQUIRED') {
        sendJson(res, 400, { error: error.code });
        return;
      }
      sendJson(res, 500, { error: 'INTERNAL_ERROR' });
    }
    return;
  }

  if (req.method === 'GET' && pathname === '/api/decision-requests') {
    if (!isServerAuthorized(req)) {
      sendJson(res, 401, { error: 'Unauthorized' });
      return;
    }
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    sendJson(res, 200, { items: listRequests({ status: url.searchParams.get('status') }) });
    return;
  }
```

파일 하단의 `server.listen(...)` 앞에 WebSocket 서버와 broadcast 추가:

```js
const wss = new WebSocketServer({ server });

function broadcast(data) {
  const message = JSON.stringify(data);
  wss.clients.forEach((client) => {
    if (client.readyState === WSWebSocket.OPEN) {
      client.send(message);
    }
  });
}
```

주의: `broadcast`는 함수 선언(hoisting)이므로 위쪽 라우트에서 사용 가능하지만, `wss`는 `const`다 — `broadcast` 정의를 함수 선언으로 유지하면 라우트 실행 시점(리스닝 이후)에는 초기화가 끝나 있으므로 안전하다.

- [ ] **Step 5: 통과 확인**

Run: `cd workflow && npm run test:server`
Expected: PASS (누적 9 tests)

- [ ] **Step 6: 커밋**

```bash
git add workflow/server/decisions.js workflow/server.js workflow/tests/decision-requests.test.mjs
git commit -m "feat(workflow): generic DecisionRequest intake with WS broadcast

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: 운영자 결정 + pull + ack (record-only)

**Files:**
- Modify: `workflow/server/decisions.js`
- Modify: `workflow/server.js`
- Test: `workflow/tests/decide-pull-ack.test.mjs`

**Interfaces:**
- Consumes: Task 4의 `decisions.js` 스토어와 라우팅 구조
- Produces:
  - `decisions.js` 추가: `decideRequest(requestId, {decision, comment?, decidedBy?}) → {item, request} | {error:string, status:number}` (404 `DECISION_REQUEST_NOT_FOUND` / 409 `ALREADY_DECIDED` / 400 `INVALID_DECISION`), `getDecisionByRequestId(requestId) → decision|null`, `acknowledgeDecision(decisionId) → decision|null`, `findRequestByDecisionId(decisionId) → request|null`, `DECISION_VALUES:Set<string>`
  - decision 형태: `{decisionId:'dcd_...', requestId, decision, comment, executorAction:'none', delivery:{mode:'pull', status:'available'|'acknowledged', acknowledgedAt}, decidedBy, createdAt}`
  - 라우트: `POST /api/decision-requests/:id/decide`(서버 토큰) → `200 {success, item, request}` + WS `{type:'WORKFLOW_DECIDED', item, request}`; `GET /api/decision-requests/:id/decision`(actor 토큰, 자기 요청만) → `{requestId, status:'pending'|'available'|'acknowledged', item}`; `POST /api/decisions/:id/ack`(actor 토큰, 자기 요청의 결정만)

- [ ] **Step 1: 실패하는 테스트 작성**

`workflow/tests/decide-pull-ack.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, cleanupDataDir, authHeaders } from './helpers.mjs';

const SERVER_TOKEN = 'wf-server-secret';

async function setup(server) {
  const register = async (actorId) => {
    const res = await fetch(`http://127.0.0.1:${server.port}/api/actors/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders(SERVER_TOKEN) },
      body: JSON.stringify({ actorId }),
    });
    return (await res.json()).actorToken;
  };
  const tokenA = await register('agent_a');
  const tokenB = await register('agent_b');
  const reqRes = await fetch(`http://127.0.0.1:${server.port}/api/decision-requests`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(tokenA) },
    body: JSON.stringify({ subjectType: 'spend', subject: { title: 'API 크레딧 $30 구매' } }),
  });
  const requestId = (await reqRes.json()).item.requestId;
  return { tokenA, tokenB, requestId };
}

function decide(server, requestId, body) {
  return fetch(`http://127.0.0.1:${server.port}/api/decision-requests/${requestId}/decide`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(SERVER_TOKEN) },
    body: JSON.stringify(body),
  });
}

test('operator decides, actor pulls own decision and acks; record-only', async () => {
  const server = await startServer({ serverToken: SERVER_TOKEN });
  try {
    const { tokenA, tokenB, requestId } = await setup(server);

    // 결정 전 pull → pending
    const pending = await fetch(
      `http://127.0.0.1:${server.port}/api/decision-requests/${requestId}/decision`,
      { headers: authHeaders(tokenA) },
    );
    assert.equal(pending.status, 200);
    assert.equal((await pending.json()).status, 'pending');

    // 남의 요청 pull → 403
    const foreign = await fetch(
      `http://127.0.0.1:${server.port}/api/decision-requests/${requestId}/decision`,
      { headers: authHeaders(tokenB) },
    );
    assert.equal(foreign.status, 403);

    // 운영자 결정 (record-only)
    const decided = await decide(server, requestId, { decision: 'approve', comment: '한도 내 지출' });
    assert.equal(decided.status, 200);
    const decidedBody = await decided.json();
    assert.equal(decidedBody.item.executorAction, 'none');
    assert.equal(decidedBody.item.delivery.status, 'available');
    assert.equal(decidedBody.request.status, 'decided');

    // 중복 결정 → 409, 잘못된 어휘 → 400, 없는 요청 → 404
    assert.equal((await decide(server, requestId, { decision: 'reject' })).status, 409);
    assert.equal((await decide(server, 'dcr_none', { decision: 'approve' })).status, 404);

    // actor pull → available
    const pulled = await fetch(
      `http://127.0.0.1:${server.port}/api/decision-requests/${requestId}/decision`,
      { headers: authHeaders(tokenA) },
    );
    const pulledBody = await pulled.json();
    assert.equal(pulledBody.status, 'available');
    const decisionId = pulledBody.item.decisionId;

    // 남의 결정 ack → 403, 자기 결정 ack → acknowledged (반복 ack 동일 결과)
    const foreignAck = await fetch(`http://127.0.0.1:${server.port}/api/decisions/${decisionId}/ack`, {
      method: 'POST',
      headers: authHeaders(tokenB),
    });
    assert.equal(foreignAck.status, 403);

    const ack = await fetch(`http://127.0.0.1:${server.port}/api/decisions/${decisionId}/ack`, {
      method: 'POST',
      headers: authHeaders(tokenA),
    });
    assert.equal(ack.status, 200);
    const ackBody = await ack.json();
    assert.equal(ackBody.item.delivery.status, 'acknowledged');
    assert.ok(ackBody.item.delivery.acknowledgedAt);

    const ackAgain = await fetch(`http://127.0.0.1:${server.port}/api/decisions/${decisionId}/ack`, {
      method: 'POST',
      headers: authHeaders(tokenA),
    });
    assert.equal((await ackAgain.json()).item.delivery.acknowledgedAt, ackBody.item.delivery.acknowledgedAt);
  } finally {
    await server.stop();
    cleanupDataDir(server.dataDir);
  }
});

test('invalid decision vocabulary is rejected; store survives restart', async () => {
  const first = await startServer({ serverToken: SERVER_TOKEN });
  const dataDir = first.dataDir;
  try {
    const { tokenA, requestId } = await setup(first);
    assert.equal((await decide(first, requestId, { decision: 'merge' })).status, 400);
    await decide(first, requestId, { decision: 'revise', comment: '금액 근거 추가 요망' });
    await first.stop();

    const second = await startServer({ serverToken: SERVER_TOKEN, tempDir: dataDir });
    try {
      const pulled = await fetch(
        `http://127.0.0.1:${second.port}/api/decision-requests/${requestId}/decision`,
        { headers: authHeaders(tokenA) },
      );
      const body = await pulled.json();
      assert.equal(body.status, 'available');
      assert.equal(body.item.decision, 'revise');
    } finally {
      await second.stop();
    }
  } finally {
    cleanupDataDir(dataDir);
  }
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd workflow && npm run test:server`
Expected: FAIL — decide 라우트가 404

- [ ] **Step 3: decisions.js에 결정/ack 로직 추가**

`workflow/server/decisions.js` 끝에 추가:

```js
export const DECISION_VALUES = new Set(['approve', 'reject', 'revise', 'ask', 'cancel']);

// record-only: executorAction은 항상 'none'. Workflow는 아무것도 실행하지 않는다.
export function decideRequest(requestId, { decision, comment = '', decidedBy = 'operator' } = {}) {
  const request = requestsById.get(requestId);
  if (!request) return { error: 'DECISION_REQUEST_NOT_FOUND', status: 404 };
  if (decisionsByRequestId.has(requestId)) return { error: 'ALREADY_DECIDED', status: 409 };
  if (!DECISION_VALUES.has(decision)) return { error: 'INVALID_DECISION', status: 400 };

  const now = new Date().toISOString();
  const item = {
    decisionId: `dcd_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    requestId,
    decision,
    comment: sanitizeText(comment, 400),
    executorAction: 'none',
    delivery: { mode: 'pull', status: 'available', acknowledgedAt: null },
    decidedBy: sanitizeText(decidedBy, 80) || 'operator',
    createdAt: now,
  };
  decisionsByRequestId.set(requestId, item);
  request.status = 'decided';
  request.updatedAt = now;
  persist();
  return { item, request };
}

export function getDecisionByRequestId(requestId) {
  return decisionsByRequestId.get(requestId) || null;
}

export function findRequestByDecisionId(decisionId) {
  for (const decision of decisionsByRequestId.values()) {
    if (decision.decisionId === decisionId) return requestsById.get(decision.requestId) || null;
  }
  return null;
}

export function acknowledgeDecision(decisionId) {
  const decision =
    Array.from(decisionsByRequestId.values()).find((item) => item.decisionId === decisionId) || null;
  if (!decision) return null;
  if (decision.delivery.status !== 'acknowledged') {
    decision.delivery.status = 'acknowledged';
    decision.delivery.acknowledgedAt = new Date().toISOString();
    persist();
  }
  return decision;
}
```

- [ ] **Step 4: server.js에 라우트 3개 추가**

import 목록의 `./server/decisions.js`에 `acknowledgeDecision, decideRequest, findRequestByDecisionId, getDecisionByRequestId, getRequest` 추가. `GET /api/decision-requests` 라우트 뒤에:

```js
  const decideMatch = pathname.match(/^\/api\/decision-requests\/([^/]+)\/decide$/);
  if (req.method === 'POST' && decideMatch) {
    if (!isServerAuthorized(req)) {
      sendJson(res, 401, { error: 'Unauthorized' });
      return;
    }
    let data;
    try {
      data = await readJsonBody(req);
    } catch {
      sendJson(res, 400, { error: 'Invalid JSON body' });
      return;
    }
    const requestId = decodeURIComponent(decideMatch[1]);
    const result = decideRequest(requestId, data);
    if (result.error) {
      sendJson(res, result.status, { error: result.error });
      return;
    }
    console.log(`🎯 결정 기록: [${result.request.subjectType}] ${result.item.decision} (${requestId})`);
    broadcast({ type: 'WORKFLOW_DECIDED', item: result.item, request: result.request });
    sendJson(res, 200, { success: true, item: result.item, request: result.request });
    return;
  }

  const decisionPollMatch = pathname.match(/^\/api\/decision-requests\/([^/]+)\/decision$/);
  if (req.method === 'GET' && decisionPollMatch) {
    const auth = authorizeActor(req, res);
    if (!auth) return;
    const requestId = decodeURIComponent(decisionPollMatch[1]);
    const request = getRequest(requestId);
    if (!request) {
      sendJson(res, 404, { error: 'DECISION_REQUEST_NOT_FOUND' });
      return;
    }
    // actor 토큰은 자기 요청만 폴링 가능
    if (auth.mode === 'actor' && request.actorId !== auth.actorId) {
      sendJson(res, 403, { error: 'ACTOR_MISMATCH' });
      return;
    }
    const decision = getDecisionByRequestId(requestId);
    sendJson(res, 200, {
      requestId,
      status: decision ? decision.delivery.status : 'pending',
      item: decision,
    });
    return;
  }

  const ackMatch = pathname.match(/^\/api\/decisions\/([^/]+)\/ack$/);
  if (req.method === 'POST' && ackMatch) {
    const auth = authorizeActor(req, res);
    if (!auth) return;
    const decisionId = decodeURIComponent(ackMatch[1]);
    // actor 토큰은 자기 요청의 결정만 ack 가능
    if (auth.mode === 'actor') {
      const targetRequest = findRequestByDecisionId(decisionId);
      if (targetRequest && targetRequest.actorId !== auth.actorId) {
        sendJson(res, 403, { error: 'ACTOR_MISMATCH' });
        return;
      }
    }
    const decision = acknowledgeDecision(decisionId);
    if (!decision) {
      sendJson(res, 404, { error: 'DECISION_NOT_FOUND' });
      return;
    }
    sendJson(res, 200, { success: true, item: decision });
    return;
  }
```

- [ ] **Step 5: 통과 확인**

Run: `cd workflow && npm run test:server`
Expected: PASS (누적 11 tests)

- [ ] **Step 6: 커밋**

```bash
git add workflow/server/decisions.js workflow/server.js workflow/tests/decide-pull-ack.test.mjs
git commit -m "feat(workflow): record-only decide + pull + ack flow

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: AuditLog (append-only 이력)

**Files:**
- Create: `workflow/server/history.js`
- Modify: `workflow/server.js` (이벤트 연결 + `GET /api/history`)
- Test: `workflow/tests/history.test.mjs`

**Interfaces:**
- Consumes: `persist.js`, `actors.js`의 `sanitizeText`, `config.js`의 `HISTORY_STORE_PATH`
- Produces:
  - `history.js`: `initHistoryStore(path)`, `appendHistory({event, requestId?, actorId?, subjectType?, title?, decision?, comment?, decidedBy?}) → entry`, `listHistory(limit?) → entry[]` (최신순)
  - entry 형태: `{id:'hist_...', timestamp, event, requestId, actorId, subjectType, title, decision, comment, decidedBy}` (누락 필드는 null)
  - event 어휘: `ACTOR_REGISTERED | ACTOR_REVOKED | REQUEST_CREATED | DECIDED | ACKNOWLEDGED`
  - 라우트: `GET /api/history?limit=`(서버 토큰) → `{items}`. 각 이벤트 발생 지점에서 `appendHistory` 호출 + WS `{type:'WORKFLOW_HISTORY_APPEND', item:entry}` 브로드캐스트.

- [ ] **Step 1: 실패하는 테스트 작성**

`workflow/tests/history.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, cleanupDataDir, authHeaders } from './helpers.mjs';

const SERVER_TOKEN = 'wf-server-secret';

test('full flow leaves append-only audit trail that survives restart', async () => {
  const first = await startServer({ serverToken: SERVER_TOKEN });
  const dataDir = first.dataDir;
  try {
    const registerRes = await fetch(`http://127.0.0.1:${first.port}/api/actors/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders(SERVER_TOKEN) },
      body: JSON.stringify({ actorId: 'agent_a' }),
    });
    const actorToken = (await registerRes.json()).actorToken;

    const reqRes = await fetch(`http://127.0.0.1:${first.port}/api/decision-requests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders(actorToken) },
      body: JSON.stringify({ subjectType: 'spend', subject: { title: 'API 크레딧 $30 구매' } }),
    });
    const requestId = (await reqRes.json()).item.requestId;

    const decideRes = await fetch(
      `http://127.0.0.1:${first.port}/api/decision-requests/${requestId}/decide`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders(SERVER_TOKEN) },
        body: JSON.stringify({ decision: 'approve', comment: '한도 내' }),
      },
    );
    const decisionId = (await decideRes.json()).item.decisionId;

    await fetch(`http://127.0.0.1:${first.port}/api/decisions/${decisionId}/ack`, {
      method: 'POST',
      headers: authHeaders(actorToken),
    });

    const historyRes = await fetch(`http://127.0.0.1:${first.port}/api/history?limit=10`, {
      headers: authHeaders(SERVER_TOKEN),
    });
    assert.equal(historyRes.status, 200);
    const events = (await historyRes.json()).items.map((item) => item.event);
    // 최신순
    assert.deepEqual(events, ['ACKNOWLEDGED', 'DECIDED', 'REQUEST_CREATED', 'ACTOR_REGISTERED']);

    const decidedEntry = (await (await fetch(`http://127.0.0.1:${first.port}/api/history?limit=10`, {
      headers: authHeaders(SERVER_TOKEN),
    })).json()).items.find((item) => item.event === 'DECIDED');
    assert.equal(decidedEntry.decision, 'approve');
    assert.equal(decidedEntry.subjectType, 'spend');
    assert.equal(decidedEntry.decidedBy, 'operator');

    await first.stop();

    // 재시작 후에도 이력 복구
    const second = await startServer({ serverToken: SERVER_TOKEN, tempDir: dataDir });
    try {
      const recovered = await fetch(`http://127.0.0.1:${second.port}/api/history?limit=10`, {
        headers: authHeaders(SERVER_TOKEN),
      });
      assert.equal((await recovered.json()).items.length, 4);
    } finally {
      await second.stop();
    }
  } finally {
    cleanupDataDir(dataDir);
  }
});

test('history endpoint requires server token', async () => {
  const server = await startServer({ serverToken: SERVER_TOKEN });
  try {
    const res = await fetch(`http://127.0.0.1:${server.port}/api/history`);
    assert.equal(res.status, 401);
  } finally {
    await server.stop();
    cleanupDataDir(server.dataDir);
  }
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd workflow && npm run test:server`
Expected: FAIL — `/api/history`가 404

- [ ] **Step 3: history.js 구현**

`workflow/server/history.js`:

```js
// Append-only 감사 이력 (AuditLog). 수정/삭제 API 없음 — 추가와 조회뿐.
import { loadStore, saveStore } from './persist.js';
import { sanitizeText } from './actors.js';

const HISTORY_MAX_ITEMS = 500;
const EVENT_VALUES = new Set([
  'ACTOR_REGISTERED',
  'ACTOR_REVOKED',
  'REQUEST_CREATED',
  'DECIDED',
  'ACKNOWLEDGED',
]);

const entries = [];
let storePath = null;

function persist() {
  if (storePath) saveStore(storePath, { items: entries });
}

export function initHistoryStore(path) {
  storePath = path;
  entries.length = 0;
  const data = loadStore(path);
  for (const item of data?.items || []) {
    if (item && EVENT_VALUES.has(item.event)) entries.push(item);
  }
}

export function appendHistory(input = {}) {
  if (!EVENT_VALUES.has(input.event)) return null;
  const entry = {
    id: `hist_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    event: input.event,
    requestId: sanitizeText(input.requestId || '', 80) || null,
    actorId: sanitizeText(input.actorId || '', 80) || null,
    subjectType: sanitizeText(input.subjectType || '', 40) || null,
    title: sanitizeText(input.title || '', 120) || null,
    decision: sanitizeText(input.decision || '', 20) || null,
    comment: sanitizeText(input.comment || '', 400) || null,
    decidedBy: sanitizeText(input.decidedBy || '', 80) || null,
  };
  entries.push(entry);
  while (entries.length > HISTORY_MAX_ITEMS) entries.shift();
  persist();
  return entry;
}

export function listHistory(limit = 40) {
  const normalized = Number.isInteger(Number(limit)) && Number(limit) > 0 ? Math.min(Number(limit), HISTORY_MAX_ITEMS) : 40;
  return entries.slice(-normalized).reverse();
}
```

- [ ] **Step 4: server.js에 이벤트 연결**

import 추가:

```js
import { HISTORY_STORE_PATH } from './server/config.js'; // 기존 config import 줄에 합침
import { appendHistory, initHistoryStore, listHistory } from './server/history.js';
```

`initDecisionStore(...)` 아래에 `initHistoryStore(HISTORY_STORE_PATH);` 추가.

`server.js` 하단의 `broadcast` 함수 선언 바로 아래에 기록 헬퍼를 함수 선언으로 추가하고(hoisting으로 위쪽 라우트에서 사용 가능), 이벤트 발생 지점 5곳에서 호출한다:

```js
function recordHistory(input) {
  const entry = appendHistory(input);
  if (entry) broadcast({ type: 'WORKFLOW_HISTORY_APPEND', item: entry });
  return entry;
}
```

1. register 성공 직후 (`sendJson` 앞): `recordHistory({ event: 'ACTOR_REGISTERED', actorId: registered.actor.actorId });`
2. revoke 성공 직후: `recordHistory({ event: 'ACTOR_REVOKED', actorId });`
3. 요청 생성 성공 직후 (`broadcast(WORKFLOW_REQUEST_CREATED)` 다음 줄): `recordHistory({ event: 'REQUEST_CREATED', requestId: request.requestId, actorId: request.actorId, subjectType: request.subjectType, title: request.subject.title });`
4. decide 성공 직후: `recordHistory({ event: 'DECIDED', requestId, actorId: result.request.actorId, subjectType: result.request.subjectType, title: result.request.subject.title, decision: result.item.decision, comment: result.item.comment, decidedBy: result.item.decidedBy });`
5. ack 성공 직후 (`acknowledgeDecision`이 non-null 반환 시): `recordHistory({ event: 'ACKNOWLEDGED', requestId: decision.requestId, decision: decision.decision });`

`GET /api/history` 라우트를 ack 라우트 뒤에 추가:

```js
  if (req.method === 'GET' && pathname === '/api/history') {
    if (!isServerAuthorized(req)) {
      sendJson(res, 401, { error: 'Unauthorized' });
      return;
    }
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    sendJson(res, 200, { items: listHistory(url.searchParams.get('limit') || 40) });
    return;
  }
```

- [ ] **Step 5: 통과 확인**

Run: `cd workflow && npm run test:server`
Expected: PASS (누적 13 tests)

- [ ] **Step 6: 커밋**

```bash
git add workflow/server/history.js workflow/server.js workflow/tests/history.test.mjs
git commit -m "feat(workflow): append-only audit history with restart recovery

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: 대시보드 셸 (채널 보드 + 노트)

**Files:**
- Create: `workflow/vite.config.js`, `workflow/index.html`, `workflow/src/main.jsx`, `workflow/src/index.css`, `workflow/src/test-setup.js`
- Create: `workflow/src/lib/api.js`, `workflow/src/lib/channels.js`
- Create: `workflow/src/App.jsx`, `workflow/src/components/ChannelBoard.jsx`
- Test: `workflow/src/lib/channels.test.js`, `workflow/src/components/ChannelBoard.test.jsx`

**Interfaces:**
- Consumes: 서버 API (`GET /api/decision-requests?status=pending_decision`, WS `WORKFLOW_REQUEST_CREATED`/`WORKFLOW_DECIDED`)
- Produces:
  - `channels.js`: `assignChannels(requests:request[], channelCount?:number=4) → request[][]` (subjectType 최초 등장 순 라운드로빈 배정)
  - `api.js`: `SERVER_URL:string`, `WS_URL:string`, `fetchPendingRequests() → Promise<request[]>`, `decideRequest(requestId, {decision, comment}) → Promise<object>`, `fetchHistory(limit?) → Promise<entry[]>`
  - `ChannelBoard` props: `{requests:request[], channelCount?:number, onSelect:(request)=>void}` — 노트 카드는 `data-testid="decision-note"`, subjectType 배지 + title 표시, 클릭/탭으로 `onSelect`
  - `App`: WS 연결 + 초기 fetch + ChannelBoard 렌더 (결정 시트는 Task 8)

- [ ] **Step 1: Vite/vitest 설정과 엔트리 작성**

`workflow/vite.config.js`:

```js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 5273 },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.js'],
  },
});
```

`workflow/index.html`:

```html
<!doctype html>
<html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Maestro Workflow</title>
  </head>
  <body class="bg-slate-950 text-slate-100">
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
```

`workflow/src/main.jsx`:

```jsx
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './index.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
```

`workflow/src/index.css`:

```css
@import "tailwindcss";
```

`workflow/src/test-setup.js`:

```js
import '@testing-library/jest-dom/vitest';
```

- [ ] **Step 2: 실패하는 테스트 작성 (channels + ChannelBoard)**

`workflow/src/lib/channels.test.js`:

```js
import { describe, expect, it } from 'vitest';
import { assignChannels } from './channels.js';

const req = (id, subjectType) => ({ requestId: id, subjectType, subject: { title: id } });

describe('assignChannels', () => {
  it('groups by subjectType in first-seen round-robin order', () => {
    const channels = assignChannels(
      [req('r1', 'spend'), req('r2', 'publish'), req('r3', 'spend'), req('r4', 'deploy')],
      4,
    );
    expect(channels).toHaveLength(4);
    expect(channels[0].map((r) => r.requestId)).toEqual(['r1', 'r3']);
    expect(channels[1].map((r) => r.requestId)).toEqual(['r2']);
    expect(channels[2].map((r) => r.requestId)).toEqual(['r4']);
    expect(channels[3]).toEqual([]);
  });

  it('wraps subjectTypes beyond channelCount', () => {
    const channels = assignChannels(
      [req('r1', 'a'), req('r2', 'b'), req('r3', 'c')],
      2,
    );
    expect(channels[0].map((r) => r.requestId)).toEqual(['r1', 'r3']);
    expect(channels[1].map((r) => r.requestId)).toEqual(['r2']);
  });
});
```

`workflow/src/components/ChannelBoard.test.jsx`:

```jsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ChannelBoard from './ChannelBoard.jsx';

const requests = [
  {
    requestId: 'dcr_1',
    subjectType: 'spend',
    actorId: 'agent_a',
    subject: { title: 'API 크레딧 $30 구매', summary: '', payload: {} },
  },
  {
    requestId: 'dcr_2',
    subjectType: 'publish',
    actorId: 'agent_b',
    subject: { title: '보고서 발송', summary: '', payload: {} },
  },
];

describe('ChannelBoard', () => {
  it('renders a note per pending request with subjectType badge', () => {
    render(<ChannelBoard requests={requests} onSelect={() => {}} />);
    const notes = screen.getAllByTestId('decision-note');
    expect(notes).toHaveLength(2);
    expect(screen.getByText('API 크레딧 $30 구매')).toBeInTheDocument();
    expect(screen.getByText('spend')).toBeInTheDocument();
    expect(screen.getByText('publish')).toBeInTheDocument();
  });

  it('calls onSelect with the request when a note is tapped', async () => {
    const onSelect = vi.fn();
    render(<ChannelBoard requests={requests} onSelect={onSelect} />);
    await userEvent.click(screen.getByText('보고서 발송'));
    expect(onSelect).toHaveBeenCalledWith(requests[1]);
  });
});
```

- [ ] **Step 3: 실패 확인**

Run: `cd workflow && npm run test:ui`
Expected: FAIL — `channels.js` / `ChannelBoard.jsx` 없음

- [ ] **Step 4: 구현**

`workflow/src/lib/channels.js`:

```js
// 레인 = 결정 채널. subjectType을 최초 등장 순서로 채널에 라운드로빈 배정한다.
export function assignChannels(requests, channelCount = 4) {
  const channels = Array.from({ length: channelCount }, () => []);
  const typeToChannel = new Map();
  for (const request of requests) {
    const type = request.subjectType || 'generic';
    if (!typeToChannel.has(type)) {
      typeToChannel.set(type, typeToChannel.size % channelCount);
    }
    channels[typeToChannel.get(type)].push(request);
  }
  return channels;
}
```

`workflow/src/lib/api.js`:

```js
// Workflow 서버 API 클라이언트. 로컬 dev는 open 모드(토큰 없음)를 기본으로 한다.
export const SERVER_URL = import.meta.env.VITE_WORKFLOW_SERVER_URL || 'http://127.0.0.1:8090';
export const WS_URL = SERVER_URL.replace(/^http/, 'ws');

async function requestJson(path, options = {}) {
  const res = await fetch(`${SERVER_URL}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function fetchPendingRequests() {
  const body = await requestJson('/api/decision-requests?status=pending_decision');
  return body.items || [];
}

export function decideRequest(requestId, { decision, comment = '' }) {
  return requestJson(`/api/decision-requests/${encodeURIComponent(requestId)}/decide`, {
    method: 'POST',
    body: JSON.stringify({ decision, comment }),
  });
}

export async function fetchHistory(limit = 40) {
  const body = await requestJson(`/api/history?limit=${limit}`);
  return body.items || [];
}
```

`workflow/src/components/ChannelBoard.jsx`:

```jsx
import { assignChannels } from '../lib/channels.js';

// 결정 채널 보드: 채널(레인)마다 대기 중인 결정 노트를 세로로 쌓는다.
// 터치 우선: 노트 전체가 44px 이상 탭 타깃, press 피드백(active:scale).
export default function ChannelBoard({ requests, channelCount = 4, onSelect }) {
  const channels = assignChannels(requests, channelCount);
  return (
    <div className="grid gap-3 p-4" style={{ gridTemplateColumns: `repeat(${channelCount}, minmax(0, 1fr))` }}>
      {channels.map((channelRequests, index) => (
        <div key={index} className="flex flex-col gap-3 rounded-xl bg-slate-900/60 p-3 min-h-40">
          <div className="text-xs text-slate-400">
            채널 {index + 1}
            {channelRequests[0] ? ` · ${channelRequests[0].subjectType}` : ''}
          </div>
          {channelRequests.map((request) => (
            <button
              key={request.requestId}
              type="button"
              data-testid="decision-note"
              onClick={() => onSelect(request)}
              className="min-h-[44px] rounded-lg bg-slate-800 px-3 py-3 text-left transition active:scale-95"
            >
              <span className="mr-2 rounded bg-indigo-600/70 px-1.5 py-0.5 text-[10px] uppercase">
                {request.subjectType}
              </span>
              <span className="block mt-1 text-sm font-medium">{request.subject.title}</span>
              <span className="block text-xs text-slate-400">{request.actorId}</span>
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}
```

`workflow/src/App.jsx`:

```jsx
import { useCallback, useEffect, useState } from 'react';
import ChannelBoard from './components/ChannelBoard.jsx';
import { WS_URL, fetchPendingRequests } from './lib/api.js';

// Maestro Workflow 대시보드 셸: 대기 요청을 채널 보드로 표시하고 WS로 실시간 갱신.
export default function App() {
  const [requests, setRequests] = useState([]);
  const [selected, setSelected] = useState(null);
  const [connected, setConnected] = useState(false);

  const reload = useCallback(() => {
    fetchPendingRequests().then(setRequests).catch(() => setRequests([]));
  }, []);

  useEffect(() => {
    reload();
    const ws = new WebSocket(WS_URL);
    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'WORKFLOW_REQUEST_CREATED' || data.type === 'WORKFLOW_DECIDED') {
          reload();
        }
      } catch {
        // 무시
      }
    };
    return () => ws.close();
  }, [reload]);

  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
        <h1 className="text-lg font-semibold">🎼 Maestro Workflow</h1>
        <span className={`text-xs ${connected ? 'text-emerald-400' : 'text-slate-500'}`}>
          {connected ? '실시간 연결됨' : '연결 대기'}
        </span>
      </header>
      <ChannelBoard requests={requests} onSelect={setSelected} />
      {selected ? (
        <div className="px-4 text-sm text-slate-400">선택됨: {selected.subject.title} (결정 시트는 다음 단계)</div>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 5: 통과 확인**

Run: `cd workflow && npm run test:ui`
Expected: PASS (channels 2 + ChannelBoard 2)

- [ ] **Step 6: 수동 스모크 (선택이지만 권장)**

Run: `cd workflow && npm run server & npm run dev` 후 브라우저에서 `http://localhost:5273` 접속, curl로 요청 하나 생성해 노트가 뜨는지 확인:

```bash
curl -X POST http://127.0.0.1:8090/api/decision-requests -H 'Content-Type: application/json' -d '{"actorId":"local","subjectType":"spend","subject":{"title":"테스트 지출"}}'
```

Expected: 채널 1에 `spend` 배지 노트 표시. 확인 후 두 프로세스 종료.

- [ ] **Step 7: 커밋**

```bash
git add workflow/vite.config.js workflow/index.html workflow/src
git commit -m "feat(workflow): dashboard shell with decision channel board

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 8: 결정 UX (승인/반려 시트 + 프리셋 표시)

**Files:**
- Create: `workflow/src/lib/presets.js`, `workflow/src/components/DecisionSheet.jsx`
- Modify: `workflow/src/App.jsx` (시트 연결)
- Test: `workflow/src/lib/presets.test.js`, `workflow/src/components/DecisionSheet.test.jsx`

**Interfaces:**
- Consumes: `api.js`의 `decideRequest`, Task 7의 `App` 상태(`selected`, `reload`)
- Produces:
  - `presets.js`: `formatPresetHighlight(subjectType, payload) → {label:string, detail:string} | null` (spend/publish만, 그 외 null)
  - `DecisionSheet` props: `{request, onDecide:(decision:string, comment:string)=>void, onClose:()=>void}` — 승인 버튼(즉시 `onDecide('approve','')`), 반려 버튼 → 사유 칩(`정책 위반`/`정보 부족`/`비용 초과`/`기타`) + 자유 입력 + `반려 확정` 버튼(`onDecide('reject', comment)`), 보조 액션 3종(`보완 요청`→revise, `질문`→ask, `취소`→cancel), 백드롭 탭 닫기(`data-testid="sheet-backdrop"`)

- [ ] **Step 1: 실패하는 테스트 작성**

`workflow/src/lib/presets.test.js`:

```js
import { describe, expect, it } from 'vitest';
import { formatPresetHighlight } from './presets.js';

describe('formatPresetHighlight', () => {
  it('formats spend payload with amount and purpose', () => {
    expect(formatPresetHighlight('spend', { amount: 30, currency: 'usd', purpose: 'research' }))
      .toEqual({ label: 'USD 30', detail: 'research' });
  });

  it('formats publish payload with target', () => {
    expect(formatPresetHighlight('publish', { target: 'client@corp.com', contentSummary: '월간 보고서' }))
      .toEqual({ label: '→ client@corp.com', detail: '월간 보고서' });
  });

  it('returns null for unknown types or missing fields', () => {
    expect(formatPresetHighlight('deploy', { env: 'prod' })).toBeNull();
    expect(formatPresetHighlight('spend', {})).toBeNull();
    expect(formatPresetHighlight('publish', {})).toBeNull();
  });
});
```

`workflow/src/components/DecisionSheet.test.jsx`:

```jsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DecisionSheet from './DecisionSheet.jsx';

const request = {
  requestId: 'dcr_1',
  subjectType: 'spend',
  actorId: 'agent_a',
  subject: {
    title: 'API 크레딧 $30 구매',
    summary: '리서치용',
    payload: { amount: 30, currency: 'USD', purpose: 'research-api' },
  },
};

describe('DecisionSheet', () => {
  it('shows title, preset highlight and payload', () => {
    render(<DecisionSheet request={request} onDecide={() => {}} onClose={() => {}} />);
    expect(screen.getByText('API 크레딧 $30 구매')).toBeInTheDocument();
    expect(screen.getByText('USD 30')).toBeInTheDocument();
    expect(screen.getByText(/research-api/)).toBeInTheDocument();
  });

  it('approve button decides immediately', async () => {
    const onDecide = vi.fn();
    render(<DecisionSheet request={request} onDecide={onDecide} onClose={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: '승인' }));
    expect(onDecide).toHaveBeenCalledWith('approve', '');
  });

  it('reject flow requires reason chip or text before confirming', async () => {
    const onDecide = vi.fn();
    render(<DecisionSheet request={request} onDecide={onDecide} onClose={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: '반려' }));
    await userEvent.click(screen.getByRole('button', { name: '비용 초과' }));
    await userEvent.click(screen.getByRole('button', { name: '반려 확정' }));
    expect(onDecide).toHaveBeenCalledWith('reject', '비용 초과');
  });

  it('backdrop tap closes the sheet', async () => {
    const onClose = vi.fn();
    render(<DecisionSheet request={request} onDecide={() => {}} onClose={onClose} />);
    await userEvent.click(screen.getByTestId('sheet-backdrop'));
    expect(onClose).toHaveBeenCalled();
  });

  it('secondary actions decide with revise/ask/cancel vocabulary', async () => {
    const onDecide = vi.fn();
    render(<DecisionSheet request={request} onDecide={onDecide} onClose={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: '보완 요청' }));
    expect(onDecide).toHaveBeenCalledWith('revise', '');
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd workflow && npm run test:ui`
Expected: FAIL — `presets.js` / `DecisionSheet.jsx` 없음

- [ ] **Step 3: 구현**

`workflow/src/lib/presets.js`:

```js
// 프리셋(spend/publish)은 표시 포맷일 뿐이다 — 서버는 유형을 모른다 (스펙 §2).
export function formatPresetHighlight(subjectType, payload = {}) {
  if (subjectType === 'spend') {
    const amount = Number(payload.amount);
    if (!Number.isFinite(amount)) return null;
    const currency = typeof payload.currency === 'string' ? payload.currency.toUpperCase() : '';
    return {
      label: `${currency} ${amount}`.trim(),
      detail: payload.purpose ? String(payload.purpose) : '',
    };
  }
  if (subjectType === 'publish') {
    if (!payload.target) return null;
    return {
      label: `→ ${payload.target}`,
      detail: payload.contentSummary ? String(payload.contentSummary) : '',
    };
  }
  return null;
}
```

`workflow/src/components/DecisionSheet.jsx`:

```jsx
import { useState } from 'react';
import { formatPresetHighlight } from '../lib/presets.js';

const REJECT_REASONS = ['정책 위반', '정보 부족', '비용 초과', '기타'];
const SECONDARY_ACTIONS = [
  ['revise', '보완 요청'],
  ['ask', '질문'],
  ['cancel', '취소'],
];

// 결정 시트: 상세 표시 + 승인/반려. 반려는 사유 칩 + 자유 입력 (본체 터치 반려 시트 패턴 계승).
export default function DecisionSheet({ request, onDecide, onClose }) {
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const highlight = formatPresetHighlight(request.subjectType, request.subject.payload);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <button
        type="button"
        data-testid="sheet-backdrop"
        aria-label="닫기"
        onClick={onClose}
        className="absolute inset-0 bg-black/60"
      />
      <div className="relative w-full max-w-xl rounded-t-2xl bg-slate-900 p-5 pb-8">
        <div className="mb-1 text-[10px] uppercase text-indigo-400">{request.subjectType}</div>
        <h2 className="text-lg font-semibold">{request.subject.title}</h2>
        {request.subject.summary ? (
          <p className="mt-1 text-sm text-slate-400">{request.subject.summary}</p>
        ) : null}
        {highlight ? (
          <div className="mt-3 rounded-lg bg-slate-800 px-3 py-2">
            <div className="text-base font-bold">{highlight.label}</div>
            {highlight.detail ? <div className="text-xs text-slate-400">{highlight.detail}</div> : null}
          </div>
        ) : null}
        <pre className="mt-3 max-h-32 overflow-auto rounded bg-slate-950 p-2 text-xs text-slate-400">
          {JSON.stringify(request.subject.payload, null, 2)}
        </pre>
        <div className="mt-2 text-xs text-slate-500">요청자: {request.actorId}</div>

        {rejecting ? (
          <div className="mt-4">
            <div className="flex flex-wrap gap-2">
              {REJECT_REASONS.map((chip) => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => setReason(chip)}
                  className={`min-h-[44px] rounded-full px-4 text-sm transition active:scale-95 ${
                    reason === chip ? 'bg-rose-600 text-white' : 'bg-slate-800 text-slate-300'
                  }`}
                >
                  {chip}
                </button>
              ))}
            </div>
            <input
              type="text"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="반려 사유 직접 입력"
              className="mt-3 w-full rounded-lg bg-slate-800 px-3 py-3 text-sm"
            />
            <button
              type="button"
              disabled={!reason.trim()}
              onClick={() => onDecide('reject', reason.trim())}
              className="mt-3 min-h-[44px] w-full rounded-xl bg-rose-600 font-semibold transition active:scale-95 disabled:opacity-40"
            >
              반려 확정
            </button>
          </div>
        ) : (
          <>
            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={() => onDecide('approve', '')}
                className="min-h-[44px] flex-1 rounded-xl bg-emerald-600 font-semibold transition active:scale-95"
              >
                승인
              </button>
              <button
                type="button"
                onClick={() => setRejecting(true)}
                className="min-h-[44px] flex-1 rounded-xl bg-rose-600/80 font-semibold transition active:scale-95"
              >
                반려
              </button>
            </div>
            {/* 보조 액션 (스펙 §4): revise / ask / cancel */}
            <div className="mt-3 flex gap-2">
              {SECONDARY_ACTIONS.map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => onDecide(value, '')}
                  className="min-h-[44px] flex-1 rounded-lg bg-slate-800 text-xs text-slate-300 transition active:scale-95"
                >
                  {label}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
```

`workflow/src/App.jsx` 수정 — import에 `DecisionSheet`와 `decideRequest` 추가:

```jsx
import DecisionSheet from './components/DecisionSheet.jsx';
import { WS_URL, decideRequest, fetchPendingRequests } from './lib/api.js';
```

`selected` 표시용 임시 블록(`{selected ? (<div className="px-4 ...">...</div>) : null}`)을 아래로 교체:

```jsx
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
```

- [ ] **Step 4: 통과 확인**

Run: `cd workflow && npm run test:ui`
Expected: PASS (누적 UI 12 tests)

- [ ] **Step 5: 커밋**

```bash
git add workflow/src/lib/presets.js workflow/src/lib/presets.test.js workflow/src/components/DecisionSheet.jsx workflow/src/components/DecisionSheet.test.jsx workflow/src/App.jsx
git commit -m "feat(workflow): decision sheet with approve/reject and preset formats

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 9: 이력 패널 + 루트 통합 (CI/README/문서)

**Files:**
- Create: `workflow/src/components/HistoryPanel.jsx`
- Modify: `workflow/src/App.jsx` (이력 토글)
- Create: `docs/maestro-workflow/README.md`
- Modify: `.github/workflows/qa-gate.yml` (workflow 잡 추가 — 경계 예외 1)
- Modify: `README.md` (Harmony 섹션 — 경계 예외 2)
- Modify: `.gitignore` (스토어 파일 — 경계 예외 3)
- Test: `workflow/src/components/HistoryPanel.test.jsx`

**Interfaces:**
- Consumes: `api.js`의 `fetchHistory`, 서버 `GET /api/history` entry 형태(Task 6)
- Produces: `HistoryPanel` props: `{entries:entry[]}` — 결정 원장 리스트(누가·무엇을·언제·어떻게·왜), 이벤트별 한국어 라벨

- [ ] **Step 1: 실패하는 테스트 작성**

`workflow/src/components/HistoryPanel.test.jsx`:

```jsx
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import HistoryPanel from './HistoryPanel.jsx';

const entries = [
  {
    id: 'hist_2',
    timestamp: '2026-07-31T10:00:00.000Z',
    event: 'DECIDED',
    requestId: 'dcr_1',
    actorId: 'agent_a',
    subjectType: 'spend',
    title: 'API 크레딧 $30 구매',
    decision: 'approve',
    comment: '한도 내',
    decidedBy: 'operator',
  },
  {
    id: 'hist_1',
    timestamp: '2026-07-31T09:59:00.000Z',
    event: 'REQUEST_CREATED',
    requestId: 'dcr_1',
    actorId: 'agent_a',
    subjectType: 'spend',
    title: 'API 크레딧 $30 구매',
    decision: null,
    comment: null,
    decidedBy: null,
  },
];

describe('HistoryPanel', () => {
  it('renders ledger rows with event label, actor, decision and reason', () => {
    render(<HistoryPanel entries={entries} />);
    const rows = screen.getAllByTestId('history-entry');
    expect(rows).toHaveLength(2);
    expect(screen.getByText('결정')).toBeInTheDocument();
    expect(screen.getByText('요청 생성')).toBeInTheDocument();
    expect(screen.getByText(/approve/)).toBeInTheDocument();
    expect(screen.getByText(/한도 내/)).toBeInTheDocument();
    expect(screen.getAllByText(/agent_a/).length).toBeGreaterThan(0);
  });

  it('shows empty state when there are no entries', () => {
    render(<HistoryPanel entries={[]} />);
    expect(screen.getByText('아직 기록된 결정이 없습니다')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd workflow && npm run test:ui`
Expected: FAIL — `HistoryPanel.jsx` 없음

- [ ] **Step 3: 구현 + App 연결**

`workflow/src/components/HistoryPanel.jsx`:

```jsx
const EVENT_LABELS = {
  ACTOR_REGISTERED: '액터 등록',
  ACTOR_REVOKED: '토큰 회수',
  REQUEST_CREATED: '요청 생성',
  DECIDED: '결정',
  ACKNOWLEDGED: '수신 확인',
};

// 결정 원장 뷰: 누가(actorId) · 무엇을(title) · 언제(timestamp) · 어떻게(decision) · 왜(comment).
export default function HistoryPanel({ entries }) {
  if (!entries.length) {
    return <div className="p-4 text-sm text-slate-500">아직 기록된 결정이 없습니다</div>;
  }
  return (
    <ul className="divide-y divide-slate-800 p-4">
      {entries.map((entry) => (
        <li key={entry.id} data-testid="history-entry" className="py-2 text-sm">
          <div className="flex items-center gap-2">
            <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px]">
              {EVENT_LABELS[entry.event] || entry.event}
            </span>
            {entry.subjectType ? (
              <span className="text-[10px] uppercase text-indigo-400">{entry.subjectType}</span>
            ) : null}
            <span className="ml-auto text-xs text-slate-500">
              {new Date(entry.timestamp).toLocaleString('ko-KR')}
            </span>
          </div>
          <div className="mt-1">{entry.title || entry.requestId || entry.actorId}</div>
          <div className="text-xs text-slate-400">
            {entry.actorId ? `요청자 ${entry.actorId}` : ''}
            {entry.decision ? ` · ${entry.decision}` : ''}
            {entry.decidedBy ? ` · ${entry.decidedBy}` : ''}
            {entry.comment ? ` · ${entry.comment}` : ''}
          </div>
        </li>
      ))}
    </ul>
  );
}
```

`workflow/src/App.jsx` 수정 — import에 추가:

```jsx
import HistoryPanel from './components/HistoryPanel.jsx';
import { WS_URL, decideRequest, fetchHistory, fetchPendingRequests } from './lib/api.js';
```

상태와 로드 추가 (`const [connected, ...]` 아래):

```jsx
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState([]);
```

`reload` 콜백을 이력 포함으로 교체:

```jsx
  const reload = useCallback(() => {
    fetchPendingRequests().then(setRequests).catch(() => setRequests([]));
    fetchHistory().then(setHistory).catch(() => setHistory([]));
  }, []);
```

WS `onmessage`의 조건에 `WORKFLOW_HISTORY_APPEND` 추가:

```jsx
        if (
          data.type === 'WORKFLOW_REQUEST_CREATED'
          || data.type === 'WORKFLOW_DECIDED'
          || data.type === 'WORKFLOW_HISTORY_APPEND'
        ) {
          reload();
        }
```

헤더에 토글 버튼 추가 (연결 상태 span 앞):

```jsx
        <button
          type="button"
          onClick={() => setShowHistory((value) => !value)}
          className="min-h-[44px] rounded-lg bg-slate-800 px-4 text-sm transition active:scale-95"
        >
          {showHistory ? '보드' : '이력'}
        </button>
```

본문 렌더를 토글로 교체:

```jsx
      {showHistory ? (
        <HistoryPanel entries={history} />
      ) : (
        <ChannelBoard requests={requests} onSelect={setSelected} />
      )}
```

- [ ] **Step 4: UI + 서버 전체 통과 확인**

Run: `cd workflow && npm test`
Expected: PASS (서버 13 + UI 14)

- [ ] **Step 5: 루트 통합 — CI 잡, README, .gitignore, 전용 문서**

`.github/workflows/qa-gate.yml`의 `e2e` 잡 뒤에 추가 (들여쓰기 주의 — 최상위 `jobs:` 아래):

```yaml
  workflow-app:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install workflow dependencies
        run: npm ci --prefix workflow

      - name: Run workflow tests
        run: npm test --prefix workflow
```

루트 `README.md` — `## 컨셉 (Concept)` 섹션 앞에 추가:

```markdown
## Maestro Harmony 제품군

이 레포는 **Maestro Harmony** 제품군의 본진입니다. 세 앱은 역할이 나뉩니다 — **결정을 만들고(Coding) / 기록하고(Workflow) / 재생한다(Player)**.

| 앱 | 위치 | 역할 |
|---|---|---|
| **Maestro Coding** | 레포 루트 (본체) | AI 에이전트 코드 변경의 승인·머지 실행 |
| **Maestro Workflow** | [`workflow/`](workflow/) | 범용 승인·결정·이력 (record-only, 포트 8090) |
| **Maestro Player** | `player/` (전용 브랜치) | 완료된 활동의 리듬게임·악보 재생 |

Workflow의 비전은 [`docs/vision/2026-07-21-universal-approval-record-service.md`](docs/vision/2026-07-21-universal-approval-record-service.md), 설계는 [`docs/superpowers/specs/2026-07-31-maestro-workflow-subapp-design.md`](docs/superpowers/specs/2026-07-31-maestro-workflow-subapp-design.md)를 참고하세요.
```

루트 `.gitignore`에 1줄 추가:

```
.maestro-workflow-*.json
```

`docs/maestro-workflow/README.md`:

```markdown
# Maestro Workflow 문서

Maestro Harmony 제품군의 범용 승인·결정·이력 앱. 구현은 [`workflow/`](../../workflow/)에서만 진행한다.

- 설계 스펙: [`../superpowers/specs/2026-07-31-maestro-workflow-subapp-design.md`](../superpowers/specs/2026-07-31-maestro-workflow-subapp-design.md)
- 상위 비전: [`../vision/2026-07-21-universal-approval-record-service.md`](../vision/2026-07-21-universal-approval-record-service.md)
- 구현 계획: [`../superpowers/plans/2026-07-31-maestro-workflow-subapp.md`](../superpowers/plans/2026-07-31-maestro-workflow-subapp.md)

## MVP 범위 요약

- Actor 등록 + per-actor 토큰 (sha256 해시 저장, 엄격 모드 전용)
- `subjectType` 자유 문자열의 DecisionRequest + record-only Decision (`executorAction=none`)
- Pull + ack 전달, append-only 이력, 파일 영속화(재시작 복구)
- 레인(결정 채널) 대시보드: 승인/반려 시트, 프리셋(spend/publish) 표시, 이력 뷰
- 범위 밖: Policy/자동승인, Delegation, 에이전트 decider, executor 실행, 다중 운영자
```

- [ ] **Step 6: 본체 무회귀 확인 + 최종 게이트**

Run: `npm run qa` (레포 루트) 그리고 `npm test --prefix workflow`
Expected: 둘 다 PASS — 본체 diff는 `qa-gate.yml`/`README.md`/`.gitignore` 3개 파일뿐임을 `git status`로 확인

- [ ] **Step 7: 커밋**

```bash
git add workflow/src/components/HistoryPanel.jsx workflow/src/components/HistoryPanel.test.jsx workflow/src/App.jsx docs/maestro-workflow/README.md .github/workflows/qa-gate.yml README.md .gitignore
git commit -m "feat(workflow): history ledger panel + root CI/README integration

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## 완료 후

1. `superpowers:requesting-code-review` 스킬로 스펙 §7 성공 기준 대비 검증
2. PR 생성 (`feat/maestro-workflow-foundation` → `main`), CI(qa + e2e + workflow-app) 통과 확인
3. 후속 스펙 후보 (이 계획 범위 밖): Policy/조건부 자동승인 일반화, Delegation, 에이전트 decider 경로
