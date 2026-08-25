import { defineConfig, devices, type Project } from '@playwright/test';

/**
 * E2E config. Assumes the full stack is already running:
 *   pnpm dev:emulators · pnpm dev · pnpm seed · pnpm seed:demo · pnpm docs:build
 * (CI and scripts/ci-local.sh start them explicitly). Tests drive the real SPA
 * against the real API + Auth emulator + Postgres + Tectonic.
 *
 * Browsers: Chromium by default. Set VITAE_E2E_BROWSERS=all for
 * Chromium + Firefox + WebKit + Pixel 7 (install those browsers first).
 */

/**
 * One clock for the whole run.
 *
 * Three things used to disagree. Fixture requests hardcode `x-vitae-tz: UTC`
 * (tests/helpers/api.ts), the SPA sends whatever zone the machine is in
 * (apps/web/src/lib/api.ts), and the specs' own date arithmetic runs in the
 * Node process's zone. On a host at UTC+3 a record the fixture stamps for
 * "today" is yesterday's row on the screen for three hours out of every
 * twenty-four, which fails locally and never in CI. Pinning the runner here,
 * before any spec module reads the clock, and the browser below, makes all
 * three agree. VITAE_E2E_TZ moves both together if a zone ever needs testing.
 */
const TIMEZONE = process.env.VITAE_E2E_TZ ?? 'UTC';
process.env.TZ = TIMEZONE;

const allBrowsers = process.env.VITAE_E2E_BROWSERS === 'all';

/**
 * Screenshot baselines are committed for chromium-linux only, and a baseline is
 * per project by construction: Playwright names them `<snapshot>-<project>-<platform>.png`.
 * Running the visual spec on the other three projects would compare against
 * files that do not exist, so it stays where its baselines are.
 */
const VISUAL_BASELINES = /visual-baselines\.spec\.ts/;

const projects: Project[] = [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }];

if (allBrowsers) {
  projects.push(
    { name: 'firefox', use: { ...devices['Desktop Firefox'] }, testIgnore: VISUAL_BASELINES },
    { name: 'webkit', use: { ...devices['Desktop Safari'] }, testIgnore: VISUAL_BASELINES },
    { name: 'mobile-chrome', use: { ...devices['Pixel 7'] }, testIgnore: VISUAL_BASELINES },
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
  // A committed `test.only` narrows the run to a single test and still reports
  // success, which is the one way a green gate can be a lie. Refuse it. Set
  // VITAE_E2E_FOCUS=1 for a deliberate local debugging run; `no-focused-test`
  // in eslint.config.js catches it on the way in either way.
  forbidOnly: !process.env.VITAE_E2E_FOCUS,
  // Most explicit waits in the suite pass 10s or 15s because a real API, a real
  // Auth emulator and a real LaTeX compile sit behind them. Playwright's 5s
  // default was the odd one out, and an assertion that gives up in 5s against
  // this stack reports a product failure that is really a budget failure.
  expect: { timeout: 10_000 },
  // The CI job is capped at 45 minutes. Stop a little short of it so a hung
  // serial suite is reported by the runner, with its partial results, instead of
  // being killed by the job with none.
  globalTimeout: 40 * 60_000,
  // One retry in CI: the stack is real (Auth emulator + API + Tectonic), and a single
  // cold-start hiccup should not fail the gate. Zero locally, where a flake is a
  // signal worth looking at.
  retries: process.env.CI ? 1 : 0,
  // Artifacts are unconditional. GitHub Actions on this account can be
  // billing-blocked, so docs/testing/LOCAL.md names local runs as the gate, and
  // a gate that discards its own evidence cannot be debugged. Everything below
  // lands in playwright-report/ and test-results/, both gitignored.
  reporter: [
    ['list'],
    ['html', { open: 'never' }],
    ['junit', { outputFile: 'test-results/junit.xml' }],
  ],
  // The suite is serial, so its wall clock is the sum of its parts. Name the
  // files that dominate it.
  reportSlowTests: { max: 10, threshold: 20_000 },
  use: {
    // 5173 is the documented dev port; E2E_BASE_URL overrides it for the case
    // where something else already owns that port and web runs elsewhere.
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:5173',
    // The browser half of the single clock described above. Locale is pinned for
    // the same reason: product copy and the specs both assume en-US formatting.
    timezoneId: TIMEZONE,
    locale: 'en-US',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects,
});
