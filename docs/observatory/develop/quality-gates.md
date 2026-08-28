---
id: DEV-GATES
title: The gates a change must pass
summary: Every automated check between a change and main: what it enforces, what it scans, how it fails, how to record an exception, and where the gates do not reach.
audience: [developer, maintainer]
domain: develop
type: reference
status: verified
verified_at: 2026-08-24
sources:
  - package.json
  - .github/workflows/ci.yml
  - eslint.config.js
  - scripts/check-test-coverage-map.mjs
  - scripts/check-test-prose.mjs
  - scripts/check-public-release.mjs
  - scripts/check-brand-bans.mjs
  - scripts/check-web-budgets.mjs
  - scripts/check-docs-pages.mjs
  - scripts/check-docs-diagrams.mjs
  - scripts/check-docs-coverage.mjs
  - scripts/check-docs-generated.mjs
  - scripts/check-docs-traceability.mjs
  - scripts/docs/build-content.mjs
  - apps/web/vite.docs-content.ts
  - scripts/ci-local.sh
  - docs/design/brand-ban-allowlist.json
  - docs/testing/prose-allowlist.json
  - docs/testing/web-budgets.json
  - docs/generated/packages.json
  - docs/generated/tests.json
related: [DEV, DEV-SETUP, DEV-WHERE, DEV-TESTING, DEV-ENDPOINT, DEV-NODETYPE, DEV-TEMPLATE]
---

# The gates a change must pass

Look a gate up here when it has failed, when you are about to add something it
will judge, or when you need to know whether it runs at all. Each entry names
what the gate enforces, what it scans, the shape of its failure, and the only
sanctioned way to record an exception.

Two figures to keep in mind while reading. `pnpm test:all` chains nine gates:
`test:map`, `test:prose`, `test:public`, `test:brand`, `docs:check`,
`test:unit`, `test:web`, `test:a11y`, `test:performance`. And the pipeline has
six jobs, one of which cannot run on this repository at all today.

## The pipeline, job by job

| Job | What it runs |
| --- | --- |
| Dependency review | The dependency-graph compare action, on pull requests only |
| Typecheck · Lint · Unit · A11y · Security | `typecheck`, `lint`, `test:map && test:prose && test:public && test:brand`, `docs:check`, `pnpm audit --audit-level=high`, `test:unit`, `test:property`, `test:web`, `test:a11y` |
| Production build | `pnpm build`, an assertion that the SPA exists, `test:performance` with budgets required, the digest-pin guard, the API image build, a vulnerability scan of that image, and an SPDX bill of materials |
| API integration (Postgres) | `test:contract`, `test:security`, `test:resilience`, then the whole API suite against a Postgres service |
| LaTeX line-model calibration | Builds the compiler image and recompiles the calibration fixtures with the network disabled |
| E2E journeys (Playwright) | The full stack - Postgres, auth emulator, compiler container, API, built web - then the browser suite |

The dependency-review job is conditioned on `github.event.repository.private
== false`. The action it calls needs a licence that is not available to a
private repository under a personal account, so on this repository the job is
skipped on every commit on every branch. The condition arms it the moment the
repository becomes public, and unlike `continue-on-error` it never swallows a
real finding in the meantime. `pnpm audit --audit-level=high` covers the
dependency tree until then.

Every action in the workflow is pinned to a commit SHA rather than a tag,
because a retagged action would otherwise execute in this pipeline with no diff
in this repository.

## Type checking and lint

### `pnpm typecheck`

Runs `tsc --noEmit` in every workspace that declares the script: `@vitae/api`,
`@vitae/web`, `@vitae/core`, `@vitae/testkit` and `@vitae/ui`. Three workspaces
declare no `typecheck` script, and what happens to them is not the same in each
case - see [where the gates do not reach](#where-the-gates-do-not-reach).

There is no exception mechanism. `strict` is on repository-wide, along with
`noUncheckedIndexedAccess`, `noImplicitOverride` and
`noFallthroughCasesInSwitch`; `apps/api` and `apps/web` each relax
`noUncheckedIndexedAccess` in their own configuration and nothing else.

### `pnpm lint`

One `eslint .` pass over the tree, with generated and vendored directories
ignored explicitly because ESLint does not read `.gitignore`.

Most rules are warnings. Two are errors, and they are scoped to `apps/api`
because they need type information and are slow: `no-floating-promises` and
`await-thenable`. The first is the one that matters - the repository's
`stage*` methods are async, and an un-awaited call inside a transaction is a
write that can land after the transaction has committed or rolled back, which
`tsc` will not tell you about.

Three React Compiler diagnostics - `set-state-in-effect`, `refs` and
`immutability` - are deliberately set to `warn` rather than `error`, because
they fire on screens that predate the compiler and are already scheduled for
rework. The configuration records the exact counts and states the rule: the
number only moves down. Do not add new ones.

## Repository hygiene

### `pnpm test:map` - source-to-test ownership

**Enforces** that every production module has either a test beside it or an
entry in `docs/testing/source-test-map.json`, and that no entry claims a module
is untested while a suite sits in the same directory.

**Scans** `packages/core/src`, `apps/api/src` and `apps/web/src`, minus the
map's `exclude_globs`. It does not walk `packages/ui`, `packages/testkit`,
`packages/config`, `services/buildsvc` or `e2e`.

**Fails** by listing unmapped modules and broken entries with a one-line reason
each. The full rule set, the four failure shapes, and what counts as a sibling
test are on [how this repository tests
itself](testing.md#what-counts-as-a-test-beside-it).

**Exception**: add the module to the map with an empty `tests` array and an
`exclude_reason` sentence. Thirty-four entries currently take that route. A
structural exemption - a whole class of file that should never be walked - goes
in `exclude_globs` instead.

The script is invoked through a self-test that must pass first. That is not
ceremony: this gate once printed `ok` unconditionally for months.

### `pnpm test:prose` - prose in tests

**Enforces** that test titles and line comments carry no em or en dash and none
of a short list of filler phrases, among them `comprehensive (test|suite|coverage)`,
`leverages`, `seamless`, `furthermore` and `in conclusion`.

**Scans** `packages/core/src`, `packages/testkit/src`, `packages/ui/src`,
`apps/api/src`, `apps/web/src` and `e2e/tests` - every `*.test.*` and
`*.spec.*` file, plus anything under a `helpers/` directory.

**Fails** with `<file>:<line>: title|comment matches ...`, printing the first
eighty findings and a count of the rest.

**Exception**: `docs/testing/prose-allowlist.json`, which holds either whole
file paths or substrings that may appear. The file's own note asks you to
document the invariant rather than paste the glyph into every title.

### `pnpm test:public` - pre-release identifiers

**Enforces** that no identifier from the private pre-release project reaches
the public tree: the maintainer's handle and name, the private hostname, the
maintainer's home directory path, and the brand names of a list of external
coding assistants. It also refuses a tracked `.env` or `deploy/.env`.

**Scans** every tracked file plus every untracked file `git` does not ignore -
so a draft you have not staged is already in scope. It prints the number of
files it read on success.

**Fails** with `<file>: matches <pattern>`. The deny list is assembled from
string fragments at runtime so the checker cannot flag its own source.

**Exception**: none. There is no allow-list, by design. This catches known
historical values and is not a substitute for secret scanning or review.

### `pnpm test:brand` - the standing design bans

**Enforces** the bans recorded in the identity documents: no gradients on
chrome, no `backdrop-filter`, no blurred shadow that does not name an
elevation or focus-ring token, exactly one easing curve, durations only from
the 90 / 130 / 220 ms token scale plus the stagger steps, no `transform` on
`:hover`, no raw hex outside `tokens.css`, and none of Tailwind's stock
`animate-bounce`, `animate-ping` or `animate-pulse`.

**Scans** the stylesheets under `packages/ui/src/styles` and
`apps/web/src/styles` for the full rule set, and the TypeScript under
`packages/ui/src` and `apps/web/src` for three of them. Comments are blanked
before scanning, with line numbers preserved, so prose about a colour a
previous identity used is not read as shipping it. Rules inside a print
media query are exempt from the raw-hex ban.

**Fails** with `<file>:<line>: <rule> (<why>)` and the offending line.

**Exception**: `docs/design/brand-ban-allowlist.json`. An entry names the rule,
the file, optionally a `line` or a `match` to narrow it, and a `reason` a
reviewer can argue with. Six entries exist: one gradient used as geometry
rather than as a wash, three animation durations belonging to the spinner and
the skeleton, and two print stylesheets where a literal colour is the point.

> [!NOTE]
> An earlier audit of this repository recorded that `pnpm test:brand` was in
> `test:all` but absent from the workflow, so the brand guard never ran in
> continuous integration. That is no longer true. It runs in the quality job,
> in the same step as `test:map`, `test:prose` and `test:public`, and the
> generated test catalog lists it among the scripts continuous integration
> invokes. The finding was real when it was made and has been repaired.

### `pnpm docs:check` - the documentation gates

Five checkers, each preceded by its own self-test - ten self-tests in total
before the first real check runs. All five judge the corpus as it is written.
None of them compiles it into what the reading surface fetches, and no other
job does either; that hole is described under *Where the gates do not reach*.

- **Pages.** Every curated page's metadata is complete and drawn from a closed
  vocabulary, its declared domain matches its directory, every path in
  `sources:` exists, every identifier in `requirements:` is registered, a page
  claiming to be verified carries a date that is not in the future, the body
  opens with a single level-one heading carrying the page's title, no heading
  level is skipped, an explanation carries its four sections in order, links
  resolve to real pages and real anchors, and no page is unreachable from every
  other page.
- **Generated artifacts.** Every generator under `scripts/docs/` is re-run in
  `--check` mode and compared against the committed artifact. Adding an
  endpoint, a table, a token or a package without regenerating is a failed
  build. The generator list is the directory rather than a constant, so a new
  generator cannot be forgotten. Every generator runs even after one fails.
- **Coverage.** What the documentation must account for. Routes, algorithms,
  packages, runbooks and résumé templates each need a curated page claiming
  them; endpoints, configuration keys, tables, migrations, components and
  tokens are covered by their generated catalogs instead and must not be
  claimed. The uncovered list in `docs/registry/coverage.json` is a ratchet: it
  may shrink and never grow, and it is rewritten with `--update`.
- **Diagrams.** Every file in `docs/registry/diagrams/` matches the diagram
  schema and the fields its own kind requires, its filename matches its
  identifier, every arrow names something the same file declares, a state
  machine has exactly one starting state and no state that is unreachable or
  has no way out, and a journey phase names a route the application actually
  mounts. The check that earns its place is the citations: every `path:line` a
  diagram cites must point at a line that still exists, so a diagram stops
  passing the moment the code it describes is refactored. A state the code
  declares that nothing reaches is a finding rather than an error - it is
  marked `unreachable` with an explanation, and the gate then verifies that
  nothing has started reaching it.
- **Traceability.** The requirement, capability and journey registers are
  validated against their schemas and joined against the generated traceability
  artifact. An identifier cited by the code but absent from the register, or
  registered but cited nowhere, fails either way.

**Exception**: for coverage, tighten the ratchet rather than widening it. For
the others, none.

### `pnpm audit --audit-level=high`

Fails the quality job on any high or critical advisory in the dependency tree.
The root manifest carries a `pnpm.overrides` block that pins transitive
dependencies past known advisories; adding an override there is the sanctioned
way to clear one without waiting on an upstream release.

## Build and supply chain

### `pnpm build` and `pnpm test:performance`

The build job runs `pnpm build` on a bare checkout, asserts
`apps/web/dist/index.html` exists, and then runs the bundle-size gate with
`VITAE_REQUIRE_BUDGETS=true`.

**Enforces**, in order: that what it is measuring is a production build at all,
then that total emitted JavaScript is within `totalJsKb` and the largest single
chunk within `largestChunkKb`, both read from `docs/testing/web-budgets.json`
(6,000 kB and 1,500 kB today).

The first check is the interesting one. Before it formed any opinion about
size, this gate used to measure whatever was in `dist/` - and a `NODE_ENV` line
in a local `.env` outranks the `production` that `vite build` sets for itself,
so a local build could carry the development JSX runtime and the build
machine's absolute source paths while passing at 98% of a limit it was not
entitled to be measured against. The gate now refuses such a bundle outright,
naming how many chunks gave it away.

**Fails** either with `this is a development build, so its size means nothing`
and the chunk counts, or with the overrun and the eight largest chunks.

Without `VITAE_REQUIRE_BUDGETS=true` and with no `dist/`, it warns and exits
zero, which is what makes it safe to include in `test:all` mid-development.

**Exception**: raising a number in `docs/testing/web-budgets.json`, which
carries a `notes` field explaining what the current headroom is for. Raising it
is a decision, not a formality.

### The digest-pin guard

Greps `apps/api/Dockerfile`, `services/buildsvc/Dockerfile` and
`deploy/compose.prod.yml` for any `FROM` or `image:` line that is not pinned by
`@sha256:`, excluding the repository's own `vitae/` images. It self-tests
first: an intentionally unpinned reference must be caught, or the job fails on
the ground that the guard is broken.

### Image scanning and the bill of materials

Both the API image and the compiler image are scanned for CRITICAL
vulnerabilities with `--ignore-unfixed`, so an advisory with no available fix
does not block a release it cannot help. An SPDX bill of materials is produced
as a build artifact.

### LaTeX line-model calibration

Its own job. It builds the compiler image - which itself compiles every
template twice, the second time with the network disabled - and then recompiles
the calibration fixtures offline. It fails when a template will not compile,
when a fixture spills to a second page, or when a template's declared
`lines_per_page` is more than three lines away from its measured capacity.
[Adding a résumé template](add-a-resume-template.md) covers what that means for
a new layout.

## Where the gates do not reach

Each of these was measured, and each is a hole rather than a design choice.

### An entire package's tests run nowhere

`@vitae/ui` declares `"test": "vitest run"` and holds **226 cases across nine
files**. No job runs them, and `test:all` does not include them. Every test
invocation in the workflow names either a specific script or a specific
workspace, and `@vitae/ui` appears in none of them. The recursive `pnpm test`
in the root manifest would run the package, but no gate calls it.

This is the most depended-on code in the repository: every screen imports the
design system, and a regression in it reaches nearly all of them. Nothing is
broken here. The tests pass; they are not wired to anything, which is why
nothing reported it. There is no failing signal to notice, only a missing one.

Until it is wired up, run it by hand when you change the design system:

```bash
pnpm --filter @vitae/ui test
```

### A package with no scripts is skipped by every recursive command

`packages/config/package.json` declares no `scripts` object at all. Both
`pnpm -r typecheck` and `pnpm -r test` therefore skip it silently: there is no
script to run and no error to report.

Half of that is less serious than it sounds. The package publishes TypeScript
source through its `exports` map, so every consumer's compiler follows it and
type-checks it in passing - a deliberate type error in `packages/config/src/env.ts`
does fail the root `pnpm typecheck`, by way of `@vitae/api`. The generated
package catalog records it as type-checked transitively rather than directly.
The other half stands: the package has no tests, and no gate would notice if it
grew some.

### Two packages are type-checked by nothing

The generated package catalog sorts the eight workspaces into three groups.
Five are type-checked directly. `@vitae/config` is type-checked transitively,
as above. `@vitae/buildsvc` and `@vitae/e2e` are type-checked by nothing.

`@vitae/buildsvc` is covered in practice: it declares `"build": "tsc"`, and
`pnpm build` runs in the build job. `@vitae/e2e` is not covered at all. It
declares neither `typecheck` nor `build`, and no workspace imports it, so its
**250 cases** - the entire browser acceptance suite - are compiled only at the
moment Playwright runs a file. A type error in a helper surfaces as a failing
journey rather than as a failing type check.

### Nothing compiles the documentation corpus any more

`pnpm docs:check` reads the corpus as Markdown. It never runs
`scripts/docs/build-content.mjs`, the step that turns those pages into the JSON
the reading surface actually fetches, so everything the entry on `docs:check`
above claims is about the source and none of it is about the artifact.

Until August 2026 that did not matter, because the compiler ran inside the web
build: the corpus was written into `apps/web/public/` and shipped inside the
bundle, so `pnpm build` in the build job compiled it on every commit. The
corpus is private now. It is served by the API out of a directory outside the
bundle, the Vite plugin that used to compile it runs only while the development
server is up, and no job invokes `pnpm docs:build`. The one gate that covered
this step covered it as a side effect, and the side effect is gone.

Run it by hand when you change the corpus, the content model or the builder:

```bash
pnpm docs:build
```

Two smaller holes sit beside it. The compiled corpus is git-ignored, so
`test:public` - which scans tracked and untracked-but-not-ignored files - never
sees it. And nothing fails a build that writes the corpus back under
`apps/web/public/`, where it would be copied into the bundle and served to
anyone; `.gitignore` still lists the old path, which stops it being committed
and stops nothing else.

### Gates that exist but run in no job

| Script | What it would prove |
| --- | --- |
| `pnpm test` | The recursive run, and the only invocation that reaches `@vitae/ui` |
| `pnpm test:visual` | Screenshot baselines for the landing and sign-in surfaces |
| `pnpm test:mutation` | That the assertions in five protected core modules kill mutants |
| `pnpm test:coverage` | V8 coverage for core and testkit |
| `pnpm test:core` | `@vitae/core` on its own, which `test:unit` covers in the pipeline |

Visual, mutation and coverage are opt-in by intention - the first needs a
running stack, the second is slow. `pnpm test` is not opt-in by intention; it is
the invocation nothing calls.

### The local mirror is not a mirror

`scripts/ci-local.sh` describes itself as the local equivalent of the workflow.
It runs install, `typecheck`, `lint`, `test:core` and the web suite; with
`--full` it adds the digest guard, `pnpm build`, API integration, both image
builds and the browser journeys.

It does not run `test:map`, `test:prose`, `test:public`, `test:brand`,
`docs:check`, `test:a11y`, `test:performance`, or the testkit half of
`test:unit`. A green run of that script is a useful pre-flight and not a
prediction of the pipeline. For that, `pnpm test:all` plus `pnpm typecheck` and
`pnpm lint` is much closer.

## How to record an exception

Every gate that permits one permits it in exactly one file, and every one of
those files asks for a reason rather than a suppression.

| Gate | Where the exception goes | What it needs |
| --- | --- | --- |
| `test:map` | `docs/testing/source-test-map.json` | an `exclude_reason` on the entry, or an `exclude_globs` pattern for a whole class |
| `test:prose` | `docs/testing/prose-allowlist.json` | a file path or an allowed substring |
| `test:brand` | `docs/design/brand-ban-allowlist.json` | rule, file, optional line or match, and a `reason` |
| `test:performance` | `docs/testing/web-budgets.json` | a new number, and a note saying what the headroom is for |
| `docs:check` coverage | `docs/registry/coverage.json` | a tightened ratchet; it may shrink and never grow |
| `pnpm audit` | `pnpm.overrides` in the root manifest | a pinned version that clears the advisory |
| `test:public` | nowhere | - |
| `typecheck` | nowhere | - |

There is no inline suppression comment anywhere in this scheme. That is the
point: an exception costs a sentence in a file somebody will read, rather than
a token on a line nobody will.

## Related

[How this repository tests itself](testing.md) explains the layers these gates
run, and the source-to-test map in full. [Setting up a working
checkout](setup.md) has the commands. The three worked procedures -
[an endpoint](add-an-endpoint.md), [a node or edge type](add-a-node-type.md),
[a résumé template](add-a-resume-template.md) - each say which of these gates
catches which mistake.
