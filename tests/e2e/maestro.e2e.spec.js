import http from 'node:http';
import { test, expect } from '@playwright/test';
import { WebSocketServer } from 'ws';

const WS_PORT = 18080;
const WS_HOST = '127.0.0.1';

let httpServer;
let wss;
const clients = new Set();
const receivedActions = [];
// 리뷰 API 픽스처 — 테스트가 requestId별 응답을 등록한다 (실서버의 /api/requests/:id/review 대역)
const reviewFixturesById = new Map();

function broadcast(payload) {
  const message = JSON.stringify(payload);
  for (const client of clients) {
    if (client.readyState === 1) {
      client.send(message);
    }
  }
}

test.beforeAll(async () => {
  httpServer = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');

    const url = new URL(req.url || '/', `http://${WS_HOST}:${WS_PORT}`);
    const reviewMatch = url.pathname.match(/^\/api\/requests\/([^/]+)\/review$/);
    if (req.method === 'GET' && reviewMatch) {
      const fixture = reviewFixturesById.get(decodeURIComponent(reviewMatch[1]));
      if (!fixture) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'REQUEST_NOT_FOUND' }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(fixture));
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'NOT_FOUND' }));
  });

  wss = new WebSocketServer({ server: httpServer });
  await new Promise((resolve) => httpServer.listen(WS_PORT, WS_HOST, resolve));

  wss.on('connection', (socket) => {
    clients.add(socket);

    socket.on('message', (data) => {
      try {
        receivedActions.push(JSON.parse(data.toString()));
      } catch {
        // ignore malformed payloads in test harness
      }
    });

    socket.on('close', () => {
      clients.delete(socket);
    });
  });
});

test.afterEach(() => {
  receivedActions.length = 0;
  reviewFixturesById.clear();
});

test.afterAll(async () => {
  for (const client of clients) {
    client.close();
  }
  clients.clear();

  if (wss) {
    await new Promise((resolve) => wss.close(resolve));
  }
  if (httpServer) {
    await new Promise((resolve) => httpServer.close(resolve));
  }
});

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.YT = {
      PlayerState: {
        ENDED: 0,
        PLAYING: 1,
        PAUSED: 2,
        CUED: 5,
      },
      Player: class MockYTPlayer {
        constructor(_element, options) {
          this.options = options;
          setTimeout(() => {
            this.options.events?.onReady?.({ target: this });
          }, 0);
        }

        cuePlaylist() {}
        cueVideoById() {}

        loadPlaylist() {
          this.options.events?.onStateChange?.({ data: 1 });
        }

        loadVideoById() {
          this.options.events?.onStateChange?.({ data: 1 });
        }

        pauseVideo() {
          this.options.events?.onStateChange?.({ data: 2 });
        }

        setVolume() {}
        destroy() {}
      },
    };
  });
});

test('approval/reject flow and function bach overlay work end-to-end', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '지휘 시작' }).click();
  await expect(page.getByText('LIVE', { exact: true })).toBeVisible();

  const approveRequestId = `req_e2e_approve_${Date.now()}`;
  broadcast({
    event: 'AGENT_TASK_READY',
    requestId: approveRequestId,
    laneIndex: 1,
    diffSummary: {
      title: 'E2E Approval Note',
      shortDescription: 'approval from e2e',
    },
  });

  await expect(page.getByText('E2E Approval Note')).toBeVisible();
  await page.keyboard.press('d');

  await expect.poll(() => (
    receivedActions.some((action) => action.action === 'APPROVE' && action.requestId === approveRequestId)
  )).toBeTruthy();

  broadcast({ event: 'MERGE_SUCCESS', requestId: approveRequestId });
  await expect(page.getByText('E2E Approval Note')).toHaveCount(0);
  broadcast({
    event: 'HISTORY_APPEND',
    item: {
      id: `hist_e2e_approve_${Date.now()}`,
      timestamp: new Date().toISOString(),
      requestId: approveRequestId,
      projectId: 'proj_b2c',
      laneIndex: 1,
      title: 'E2E Approval Note',
      branchName: 'feature/e2e-approve',
      agentId: 'frontend_agent',
      result: 'APPROVED',
      source: 'manual',
      reason: 'MERGE_SUCCESS',
      autoApproved: false,
    },
  });

  await page.getByRole('button', { name: '롤백 실행' }).click();
  await expect.poll(() => (
    receivedActions.some((action) => action.action === 'UNDO')
  )).toBeTruthy();
  broadcast({ event: 'UNDO_SUCCESS' });
  broadcast({
    event: 'HISTORY_APPEND',
    item: {
      id: `hist_e2e_undo_${Date.now()}`,
      timestamp: new Date().toISOString(),
      requestId: `req_e2e_undo_${Date.now()}`,
      projectId: 'proj_b2c',
      laneIndex: 1,
      title: 'E2E Rollback',
      branchName: 'feature/e2e-undo',
      agentId: 'ops_agent',
      result: 'ROLLBACK',
      source: 'manual',
      reason: 'UNDO_SUCCESS',
      autoApproved: false,
    },
  });

  const rejectRequestId = `req_e2e_reject_${Date.now()}`;
  broadcast({
    event: 'AGENT_TASK_READY',
    requestId: rejectRequestId,
    laneIndex: 1,
    diffSummary: {
      title: 'E2E Reject Note',
      shortDescription: 'reject from e2e',
    },
  });

  await expect(page.getByText('E2E Reject Note')).toBeVisible();
  await page.keyboard.down('Shift');
  await page.keyboard.press('d');
  await page.keyboard.up('Shift');

  // F4: window.prompt 대신 반려 시트가 열린다
  await expect(page.getByTestId('reject-sheet')).toBeVisible();
  await page.getByRole('textbox', { name: '반려 사유 입력' }).fill('e2e reject reason');
  await page.getByRole('button', { name: '반려 확정' }).click();

  await expect.poll(() => (
    receivedActions.some((action) => (
      action.action === 'REJECT'
      && action.requestId === rejectRequestId
      && action.feedback === 'e2e reject reason'
    ))
  )).toBeTruthy();

  broadcast({ event: 'AGENT_RESTARTED', requestId: rejectRequestId });
  await expect(page.getByText('E2E Reject Note')).toHaveCount(0);
  broadcast({
    event: 'HISTORY_APPEND',
    item: {
      id: `hist_e2e_reject_${Date.now()}`,
      timestamp: new Date().toISOString(),
      requestId: rejectRequestId,
      projectId: 'proj_b2c',
      laneIndex: 1,
      title: 'E2E Reject Note',
      branchName: 'feature/e2e-reject',
      agentId: 'frontend_agent',
      result: 'REJECTED',
      source: 'manual',
      reason: 'AGENT_RESTARTED',
      autoApproved: false,
    },
  });

  await page.getByRole('button', { name: '배경음악 재생' }).click();
  await expect(page.getByTestId('function-bach-hz')).toContainText('Hz');

  await page.getByRole('button', { name: '히스토리 패널 토글' }).click();
  await expect(page.getByRole('listitem').filter({ hasText: 'E2E Approval Note' })).toBeVisible();
  await expect(page.getByRole('listitem').filter({ hasText: 'E2E Rollback' })).toBeVisible();
  await expect(page.getByRole('listitem').filter({ hasText: 'E2E Reject Note' })).toBeVisible();

  await page.getByRole('button', { name: '배경음악 채널 설정' }).click();
  await expect(page.getByLabel('유튜브 채널 경로')).toBeVisible();
});

test('native shell hides function bach (capacitor:// origin rejects YouTube embeds)', async ({ page }) => {
  await page.addInitScript(({ wsUrl }) => {
    // Capacitor 네이티브 셸 에뮬레이션 — isNativeShell()이 참조하는 전역 브릿지만 주입
    window.Capacitor = { isNativePlatform: () => true };
    // 저장된 서버 주소가 없으면 네이티브 셸은 서버 설정 패널을 자동 오픈하므로 미리 채운다
    window.localStorage.setItem('maestro.server.ws-url', wsUrl);
  }, { wsUrl: `ws://${WS_HOST}:${WS_PORT}` });

  await page.goto('/');
  await expect(page.getByRole('button', { name: '지휘 시작' })).toBeVisible();

  await expect(page.getByTestId('function-bach-mini')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '배경음악 재생' })).toHaveCount(0);
  // YouTube IFrame API 스크립트 자체를 로드하지 않아야 한다
  await expect(page.locator('script[data-maestro-youtube-api="true"]')).toHaveCount(0);
});

test('server address panel shows current address and passes connection test', async ({ page }) => {
  await page.goto('/');

  await page.getByTestId('server-address-toggle').click();
  await expect(page.getByTestId('server-address-panel')).toBeVisible();

  // VITE_WS_URL env 주입이 런타임 해석 우선순위에서 계속 유효한지 검증
  await expect(page.getByRole('textbox', { name: '서버 주소 입력' })).toHaveValue(`ws://${WS_HOST}:${WS_PORT}`);

  // 테스트 하네스 WSS가 떠 있으므로 실제 성공 경로를 검증한다
  await page.getByRole('button', { name: '연결 테스트' }).click();
  await expect(page.getByTestId('server-address-test-result')).toContainText('연결 성공');

  // Bonjour 발견은 네이티브 셸 전용 — 웹 빌드에는 버튼이 없어야 한다
  await expect(page.getByRole('button', { name: '주변 서버 찾기' })).toHaveCount(0);

  await page.getByRole('button', { name: '닫기' }).click();
  await expect(page.getByTestId('server-address-panel')).toHaveCount(0);
});

test('review sheet shows real diff and approves from the sheet', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '지휘 시작' }).click();
  await expect(page.getByText('LIVE', { exact: true })).toBeVisible();

  const requestId = `req_e2e_review_${Date.now()}`;
  reviewFixturesById.set(requestId, {
    requestId,
    branchName: 'feature/e2e-review',
    baseRef: 'main',
    mergeable: true,
    conflictFiles: [],
    stats: { filesChanged: 1, additions: 5, deletions: 1, truncated: false },
    commits: [
      { sha: 'e2e1234', subject: 'feat: e2e review commit', author: 'e2e', date: new Date().toISOString() },
    ],
    files: [
      {
        path: 'src/e2e-review.js',
        status: 'modified',
        additions: 5,
        deletions: 1,
        binary: false,
        patch: '@@ -1 +1,2 @@\n-old-line\n+new-line-from-e2e',
        truncated: false,
      },
    ],
    generatedAt: new Date().toISOString(),
  });

  broadcast({
    event: 'AGENT_TASK_READY',
    requestId,
    laneIndex: 1,
    branchName: 'feature/e2e-review',
    diffSummary: {
      title: 'E2E Review Note',
      shortDescription: 'review from e2e',
    },
  });

  // 노트가 판정선에 정착할 때까지 대기 후 클릭 (낙하 중 클릭 플레이크 방지)
  await expect(page.getByText('E2E Review Note')).toBeVisible();
  await page.waitForTimeout(1600);
  await page.getByText('E2E Review Note').click();

  await expect(page.getByTestId('review-merge-badge')).toContainText('머지 가능');
  await expect(page.getByText('src/e2e-review.js')).toBeVisible();
  await expect(page.getByText('+new-line-from-e2e')).toBeVisible();
  await expect(page.getByText('feat: e2e review commit')).toBeVisible();

  await page.getByRole('button', { name: '리뷰 승인' }).click();
  await expect.poll(() => (
    receivedActions.some((action) => action.action === 'APPROVE' && action.requestId === requestId)
  )).toBeTruthy();

  broadcast({ event: 'MERGE_SUCCESS', requestId });
  await expect(page.getByText('E2E Review Note')).toHaveCount(0);
});

test('PWA manifest and apple meta tags are wired for standalone install', async ({ page }) => {
  await page.goto('/');

  const manifestHref = await page.locator('link[rel="manifest"]').getAttribute('href');
  expect(manifestHref).toBeTruthy();
  const manifestResponse = await page.request.get(new URL(manifestHref, page.url()).toString());
  expect(manifestResponse.ok()).toBeTruthy();
  const manifest = await manifestResponse.json();
  expect(manifest.display).toBe('standalone');
  expect(manifest.icons.length).toBeGreaterThanOrEqual(2);

  await expect(page.locator('meta[name="apple-mobile-web-app-capable"]')).toHaveAttribute('content', 'yes');

  const appleIconHref = await page.locator('link[rel="apple-touch-icon"]').getAttribute('href');
  expect(appleIconHref).toBeTruthy();
  const iconResponse = await page.request.get(new URL(appleIconHref, page.url()).toString());
  expect(iconResponse.ok()).toBeTruthy();
});
