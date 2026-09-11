# Running the test program locally

GitHub Actions on this account can be billing-blocked. Treat local runs as the
gate.

## Prerequisites

- Node 22.23.x / pnpm 9.15.x
- Docker (Postgres on **5433**, buildsvc on **8787**)
- Java 21 for the Firebase Auth emulator (`pnpm dev:emulators`)
- Playwright browsers: `pnpm --filter @vitae/e2e exec playwright install`

## The whole gate, in one command

```bash
./scripts/ci-local.sh            # the gates that need no Docker
./scripts/ci-local.sh --full     # adds the image builds and e2e
./scripts/ci-local.sh --quick    # the subset that needs no Postgres or build
```

This mirrors `.github/workflows/ci.yml` on isolated ports (API 4010, web 5183,
buildsvc 8797) against its own `vitae_e2e` database, so it will not disturb a
running dev stack or the development data. Everything below is the same program
taken a piece at a time.

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
pnpm test:performance  # web bundle budgets (warn if dist missing) + productivity chunk/matrix/query budgets (missing dist fails)
pnpm test:all          # map + prose + public-data + unit + web + a11y + budgets
```

## Stacked e2e

```bash
pnpm dev:db
pnpm dev:emulators     # separate terminal
pnpm buildsvc:up
pnpm seed              # the real data space
pnpm seed:demo         # the demo space; eight specs sign in there and fail without it
pnpm docs:build        # compiles docs/.compiled; without it the API answers 503
                       # and the nineteen cases in docs.spec.ts fail
pnpm dev               # API :4000 + web :5173
pnpm e2e
pnpm test:visual
# After intentional marketing/auth UI changes, refresh baselines and review PNGs:
# pnpm --filter @vitae/e2e exec playwright test visual-baselines --update-snapshots
# Optional broader browsers (install first):
# pnpm --filter @vitae/e2e exec playwright install firefox webkit
# VITAE_E2E_BROWSERS=all pnpm e2e
```

`seed` and `seed:demo` truncate before they write. They are meant for a scratch
database; point `DATABASE_URL` somewhere disposable, or use `ci-local.sh`, which
keeps its own. `seed:productivity-perf` writes 10,000 task nodes and refuses
the default `vitae` / `vitae_test` databases; it needs a dedicated
`DATABASE_URL` and `VITAE_PRODUCTIVITY_PERF_CONFIRM=YES`.

## Artifacts

- Vitest coverage: `coverage/` (per package when `test:coverage` runs)
- Playwright: `e2e/playwright-report/`, plus a trace, a video and a screenshot
  for every failure, and `e2e/test-results/junit.xml`. These are written on every
  run, not only under CI, because a billing-blocked pipeline makes the local run
  the only place the evidence exists. Open a trace with
  `pnpm --filter @vitae/e2e exec playwright show-trace <path>`

## Notes

- API tests provision `vitae_test` in `apps/api/vitest.global-setup.ts`. They
  use Postgres; Firebase's local emulator is for Auth only.
- Prefer `@vitae/testkit` factories for new fixtures so payloads stay schema-valid.
- Mutation (`pnpm test:mutation`) runs Stryker against a focused core mutate set;
  HTML report lands in `packages/core/reports/mutation/`. Break threshold is 60;
  expand the mutate list as suite time allows.
- E2E fixture helpers send `x-vitae-space` from the page's `vitae.space` key.
- Visual baselines (landing + sign-in, Chromium desktop) run with `pnpm e2e` /
  `pnpm test:visual`. Baselines are per project and per platform by
  construction, and only `chromium-linux` is committed, so
  `VITAE_E2E_BROWSERS=all` runs the visual spec on Chromium alone and the rest
  of the suite on all four. Authenticated DAST and mutation remain local and
  opt-in; security / resilience / performance scripts are real.
- The suite runs with `TZ=UTC` and `timezoneId: 'UTC'` so the fixtures, the
  browser and the specs' own date arithmetic agree. `VITAE_E2E_TZ` moves all
  three together if another zone ever needs testing.
