import { defineConfig, devices } from '@playwright/test';

/**
 * Cloud mode runs as a separate suite, and has to.
 *
 * Turning `VITAE_CLOUD_ENABLED=true` on breaks roughly a quarter of
 * `e2e/tests/` by design: `apps/api/src/db/space.ts` stops reading the
 * `x-vitae-space` header, so every `signInDemo` spec silently reads the real
 * graph while the banner still claims otherwise. That is the worst failure a
 * suite can have, so the two never run in the same process.
 *
 * What does not change is the browser bundle. `cloudEnabled` reaches the SPA
 * from `GET /auth/me` at run time (apps/api/src/routes/v1/auth.ts), not from a
 * `VITE_` flag baked at build time, so this suite drives the same `dist` the
 * default suite does against an API restarted with the flag. The five
 * `VITE_PUBLIC_*` values gate marketing copy and SEO only.
 *
 * Everything else is inherited on purpose: one clock, artifacts on failure,
 * `forbidOnly`, and one worker. See playwright.config.ts for why each.
 */
const TIMEZONE = process.env.VITAE_E2E_TZ ?? 'UTC';
process.env.TZ = TIMEZONE;

export default defineConfig({
  testDir: './cloud',
  timeout: 30_000,
  fullyParallel: false,
  // The suite bootstraps a workspace and moves it through access states. Two
  // files doing that at once would each see the other's transitions.
  workers: 1,
  forbidOnly: !process.env.VITAE_E2E_FOCUS,
  expect: { timeout: 10_000 },
  globalTimeout: 10 * 60_000,
  retries: process.env.CI ? 1 : 0,
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-report-cloud' }],
    ['junit', { outputFile: 'test-results/junit-cloud.xml' }],
  ],
  outputDir: 'test-results-cloud',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:5173',
    timezoneId: TIMEZONE,
    locale: 'en-US',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
