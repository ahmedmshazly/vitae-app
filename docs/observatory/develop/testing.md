---
id: DEV-TESTING
title: How this repository tests itself
summary: Ten layers, 1,942 cases, and a machine-checked map that decides whether a production module is allowed to exist without a test.
audience: [developer, maintainer]
domain: develop
type: explanation
status: verified
verified_at: 2026-08-24
sources:
  - package.json
  - docs/testing/source-test-map.json
  - docs/testing/coverage-matrix.md
  - docs/testing/LOCAL.md
  - scripts/check-test-coverage-map.mjs
  - scripts/check-test-coverage-map.selftest.mjs
  - apps/api/vitest.config.ts
  - apps/web/vite.config.ts
  - packages/core/stryker.config.json
  - docs/generated/tests.json
related: [DEV, DEV-SETUP, DEV-WHERE, DEV-GATES, DEV-ENDPOINT, DEV-NODETYPE, DEV-TEMPLATE]
---

# How this repository tests itself

## In short

There are 1,942 test cases in 307 files, and none of them are skipped or
pending. They are organised into layers, each with its own command, and the
layer is chosen by what a test needs in order to run rather than by what it is
about: a pure function gets a unit test, a route gets an integration test
against a real Postgres, a screen gets a component test in a simulated browser,
and a journey gets a real browser. On top of that sits an unusual second
mechanism: a checked-in map that names, for every production module, what
proves it — and a gate that fails when a module has neither a test beside it nor
an entry in the map. The map is the reason it is hard to add untested code here
by accident.

## How it works

### The layers

Each layer has a script in the root `package.json`. Running the script is how
you run the layer; there is no other invocation to learn.

| Layer | Command | What it proves |
| --- | --- | --- |
| Unit | `pnpm test:unit` | `@vitae/core` and `@vitae/testkit`: pure domain logic and schema invariants |
| Property, metamorphic, golden | `pnpm test:property` | generated inputs and a fixed corpus, over the escape layer and the selection maths |
| Mutation | `pnpm test:mutation` | that the assertions in five protected core modules kill deliberate mutants |
| API integration | `pnpm test:api` | route to service to repository, against a real Postgres |
| Contract | `pnpm test:contract` | the OpenAPI document and the error envelope |
| Security | `pnpm test:security` | authorisation, headers and CORS |
| Resilience | `pnpm test:resilience` | the compiler being offline, and the signing shape |
| Web component | `pnpm test:web` | screen and feature states in a simulated browser |
| Accessibility | `pnpm test:a11y` | axe contracts and keyboard behaviour |
| Browser journeys | `pnpm e2e` | the whole stack, driven as a person would |
| Visual | `pnpm test:visual` | screenshot baselines for the landing and sign-in surfaces |
| Bundle budgets | `pnpm test:performance` | that the built SPA is inside its declared size limits |

Where the cases actually are, counted from the generated test catalog:
`@vitae/web` 991, `@vitae/core` 273, `@vitae/e2e` 250, `@vitae/ui` 226,
`@vitae/api` 195, `@vitae/testkit` 7.

That distribution is worth a second look. The browser suite is 46 spec files
and a quarter of all cases, which is why it is slow and why it is the last
thing to run. And `@vitae/ui` has more cases than the API — 226 of them — none
of which any gate runs. [The gates page](quality-gates.md) has that in full.

### Where a test goes

The convention is colocation. A test sits beside the module it proves,
`dedup.ts` next to `dedup.test.ts`, and the second convention is a facet
suffix for a module with several suites: `Person.states.test.tsx`,
`AtlasCanvas.error.test.tsx`, `Person.log.test.ts`.

Two directories break colocation on purpose. `apps/api/src/__tests__/` holds
the suites that are not about one module — the contract suites, the security
suites, the resilience suites, and the shared application helper that boots the
Express app once per worker and mints a developer token. `e2e/tests/` holds the
browser specs, which are about journeys rather than modules.

### What each layer needs to run

A unit or component test needs nothing. An API test needs Postgres, and takes
care of the rest itself: `apps/api/vitest.config.ts` declares a global setup
that creates and migrates a separate `vitae_test` database and points every
suite at it, whatever `DATABASE_URL` says in your `.env`. That redirection is a
data-safety measure, not a convenience — the suites truncate between tests, so
a suite that ran against a seeded development database would destroy it. For
the same reason `fileParallelism` is off: truncation is global to the database,
so two files running at once would clear each other's fixtures mid-test.

Browser journeys need the most: Postgres, the auth emulator, the compiled web
bundle, the API, and the LaTeX build service in a container. Both seeds have to
have run, because the résumé journeys read parsed job-description targets that
only the demo seed creates.

## Mechanics

### The source-to-test map

`docs/testing/source-test-map.json` names 256 production modules and, for each
one, its risk class, the layers that own it, and the test files that prove it.
`scripts/check-test-coverage-map.mjs` — the `pnpm test:map` gate — walks three
directories, `packages/core/src`, `apps/api/src` and `apps/web/src`, skipping
anything matched by the map's own `exclude_globs` (barrel files, declaration
files, test files, the API's one-off scripts, the web entry point).

For every module that survives that filter, the gate asks one question: is
there a test beside it? If there is, the module is done. If there is not, it
must have an entry in the map, and that entry must either name test files that
exist or carry an `exclude_reason` explaining the gap in a sentence.

A map entry looks like this:

```json
"apps/api/src/routes/v1/applications.ts": {
  "risk": "high",
  "layers": ["integration"],
  "status": "covered",
  "tests": ["apps/api/src/routes/v1/applications.integration.test.ts"]
}
```

`risk` is from the risk classes in `docs/testing/coverage-matrix.md`, and it
sets the evidence the matrix expects: a critical module — authentication,
tenancy isolation, retention purge, export and restore, the LaTeX escape layer,
the compiler's signing — is expected to have unit, integration and negative-path
coverage, where a medium one needs a happy path, an empty state and an error.
Of the 256 mapped modules, 11 are critical, 29 high, 212 medium and 4 low.

### What counts as "a test beside it"

This is the part worth reading carefully, because the answer is not "any test
file in the directory", and the difference decides whether your new module needs
a map entry.

A plainly named sibling counts on its name alone: `<name>.test.ts`,
`<name>.test.tsx` or `<name>.spec.ts`. A few of those prove a component through
the content module it renders rather than by importing the component, so
demanding an import would reject them.

A facet-named sibling — anything else starting `<name>.` and ending `.test.ts`,
`.test.tsx` or `.spec.ts` — counts **only if it imports the module**. That rule
costs recall deliberately. Of the eighty-four facet suites sitting beside a
module of the same stem, fifty-two import it and count; the other thirty-two
reach their module through a route render or a content module and still require
a map entry. The alternative, accepting any similarly named file, would let
`Foo.helpers.test.ts` be read as proof of `Foo.ts`, and accepting the wrong file
as proof is the failure this gate exists to prevent.

The practical consequence for an API route is concrete. The route integration
suites drive the whole application through the shared helper rather than
importing the router, so `applications.integration.test.ts` does **not** satisfy
the gate for `applications.ts` — which is why that module has the map entry
shown above. Add a route file and you will add a map entry.

The four ways the gate fails, each reproduced against a fixture tree:

| Situation | What it prints |
| --- | --- |
| Module with no sibling suite and no entry | `Unmapped production modules (1): - <path>` |
| Entry with an empty `tests` array and no `exclude_reason` | `<path>: mapped without tests or exclude_reason` |
| Entry declaring no tests while a sibling suite exists | `<path>: declared untested while <suite> sits beside it` |
| Entry naming a test file that is not there | `<path>: missing test <path>` |

The third of those is the newer half, and it closes a hole that a reader would
never have found: an entry can be wrong by claiming too little, not only by
claiming too much. Sixteen entries once said "nothing proves this" while the
suite sat in the same directory, and nothing read that field.

### The gate has to be able to fail

`pnpm test:map` is not `node scripts/check-test-coverage-map.mjs`. It is
`node scripts/check-test-coverage-map.selftest.mjs && node
scripts/check-test-coverage-map.mjs` — a self-test that builds fixture
repositories, points the real checker at each one through `VITAE_MAP_ROOT`, and
asserts the exit code, running ahead of every real invocation.

That belt is there because this gate once could not fail at all. Its
sibling-finding function built candidate paths with `String.replace`, which
returns the input unchanged when the pattern misses, so every walked module
resolved to its own path and counted as tested. It printed `source-test-map: ok`
for months while modules landed with no test and no entry. The function was
replaced with one that lists the directory and matches real names, which has no
silent identity case — and the self-test exists so that a future regression
announces itself rather than being inferred from a passing build.

The same pattern is used elsewhere. `test:performance` runs its own self-test
first, seven cases of it, and `docs:check` runs nine self-tests before it makes
its first real check. A gate is trusted here only after it has been seen to
fail.

### Determinism, and how it is held

`packages/core` is required to be deterministic: identical inputs, identical
outputs, no randomness anywhere in the algorithms. Three layers hold that.
Property tests generate arbitrary inputs and assert invariants — the escape
layer's suite requires that any input compiles and never leaks an active TeX
control sequence. Metamorphic tests assert relationships between runs rather
than fixed values. A golden corpus pins exact outputs, so a change in a scoring
constant shows up as a diff rather than as a slightly different résumé.

Mutation testing is the check on the assertions themselves. Stryker mutates
five protected modules — the escape layer, the capture and filter grammars,
subject assignment, and schema validation — and fails below a score of 60. It
is slow, it is opt-in locally, and it runs in no gate.

### What the numbers do not tell you

Test counts are not coverage. Two measurements in the generated catalogs say so
directly: 130 of the 137 registered API endpoints have a test associated with
them, and of the 99 identifiers in the requirement register, only 22 are cited
from inside a test file. The second figure measures citation, not proof — a
requirement can be thoroughly tested by a suite that never names it — but it
does mean the requirement-to-test trail is thin, and that a claim of the form
"this requirement is proven" cannot be read off the suite today.

## Related

[The gates a change must pass](quality-gates.md) turns the layers above into
the list of things that will actually refuse a change, including the ones that
run nowhere. [Where a change belongs](where-to-change.md) decides which
workspace you are testing in the first place. Each of the three worked
procedures — [an endpoint](add-an-endpoint.md), [a node or edge
type](add-a-node-type.md), [a résumé template](add-a-resume-template.md) —
names the map entry its change requires.
