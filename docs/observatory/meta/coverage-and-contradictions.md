---
id: META-AUDIT
title: Documentation coverage and contradiction inventory
summary: Every defect found while auditing the existing documentation, with the file and line that proves it.
audience: [maintainer, developer, operator]
domain: meta
type: reference
status: verified
sources:
  - scripts/check-test-coverage-map.mjs
  - apps/api/src/openapi/spec.ts
  - apps/api/src/openapi/mounts.ts
  - docs/specs/srs.md
  - docs/ARCHITECTURE.md
  - GOVERNANCE.md
  - apps/web/src/app/Shell.tsx
  - apps/web/src/test/a11y.ts
  - e2e/tests/helpers/a11y.ts
  - .env.example
  - apps/web/vite.config.ts
  - scripts/check-web-budgets.mjs
  - scripts/check-public-release.mjs
  - packages/ui/src/styles/base.css
  - scripts/docs/lib/citations.mjs
  - docs/testing/source-test-map.json
verified_at: 2026-08-26
---

# Documentation coverage and contradiction inventory

This is the evidence base for the Documentation Observatory. Every entry was
reproduced against the working tree, not inferred from another document. Each
row carries a command you can run to confirm or refute it.

## Method

Authority is ranked. When two sources disagree, the higher rank wins and the
lower one is recorded here as a defect:

1. Generated-from-source artifacts and passing tests
2. Running code, schemas, migrations, and actual configuration
3. Product specifications
4. Roadmaps and design intent

A claim that cannot be reproduced is not recorded, however plausible it sounds.
Claims that were investigated and did not hold are listed at the end, so the
same wrong lead is not chased twice.

Identifiers are stable. Cite them as `DOC-D-001`.

---

## Severity 1: quality gates that do not hold

### DOC-D-001 - `pnpm test:map` never reports a missing module

> **Resolved.** What follows is the state before the fix, kept because the record of
> what was wrong is the point of this document. The fix is in the resolved table at
> the end.

`colocatedTest()` builds its candidate paths with `String.replace`, which
returns the **original string** when the pattern does not match:

```js
const candidates = [
  abs.replace(/\.tsx$/, '.test.tsx'),   // on a .ts file: no match, returns abs
  abs.replace(/\.tsx$/, '.test.ts'),    // same
  abs.replace(/\.ts$/,  '.test.ts'),    // on a .tsx file: no match, returns abs
  abs.replace(/\.tsx?$/, '.spec.ts'),
];
return candidates.find((c) => existsSync(c));
```

`walk()` only yields files that exist, so for every walked module one candidate
is the module's own path and `existsSync` succeeds. The function is
unconditionally truthy and every line after it in the loop is unreachable.

- Source: `scripts/check-test-coverage-map.mjs:70-78`
- Measured: **200 of 275** walked production modules resolve to their own source path.
- Consequence: **18** modules have no test and no map entry. The gate prints `source-test-map: ok`.

The second loop, which verifies that declared test files exist, still runs. Only
the primary check is dead.

### DOC-D-002 - the gap is where the newest code lives

`scripts/check-test-coverage-map.mjs` is unchanged since `20f2b86 Release Vitae
1.0.0`. Sixteen of the eighteen unguarded modules were added in the three
feature commits after it.

| Commit | Unguarded modules introduced |
| --- | --- |
| `1e2c502 feat(cloud)` | `apps/api/src/cloud/paddle.ts`, `apps/api/src/middleware/workspace.ts`, `apps/api/src/routes/v1/billing.ts`, `apps/api/src/routes/webhooks/paddle.ts`, `apps/api/src/services/control-plane.ts`, `apps/api/src/db/migrations/007`-`010`, `apps/web/src/lib/paddle.ts` |
| `ffd9819 feat(marketing)` | `CareerEvidence.tsx`, `CloudAction.tsx`, `HowItWorks.tsx`, `SecurityOwnership.tsx`, `WarmPaths.tsx` under `apps/web/src/routes/marketing/` |
| `cfccb40 feat` | `apps/api/src/routes/v1/applications.ts`, `apps/web/src/routes/career/application-view.ts`, `apps/web/src/routes/career/ApplicationActions.tsx` |

The Cloud billing and tenant-isolation plane is the most security-sensitive code
in the repository. It is unguarded by the coverage gate and absent from the
architecture guide (`DOC-D-010`).

Reproduce:

```bash
node scripts/check-test-coverage-map.mjs   # prints ok
git log --format='%h %ad' --date=short -1 -- scripts/check-test-coverage-map.mjs
```

### DOC-D-030 - `pnpm lint` fails on `main`

> **Resolved.** What follows is the state before the fix, kept because the record of
> what was wrong is the point of this document. The fix is in the resolved table at
> the end.

`pnpm lint` exits 1 on a clean checkout. CI runs it in the `quality` job, so
that job cannot pass on any commit. A single rule violation is responsible:

```
apps/api/src/services/control-plane.ts:100:7
  prefer-const  'graceEndsAt' is never reassigned. Use 'const' instead.
```

`refreshAccess()` declares `graceEndsAt` with `let` beside `deletionScheduledAt`,
which genuinely is reassigned through `??=`. Only the first is constant.

The file is from `1e2c502 feat(cloud)`, the same commit as most of `DOC-D-002`.
The Cloud plane therefore entered the repository past a coverage gate that could
not fail and a lint gate that was already failing, so neither reported it.

Reproduce:

```bash
git stash -u && pnpm lint; echo "exit=$?"; git stash pop
```

### DOC-D-035 - an entire package's tests never run

`packages/ui` declares `"test": "vitest run"` and contains **226 cases across
nine files**. Nothing runs them.

`.github/workflows/ci.yml` invokes tests at lines 67, 75, 77, 79, 81, 184, 192,
194, 200 and 326. Every one of them names either a specific script or a specific
workspace: `@vitae/core` and `@vitae/testkit` through `test:unit`, `@vitae/web`
through `test:web`, `@vitae/api` by filter at line 200, `@vitae/e2e` by filter at
line 326. `@vitae/ui` appears in none of them. `test:all` does not include it
either. A recursive `pnpm test` exists at `package.json:21` and would run the
package, but no gate calls it.

This is the most depended-on code in the repository. Counting production
importers only, `packages/ui/src/index.ts` has **102** dependents,
`components.tsx` 79, `feedback.tsx` 65, `overlay.tsx` 51. A regression in the
design system reaches nearly every screen, and no automated check would see it.

Unlike `DOC-D-001`, no gate is broken here. The tests pass. They are simply not
wired to anything, which is why nothing reported the gap: there is no failing
signal to notice, only a missing one.

Reproduce:

```bash
node -e "console.log(require('./docs/generated/tests.json').summary.workspaces_absent_from_ci)"
pnpm --filter @vitae/ui test   # 226 pass, run by no gate
```

### DOC-D-040 - a skip link that scrolls without skipping, and two surfaces with none

> **Resolved.** What follows is the state before the fix, kept because the record
> of what was wrong is the point of this document. The fix is in the resolved
> table at the end. The row for `seo.ts` was wrong when it was written and is
> corrected below rather than removed.

A browser places focus on a fragment target only when that target can hold
focus. A skip link whose target has no `tabindex` moves the viewport and leaves
focus where it was: the reader presses Tab, and lands back on the first link in
the navigation they were trying to get past. Nothing announces that anything
happened.

`apps/web/src/app/Shell.tsx` gets this right and has since it was written. Its
skip target is the route wrapper at `:408`, which carries `tabIndex={-1}`, and
`apps/web/src/app/Shell.test.tsx:97` asserts it with the reason attached:
*"tabIndex -1 is what makes the region focusable by script without adding a tab
stop."* Three later surfaces declared the same `id` without the attribute.

| Surface | Skip link | Target | `tabindex` |
| --- | --- | --- | --- |
| Application shell | `Shell.tsx:191` | `Shell.tsx:408` | `-1` - correct |
| Marketing chrome | `Chrome.tsx:217` | `Chrome.tsx:221` | absent |
| Entity reference | none | `EntityCatalog.tsx:755` | absent |
| Prerendered public pages | none | `public/seo.ts:255` | absent |
| Documentation | `DocsApp.tsx:118` | `DocsApp.tsx:44,98` | `-1` - fixed in this work |

Only one row is the defect in the title. `Chrome.tsx` has a working skip link
pointing at a target that cannot take focus, so it scrolls and does not skip.

The next two rows are a different, larger problem that the first framing of this
entry hid by counting targets instead of links. `/reference/entities` has no
skip link at all, and it puts a back link, seven output buttons and a three-way
tab strip ahead of its content - crossed on arrival and again after every lens
change.

The `seo.ts` row was a mistake. That is the static body served before any
JavaScript runs, and in it `<main>` is the only child of `#root`:

```
<body><div id="root"><main id="main-content" data-vitae-static-public-page="/manifesto">
```

There is nothing ahead of it to skip, no link points at it, and the element is
replaced by `Chrome.tsx`'s the moment React mounts. Adding `tabindex` there
would change nothing for anyone. The row is kept and corrected rather than
deleted, because a wrong row in an evidence document is itself a finding.

Measured in Chrome against the built bundle on
`/docs/meta/coverage-and-contradictions`, before the fix:

```
targetTabIndex: null   focusAfterSkip: "BODY"   focusIsTargetOrInside: false
```

That measurement was taken while the documentation was still served as static
files by the web host. It is not any more - the corpus is private and comes
from the API behind the owner allow-list - so reproducing this one means
signing in as the owner first, and the deployment must have been given a
compiled corpus at all. The finding and the fix are unaffected; only the way
you get to the page has changed.

Two accessibility gates run over these surfaces and neither can see it.

`runAxe` (`apps/web/src/test/a11y.ts`) applies no tag filter, so axe-core's
`skip-link` rule does run - the rule whose own help text reads *"The skip-link
target should exist and be focusable"*. Its implementation tests something
weaker:

```js
function skipLinkEvaluate(node) {
  var target = get_element_by_reference_default(node, 'href');
  if (target) {
    return _isVisibleToScreenReaders(target) || void 0;
  }
```

Existence and visibility. Nothing about focus. It passes on a target that cannot
take any.

The Playwright scan never reaches the rule. `skip-link` is tagged
`cat.keyboard, best-practice, RGAAv4, RGAA-12.7.1` and carries no WCAG tag, while
`e2e/tests/helpers/a11y.ts:37` filters to
`['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']`.

Both gates report green truthfully and neither statement means what a reader of
the result would assume: one rule implements less than its description promises,
the other is excluded by tag. The shape is `DOC-D-001` again - a check that
cannot go red.

Reproduce:

```bash
grep -rn 'id="main-content"' apps/web/src            # tabIndex on two of five
grep -rn 'skip-link\|docs-skip\|ec-skip' apps/web/src | grep -v test   # links, not targets
node -e "const a=require('./node_modules/.pnpm/axe-core@4.12.1/node_modules/axe-core');console.log(a.getRules().find(r=>r.ruleId==='skip-link').tags)"
```

### DOC-D-041 - following the setup instructions turns `pnpm build` into a development build

> **Resolved.** What follows is the state before the fix, kept because the record
> of what was wrong is the point of this document. The fix is in the resolved
> table at the end. Reproducing it today means adding the line back by hand.

`README.md:51` and `docs/ONBOARDING.md:23` both open with the same step:

```bash
cp .env.example .env
```

`.env.example:7` sets `NODE_ENV=development`. From that point on, `pnpm build`
on that machine no longer builds for production, and says nothing about it.

| | with the documented `.env` | with no `.env` |
| --- | --- | --- |
| files containing `jsxDEV(` | 49 | 0 |
| files containing an absolute `/home/...` path | 49 | 0 |
| total JavaScript | 5,875 kB | 4,850 kB |
| largest chunk | `index` 1,455 kB | `EntityObservatoryGraph` 1,385 kB |
| `check-web-budgets.mjs` | ok | ok |

`apps/web/vite.config.ts:52` reads the file with `loadEnv(mode, ENV_DIRECTORY,
'')`, where `ENV_DIRECTORY` is the repository root (`:12`), and Vite copies the
parsed value into `process.env.VITE_USER_NODE_ENV`. In `resolveConfig` it
captures `isNodeEnvSet = !!process.env.NODE_ENV` **before**
loading the config file, sets `NODE_ENV` to `production` for a build, then
overwrites it back to `development` when `!isNodeEnvSet && userNodeEnv ===
'development'`. `isProduction` is read from `process.env.NODE_ENV` immediately
after. Nothing inside `vite.config.ts` can prevent this: `isNodeEnvSet` is
already captured by the time any config hook runs.

**What is not affected.** The CI `build` job (`.github/workflows/ci.yml:98`)
runs `pnpm build` on a bare checkout, and `.env` is git-ignored, so it is absent
and the build is a production build. The documented host build
(`docs/DEPLOYMENT.md:45`) runs the same command on the static host from the same
bare checkout. Both produce the correct artifact. What ships is fine.

**What is affected is every local build**, and two things follow from that.

The local budget gate measures an artifact nobody deploys. Run
`VITAE_REQUIRE_BUDGETS=true pnpm test:performance` on a set-up machine and it
reports `total 5875kb, largest index-UL8_rbwL.js 1455kb` against limits of 6,000
and 1,500 - 98% of one, 97% of the other - and exits 0. CI, measuring the real
bundle, sees 4,850 kB and 1,385 kB. A developer sizing a new lazy route against
their own run believes there is 125 kB of headroom. There is **1,150 kB**. The
chunk the local run names as largest is not even the largest chunk in a real
build.

Every locally built chunk carries the developer's absolute home path, and the
guard written to catch exactly that cannot see it. `check-public-release.mjs:29`
bans `/home/<handle>` across tracked *and* untracked files, but its file list
comes from `git ls-files --others --exclude-standard`, and `.gitignore:9` ignores
`apps/web/dist/`. No documented workflow uploads a locally built `dist/`, so this
is latent rather than shipped - but the command in `DEPLOYMENT.md` is the same
command a developer runs locally, and nothing between the two would notice.

Reproduce:

```bash
cp .env.example .env
pnpm --filter @vitae/web build
grep -l 'jsxDEV(' apps/web/dist/assets/*.js | wc -l   # 49
grep -l '/home/' apps/web/dist/assets/*.js | wc -l    # 49
mv .env .env.off && pnpm --filter @vitae/web build && mv .env.off .env
grep -l 'jsxDEV(' apps/web/dist/assets/*.js | wc -l   # 0
```

---

## Severity 2: reference surfaces that under-report reality

### DOC-D-003 - the OpenAPI document covers under half the API

`docs/api/openapi.json` describes **49 paths / 53 operations**. The routers
declare **133 handlers**.

`apps/api/src/openapi/spec.ts:60` defines `stubGet`, used at line 471 to emit one
placeholder path per mount prefix so the per-mount contract assertion passes. The
document therefore reports full mount coverage while describing 40% of the
operations.

```bash
node -e "const j=require('./docs/api/openapi.json');console.log(Object.keys(j.paths).length)"
grep -rhcE "^[A-Za-z]+Router\.(get|post|put|patch|delete)\(" \
  $(find apps/api/src/routes -name '*.ts' ! -name '*.test.ts' ! -name 'index.ts') | paste -sd+ | bc
```

Consequence for this project: the API reference must be generated by walking
`apps/api/src/routes/**/*.ts` and joining to `V1_MOUNT_PREFIXES`, never by
reading `openapi.json`.

### DOC-D-004 - `docs/api/README.md` documents 17 of 34 mount prefixes

Absent: `/suggest`, `/letters`, `/docs`, `/settings`, `/habits`,
`/people/{personId}/favors`, `/orgs`, `/intros`, `/composer`, `/graph`,
`/timeline`, `/map`, `/places`, `/views`, `/imports`, `/duplicates`,
`/retention`.

Source of truth: `apps/api/src/openapi/mounts.ts`.

### DOC-D-005 - the requirement spine is severed

> **Resolved.** What follows is the state before the fix, kept because the record of
> what was wrong is the point of this document. The fix is in the resolved table at
> the end.

**73** distinct requirement identifiers are cited across API services, core
algorithms, web routes, tests, and `.github/workflows/ci.yml`. `docs/specs/srs.md`
defines **none of them**.

```bash
grep -rhoE "\b(FR|NFR)-[A-Z]*-?[0-9]{3}\b" --include='*.ts' --include='*.tsx' \
  --include='*.yml' --include='*.md' apps packages e2e .github docs | sort -u | wc -l   # 73
grep -coE "\b(FR|NFR)-[A-Z]*-?[0-9]{3}\b" docs/specs/srs.md                             # 0
```

Families in use: `FR-001`-`FR-027`, `FR-102`, `FR-104`, `FR-105`, `FR-CAP-*`,
`FR-CON-*`, `FR-EXP-*`, `FR-ORG-*`, `FR-RES-*`, `FR-SET-*`, `FR-SRCH-*`,
`FR-VIS-*`, `NFR-REL-003`. No requirement can be traced to its implementation or
its tests.

### DOC-D-006 - nine section references point into a document with no sections

`docs/ARCHITECTURE.md` cites SRS `§10.7.1`-`§10.7.6` (lines 137-142), `§6.6`
(143), `§8.4` (144), `§5.1` (145), and `§10.7` (21). `docs/specs/srs.md` contains
**zero** numbered sections.

```bash
grep -nE "§[0-9]" docs/ARCHITECTURE.md | wc -l    # 10 citations
grep -cE "^#{2,3} [0-9]" docs/specs/srs.md        # 0 numbered sections
```

`docs/ROADMAP.md` additionally cites `§4.2-4.7`, `§4.3.22-28`, `M0`, `INT-1`,
`IMP-001..006`, `VIS-001/002/003`, and `EXP-012/013`, none of which resolve.

### DOC-D-007 - `restore-drill.md` cites a section that does not exist

`docs/runbooks/restore-drill.md:105` links `docs/DEPLOYMENT.md` **§8**.
`docs/DEPLOYMENT.md` has numbered sections 1 through 5.

### DOC-D-008 - no user documentation exists

There are no task guides, no screen reference, no troubleshooting material, and
no FAQ. `docs/ONBOARDING.md` is contributor onboarding, not user onboarding. A
first-time user has the marketing site and the running application, nothing else.

### DOC-D-009 - no package has a README

All seven first-party packages are undocumented at their root: `packages/core`,
`packages/ui`, `packages/config`, `packages/testkit`, `apps/web`, `apps/api`,
`services/buildsvc`.

### DOC-D-042 - a requirement family with a digit in its name is invisible to the tooling

> **Resolved.** What follows is the state before the fix, kept because the record
> of what was wrong is the point of this document. The fix is in the resolved
> table at the end.

`packages/ui/src/styles/base.css:123` carries a requirement citation:

```css
/* Visible focus everywhere (WCAG 2.1 AA: NFR-A11Y-001). */
```

`NFR-A11Y-001` is not in `docs/registry/requirements.json`, is not in that file's
`id_aliases`, and does not appear anywhere in `docs/generated/traceability.json`.
It is not merely undefined - it cannot be read. Both patterns in
`scripts/docs/lib/citations.mjs:19` spell a family name as uppercase letters
only:

```js
const CITATION = /\b((?:FR|NFR)(?:-[A-Z]{2,4})?)-(\d{3}).../g;
const ALIAS = /(^|[^A-Z-])([A-Z]{2,4})-(\d{3}).../g;
```

`A11Y` contains digits, so `[A-Z]{2,4}` cannot express it. Tracing `CITATION`
against the string: `(?:FR|NFR)` consumes `NFR`, the optional family group tries
`-A11Y` and fails on the `1`, so it matches empty, and the pattern then requires
`-` followed by three digits where the text has `-A11`. No later start position
matches either. `ALIAS` needs two to four consecutive uppercase letters before
`-001` and finds one. The identifier produces no match of any kind. The JSON
Schema at `scripts/docs/lib/json-schema.selftest.mjs:49` carries the same
`[A-Z]{2,4}`, so even adding the requirement to the registry by hand would be
rejected as malformed.

`gen-traceability.mjs:54` does read `.css`, and `:50` excludes only
`scripts/docs/`, so the file is scanned and the line is reached. The grammar is
the whole of the failure.

This is the mild form of the `DOC-D-001` shape. Nothing is broken, no check
lies, and `check-docs-traceability.mjs` correctly reports that every citation it
can see resolves. The set it can see is smaller than the set that exists, and
nothing says so. A sweep of every tracked readable file for the loose form
`[A-Z][A-Z0-9]{1,5}-\d{3}` found exactly one identifier the strict grammar
misses, so the blind spot is currently one requirement wide - but it is the
accessibility requirement, cited on the rule that draws every focus ring in the
product.

Reproduce:

```bash
git ls-files -z | xargs -0 grep -n 'NFR-A11Y-[0-9]\{3\}'   # one hit
grep -c A11Y docs/registry/requirements.json                # 0
grep -c A11Y docs/generated/traceability.json               # 0
```

---

### DOC-D-043 - sixteen map entries declared a module untested while its tests sat beside it

> **Resolved.** What follows is the state before the fix, kept because the record
> of what was wrong is the point of this document. The fix is in the resolved
> table at the end.

`docs/testing/source-test-map.json` is the repository's answer to the question
"what proves this module". Sixteen entries answered "nothing", from a directory
that already held the suite:

```json
"apps/web/src/routes/reference/EntityCatalogOverview.tsx": {
  "risk": "medium",
  "layers": ["component", "e2e"],
  "status": "deferred",
  "tests": [],
  "exclude_reason": "Deferred web coverage: component and/or e2e ownership in a later wave."
}
```

`EntityCatalogOverview.states.test.tsx` sits beside that module, imports it and
asserts its states. The same sentence stood over `Person.tsx` (three suites),
`Org.tsx` (two), `Browse.tsx`, `Atoms.tsx`, `Outputs.tsx`, `app/routes.ts`, the
two bulk-delete features, four Atlas panels and three further reference modules.

The cause is one function away from `DOC-D-001`. `colocatedTest()` built its
candidates by swapping extensions, so the only shapes it could recognise were
`<name>.test.ts`, `<name>.test.tsx` and `<name>.spec.ts`. This repository's
other convention is a facet suffix - `Person.states.test.tsx`,
`AtlasCanvas.error.test.tsx`, `Person.log.test.ts` - and eighty-four such files
sit beside a module of the same stem inside the three directories the gate
walks. It could see none of them, so it demanded a map entry for each; whoever
wrote the entry was recording the gate's view of the world, and the map
inherited it.

Thirteen of the sixteen arrived that way. The other three - `app/routes.ts`,
`Org.tsx` and `Person.tsx` - do have a plainly named suite, so the gate found
it, skipped the module and never opened the entry beside it. That is the second
half of the defect and the more durable one: the `tests` field was written by
hand and read by nobody, in a file whose whole purpose is to be checked.

Note which way this points, because it is the opposite of `DOC-D-001`. There a
gate could not fail. Here a gate fails correctly, for a reason that is wrong,
and files that wrong reason in a reference surface a reader is entitled to
trust. Nothing broke and no test was lost; the cost falls on whoever plans the
next wave of test work and begins with sixteen modules that are already covered.
The claim did not spread beyond the file: no generator reads it, and the
`untested` counts in `docs/generated/` are computed from the import graph.

Reproduce:

```bash
ls apps/web/src/routes/reference/EntityCatalogOverview*   # module and suite, one directory
git show 48c534c:docs/testing/source-test-map.json |
  node -e 'const m = JSON.parse(require("node:fs").readFileSync(0, "utf8"));
    console.log(JSON.stringify(m.modules["apps/web/src/routes/reference/EntityCatalogOverview.tsx"]))'
# {"risk":"medium","layers":["component","e2e"],"status":"deferred","tests":[],
#  "exclude_reason":"Deferred web coverage: component and/or e2e ownership in a later wave."}
```

Run the repaired `scripts/check-test-coverage-map.mjs` against that revision's
map and it names all sixteen, each as `declared untested while <suite> sits
beside it`.

---

## Severity 3: contradictions between documentation and shipped code

### DOC-D-010 - the Cloud subsystem is a documentation blackout

Occurrences of `cloud`, `workspace`, `tenant`, `billing` and `paddle`:

| File | cloud | workspace | tenant | billing | paddle |
| --- | --- | --- | --- | --- | --- |
| `docs/ARCHITECTURE.md` | 0 | 0 | 0 | 0 | 0 |
| `docs/ROADMAP.md` | 0 | 0 | 0 | 0 | 0 |
| `docs/testing/coverage-matrix.md` | 0 | 0 | 0 | 0 | 0 |
| `CHANGELOG.md` | 0 | 2 | 0 | 0 | 0 |

The shipped system has a workspace-partitioned schema, a three-layer isolation
stack (`workspaceMiddleware`, `entitlementGate`, `AsyncLocalStorage`), a billing
control plane, and a signed webhook receiver. None of it is described in the
architecture guide.

### DOC-D-011 - the required Cloud ADR was never written

`GOVERNANCE.md` states: *"Major changes to storage, authentication, public APIs,
or deployment policy need an architecture decision record and an upgrade path."*

The Cloud plane changed all four:

- storage: `apps/api/src/db/migrations/007`-`010`, including a primary-key change
- authentication: `apps/api/src/middleware/workspace.ts`
- public APIs: `/api/v1/billing`, `/webhooks/paddle`
- deployment policy: `VITE_PUBLIC_CLOUD_ENABLED`, provisioning gate

`docs/adr/` holds `0001`-`0005`. There is no `0006`.

### DOC-D-012 - the SRS denies a capability the schema implements

> **Resolved.** What follows is the state before the fix, kept because the record of
> what was wrong is the point of this document. The fix is in the resolved table at
> the end.

`docs/specs/srs.md:25`: *"Vitae does not provide multi-tenant hosting, social
networking, behavioural..."*

`apps/api/src/db/migrations/009-workspace-primary-keys.ts` makes
`(workspace_id, id)` the primary key across the graph tables. The document is
marked *"current for v1.0.0"*.

### DOC-D-013 - the security section under-reports the public surface by three routes

`docs/ARCHITECTURE.md:166-167`: *"only `/health` and the dev-login/logout
endpoints are public"*.

Actual public surface:

| Route | Why it is public | Source |
| --- | --- | --- |
| `/health` | outside `/api`, registered before `authGate` | `apps/api/src/app.ts:57` |
| `/ready` | outside `/api`, registered before `authGate` | `apps/api/src/app.ts:58` |
| `/webhooks/paddle` | deliberately outside default-deny; verifies an HMAC instead | `apps/api/src/app.ts:50` |
| `/api/v1/auth/dev-login` | `PUBLIC_PATHS` | `apps/api/src/middleware/auth.ts:35` |
| `/api/v1/auth/logout` | `PUBLIC_PATHS` | `apps/api/src/middleware/auth.ts:35` |
| `/api/v1/auth/me` | `PUBLIC_PATHS` | `apps/api/src/middleware/auth.ts:35` |

Three routes are missing from the guide, one of which accepts unauthenticated
POST bodies from a payment provider. `app.ts:47-49` documents the webhook
decision correctly in a code comment; the architecture guide never picked it up.

### DOC-D-014 - a superseded brand identity carries no supersession marker

`docs/design/addenda/P26-aurora-identity.md` prescribes gradients, glow, and an
electric-cyan accent. `scripts/check-brand-bans.mjs` fails the build on
`gradient`, on blurred `box-shadow` outside the two approved tokens, and on raw
hex outside `tokens.css`.

The file contains no occurrence of `supersede`, `superseded`, `historical`, or
`not current`. Its H1 reads as current guidance. A contributor who reads it first
will implement patterns that cannot pass CI.

### DOC-D-015 - the motion amendment excludes the pages it now needs to cover

`docs/design/MOTION.md:144-151` scopes its marketing register to `/`, `/tour` and
`/manifesto`, with line 151 reading **"Permitted on those three routes and
nowhere else"**.

`ffd9819 feat(marketing)` added `/how-it-works`, `/pricing`, `/product`,
`/product/career-evidence`, `/product/warm-paths`, and `/security-and-ownership`.
By the document's own rule these pages are non-compliant.

### DOC-D-016 - the design system's public route list is nine routes out of date

`DESIGN.md:120-121` names `/`, `/tour`, `/manifesto`, `/guides`, `/resources`,
legal/status pages, `/reference/entities`, and `/welcome`.

`apps/web/src/App.tsx` registers these additional paths above the auth wildcard:
`/changelog`, `/how-it-works`, `/pricing`, `/product`, `/product/career-evidence`,
`/product/warm-paths`, `/security-and-ownership`, `/signin`, `/signup`.

---

## Severity 4: stale facts

| ID | Defect | Evidence |
| --- | --- | --- |
| `DOC-D-017` | `docs/ONBOARDING.md:9` sets the Node floor at **≥ 20 (22 recommended)**. `package.json` `engines` requires **`>=22.23.0 <23`**. A contributor following the guide installs a version the workspace refuses. | `docs/ONBOARDING.md:9` |
| `DOC-D-018` | `docs/ONBOARDING.md:84` describes `test:all` as *"map + prose + unit + web"*. It actually runs eight gates: `map`, `prose`, `public`, `brand`, `unit`, `web`, `a11y`, `performance`. | root `package.json` |
| `DOC-D-019` | Three different node-type counts for one fact. `NODE_TYPES` composes to **34** (16 career + 11 life + 7 proposed). `apps/api/src/scripts/seed-demo.ts:3` says 33. `docs/design/addenda/P23-entity-forms.md:3` says 28, which is the `EDGE_TYPES` count. | `packages/core/src/types.ts` |
| `DOC-D-020` | `apps/web/package.json:6` describes the app as *"React 18 + Vite SPA"*. Line 29 pins `react: ^19.2.8`. | same file |
| `DOC-D-021` | `docs/ARCHITECTURE.md:28` names two résumé templates, *"Onyx, Argon"*. Three exist. The missing one, **cobalt**, is the default. | `templates/` |
| `DOC-D-022` | `README.md:77` links `docs/testing/README.md`. The file does not exist. | absence |
| `DOC-D-023` | `docs/ARCHITECTURE.md:6` cites `constitution.md` as *"the non-negotiable principles"*. The file does not exist. ADR 0002 and ADR 0003 cite it too. | absence |
| `DOC-D-024` | `docs/specs/merge-plan.md:12` and `:24` contain a self-referential redirect, `app.vitae.example` to `app.vitae.example` (301), left behind by placeholder scrubbing. | same file |
| `DOC-D-025` | `packages/core/src/algorithms/graph-paths.ts:102` branches on edge type `INTRODUCED`. `EDGE_TYPES` does not contain it. The branch is unreachable. | `packages/core/src/types.ts` |
| `DOC-D-026` | `packages/config/package.json` declares no `scripts`, so `pnpm -r typecheck` and `pnpm -r test` silently skip the package. **Partly corrected by `DOC-D-039`:** the package is skipped as a unit, but its source *is* type-checked, transitively, by every consumer that imports it. The `pnpm -r test` half stands - it has no tests. | same file |
| `DOC-D-027` | **Resolved; see the table at the end.** `pnpm test:brand` is in `test:all` but absent from `.github/workflows/ci.yml`. Line 65 runs `test:map && test:prose && test:public` only. The brand guard never runs in CI. | `.github/workflows/ci.yml:65` |
| `DOC-D-028` | `docs/DEPLOYMENT.md:142` advises pairing exports with *"managed Postgres backups for short recovery windows"* without stating the window. `docs/runbooks/postgres-restore.md` records that the PITR window is **1 day, not the 7 the design assumed**, because the account is on a Free Tier plan. The operational constraint exists in one document and not the one operators are pointed at first. | both files |
| `DOC-D-029` | CI names journeys `J1 capture`, `J4 résumé`, `J8 trash/restore`. The numbering implies J2, J3, J5, J6 and J7 exist as product journeys with no executable coverage. No document records which journeys exist or which are covered. | `.github/workflows/ci.yml:319` |
| `DOC-D-031` | `docs/ROADMAP.md:40` plans backups as a nightly `pg_dump` to R2 with a quarterly restore drill. The shipped system is different in target, mechanism and cadence: `scripts/backup-to-s3.sh` uploads a full export bundle to S3 and is wired to `pnpm backup:s3`. The roadmap row also calls the work unshipped while the script exists, so an operator reading the roadmap would prepare for a database dump that nothing produces. Found by re-checking a claim this document had itself recorded as not upheld. | `docs/ROADMAP.md:40`, `scripts/backup-to-s3.sh:2`, `package.json` |
| `DOC-D-033` | `apps/api/src/middleware/auth.ts:35` lists `/^\/health$/` as a public path. `authGate` is mounted at `/api` (`apps/api/src/app.ts:62`) and matches against `req.baseUrl + req.path` (`auth.ts:127`), which therefore always begins `/api`. The pattern can never match. `/health` is reachable without authentication because `app.ts:58` registers it four lines *above* the gate, not because it is declared public. A security page that presented `PUBLIC_PATHS` as the list of unauthenticated routes would be describing a mechanism that does not govern the route it names. | `apps/api/src/middleware/auth.ts:35,127`, `apps/api/src/app.ts:58,62` |
| `DOC-D-034` | Five production modules totalling **1,601 lines** are imported only by their own tests: `apps/web/src/components/ListToolbar.tsx` (275), `apps/web/src/lib/format-date.ts` (372), `apps/web/src/lib/selection.ts` (217), `apps/web/src/lib/unsaved-changes.tsx` (288), `packages/ui/src/combobox.tsx` (449). Each is tested and passing; nothing in the product reaches any of them. Documenting them as behaviour a user can observe would assert functionality the application does not expose, so the corpus must treat them as unreferenced code rather than as features. | `docs/generated/atlas-summary.json`, `summary.consumed_only_by_tests` |
| `DOC-D-036` | Four design tokens are declared and never consumed: `--ae-data-idea`, `--ae-data-practice` and `--ae-data-other` (`packages/ui/src/styles/tokens.css:177-180`), and `--ae-trace-current` (`:57`). The `--ae-data-*` family is referenced by literal name throughout `apps/web/src/styles/`, never assembled from a variable, so these four are genuinely unreferenced rather than dynamically constructed the way `--ae-viz-N` is. A token catalog must show them as declared-unused rather than as part of the working palette. | `docs/generated/tokens.json`, `summary.unused` |
| `DOC-D-037` | Four `@vitae/ui` exports have no importer outside the package: `Card`, `Combobox`, `HelpTip`, `Toast`. `Toast` is the one that looks used and is not - `apps/web/src/features/Toast.tsx` imports `ToastProvider` from the library and exports a `ToastProvider` of its own (`:89`), so 31 modules depend on the application's toast while the library's `Toast` component has no consumer at all. A component catalog that counted name matches would report the opposite. | `docs/generated/components.json`, `summary.unused` |
| `DOC-D-038` | `packages/ui/src/forms.tsx:34` applies `vt-fld--error` to a field wrapper whenever the field carries an error. No stylesheet defines `.vt-fld--error`. `.vt-fld`, `.vt-fld__label`, `.vt-fld__help`, `.vt-fld__req` and `.vt-fld__error` all exist, so the error *message* is styled while the error *state of the container* renders nothing at all. Two further classes have no rule: `.vt-info`, whose children `__title`, `__body`, `__shortcut` and `__shortcuts` are each styled, and `.vt-cbx__input`, which sits inside the component `DOC-D-037` records as having no consumer. | `docs/generated/components.json`, `summary.unstyled_classes`; `packages/ui/src/forms.tsx:34` |
| `DOC-D-039` | `@vitae/e2e` is type-checked by nothing. It declares neither `typecheck` nor `build`, and no workspace imports it, so its **250 cases** - the entire browser acceptance suite - are compiled only at the moment Playwright runs a file. Verified by appending `const x: number = 'a'` to `e2e/tests/helpers/a11y.ts`: `pnpm typecheck` and `pnpm build` both exit 0. The same probe corrects `DOC-D-026` - placed in `packages/config/src/env.ts` it **is** reported, and the root `pnpm typecheck` exits 2, because that package publishes TypeScript source through its `exports` map and each consumer's compiler follows it. Config is checked as a side effect of being imported; e2e is not checked anywhere. `services/buildsvc` also declares no `typecheck`, but `"build": "tsc"` covers it through `pnpm build` at `.github/workflows/ci.yml:98`. | measured; `docs/generated/packages.json`, `summary.workspace_typecheck` |

---

## Claims investigated and not upheld

Recorded so they are not re-investigated.

| Claim | Finding |
| --- | --- |
| `pnpm test:map` currently fails on `billing.ts`, `webhooks/paddle.ts` and `control-plane.ts`. | **False.** The gate passes. Those modules are genuinely unmapped and untested, but the gate cannot report them, which is `DOC-D-001`. The correct finding is more severe than the reported one. |
| Three documents describe three different backup systems (R2 versus S3, `pg_dump` versus export bundle, planned versus running). | **Partly upheld, and this entry previously overcorrected.** The three-document part is false: `docs/DEPLOYMENT.md`, `docs/runbooks/restore-drill.md` and `docs/runbooks/postgres-restore.md` all describe the same export-bundle-to-S3 system implemented by `scripts/backup-to-s3.sh`, wired to `pnpm backup:s3`. An earlier revision of this row went on to assert that *no document mentions R2*, which is false: `docs/ROADMAP.md:40` does. The divergence is real, it is two-way rather than three-way, and it is now recorded as `DOC-D-031`. |
| `docs/merge-plan.md` contains a broken redirect. | **Path wrong.** The file is `docs/specs/merge-plan.md`. The defect itself is real and is recorded as `DOC-D-024`. |

---

## Areas with no documentation at all

These are gaps rather than defects. Each becomes a section of the corpus.

| Area | Current state |
| --- | --- |
| User onboarding and task guides | none |
| Screen-by-screen reference | none |
| Troubleshooting and recovery for users | none |
| Route catalog | none outside `apps/web/src/App.tsx` |
| Configuration and environment reference | none outside `packages/config` |
| Algorithm constants and formulas | none outside `packages/core/src/algorithms/constants.ts` |
| Migration catalog | none outside `apps/api/src/db/migrations/` |
| Design token catalog | none outside `packages/ui/src/styles/tokens.css` |
| Component catalog | none outside `packages/ui/src` |
| Requirement to implementation to test traceability | none |
| Cloud architecture and subscription lifecycle | none (`DOC-D-010`) |
| Incident response runbook | required by `docs/CLOUD-LAUNCH.md:58`, does not exist |

---

## Maintenance

This document is verified, not generated. When a defect is fixed, move its row to
the resolved table below with the commit that fixed it, rather than deleting it,
so the record of what was wrong survives.

Re-verify with the commands embedded in each entry. `scripts/check-docs-claims.mjs`
will fail the build if a page asserts an implementation status that contradicts
this inventory.

### Resolved

Commits are referenced by subject, because a row written before its own commit
cannot contain that commit's hash. Resolve a subject with
`git log --oneline --grep '<subject>'`.

| ID | Fixed in | Note |
| --- | --- | --- |
| `DOC-D-001` | `fix(testing): let the source-to-test gate fail again` | `colocatedTest()` now rejects a candidate equal to the module's own path. The gate went from 275 walked modules always passing to 18 reported. A self-test in `scripts/check-test-coverage-map.selftest.mjs` runs ahead of every invocation and asserts the gate still fails on an unmapped module, so this defect cannot recur silently. |
| `DOC-D-005` | `docs(traceability): define every requirement the code cites` | `docs/registry/requirements.json` defines all **98** identifiers the repository cites, and `docs/specs/srs.md` now carries every one of them in a block between generated markers. This entry measured 73 because the pattern it used cannot see 25 of them: five belong to an `INT-*` family that `(FR\|NFR)` cannot match, one (`NFR-MNT-002`) is cited only from root-level `eslint.config.js`, outside the searched directories, eight are written under the prefix-less spellings `EXP-*` and `IMP-*` that `docs/ROADMAP.md` uses, and eleven appear only as the continuation of a group or range such as `FR-RES-002/003/010/016/017`. Re-running the command in this entry today returns 110 rather than 98, because the generated register also lists the numbers it records as belonging to nothing; the tooling strips generated regions before reading citations, a hand-run `grep` does not. `pnpm docs:check` now fails when the register, the repository and the document disagree in any direction, and `scripts/check-docs-traceability.selftest.mjs` breaks a fixture twelve ways to prove it can. |
| `DOC-D-012` | `docs(traceability): define every requirement the code cites` | `docs/specs/srs.md` no longer denies multi-tenant hosting. The replacement states what migration `009-workspace-primary-keys` established, names the workspace boundary as a shipped property of the schema, and says in the document itself that the earlier sentence was corrected rather than repeated, so a reader who remembers the old claim can see it was withdrawn on evidence. |
| `DOC-D-027` | `fix(testing): let the source-to-test gate fail again` | `pnpm test:brand` added to the `quality` job in `.github/workflows/ci.yml`. |
| `DOC-D-030` | `fix(testing): let the source-to-test gate fail again` | `let` to `const` in `apps/api/src/services/control-plane.ts:100`. No behaviour change. `pnpm lint` now exits 0 with 40 pre-existing warnings and no errors. |
| `DOC-D-042` | `fix(traceability): let a family name carry a digit` | `FAMILY` in `scripts/docs/lib/citations.mjs` is now one exported pattern, `[A-Z][A-Z0-9]{1,4}`, that the citation reader, the sort order and `check-docs-traceability.mjs` all build their expressions from; a digit still may not open a family name, so `SHA-256` and `3D-001` are refused as before. `NFR-A11Y-001` is registered from the evidence in `base.css` and marked `needs-review`. The register's JSON Schema cannot import the constant, so `citations.selftest.mjs` asserts the two spellings match and was seen to fail when they were made to differ. Measured effect: traceability went from 348 citations across 133 files to 351 across 134 - `packages/ui/src/styles/base.css` had been absent from the graph entirely, because its only identifier was unreadable rather than unwritten. |
| `DOC-D-040` | `fix(a11y): make the skip links skip` | `Chrome.tsx`'s main carries `tabIndex={-1}`, so its skip link now moves focus rather than only the viewport. `/reference/entities` gained the skip link it never had, with the same off-screen-until-focused treatment the shell and the marketing chrome use, and `.ec-main:focus` suppresses the ring the way `.content:focus` does at `apps/web/src/styles/app.css:3554` - a page-height element turns a `box-shadow` ring into two vertical lines. `seo.ts` was left alone: the row naming it was wrong, and the entry above now says why. Both surfaces are asserted by tests that were run against the unfixed code and seen to fail: a new `apps/web/src/routes/marketing/Chrome.test.tsx`, and a case added to `apps/web/src/routes/reference/EntityCatalog.states.test.tsx`. |
| `DOC-D-041` | `fix(build): make a local pnpm build a production build` | `NODE_ENV` removed from `.env.example`, which is the only file in the repository that put it on a developer's machine; the comment left in its place explains why it must not come back. Because an existing `.env` is user-owned and was not edited, `scripts/check-web-budgets.mjs` now refuses a bundle carrying the development JSX runtime or the build machine's absolute paths, before it forms any opinion about size - so the residue announces itself instead of being measured. Seen to fail: `49 of 55 chunks carry the development JSX runtime`, exit 1. `scripts/check-web-budgets.selftest.mjs` runs seven cases ahead of every invocation. |
| `DOC-D-032` | `docs(traceability): define every requirement the code cites` | Found while editing, not during the audit, so it has no open row above: the stack table in `docs/specs/srs.md` named the web application as *"React 18 and Vite"*, while `apps/web/package.json:29` pins `react: ^19.2.8`. Corrected in the same edit. This is the same fact as `DOC-D-020`, which remains open in its second location, `apps/web/package.json:6`. |
| `DOC-D-043` | `fix(testing): let the coverage map see the tests beside it` | `colocatedTest()` is replaced by `siblingTests()`, which lists the directory instead of guessing filenames. Plain `<name>.test.ts`, `.test.tsx` and `.spec.ts` count on their name, because a few of them prove a component through the content module it renders; facet-named files count only when they import the module, so `Foo.helpers.test.ts` can never be read as proof of `Foo.ts`. That costs recall deliberately: fifty-two of the eighty-four facet suites import their module and count, and the other thirty-two still require a map entry. A second rule closes the half nothing was reading - an entry with an empty `tests` array now fails when a sibling suite exists, which is what caught these sixteen. All sixteen entries now name their real suites and `$schema_note` states both rules. Seen to fail: the two new cases in `scripts/check-test-coverage-map.selftest.mjs` were run against `HEAD`'s checker and reported `expected exit 0, got 1` and `expected exit 1, got 0`. An entry that names some of its siblings but not all of them is incomplete rather than false, and is left alone. |
| `DOC-D-006` | `docs(product): author the definition forward around four personas` | Closed in two halves. The architecture guide's ten `§` references were replaced with registered identifiers one commit earlier (`docs(product): point surfaces and citations at what ships`); this commit rewrote `docs/ROADMAP.md`, so its `§4.x`, `M0`, and prefix-less citations are gone too - every SRS cell now carries canonical registered identifiers. The registered-but-uncited hazard a roadmap rewrite used to pose was pre-empted by the anchor section added in `docs(specs): anchor the fragile identifiers, and open ADR 0007`, which cites the twenty-one grouped-citation dependents individually. |
| `DOC-D-031` | `docs(product): author the definition forward around four personas` | The roadmap no longer plans a nightly `pg_dump` to R2 that nothing produces. Its recovery row states what ships - `scripts/backup-to-s3.sh`, wired to `pnpm backup:s3`, uploading a full export bundle to S3 - and what awaits operational confirmation (cadence and objectives), citing `NFR-OPS-001`, `FR-EXP-012`, and `FR-EXP-013`. The two-way R2-versus-S3 divergence is gone because only one system is described anywhere. |
| `DOC-D-029` | `docs(product): give every journey a statement, and its stories` | `J2`, `J3`, `J5`, `J6` and `J7` carry authored statements under ADR 0007, with two honest statuses distinguishing them: `partial` for journeys whose steps ship but whose identifier no spec names (J2, J3, J6 - covered unnamed by `exploration.spec.ts`, `import.spec.ts`, `duplicates.spec.ts`, `export.spec.ts`), and a new `planned` status for journeys riding on registered intent (J5 dossiers, J7 correspondence). The journeys page and `docs/registry/journeys.json` no longer describe empty rows, and `docs/observatory/product/stories.md` gives all eight journeys acceptance criteria that cite the requirement register. |
