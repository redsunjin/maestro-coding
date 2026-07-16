import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:4175',
    headless: true,
    // Desktop width so the header keeps panel toggles inline (they collapse
    // into an overflow menu below 1480px).
    viewport: { width: 1600, height: 900 },
  },
  webServer: {
    command: 'VITE_WS_URL=ws://127.0.0.1:18080 npm run dev -- --host 127.0.0.1 --port 4175',
    url: 'http://127.0.0.1:4175',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
