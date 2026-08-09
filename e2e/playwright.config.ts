import { defineConfig, devices, type Project } from '@playwright/test';

/**
 * E2E config. Assumes the full stack is already running:
 *   pnpm dev:emulators · pnpm dev · pnpm seed
 * (CI starts them explicitly). Tests drive the real SPA against the real API +
 * Auth emulator + Postgres.
 *
 * Browsers: Chromium by default. Set VITAE_E2E_BROWSERS=all for
 * Chromium + Firefox + WebKit + Pixel 7 (install those browsers first).
 */
const allBrowsers = process.env.VITAE_E2E_BROWSERS === 'all';

const projects: Project[] = [
  { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
];

if (allBrowsers) {
  projects.push(
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    { name: 'mobile-chrome', use: { ...devices['Pixel 7'] } },
  );
}

export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  fullyParallel: false,
  // Journeys share one test data space and intentionally mutate the same graph.
  // Parallel files race on drafts/search indexes and can starve the single API
  // process during PDF compiles, producing non-product flakiness.
  workers: 1,
  // One retry in CI: the stack is real (Auth emulator + API + Tectonic), and a single
  // cold-start hiccup should not fail the gate. Zero locally, where a flake is a
  // signal worth looking at.
  retries: process.env.CI ? 1 : 0,
  // CI uploads the HTML report + traces as an artifact (FR-007), so a failed
  // journey is debuggable without re-running the pipeline.
  reporter: process.env.CI
    ? [['list'], ['html', { open: 'never' }], ['junit', { outputFile: 'test-results/junit.xml' }]]
    : [['list']],
  use: {
    // 5173 is the documented dev port; E2E_BASE_URL overrides it for the case
    // where something else already owns that port and web runs elsewhere.
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: process.env.CI ? 'retain-on-failure' : 'off',
  },
  projects,
});
