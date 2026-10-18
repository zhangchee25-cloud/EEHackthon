import { defineConfig } from '@playwright/test';

process.env.UI_FIXTURE_URL = 'http://127.0.0.1:8018';

export default defineConfig({
  testDir: './tests',
  testMatch: ['whiteboard-layout.spec.ts', 'a-workspace.spec.ts', 'ai-board.spec.ts'],
  workers: 1,
  timeout: 90000,
  expect: { timeout: 10000 },
  outputDir: './test-results/whiteboard-layout',
  reporter: [['list'], ['json', { outputFile: './test-results/whiteboard-layout-results.json' }]],
  use: { baseURL: 'http://127.0.0.1:4180', channel: 'chrome', headless: true, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1440, height: 900 } } },
    { name: 'mobile', use: { viewport: { width: 375, height: 812 } } },
  ],
  webServer: [
    { command: `"${process.execPath}" tests/fixture-server.mjs`, env: { FIXTURE_PORT: '8018' }, url: 'http://127.0.0.1:8018/api/health', reuseExistingServer: false },
    { command: `"${process.execPath}" node_modules/vite/bin/vite.js --host 127.0.0.1 --port 4180 --configLoader runner`, env: { BACKEND_URL: 'http://127.0.0.1:8018' }, url: 'http://127.0.0.1:4180', reuseExistingServer: false },
  ],
});
