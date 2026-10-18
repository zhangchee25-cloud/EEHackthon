import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: '**/ui.spec.ts',
  timeout: 60000,
  expect: { timeout: 10000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }], ['json', { outputFile: '../docs/screenshots/ui-refactor/D/playwright-results.json' }]],
  use: {
    channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome',
    headless: true,
    reducedMotion: 'reduce',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1440, height: 900 } } },
    { name: 'tablet', use: { viewport: { width: 768, height: 1024 } } },
    { name: 'mobile', use: { viewport: { width: 375, height: 812 } } },
  ],
  webServer: [
    { command: 'npm run preview', url: 'http://127.0.0.1:4173', reuseExistingServer: !process.env.CI },
    { command: 'npm run test:fixture', url: 'http://127.0.0.1:8011/api/health', reuseExistingServer: !process.env.CI },
    { command: 'npm run preview -- --port 4174', env: { BACKEND_URL: 'http://127.0.0.1:8011' }, url: 'http://127.0.0.1:4174', reuseExistingServer: !process.env.CI },
  ],
});
