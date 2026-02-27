import { test, expect } from '@playwright/test';
import { WebSocketServer } from 'ws';

const WS_PORT = 18080;
const WS_HOST = '127.0.0.1';

let wss;
const clients = new Set();
const receivedActions = [];

function broadcast(payload) {
  const message = JSON.stringify(payload);
  for (const client of clients) {
    if (client.readyState === 1) {
      client.send(message);
    }
  }
}

test.beforeAll(async () => {
  wss = new WebSocketServer({ port: WS_PORT, host: WS_HOST });
  await new Promise((resolve) => wss.once('listening', resolve));

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
});

test.afterAll(async () => {
  for (const client of clients) {
    client.close();
  }
  clients.clear();

  if (!wss) return;
  await new Promise((resolve) => wss.close(resolve));
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
  await expect(page.getByText('LIVE')).toBeVisible();

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
  page.once('dialog', (dialog) => dialog.accept('e2e reject reason'));
  await page.keyboard.down('Shift');
  await page.keyboard.press('d');
  await page.keyboard.up('Shift');

  await expect.poll(() => (
    receivedActions.some((action) => (
      action.action === 'REJECT'
      && action.requestId === rejectRequestId
      && action.feedback === 'e2e reject reason'
    ))
  )).toBeTruthy();

  broadcast({ event: 'AGENT_RESTARTED', requestId: rejectRequestId });
  await expect(page.getByText('E2E Reject Note')).toHaveCount(0);

  await page.getByRole('button', { name: '배경음악 재생' }).click();
  await expect(page.getByTestId('function-bach-hz')).toContainText('Hz');

  await page.getByRole('button', { name: '배경음악 채널 설정' }).click();
  await expect(page.getByLabel('유튜브 채널 경로')).toBeVisible();
});
