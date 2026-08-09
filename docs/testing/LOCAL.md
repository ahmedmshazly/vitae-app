# Running the test program locally

GitHub Actions on this account can be billing-blocked. Treat local runs as the
gate.

## Prerequisites

- Node 22.23.x / pnpm 9.15.x
- Docker (Postgres on **5433**, buildsvc on **8787**)
- Java 21 for the Firebase Auth emulator (`pnpm dev:emulators`)
- Playwright browsers: `pnpm --filter @vitae/e2e exec playwright install`

## One-liners

```bash
pnpm install
pnpm test:map          # source ↔ test ownership
pnpm test:prose        # test-file prose gate
pnpm test:unit         # core + testkit (+ property tests in core)
pnpm test:web          # web Vitest (jsdom)
pnpm dev:db            # Postgres + migrations
pnpm test:api          # API integration against vitae_test
pnpm test:contract     # OpenAPI + error-envelope contract suite
pnpm openapi           # regenerate docs/api/openapi.json from apps/api/src/openapi/
pnpm test:coverage     # V8 coverage reports under coverage/
pnpm test:property     # property + metamorphic + golden corpus
pnpm test:mutation     # Stryker on protected core modules (slow)
pnpm buildsvc:up
pnpm e2e               # full stack + seed assumed running (Chromium; includes visual baselines)
pnpm test:visual       # landing + sign-in screenshot contracts (stack must be up)
pnpm test:security     # auth/CSP + HTTP hardening (needs Postgres for hardening)
pnpm test:resilience   # buildsvc offline + readiness fail-closed
pnpm test:performance  # web bundle budgets (warns if dist missing)
pnpm test:all          # map + prose + public-data + unit + web + a11y + budgets
```

## Stacked e2e

```bash
pnpm dev:db
pnpm dev:emulators     # separate terminal
pnpm buildsvc:up
pnpm seed
pnpm dev               # API :4000 + web :5173
pnpm e2e
pnpm test:visual
# After intentional marketing/auth UI changes, refresh baselines and review PNGs:
# pnpm --filter @vitae/e2e exec playwright test visual-baselines --update-snapshots
# Optional broader browsers (install first):
# pnpm --filter @vitae/e2e exec playwright install
# VITAE_E2E_BROWSERS=all pnpm e2e
```

## Artifacts

- Vitest coverage: `coverage/` (per package when `test:coverage` runs)
- Playwright: `e2e/playwright-report/`, traces/video on failure, JUnit in CI

## Notes

- API tests provision `vitae_test` in `apps/api/vitest.global-setup.ts`. They
  use Postgres; Firebase's local emulator is for Auth only.
- Prefer `@vitae/testkit` factories for new fixtures so payloads stay schema-valid.
- Mutation (`pnpm test:mutation`) runs Stryker against a focused core mutate set;
  HTML report lands in `packages/core/reports/mutation/`. Break threshold is 60;
  expand the mutate list as suite time allows.
- E2E fixture helpers send `x-vitae-space` from the page's `vitae.space` key.
- Visual baselines (landing + sign-in, Chromium desktop) run with `pnpm e2e` /
  `pnpm test:visual`. Authenticated DAST, multi-browser e2e
  (`VITAE_E2E_BROWSERS=all`), and mutation remain local/opt-in; security /
  resilience / performance scripts are real.
