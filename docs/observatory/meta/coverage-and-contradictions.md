---
id: META-AUDIT
title: Documentation coverage and contradiction inventory
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
verified_at: 2026-08-23
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

### DOC-D-001 — `pnpm test:map` never reports a missing module

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

### DOC-D-002 — the gap is where the newest code lives

`scripts/check-test-coverage-map.mjs` is unchanged since `20f2b86 Release Vitae
1.0.0`. Sixteen of the eighteen unguarded modules were added in the three
feature commits after it.

| Commit | Unguarded modules introduced |
| --- | --- |
| `1e2c502 feat(cloud)` | `apps/api/src/cloud/paddle.ts`, `apps/api/src/middleware/workspace.ts`, `apps/api/src/routes/v1/billing.ts`, `apps/api/src/routes/webhooks/paddle.ts`, `apps/api/src/services/control-plane.ts`, `apps/api/src/db/migrations/007`–`010`, `apps/web/src/lib/paddle.ts` |
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

### DOC-D-030 — `pnpm lint` fails on `main`

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

---

## Severity 2: reference surfaces that under-report reality

### DOC-D-003 — the OpenAPI document covers under half the API

`docs/api/openapi.json` describes **48 paths / 52 operations**. The routers
declare **131 handlers**.

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

### DOC-D-004 — `docs/api/README.md` documents 17 of 33 mount prefixes

Absent: `/suggest`, `/letters`, `/settings`, `/habits`,
`/people/{personId}/favors`, `/orgs`, `/intros`, `/composer`, `/graph`,
`/timeline`, `/map`, `/places`, `/views`, `/imports`, `/duplicates`,
`/retention`.

Source of truth: `apps/api/src/openapi/mounts.ts`.

### DOC-D-005 — the requirement spine is severed

**73** distinct requirement identifiers are cited across API services, core
algorithms, web routes, tests, and `.github/workflows/ci.yml`. `docs/specs/srs.md`
defines **none of them**.

```bash
grep -rhoE "\b(FR|NFR)-[A-Z]*-?[0-9]{3}\b" --include='*.ts' --include='*.tsx' \
  --include='*.yml' --include='*.md' apps packages e2e .github docs | sort -u | wc -l   # 73
grep -coE "\b(FR|NFR)-[A-Z]*-?[0-9]{3}\b" docs/specs/srs.md                             # 0
```

Families in use: `FR-001`–`FR-027`, `FR-102`, `FR-104`, `FR-105`, `FR-CAP-*`,
`FR-CON-*`, `FR-EXP-*`, `FR-ORG-*`, `FR-RES-*`, `FR-SET-*`, `FR-SRCH-*`,
`FR-VIS-*`, `NFR-REL-003`. No requirement can be traced to its implementation or
its tests.

### DOC-D-006 — nine section references point into a document with no sections

`docs/ARCHITECTURE.md` cites SRS `§10.7.1`–`§10.7.6` (lines 137-142), `§6.6`
(143), `§8.4` (144), `§5.1` (145), and `§10.7` (21). `docs/specs/srs.md` contains
**zero** numbered sections.

```bash
grep -nE "§[0-9]" docs/ARCHITECTURE.md | wc -l    # 10 citations
grep -cE "^#{2,3} [0-9]" docs/specs/srs.md        # 0 numbered sections
```

`docs/ROADMAP.md` additionally cites `§4.2-4.7`, `§4.3.22-28`, `M0`, `INT-1`,
`IMP-001..006`, `VIS-001/002/003`, and `EXP-012/013`, none of which resolve.

### DOC-D-007 — `restore-drill.md` cites a section that does not exist

`docs/runbooks/restore-drill.md:105` links `docs/DEPLOYMENT.md` **§8**.
`docs/DEPLOYMENT.md` has numbered sections 1 through 5.

### DOC-D-008 — no user documentation exists

There are no task guides, no screen reference, no troubleshooting material, and
no FAQ. `docs/ONBOARDING.md` is contributor onboarding, not user onboarding. A
first-time user has the marketing site and the running application, nothing else.

### DOC-D-009 — no package has a README

All seven first-party packages are undocumented at their root: `packages/core`,
`packages/ui`, `packages/config`, `packages/testkit`, `apps/web`, `apps/api`,
`services/buildsvc`.

---

## Severity 3: contradictions between documentation and shipped code

### DOC-D-010 — the Cloud subsystem is a documentation blackout

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

### DOC-D-011 — the required Cloud ADR was never written

`GOVERNANCE.md` states: *"Major changes to storage, authentication, public APIs,
or deployment policy need an architecture decision record and an upgrade path."*

The Cloud plane changed all four:

- storage: `apps/api/src/db/migrations/007`–`010`, including a primary-key change
- authentication: `apps/api/src/middleware/workspace.ts`
- public APIs: `/api/v1/billing`, `/webhooks/paddle`
- deployment policy: `VITE_PUBLIC_CLOUD_ENABLED`, provisioning gate

`docs/adr/` holds `0001`–`0005`. There is no `0006`.

### DOC-D-012 — the SRS denies a capability the schema implements

`docs/specs/srs.md:25`: *"Vitae does not provide multi-tenant hosting, social
networking, behavioural…"*

`apps/api/src/db/migrations/009-workspace-primary-keys.ts` makes
`(workspace_id, id)` the primary key across the graph tables. The document is
marked *"current for v1.0.0"*.

### DOC-D-013 — the security section under-reports the public surface by three routes

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

### DOC-D-014 — a superseded brand identity carries no supersession marker

`docs/design/addenda/P26-aurora-identity.md` prescribes gradients, glow, and an
electric-cyan accent. `scripts/check-brand-bans.mjs` fails the build on
`gradient`, on blurred `box-shadow` outside the two approved tokens, and on raw
hex outside `tokens.css`.

The file contains no occurrence of `supersede`, `superseded`, `historical`, or
`not current`. Its H1 reads as current guidance. A contributor who reads it first
will implement patterns that cannot pass CI.

### DOC-D-015 — the motion amendment excludes the pages it now needs to cover

`docs/design/MOTION.md:144-151` scopes its marketing register to `/`, `/tour` and
`/manifesto`, with line 151 reading **"Permitted on those three routes and
nowhere else"**.

`ffd9819 feat(marketing)` added `/how-it-works`, `/pricing`, `/product`,
`/product/career-evidence`, `/product/warm-paths`, and `/security-and-ownership`.
By the document's own rule these pages are non-compliant.

### DOC-D-016 — the design system's public route list is nine routes out of date

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
| `DOC-D-026` | `packages/config/package.json` declares no `scripts`, so `pnpm -r typecheck` and `pnpm -r test` silently skip the package. | same file |
| `DOC-D-027` | `pnpm test:brand` is in `test:all` but absent from `.github/workflows/ci.yml`. Line 65 runs `test:map && test:prose && test:public` only. The brand guard never runs in CI. | `.github/workflows/ci.yml:65` |
| `DOC-D-028` | `docs/DEPLOYMENT.md:142` advises pairing exports with *"managed Postgres backups for short recovery windows"* without stating the window. `docs/runbooks/postgres-restore.md` records that the PITR window is **1 day, not the 7 the design assumed**, because the account is on a Free Tier plan. The operational constraint exists in one document and not the one operators are pointed at first. | both files |
| `DOC-D-029` | CI names journeys `J1 capture`, `J4 résumé`, `J8 trash/restore`. The numbering implies J2, J3, J5, J6 and J7 exist as product journeys with no executable coverage. No document records which journeys exist or which are covered. | `.github/workflows/ci.yml:319` |

---

## Claims investigated and not upheld

Recorded so they are not re-investigated.

| Claim | Finding |
| --- | --- |
| `pnpm test:map` currently fails on `billing.ts`, `webhooks/paddle.ts` and `control-plane.ts`. | **False.** The gate passes. Those modules are genuinely unmapped and untested, but the gate cannot report them, which is `DOC-D-001`. The correct finding is more severe than the reported one. |
| Three documents describe three different backup systems (R2 versus S3, `pg_dump` versus export bundle, planned versus running). | **False.** `docs/DEPLOYMENT.md`, `docs/runbooks/restore-drill.md` and `docs/runbooks/postgres-restore.md` all describe the same export-bundle-to-S3 system implemented by `scripts/backup-to-s3.sh`, which exists and is wired to `pnpm backup:s3`. No document mentions R2. The real defect is narrower and is recorded as `DOC-D-028`. |
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
| `DOC-D-027` | `fix(testing): let the source-to-test gate fail again` | `pnpm test:brand` added to the `quality` job in `.github/workflows/ci.yml`. |
| `DOC-D-030` | `fix(testing): let the source-to-test gate fail again` | `let` to `const` in `apps/api/src/services/control-plane.ts:100`. No behaviour change. `pnpm lint` now exits 0 with 40 pre-existing warnings and no errors. |
