import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: ['**/*.spec.ts', '**/*.test.ts'],
  timeout: 30_000,
  expect: { timeout: 5000 },
  fullyParallel: true,
  reporter: [['list']],
  use: {
    headless: true,
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3001',
    viewport: { width: 1280, height: 800 },
  },
  // Ensure backend is started for API tests. Reuse existing server if present.
  webServer: {
    command: 'npm run dev',
    cwd: 'backend',
      // wait until the public events endpoint is reachable to consider server ready
      url: (process.env.PLAYWRIGHT_API_BASE || 'http://127.0.0.1:4000') + '/events',
    env: {
      ...process.env,
      ADMIN_BYPASS_TOKEN: process.env.ADMIN_BYPASS_TOKEN,
    },
    reuseExistingServer: true,
    timeout: 120_000,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});
