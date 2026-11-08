import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end suite. Runs against a real stack (Postgres + backend + this frontend image), started
 * by e2e/docker-compose.e2e.yml, so the tests exercise the actual nginx config, auth flow and
 * API — not mocks. Override the target with E2E_BASE_URL.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 1 : 0,
  workers: 1,
  reporter: process.env['CI'] ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: process.env['E2E_BASE_URL'] ?? 'http://localhost:4280',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    locale: 'es-AR',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
