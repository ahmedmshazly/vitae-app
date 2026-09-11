# Coverage matrix

Owner map for Vitae's test program. Every critical flow and production module
must land in an executable layer below. Update
[`source-test-map.json`](./source-test-map.json) when adding modules; CI runs
`pnpm test:map` to reject unmapped sources.

## Baseline inventory (2026-08-09)

| Area | Production modules | Existing tests |
|------|-------------------:|---------------:|
| `packages/core` | 37 | 32 colocated `*.test.ts` |
| `apps/api` (non-scripts) | 77 | 13 (`*.test.ts` + `__tests__`) |
| `apps/web` | 122 | 36 |
| Playwright e2e | - | 46 specs |
| `@vitae/testkit` | new | unit tests for clock/factories |

The Playwright row was re-measured on 2026-08-25 with
`ls e2e/tests/*.spec.ts | wc -l`; the rest of the table is the 2026-08-09
snapshot.

## Risk classes

| Class | Examples | Required evidence |
|-------|----------|-------------------|
| Critical | auth, space isolation, ownership, retention purge, export/restore, LaTeX escape, HMAC/buildsvc, secrets | unit + integration + negative path; 100% branch on security paths |
| High | schema validate, resume model/render, imports, duplicates merge, search index | unit/property + integration |
| Medium | CRM surfaces, explore/map/timeline, forms, settings | component/integration + happy/empty/error |
| Low | pure type catalogs, token/style files | covered indirectly or by visual/a11y contracts |

## Layer ownership

| Layer | Command | What it proves |
|-------|---------|----------------|
| Unit / property | `pnpm test:unit`, `pnpm test:property` | Pure domain logic and schema invariants |
| Mutation | `pnpm test:mutation` | Assertions kill meaningful mutants in protected modules |
| API integration | `pnpm test:api` | Route → service → repository against `vitae_test` Postgres |
| Contract | `pnpm test:contract` | OpenAPI 3.1 (`docs/api/openapi.json`) + error envelope |
| Web component | `pnpm test:web` | Route/feature states with router/auth/query harness |
| Accessibility | `pnpm test:a11y` | axe + keyboard contracts |
| E2E | `pnpm test:e2e` | Full stack business journeys |
| Visual | `pnpm test:visual` | Screenshot baselines for stable surfaces |
| Security | `pnpm test:security` | Authz, injection, HMAC, header/CORS contracts |
| Performance | `pnpm test:performance` | Web bundle size plus productivity matrix / analytics / chunk / query budgets |
| Resilience | `pnpm test:resilience` | Fault injection and recovery |
| Coverage aggregate | `pnpm test:coverage` | V8 LCOV/HTML with package thresholds |
| Test prose | `pnpm test:prose` | AST check on titles/comments (allow-listed fixtures) |
| Source map | `pnpm test:map` | Every prod module mapped or explicitly excluded |

## Critical SRS / product flows

| Flow | Primary tests (current → target) |
|------|----------------------------------|
| Auth default-deny + verified Google | `apps/api` auth middleware tests → security suite |
| Capture → Today queue | e2e + capture service integration |
| Record / connection lifecycle | e2e forms/connections + API nodes/edges |
| Ownership via subject edges | API resume-scope + subjects service tests |
| Search / filter / switcher | e2e search + core filter property tests |
| Import / dedup / rollback | API import integration + core importers |
| Target → tailor → compile → finalize | e2e resume + API resume/render |
| Export / restore drill | API export + restore services |
| Retention / trash | API retention routes + service |
| Space isolation (`x-vitae-space`) | API integration matrix (every mount) |
| Buildsvc HMAC + offline fallback | buildsvc calibrate + API client seams |

## Core coverage wave (property / metamorphic / golden)

| Suite | Path | What it locks |
|-------|------|----------------|
| Filter property | `algorithms/filter-grammar.property.test.ts` | serialize↔parse round-trip; parse totality |
| Capture property | `algorithms/capture-grammar.property.test.ts` | parseCapture totality; leading keys; date tokens |
| Text property | `algorithms/text.property.test.ts` | normalize idempotence; token/stem/similarity bounds |
| Metamorphic | `algorithms/metamorphic.test.ts` | reorder invariance; dedup symmetry; filter equivalence; latex safety |
| Golden corpus | `fixtures/golden/` | reviewed whoToCall order + dedup verdicts |
| Mutation | `packages/core/stryker.config.json` via `pnpm test:mutation` | protected algorithms/forms/validate |

Coverage thresholds in `packages/core/vitest.config.ts` are ratcheted toward the
program targets (currently 92/85/78 intermediate; measured ~97.8% lines / ~86%
branches / ~93% functions). Goal remains 100/100/98.

Mutation (focused set: latex-escape, capture-grammar, filter-grammar, subjects,
validate) scored **73.31** locally with break threshold 60. Surviving mutants
should be reviewed before widening the mutate list.

## Web coverage wave (harness + route states + a11y)

| Piece | Path |
|-------|------|
| Render harness | `apps/web/src/test/render.tsx` (+ ToastProvider) |
| API mock | `apps/web/src/test/api-mock.ts` |
| Axe helper | `apps/web/src/test/a11y.ts` · `pnpm test:a11y` |
| People states / a11y | `routes/People.test.tsx`, `People.a11y.test.tsx` |
| Orgs states / a11y | `routes/Orgs.test.tsx`, `Orgs.a11y.test.tsx` |
| Today (Dashboard) | `routes/Dashboard.test.tsx` via shared harness |
| Trash / Search states | `Trash.states.test.tsx`, `SearchResults.states.test.tsx` |
| Palette keyboard | `features/QuickSwitcher.test.tsx`, `app/commands.test.ts` |
| Shell + CRM overlays | `Shell`/`Breadcrumb` + `Composer`/`RemindersDrawer`/`QuickAdd`/`InteractionLogger`/`FirstRun`/`GettingStarted` focused suites |
| Forms layer | `SuggestTextInput`/`SuggestTagInput`/`SubjectPicker`/`EntityPicker` + `FieldRenderer`/`KnowsEditor`/`NewNodeButton`/`AddConnection`/`ConnectionRow`/`EdgeSubEditorRow` focused suites |
| Explore chrome | graph prefs/helpers + `GraphPathfinder`/`GraphSearch`/`GraphPeek`/`GraphToolbar`/`GraphDisplayPrefs`; timeline prefs + `TimelineList`/`TimelineReview`/`TimelineToolbar` (canvas/view shells stay e2e) |
| Visual baselines | `e2e/tests/visual-baselines.spec.ts` + committed `*-snapshots/` · `pnpm test:visual` (Chromium desktop landing + sign-in; enforced in e2e) |

Shell, CRM overlays, forms, and explore chrome are `covered`. Remaining medium
deferred web is mostly bulk delete, directory/route pages, map docks/atlas
chrome, canvas/view orchestrators, tailor panes, Entity Observatory, and lib
helpers (~50+).

## API coverage wave (route splits + contracts)

| Suite | Path |
|-------|------|
| Nodes | `routes/v1/nodes.integration.test.ts` |
| Edges | `routes/v1/edges.integration.test.ts` |
| Capture | `routes/v1/capture.integration.test.ts` |
| Auth | `routes/v1/auth.integration.test.ts` |
| Search | `routes/v1/search.integration.test.ts` |
| Retention | `routes/v1/retention.integration.test.ts` |
| Export | `routes/v1/export.integration.test.ts` |
| Resumes (focused) | `routes/v1/resumes.integration.test.ts` |
| Imports / duplicates | `imports.integration.test.ts`, `duplicates.integration.test.ts` |
| Targets / atoms / letters | `targets\|atoms\|letters.integration.test.ts` |
| Dashboard / suggest / interactions | focused route suites |
| Explore / views / settings | `explore\|views\|settings.integration.test.ts` |
| Restore corruption | `services/restore.integration.test.ts` |
| Space | `db/space.integration.test.ts` |
| Secrets | `services/secrets.test.ts` |
| Error / request-context | `middleware/error.test.ts`, `middleware/request-context.test.ts` |
| Error envelope contract | `__tests__/contracts/error-envelope.contract.test.ts` |
| OpenAPI contract | `__tests__/contracts/openapi.contract.test.ts` - mount inventory + drift vs `docs/api/openapi.json` (`pnpm openapi` / `pnpm test:contract`) |
| Thin CRM/ops routes | `ask\|composer\|favors\|habits\|intros\|orgs\|people\|places\|reminders\|status.integration.test.ts` |
| Shared helper | `__tests__/helpers/app.ts` (`ensureSelfPerson`, `createKnowsPerson`) + `@vitae/testkit` factories |

High-risk API modules and the monolith-backed route-split wave are `covered`.
OpenAPI phase 1 documents paths/methods/auth/shared Error (+ detailed critical
writes); deep per-response schemas for every endpoint are deferred.
Thin CRM/ops routes (ask, composer, favors, habits, intros, orgs, people,
places, reminders, status) have focused integration suites - **API route
deferred count is 0**.

## E2E coverage wave (space-aware fixtures + negatives + browsers)

| Piece | Path |
|-------|------|
| Space-aware API helper | `e2e/tests/helpers/api.ts` (`x-vitae-space` from page) |
| Fixtures | `e2e/tests/helpers/fixtures.ts` (uses api helper) |
| Negative journeys | `e2e/tests/negative.spec.ts` (401, bad bearer, invalid filter, demo/real isolation) |
| Multi-browser | `e2e/playwright.config.ts` - Chromium default; `VITAE_E2E_BROWSERS=all` adds Firefox, WebKit, Pixel 7 |
| Visual | `visual-baselines.spec.ts` - Chromium desktop landing + sign-in (always on) |

Arbitrary per-spec Postgres spaces are not a product feature (space is only
`real` \| `demo`); isolation is stamped fixture data + space header fidelity +
the demo/real leakage test.

## Non-functional wave (security · resilience · budgets)

| Piece | Command / path |
|-------|----------------|
| Security suite | `pnpm test:security` - HTTP hardening + auth/CSP unit tests |
| Resilience | `pnpm test:resilience` - buildsvc offline/HMAC + readiness fail-closed |
| Performance budgets | `pnpm test:performance` - `docs/testing/web-budgets.json` vs `apps/web/dist` |
| Authenticated DAST | still deferred (needs ephemeral stack job) |

## Writing policy for tests

- Titles: condition + observable result, present tense, no filler.
- Comments: durable intent, invariant, or non-obvious fixture choice only.
- Never bulk-strip typographic dashes. The checker already blanks the shapes
  that earn one: the UI empty glyph alone in its literal, an en dash spanning a
  range, and a regular-expression character class. A fixture that genuinely
  needs the character says so with a `prose-gate:` comment and a reason.
- Checker: `pnpm test:prose`, over source, tests and docs alike.

## CI gates (every PR)

| Job | Layers |
|-----|--------|
| quality | typecheck, lint, `test:map`, `test:prose`, unit, property, web, a11y, auth/CSP security unit, buildsvc resilience unit |
| build | production build, **web budgets** (`VITAE_REQUIRE_BUDGETS=true`), digest-pin guard, API image + Trivy, SBOM |
| api-integration | full `pnpm test:api` (includes security hardening + readiness resilience + contracts) |
| latex-calibration | buildsvc calibrate + Trivy |
| e2e | Playwright Chromium journeys (includes `negative.spec.ts` when the suite runs) |

Still opt-in locally: `VITAE_E2E_BROWSERS=all`, authenticated DAST, mutation (`pnpm test:mutation`). Authenticated / multi-browser visual screenshots remain deferred.

## Local reproduction

See [LOCAL.md](./LOCAL.md).
