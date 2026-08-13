# Player iOS 런처 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Coding 앱(`kr.selim.maestro`)과 동일한 iOS 설치 안에, Player(공개 URL 리플레이)로 들어가는 완전히 분리된 화면 트리를 추가한다. 진입은 얇은 정적 런처 화면이 담당한다.

**Architecture:** 루트 앱(`src/`)과 `player/`는 지금처럼 독립된 Vite 빌드를 유지한다. 새 스크립트 `scripts/build-ios-shell.mjs`가 두 빌드 결과물을 `dist-ios-shell/coding/`, `dist-ios-shell/player/`로 나란히 배치하고, 정적 런처(`ios/launcher/`)를 `dist-ios-shell/index.html`로 복사한다. `capacitor.config.json`의 `webDir`을 `dist-ios-shell`로 바꿔 `cap sync ios`가 이 합쳐진 셸을 그대로 iOS 웹뷰에 반영한다. 각 서브앱 헤더에는 네이티브 셸에서만 보이는 "⇄ 전환" 버튼을 추가해 런처로 돌아갈 수 있게 한다.

**Tech Stack:** Vite(프로그래매틱 `build()` API), 순수 ESM 스크립트(Node 20), React(각 서브앱 헤더 컴포넌트), Vitest+jsdom(UI 테스트), `node:test`(스크립트/정적 파일 테스트), Capacitor(iOS 셸).

## Global Constraints

- `player/`는 자체 `package.json`/빌드/테스트를 유지하고 루트 앱(`src/`, `tests/`, `maestro-server.js`)을 import하지 않는다. 루트 앱도 `player/` 코드를 import하지 않는다 — 산출물(정적 파일) 레벨에서만 결합한다.
- Player의 iOS 모드는 **공개 URL 모드만** 노출한다. Local Repo / Connected Account 모드는 비범위.
- 기존 웹 배포(GH Pages, 루트 앱 base `/maestro-coding/`)와 Chrome 확장(`player/extension/`)은 이 작업으로 변경되지 않는다.
- 홈 화면 앱 아이콘은 신규 제작하지 않고 현재 것을 유지한다. `Info.plist`의 `CFBundleDisplayName`도 "Maestro" 그대로 유지한다.
- 전환은 풀 페이지 리로드다(SPA 라우팅 통합 아님) — 전환 시 각 서브앱의 내부 상태는 초기화된다.

---

## Task 1: `dist-ios-shell/` 빌드 산출물 gitignore 처리

**Files:**
- Modify: `.gitignore`

**Interfaces:**
- Consumes: 없음
- Produces: 이후 태스크가 생성하는 `dist-ios-shell/` 디렉토리가 git에 추적되지 않음

- [ ] **Step 1: `.gitignore`에 항목 추가**

`.gitignore`의 `dist/` 줄 바로 아래에 다음 줄을 추가한다:

```
dist-ios-shell/
```

- [ ] **Step 2: 확인**

Run: `git check-ignore -v dist-ios-shell/coding/index.html || echo "NOT IGNORED"`
Expected: `.gitignore:<line>:dist-ios-shell/	dist-ios-shell/coding/index.html` (경로가 출력되면 무시 규칙이 걸린 것 — `NOT IGNORED`가 출력되면 실패)

- [ ] **Step 3: Commit**

```bash
git add .gitignore
git commit -m "chore(ios): dist-ios-shell 빌드 산출물 gitignore 처리"
```

---

## Task 2: 런처 순수 로직 (`ios/launcher/launcher.js`)

**Files:**
- Create: `ios/launcher/launcher.js`
- Test: `tests/launcher.test.mjs`

**Interfaces:**
- Consumes: 없음 (순수 함수, `localStorage`류 storage 객체를 인자로 받음 — DOM 의존 없음)
- Produces:
  - `LAST_APP_STORAGE_KEY: string` (값 `'maestro-shell-last-app'`)
  - `getLastApp(storage): 'coding' | 'player' | null`
  - `setLastApp(storage, appId: 'coding' | 'player'): void`
  - `buildLauncherState(lastApp: 'coding' | 'player' | null): { coding: { badge: boolean }, player: { badge: boolean } }`

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/launcher.test.mjs`:

```javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LAST_APP_STORAGE_KEY,
  getLastApp,
  setLastApp,
  buildLauncherState,
} from '../ios/launcher/launcher.js';

function createFakeStorage() {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => { map.set(key, value); },
  };
}

test('LAST_APP_STORAGE_KEY는 maestro- 접두사를 쓴다', () => {
  assert.equal(LAST_APP_STORAGE_KEY, 'maestro-shell-last-app');
});

test('getLastApp은 저장된 값이 없으면 null을 반환한다', () => {
  const storage = createFakeStorage();
  assert.equal(getLastApp(storage), null);
});

test('getLastApp은 coding/player가 아닌 값을 무시한다', () => {
  const storage = createFakeStorage();
  storage.setItem(LAST_APP_STORAGE_KEY, 'garbage');
  assert.equal(getLastApp(storage), null);
});

test('setLastApp으로 저장한 값을 getLastApp이 그대로 읽는다', () => {
  const storage = createFakeStorage();
  setLastApp(storage, 'player');
  assert.equal(getLastApp(storage), 'player');
});

test('buildLauncherState는 마지막 선택에만 배지를 켠다', () => {
  assert.deepEqual(buildLauncherState(null), {
    coding: { badge: false },
    player: { badge: false },
  });
  assert.deepEqual(buildLauncherState('coding'), {
    coding: { badge: true },
    player: { badge: false },
  });
  assert.deepEqual(buildLauncherState('player'), {
    coding: { badge: false },
    player: { badge: true },
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `node --test tests/launcher.test.mjs`
Expected: FAIL — `Cannot find module '../ios/launcher/launcher.js'`

- [ ] **Step 3: 최소 구현 작성**

`ios/launcher/launcher.js`:

```javascript
// iOS 셸 런처의 순수 로직 — DOM 의존 없음, storage 인터페이스(getItem/setItem)만 받는다.
export const LAST_APP_STORAGE_KEY = 'maestro-shell-last-app';

export function getLastApp(storage) {
  const value = storage.getItem(LAST_APP_STORAGE_KEY);
  return value === 'coding' || value === 'player' ? value : null;
}

export function setLastApp(storage, appId) {
  storage.setItem(LAST_APP_STORAGE_KEY, appId);
}

export function buildLauncherState(lastApp) {
  return {
    coding: { badge: lastApp === 'coding' },
    player: { badge: lastApp === 'player' },
  };
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `node --test tests/launcher.test.mjs`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add ios/launcher/launcher.js tests/launcher.test.mjs
git commit -m "feat(ios): 런처 순수 로직(마지막 선택 저장/조회)"
```

---

## Task 3: 런처 정적 페이지 (`ios/launcher/index.html`)

**Files:**
- Create: `ios/launcher/index.html`
- Test: `tests/launcher.test.mjs` (Task 2 파일에 케이스 추가)

**Interfaces:**
- Consumes: Task 2의 `LAST_APP_STORAGE_KEY`, `getLastApp`, `setLastApp`, `buildLauncherState` (`./launcher.js`를 ES module로 import)
- Produces: 정적 HTML 파일 — 이후 Task 4의 빌드 스크립트가 그대로 복사

- [ ] **Step 1: 실패하는 테스트 추가**

`tests/launcher.test.mjs` 파일 맨 위 import 블록에 추가:

```javascript
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
```

그리고 파일 끝에 다음 테스트를 추가:

```javascript
const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');

test('launcher index.html은 Coding/Player 버튼과 launcher.js import를 포함한다', () => {
  const html = readFileSync(resolve(ROOT_DIR, 'ios/launcher/index.html'), 'utf8');
  assert.match(html, /data-app="coding"/);
  assert.match(html, /data-app="player"/);
  assert.match(html, /from\s+['"]\.\/launcher\.js['"]/);
  assert.match(html, /coding\/index\.html/);
  assert.match(html, /player\/index\.html/);
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `node --test tests/launcher.test.mjs`
Expected: FAIL — `ENOENT: no such file or directory ... ios/launcher/index.html`

- [ ] **Step 3: 최소 구현 작성**

`ios/launcher/index.html`:

```html
<!doctype html>
<html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <title>Maestro</title>
    <style>
      :root {
        color-scheme: dark;
      }
      html, body {
        margin: 0;
        height: 100%;
        background: #111827;
        color: #e5e7eb;
        font-family: -apple-system, BlinkMacSystemFont, sans-serif;
      }
      body {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 20px;
        padding: 24px;
        box-sizing: border-box;
      }
      h1 {
        margin: 0 0 8px;
        font-size: 1.4rem;
        font-weight: 700;
      }
      .launcher-buttons {
        display: flex;
        flex-direction: column;
        gap: 14px;
        width: 100%;
        max-width: 320px;
      }
      button.launcher-button {
        position: relative;
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 4px;
        padding: 16px 18px;
        border-radius: 14px;
        border: 1px solid #374151;
        background: rgba(17, 24, 39, 0.7);
        color: #e5e7eb;
        font-size: 1rem;
        font-weight: 600;
        cursor: pointer;
      }
      button.launcher-button[data-app="coding"] {
        border-color: rgba(168, 85, 247, 0.5);
      }
      button.launcher-button[data-app="player"] {
        border-color: rgba(34, 211, 238, 0.5);
      }
      .launcher-button__sub {
        font-size: 0.8rem;
        font-weight: 400;
        color: #9ca3af;
      }
      .launcher-badge {
        position: absolute;
        top: 10px;
        right: 12px;
        font-size: 0.7rem;
        font-weight: 700;
        color: #fbbf24;
      }
      .launcher-badge[hidden] {
        display: none;
      }
    </style>
  </head>
  <body>
    <h1>Maestro</h1>
    <div class="launcher-buttons">
      <button type="button" class="launcher-button" data-app="coding">
        Coding
        <span class="launcher-button__sub">코드 승인 · merge 실행</span>
        <span class="launcher-badge" data-badge="coding" hidden>마지막 사용</span>
      </button>
      <button type="button" class="launcher-button" data-app="player">
        Player
        <span class="launcher-button__sub">완료된 활동 리플레이 (공개 URL)</span>
        <span class="launcher-badge" data-badge="player" hidden>마지막 사용</span>
      </button>
    </div>
    <script type="module">
      import { getLastApp, setLastApp, buildLauncherState } from './launcher.js';

      const state = buildLauncherState(getLastApp(window.localStorage));
      for (const appId of ['coding', 'player']) {
        const badge = document.querySelector(`[data-badge="${appId}"]`);
        badge.hidden = !state[appId].badge;
      }

      for (const button of document.querySelectorAll('.launcher-button')) {
        button.addEventListener('click', () => {
          const appId = button.dataset.app;
          setLastApp(window.localStorage, appId);
          window.location.href = `${appId}/index.html`;
        });
      }
    </script>
  </body>
</html>
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `node --test tests/launcher.test.mjs`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add ios/launcher/index.html tests/launcher.test.mjs
git commit -m "feat(ios): 런처 정적 페이지 (Coding/Player 선택 화면)"
```

---

## Task 4: iOS 셸 빌드 스크립트 + Capacitor 설정 연결

**Files:**
- Create: `scripts/build-ios-shell.mjs`
- Modify: `capacitor.config.json`
- Modify: `package.json` (`ios:build` 스크립트)
- Test: `tests/build-ios-shell.test.mjs`

**Interfaces:**
- Consumes: Task 3의 `ios/launcher/index.html`(+`launcher.js`), 루트 `vite.config.js`, `player/vite.config.js`
- Produces: `dist-ios-shell/{index.html, launcher.js, coding/, player/}` — 이후 `cap sync ios`가 그대로 반영

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/build-ios-shell.test.mjs`:

```javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SHELL_DIR = resolve(ROOT_DIR, 'dist-ios-shell');

test('build-ios-shell.mjs는 coding/player 빌드와 런처를 하나의 셸로 배치한다', { timeout: 120_000 }, () => {
  rmSync(SHELL_DIR, { recursive: true, force: true });

  execFileSync('node', ['scripts/build-ios-shell.mjs'], { cwd: ROOT_DIR, stdio: 'inherit' });

  assert.ok(existsSync(resolve(SHELL_DIR, 'index.html')), '런처 index.html 없음');
  assert.ok(existsSync(resolve(SHELL_DIR, 'launcher.js')), '런처 launcher.js 없음');
  assert.ok(existsSync(resolve(SHELL_DIR, 'coding/index.html')), 'coding 빌드 없음');
  assert.ok(existsSync(resolve(SHELL_DIR, 'player/index.html')), 'player 빌드 없음');

  const codingHtml = readFileSync(resolve(SHELL_DIR, 'coding/index.html'), 'utf8');
  assert.match(codingHtml, /src="\.\/assets\//, 'coding 빌드가 상대 경로(base ./)를 쓰지 않음');

  const playerHtml = readFileSync(resolve(SHELL_DIR, 'player/index.html'), 'utf8');
  assert.match(playerHtml, /src="\.\/assets\//, 'player 빌드가 상대 경로(base ./)를 쓰지 않음');

  rmSync(SHELL_DIR, { recursive: true, force: true });
});

test('capacitor.config.json의 webDir은 dist-ios-shell을 가리킨다', () => {
  const config = JSON.parse(readFileSync(resolve(ROOT_DIR, 'capacitor.config.json'), 'utf8'));
  assert.equal(config.webDir, 'dist-ios-shell');
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `node --test tests/build-ios-shell.test.mjs`
Expected: FAIL — `Cannot find module ... scripts/build-ios-shell.mjs` 및 `webDir` assertion 실패(현재값 `"dist"`)

- [ ] **Step 3: `capacitor.config.json` 수정**

`capacitor.config.json` 전체를 다음으로 교체:

```json
{
  "appId": "kr.selim.maestro",
  "appName": "Maestro",
  "webDir": "dist-ios-shell"
}
```

- [ ] **Step 4: 빌드 스크립트 작성**

`scripts/build-ios-shell.mjs`:

```javascript
#!/usr/bin/env node
// Coding(루트 앱)·Player 정적 빌드 + 런처를 하나의 iOS 웹뷰 셸로 합친다.
// dist-ios-shell/{index.html, launcher.js, coding/, player/}
//   node scripts/build-ios-shell.mjs
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const shellDir = path.join(rootDir, 'dist-ios-shell');
const launcherDir = path.join(rootDir, 'ios/launcher');

rmSync(shellDir, { recursive: true, force: true });
mkdirSync(shellDir, { recursive: true });

await build({
  configFile: path.join(rootDir, 'vite.config.js'),
  base: './',
  logLevel: 'warn',
  build: {
    outDir: path.join(shellDir, 'coding'),
    emptyOutDir: true,
  },
});

await build({
  configFile: path.join(rootDir, 'player/vite.config.js'),
  root: path.join(rootDir, 'player'),
  base: './',
  logLevel: 'warn',
  build: {
    outDir: path.join(shellDir, 'player'),
    emptyOutDir: true,
  },
});

for (const file of ['index.html', 'launcher.js']) {
  const src = path.join(launcherDir, file);
  if (!existsSync(src)) {
    throw new Error(`런처 소스가 없습니다: ${src}`);
  }
  cpSync(src, path.join(shellDir, file));
}

console.log(`iOS 셸 빌드 완료: ${path.relative(rootDir, shellDir)}/{index.html, launcher.js, coding/, player/}`);
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `node --test tests/build-ios-shell.test.mjs`
Expected: PASS (2 tests) — 빌드 2회 실행으로 수십 초 걸릴 수 있음

- [ ] **Step 6: `package.json`의 `ios:build` 갱신**

`package.json`에서:

```json
    "ios:build": "CAPACITOR_BUILD=1 vite build && cap sync ios",
```

를 다음으로 교체:

```json
    "ios:build": "node scripts/build-ios-shell.mjs && cap sync ios",
```

- [ ] **Step 7: Commit**

```bash
git add scripts/build-ios-shell.mjs capacitor.config.json package.json tests/build-ios-shell.test.mjs
git commit -m "feat(ios): coding+player 빌드를 하나의 iOS 셸로 합치는 스크립트"
```

---

## Task 5: Player 네이티브 셸 감지 유틸

**Files:**
- Create: `player/src/lib/nativeShell.js`
- Test: `player/src/lib/nativeShell.test.js`

**Interfaces:**
- Consumes: `window.Capacitor?.isNativePlatform?.()` (전역, 신규 의존성 없음 — 루트 앱 `src/utils/server-address.js`의 `isNativeShell` 패턴과 동일)
- Produces: `isNativeShell(): boolean`

- [ ] **Step 1: 실패하는 테스트 작성**

`player/src/lib/nativeShell.test.js`:

```javascript
import { afterEach, describe, expect, test } from 'vitest';
import { isNativeShell } from './nativeShell.js';

describe('isNativeShell', () => {
  afterEach(() => {
    delete window.Capacitor;
  });

  test('Capacitor 전역이 없으면 false', () => {
    expect(isNativeShell()).toBe(false);
  });

  test('Capacitor.isNativePlatform()이 false면 false', () => {
    window.Capacitor = { isNativePlatform: () => false };
    expect(isNativeShell()).toBe(false);
  });

  test('Capacitor.isNativePlatform()이 true면 true', () => {
    window.Capacitor = { isNativePlatform: () => true };
    expect(isNativeShell()).toBe(true);
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `cd player && npx vitest run src/lib/nativeShell.test.js`
Expected: FAIL — `Cannot find module './nativeShell.js'`

- [ ] **Step 3: 최소 구현 작성**

`player/src/lib/nativeShell.js`:

```javascript
// Capacitor 네이티브 셸(iOS 런처) 감지 — 전역 브릿지만 확인, 신규 의존성 없음.
// 루트 앱 src/utils/server-address.js의 isNativeShell과 동일한 패턴.
export const isNativeShell = () => (
  typeof window !== 'undefined' && window.Capacitor?.isNativePlatform?.() === true
);
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd player && npx vitest run src/lib/nativeShell.test.js`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add player/src/lib/nativeShell.js player/src/lib/nativeShell.test.js
git commit -m "feat(player): 네이티브 셸 감지 유틸"
```

---

## Task 6: Player 헤더에 "전환" 버튼 추가

**Files:**
- Modify: `player/src/App.jsx` (헤더의 `player-hero__controls` 블록, 대략 393-414행)
- Modify: `player/src/styles.css` (`.player-language-switch__button.is-active` 블록 뒤에 추가, 대략 151행)
- Test: `player/src/App.ui.test.jsx` (기존 파일에 케이스 추가)

**Interfaces:**
- Consumes: Task 5의 `isNativeShell()` (`./lib/nativeShell.js`)
- Produces: 없음 (leaf UI)

- [ ] **Step 1: 실패하는 테스트 추가**

`player/src/App.ui.test.jsx`의 `describeIfApp('Player Shell UI', ...)` 블록 안에 케이스 추가 (기존 `afterEach`가 이미 `window.Capacitor`를 정리하지 않으므로, 이 테스트 안에서 직접 정리한다):

```javascript
  test('네이티브 셸에서만 전환 버튼이 보인다', () => {
    window.Capacitor = { isNativePlatform: () => true };
    renderPlayerApp(App);

    expect(screen.getByRole('button', { name: 'Coding으로 전환' })).toBeVisible();

    delete window.Capacitor;
  });

  test('웹/확장 배포(Capacitor 없음)에서는 전환 버튼이 없다', () => {
    renderPlayerApp(App);
    expect(screen.queryByRole('button', { name: 'Coding으로 전환' })).toBeNull();
  });
```

(주의: 클릭 시 `window.location.href` 변경 자체는 jsdom이 실제 네비게이션을
구현하지 않아 — `location`은 재정의도 막혀 있어 — 단위 테스트로 안정적으로
검증할 수 없다. 버튼 노출 조건만 자동화하고, 실제 이동은 Task 8의 실기기
수동 검증에서 확인한다.)

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `cd player && npx vitest run src/App.ui.test.jsx`
Expected: FAIL — `Unable to find role="button" and name "Coding으로 전환"`

- [ ] **Step 3: `styles.css`에 버튼 스타일 추가**

`player/src/styles.css`의 `.player-language-switch__button.is-active { ... }` 블록(대략 148-151행) 바로 뒤에 추가:

```css
.player-switch-app {
  border: 1px solid var(--player-panel-border);
  border-radius: 999px;
  padding: 0.4rem 0.85rem;
  background: rgba(2, 6, 23, 0.4);
  color: var(--player-text-dim);
  font-size: 0.78rem;
  cursor: pointer;
  transition: color 160ms ease, border-color 160ms ease;
}

.player-switch-app:hover {
  color: var(--player-text);
  border-color: var(--player-violet);
}
```

- [ ] **Step 4: `App.jsx` 수정**

import 블록(파일 상단, 다른 `./lib/*` import들 근처)에 추가:

```javascript
import { isNativeShell } from './lib/nativeShell.js';
```

`<div className="player-hero__controls">` 블록(대략 395행) 맨 앞에 버튼 추가:

```jsx
          <div className="player-hero__controls">
            {isNativeShell() && (
              <button
                type="button"
                className="player-switch-app"
                onClick={() => { window.location.href = '../index.html'; }}
              >
                ⇄ Coding으로 전환
              </button>
            )}
            <span className="player-language-switch__label">{copy.languageLabel}</span>
```

(주의: 버튼 `aria-label`은 별도로 두지 않는다 — 버튼 텍스트 자체가 "Coding으로 전환"을 포함해 접근성 이름이 그대로 일치한다.)

- [ ] **Step 5: 테스트 통과 확인**

Run: `cd player && npx vitest run src/App.ui.test.jsx`
Expected: PASS (기존 케이스 포함 전체)

- [ ] **Step 6: Commit**

```bash
git add player/src/App.jsx player/src/styles.css player/src/App.ui.test.jsx
git commit -m "feat(player): 네이티브 셸에서 Coding 전환 버튼 노출"
```

---

## Task 7: Coding(루트) 헤더에 "전환" 버튼 추가

**Files:**
- Modify: `src/components/maestro/MaestroHeader.jsx` (우측 컨트롤 그룹, 대략 392-455행)
- Test: `src/App.native-shell-switch.ui.test.jsx` (신규)

**Interfaces:**
- Consumes: 기존 `isNativeShell` (`../../utils/server-address.js`, 이미 export되어 있음 — 신규 코드 없음)
- Produces: 없음 (leaf UI)

- [ ] **Step 1: 실패하는 테스트 작성**

`src/App.native-shell-switch.ui.test.jsx`:

```javascript
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
```

(주의: 클릭 시 `window.location.href` 변경 자체는 jsdom이 실제 네비게이션을
구현하지 않아 단위 테스트로 안정적으로 검증할 수 없다. 버튼 노출 조건만
자동화하고, 실제 이동은 Task 8의 실기기 수동 검증에서 확인한다.)

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run src/App.native-shell-switch.ui.test.jsx`
Expected: FAIL — `Unable to find role="button" and name "Player로 전환"`

- [ ] **Step 3: `MaestroHeader.jsx` 수정**

import 블록(파일 상단, 2-3행 근처)에 추가:

```javascript
import { isNativeShell } from '../../utils/server-address.js';
```

우측 컨트롤 그룹 `<div className="flex w-full flex-wrap items-center justify-end gap-4 2xl:w-auto">`(대략 392행) 맨 앞에 버튼 추가:

```jsx
        <div className="flex w-full flex-wrap items-center justify-end gap-4 2xl:w-auto">
          {isNativeShell() && (
            <button
              type="button"
              onClick={() => { window.location.href = '../index.html'; }}
              className="maestro-touch-control flex items-center rounded-md border border-gray-700 bg-gray-900/70 px-2 py-1 text-[11px] font-semibold text-gray-300 transition-colors hover:border-cyan-400/50 hover:text-cyan-100"
            >
              ⇄ Player로 전환
            </button>
          )}
          <div className="flex flex-col items-end">
```

(기존 `<div className="flex flex-col items-end">`로 시작하던 "Merged PRs" 블록은 그대로 유지 — 전환 버튼만 그 앞에 추가한다.)

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/App.native-shell-switch.ui.test.jsx`
Expected: PASS (2 tests)

- [ ] **Step 5: 회귀 확인**

Run: `npm run test:ui`
Expected: 기존 UI 테스트 전체 PASS (헤더 구조 변경이 다른 테스트를 깨지 않았는지 확인)

- [ ] **Step 6: Commit**

```bash
git add src/components/maestro/MaestroHeader.jsx src/App.native-shell-switch.ui.test.jsx
git commit -m "feat(ios): Coding 헤더에 Player 전환 버튼 노출"
```

---

## Task 8: 실기기 수동 검증

**Files:** 없음 (검증 전용 태스크)

**Interfaces:**
- Consumes: Task 1-7의 모든 산출물
- Produces: 없음

- [ ] **Step 1: 전체 자동 테스트 재확인**

```bash
npm test
(cd player && npm run qa)
```

Expected: 둘 다 PASS

- [ ] **Step 2: iOS 빌드**

```bash
npm run ios:build
```

Expected: `iOS 셸 빌드 완료: dist-ios-shell/{index.html, launcher.js, coding/, player/}` 출력 후 `cap sync ios` 성공 로그

- [ ] **Step 3: Xcode 빌드 + 아이패드 설치**

이 세션에서 이미 검증한 방식과 동일:

```bash
cd ios/App
xcodebuild build \
  -project App.xcodeproj -scheme App -configuration Debug \
  -destination "id=<아이패드 UDID>" \
  -allowProvisioningUpdates -allowProvisioningDeviceRegistration \
  DEVELOPMENT_TEAM=X34AHRFTK3
xcrun devicectl device install app --device <아이패드 device id> <Debug .app 경로>
xcrun devicectl device process launch --device <아이패드 device id> kr.selim.maestro
```

- [ ] **Step 4: 수동 확인 체크리스트**

1. 앱 실행 시 런처(Coding/Player 버튼)가 먼저 뜨는지.
2. "Coding" 선택 → 기존 기능(서버 주소 설정, 헤더 등) 정상 동작 확인.
3. 헤더의 "⇄ Player로 전환" 클릭 → 런처로 돌아가는지.
4. "Player" 선택 → 공개 GitHub URL 입력 → 리플레이 재생까지 확인.
5. Player 헤더의 "⇄ Coding으로 전환" 클릭 → 런처로 돌아가는지.
6. 런처에서 마지막 선택한 항목에 "마지막 사용" 배지가 뜨는지.

- [ ] **Step 5: 증거 기록**

`docs/maestro-player/goal-roadmap.md` 또는 새 evidence 파일에 스크린샷/확인 결과를 남긴다 (기존 `docs/maestro-player/evidence/` 디렉토리 관례 참고). 이 스텝은 실기기 접근 권한이 있는 사람이 직접 수행한다.
