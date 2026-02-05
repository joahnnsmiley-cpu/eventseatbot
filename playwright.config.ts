import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests',
  timeout: 30_000,
  expect: { timeout: 5000 },
  fullyParallel: true,
  reporter: [['list']],
  use: {
    headless: true,
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3001',
    // Default API base used by API tests (can be overridden via env)
    env: {
      PLAYWRIGHT_API_BASE: process.env.PLAYWRIGHT_API_BASE || 'http://127.0.0.1:4000',
    },
    viewport: { width: 1280, height: 800 },
  },
  // Ensure backend is started for API tests. Reuse existing server if present.
  webServer: {
    command: 'npm run dev',
    cwd: 'backend',
      // wait until the public events endpoint is reachable to consider server ready
      url: (process.env.PLAYWRIGHT_API_BASE || 'http://127.0.0.1:4000') + '/events',
    reuseExistingServer: true,
    timeout: 120_000,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});
