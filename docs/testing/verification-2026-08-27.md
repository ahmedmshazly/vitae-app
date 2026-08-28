# Full verification sweep, 2026-08-27

Every suite the repository owns, run end to end against `main` at `6e1e2c0`,
with the defects it found and what changed. The sweep was commissioned as a
re-verification: the previous session's testing was done in another tool and
left no commits, no notes and no artifacts, so there was nothing to trust and
nothing to resume. The honest response to an unrecorded test run is to run it
again and write down what happened.

**The baseline was red.** Two of the twenty gate steps failed before anything
was edited, so `main` as published did not pass its own gate. Neither failure
was in product behaviour: one was a generated artifact committed a step behind
its own source, and one was the gate reaching outside itself for a dependency
it does not own. Both are the kind of defect that makes a green result mean
less than it appears to, which is why they are written up here in full.

Identifiers are stable. Cite them as `V-001`.

## Method

1. **Reset the field.** An orphaned API process and a `vite preview` from an
   earlier run were still holding ports 4010 and 5183. `e2e_local()` refuses to run when either
   is held, so the gate could not have started at all. Both were reaped by
   process group, the way `reap_port()` in the gate itself does it.
2. **Baseline, unmodified.** `./scripts/ci-local.sh --full` against the tree
   before a single source edit, run to completion rather than stopped at the
   first failure, so one pass yields the whole failure set.
3. **Root-cause each failure before touching it**, and prefer reproducing a
   cause directly over reasoning to it. `V-002` below is *seen*, not inferred.
4. **Re-run the same command** on the finished tree.
5. **Then the suites the gate deliberately omits**, named individually.

## What the sweep did not touch

The `vitae` development database was not seeded, truncated or read. The gate
keeps its own `vitae_e2e` database and binds API 4010, web 5183 and buildsvc
8797. The long-running `vitae-postgres` and `vitae-buildsvc` development
containers were left alone; the gate reuses Postgres by design, and the
build service sits on 8787, which the gate does not own.

No deployment was written to. The two production origins were read from outside:
health, readiness and two unauthenticated requests that must be refused, and
nothing else.

No application source was modified. The four changes are a regenerated artifact,
the gate script, one browser spec's locator, and the demo seed, which the server
never calls. What production runs is byte-identical before and after.

---

## V-001 - a generated artifact was committed a step behind its own commit

**Seen to fail.** `pnpm docs:check` →
`docs/generated/traceability.json: is stale. Run 'pnpm docs:gen' and commit the result.`

Commit `6e1e2c0` added seven files. Two of them are read by the citation
scanner - `apps/api/src/services/storage/memory.ts`, which cites `FR-001`, and
`apps/web/src/lib/last-viewed.ts`. The commit regenerated `docs/generated/*`,
but did so *before* those files were staged, and the generator reads the
**tracked** file set through git. It therefore indexed a tree that did not yet
contain them, and the regenerated artifacts shipped already out of date.

The drift was sixteen lines: `files_scanned` 943 → 945, `files_citing`
242 → 243, `citations` 917 → 918, and a `memory.ts:14 → FR-001` row.

This is a documented trap in this repository and it caught a commit anyway.
The order that works is **stage, then generate**:

```
git add <paths> → pnpm docs:gen ×2 → pnpm docs:check → pnpm docs:build → pnpm test:public
```

The second `docs:gen` pass is not superstition: when the register block grows,
every line number below it shifts, and one pass records the pre-shift numbers.

**Fixed** by regenerating and committing. `docs:check` now reports
`ok (131 requirements, 19 capabilities, 8 journeys, 920 citations)` - 918 after
the regeneration, and two more once this report joined the tracked set and began
citing identifiers itself.

## V-002 - the API integration step borrowed a build service it does not own

**Seen to fail.** `letters.integration.test.ts > compiles a letter to the same
artifact pair shape a résumé compiles to` reports `expected false to be true`,
with nothing after the colon in `compile failed: `.

That empty message is the whole diagnosis, once the pieces are read together.

The test accepts two outcomes and refuses a third. Either the build service
answered and a real PDF came back, or it was unreachable and `offline` says so.
It took the **reachable** branch and still failed, which is the third outcome -
a compiler that is up and failing.

`apps/api/src/services/buildsvc-client.ts` sets `offline: true` only inside its
`catch`, so only a network-level failure is ever called offline. A reachable
service answering non-2xx falls through to `ok: false` with
`logTail: json.log_tail`, and an authentication rejection carries no LaTeX log.
Hence a failure message that ends at the colon.

The reason it was reachable and rejecting: `api_integration()` in
`scripts/ci-local.sh` pinned `DATABASE_URL`, the Auth emulator host, the owner,
the session secret and `BUILDSVC_HMAC_SECRET` - but not `BUILDSVC_URL`. That one
dependency was left to the environment, where `packages/config/src/env.ts`
defaults it to `http://localhost:8787` and the repository `.env` sets the same.
A developer with `docker compose up -d buildsvc` running therefore had the API
suite signing CI-secret requests against a container holding the *development*
secret.

Reproduced directly against that container, signing one identical request twice:

| secret used | answer |
| --- | --- |
| `ci-buildsvc-secret`, what the gate exports | `401 BAD_SIGNATURE`, no `log_tail` |
| the development secret, what the container holds | reaches the compiler |

The first row is the observed failure exactly: reachable, so not offline;
rejected, so not ok; no log, so an empty message.

**Why this is a gate defect and not a local annoyance.** The same step *passes*
on a machine with no development build service running, because the connection
is refused and the test takes its offline branch. The workflow's
`api-integration` job runs no build service and has no `.env`, so upstream this
case has only ever taken that branch. The result depended on whether an
unrelated container happened to be up - a gate that answers "would CI accept
this" differently depending on the developer's docker state.

**Fixed** by pinning `BUILDSVC_URL=http://127.0.0.1:9` in `api_integration()`,
with the reasoning recorded beside it. Port 9 is discard: privileged, so nothing
a developer runs can bind it, which makes the refusal deterministic. Pointing at
8797 instead would only trade one ambient dependency for another, since a stale
container from an interrupted run listens there.

No assertion was weakened. The test still asserts in full on whichever branch it
takes, and the real-PDF branch is exercised in the e2e layer, where the gate
starts the build service itself and shares its secret with the API.

`test:mirror` compares which scripts and workspaces the two gates run, and
explicitly not their environments or ports - "those differ on purpose" - so
pinning a variable locally does not put the mirror out of step.

**Recorded, not fixed.** A signature rejection from the compiler reaches the
caller as a generic `COMPILE_ERROR` rather than as a configuration fault. That
is an honesty gap in the error envelope rather than a defect in this sweep's
scope, and fixing it is a design decision about what the envelope owes its
reader.

## V-003 - dependency advisories below the enforced threshold

`pnpm audit --audit-level=high`, which is the gate, passes. Lowering the
threshold to `low` surfaces six.

| Severity | Package | Reached through | Ships? |
| --- | --- | --- | --- |
| moderate | `react-router` | `apps/web → react-router-dom@6.30.4` | **yes** |
| moderate | `react-router-dom` | `apps/web` | **yes** |
| moderate | `ajv` | `@stryker-mutator/core` | no - mutation testing |
| moderate | `re2` | `firebase-tools → superstatic` | no - Auth emulator |
| low | `@babel/core` | `@stryker-mutator/instrumenter` | no - mutation testing |

`docs/observatory/develop/quality-gates.md` sets the policy: the gate fails on
high or critical, and a `pnpm.overrides` entry is the sanctioned way to clear an
advisory without waiting upstream.

The two that ship cannot be cleared that way. `react-router` is patched only at
≥ 7.18.0 and the installed line is 6.30.4, so no 6.x release fixes it; the
advisory against `react-router-dom` reports no patched version at all, because
in v7 that package stopped being the entry point. Both therefore resolve to the
same action - a v6 → v7 major migration, which changes routing semantics across
every route in the application. That is a scope change with real breakage risk
and it does not belong inside a verification sweep. Recorded here so the
decision is deliberate rather than unnoticed.

---

## V-004 - a latent strict-mode flake in the document editor spec

**Reasoned, not seen.** It has not fired, and the suite is green with it in
place. It is recorded because it was found while reviewing what a much larger
demo graph would do to the existing locators, and because the same class of
defect has fired here before - commit `3642c0d`, "note text went ambiguous
once the panel cited it".

`e2e/tests/document-editor.spec.ts` asserted `paper.getByText('Education')`.
Playwright's `getByText(string)` defaults to `exact: false`, which is a
case-insensitive **substring** match, scoped here only to the whole résumé
paper. The demo seed already carries an atom containing `education-research`.
If atom selection ever places that bullet on the paper, the locator matches
both it and the section heading, and strict mode fails the test - a data
change presenting as a product defect.

**Fixed** by locating the heading of the section itself:

```
paper.locator('[data-resume-section="education"] .paper__sectiontitle')
```

`DocumentPane.tsx:404` renders `data-resume-section={key}`, and
`packages/core/src/schema/resume.ts:183` defaults `section_order` to
`['summary', 'experience', 'education', 'skills']`, so the attribute is always
present. The neighbouring `Technical Skills` assertion had identical exposure
and got the same treatment.

This is a strengthening, not a relaxation: an assertion that can only be
satisfied by a section heading is narrower than one that any body text on the
page can satisfy. The ratchets confirm nothing was traded away - 52 specs,
294 tests, 1025 assertions, unchanged.

## V-005 - the documented multi-browser mode cannot pass, for two unrelated reasons

**Seen to fail.** `VITAE_E2E_BROWSERS=all` over seven core specs - foundation,
sign-in, shell, today, search, forms and the résumé hub - 45 tests per project.

| Project | Result |
| --- | --- |
| firefox | **45 / 45 passed** |
| mobile-chrome | 39 / 45 |
| webkit | **0 / 45** |

Firefox is the result worth having, and it is a good one: a second engine runs
the whole subset green, including the axe scans. Nothing in the application
depends on Chromium.

The other two are not product defects, and neither is a reason to change
application code.

**WebKit cannot start.** Every one of its 45 failures is `browserType.launch:
Host system is missing dependencies`, naming `libevent-2.1-7t64` and
`libavif16`. The browser binary is installed; the system libraries it links
against are not. Ninety such errors were logged for 45 tests because CI grants
one retry, and a missing shared library is not a flake. Installing them needs
root, which a verification sweep should not take unasked.

**Mobile Chrome runs desktop-only specs.** The six failures are cases like
`shell.spec.ts` › *"desktop rail keeps every workspace reachable when
compacted"*, failing on a 412-pixel Pixel 7 viewport because the desktop rail is
deliberately not rendered there. The spec is right, the application is right,
and the pairing is wrong: `playwright.config.ts` adds `mobile-chrome` as a
project running the entire desktop suite, excluding only the visual baselines.

**Not fixed, deliberately.** The honest fix is per-test viewport gating so the
mobile project runs the cases that mean something at that width, and that is
harness design rather than a defect repair. The dishonest fix is a blanket
`testIgnore` for the files that fail, which would produce a green mobile project
that proves less than nothing - a claim of mobile coverage with the failing
cases removed. `e2e-review-2026-08-25.md` recorded this mode as broken under
E2E-H-012; it is still broken, in two new ways, and saying so is worth more than
a manufactured pass.

The default gate is unaffected: it runs Chromium, which is what CI runs.

## The runs

The sweep began on 27 August and finished on the 28th; it is filed under its
start date, as `e2e-review-2026-08-25.md` is.

Environment: Node 22.23.0, pnpm 9.15.0, Docker 29.1.3, Postgres 17-alpine,
OpenJDK 21.0.11 for the Auth emulator, Playwright Chromium/WebKit/Firefox.

Two gate runs were lost to causes outside the tree, and are named here so the
count of runs in this document reconciles. One was killed mid-suite by the task
runner that owned it - 282 of 284 browser tests had passed and none had failed,
but an interrupted run is not a result and is not counted as one. The other was
abandoned once a concurrent session's untracked scratch files began failing
`test:public` and attributing environment keys to files this repository does not
contain.

That second one is worth a sentence, because the gate was right both times.
`check-public-release.mjs` scans untracked files deliberately - a private string
in the working tree is one `git add -A` away from shipping - and the
configuration generator indexes what is actually there rather than what is
committed. Neither was a false positive; the working tree genuinely held files
that would have failed the release. The fix was for those files to leave the
tree, not for either gate to relax, and the session that owned them moved them
out. The authoritative run below was taken afterwards, against a tree holding
nothing untracked but one deliberately private runbook.

### The gate

`./scripts/ci-local.sh --full` - twenty steps, in the workflow's order.

| Step | Baseline | After |
| --- | --- | --- |
| Install (frozen lockfile) | ok | ok |
| Typecheck | ok | ok |
| Lint | ok | ok |
| Repository gates (map, prose, public, brand) | ok | ok |
| Generated documentation | **failed - V-001** | ok |
| Harness gates (mirror, ratchets, workflow) | ok | ok |
| Unit tests (core + testkit) | ok | ok |
| Design system (`@vitae/ui`) | ok | ok |
| Web unit tests | ok | ok |
| Web accessibility (axe) | ok | ok |
| Property, metamorphic and golden | ok | ok |
| Dependency audit | ok | ok |
| Digest-pin guard | ok | ok |
| Production build | ok | ok |
| Web performance budgets | ok | ok |
| API integration | **failed - V-002** | ok |
| Docker image · api | ok | ok |
| Docker image · buildsvc | ok | ok |
| E2E (Playwright) | ok - 284 passed in 10.0m | ok - 284 passed in 20.0m |
| E2E cloud mode | ok - 12 passed in 21.6s | ok - 12 passed |

The final column is one run, on the committed tree, with every step green.

### What the whole program comes to

| Layer | Files | Tests |
| --- | --- | --- |
| Core (unit, property, metamorphic, golden) | 48 | 388 |
| Web components and routes | 175 | 1266 |
| Design system (`@vitae/ui`) | 9 | 230 |
| API integration, contract, security, resilience | 65 | 354 |
| Test kit | 2 | 7 |
| Browser, self-hosted | 52 specs | 284 |
| Browser, cloud mode | 2 specs | 12 |
| **Total** | | **≈ 2,541** |

### The cost of the richer demo space

The browser suite went from **10.0 to 20.0 minutes** for the same 284 tests when
the demo seed grew. Nothing failed and nothing became flaky, but the suite is
serial by design (`workers: 1`) under a 40-minute `globalTimeout`, so the
headroom is now half what it was.

That is the price of a demo worth looking at, and it is worth paying at this
size. It is recorded because the next person to grow that seed should know they
are spending a budget rather than a free resource, and because a suite killed by
its own timeout reports nothing at all - which is a worse outcome than a slow
suite.

### The suites the gate does not run

Run separately and named, because a suite nobody invokes is a suite nobody has.

| Suite | Command | Result |
| --- | --- | --- |
| Core coverage | `pnpm test:coverage` | 48 files, 388 tests. 98.28 statements / 88.52 branches / 94.44 functions / 98.28 lines, against floors of 92 / 78 / 85 / 92 |
| OpenAPI drift | `pnpm openapi` then `git diff` | no drift; the committed contract matches the router |
| Contract | `pnpm test:contract` | 2 files, 9 tests |
| Security | `pnpm test:security` | 3 files, 13 tests |
| Resilience | `pnpm test:resilience` | 2 files, 6 tests |
| Mutation | `pnpm test:mutation` | **75.88%** against a break threshold of 60. 622 mutants: 463 killed, 9 timed out, 143 survived, 7 uncovered, 0 errors |

Stryker's own warning is worth carrying forward: 80 of the 622 mutants are
static, 13% of the total taking an estimated 69% of the run. `ignoreStatic`
would make this suite substantially cheaper if it is ever run more often than
once a sweep.

### Ratchets

`e2e-ratchets: ok (52 specs, 294 tests, 1025 assertions, 0 quarantined,
3 sleeps, 4 toBeTruthy, 46 screens scanned, 0 unscanned)` - floors met exactly,
ceilings unchanged. No floor was lowered and no ceiling was raised.

## Production verification

Both halves of the running deployment were checked from outside, against the
live system rather than against the configuration meant to produce it.

Hosts are not named here. This file ships publicly and
`check-public-release.mjs` refuses the deployment's real hostnames - which it
did to a draft of this very section, correctly, and after this sweep had already
recorded another session's file for the same offence. The gate does not care
whose text it is.

**The web application**, on its static host. Answers 200, carries all four
headers `vercel.json` declares, serves `robots.txt` and `sitemap.xml`, and falls
back correctly on a deep route.

The compiled documentation corpus is **not** public. That needed checking
rather than assuming, because this repository has published it before, and
because the obvious probe gives the wrong answer: `/docs-content/index.json`
returns 200. The rewrite sends every unmatched path to `index.html`, so a status
code proves nothing here. The body is `content-type: text/html` and its sha256
is byte-identical to the SPA shell. Not exposed.

**The API**, on its own origin.

| Probe | Answer |
| --- | --- |
| `GET /health` | `{"ok":true,"service":"vitae-api"}` |
| `GET /ready` | 200 · `{"ok":true,"checks":{"database":"reachable"}}` |
| `GET /api/v1/nodes`, unauthenticated | **401** |
| `GET /api/v1/docs/index`, unauthenticated | **401** |

The two 401s are the result worth having. Default-deny holds on the live system,
and the private corpus is behind the owner allow-list in production, rather than
only in the source that was deployed.

The 200 from `/ready` is stronger evidence than its body suggests, and the body
is why this nearly became a false finding. It reports only a database check,
while `docs/DEPLOYMENT.md` promises readiness gates on Postgres *and* the build
service - which reads like documentation overstating the code. It is the
reverse: `readinessHandler` in `apps/api/src/middleware/health.ts` probes both
and answers 503 if either is unreachable, and only the success payload omits the
second result. The document is right, the compiler is up in production, and the
response under-reports what it verified. Recorded because a payload that
invites the wrong conclusion costs someone the same twenty minutes later.

## What was already sound

Recorded because a report that lists only faults misrepresents the thing.

- **Nothing is quarantined.** No `.only`, `.skip`, `.fixme` or `.todo` in any
  unit, component or browser test, in any workspace.
- **No debt markers.** Zero `TODO`, `FIXME`, `XXX` or `HACK` across `apps`,
  `packages`, `services` and `e2e`. No `@ts-ignore` or `@ts-expect-error`
  anywhere. Six `eslint-disable` lines, each with its reason written beside it.
- **No orphaned suites.** Every test file sits where its runner's `include`
  pattern actually reaches it, so nothing is silently uncollected.
- **The browser suites were green from the first run** and stayed green: 284
  default plus 12 cloud, zero failures, zero flakes, on a real stack with a real
  Auth emulator, a real Postgres and a real Tectonic compiler.

## The demo seed, and the coupling it made executable

The demo space was expanded in the same session, from a 676-line sample to a
fourteen-year working life: all 34 node types and all 29 edge types, a network
of sixty-odd people across twenty-five organisations, years of dated
correspondence, a job search covering all eight application states, and enough
in every list for the screens to be read rather than merely rendered.

It is recorded here because of what expanding it exposed rather than what it
added. Nine specs sign into that space, and bulk data breaks a browser suite in
one specific way: a locator that resolves to one element today resolves to two
tomorrow, because a new record happened to share its wording, and the spec then
fails on strict mode rather than on the product. Commit `3642c0d` is that
failure, already in this repository's history.

Those couplings were undocumented. A spec asserted `getByText('Workflow')` with
no `.first()`, and nothing anywhere said that a résumé output may therefore not
be named for a workflow. The knowledge lived in whoever last broke it.

The seed now **asserts its own invariants before it finishes** and throws with a
named failure if one is broken - exactly one target called "Machine Learning
Engineer", Aurora Dynamics reachable through Marc Uwimana and no one else,
distinct output row labels, and each no-`.first()` wording checked against the
text that actually reaches the screen its assertion runs on, and no wider.

That is the same move the ratchets made and for the same reason: a rule that
lives in prose is a rule nobody runs. `pnpm seed:demo` now fails loudly at seed
time with a sentence saying which invariant broke, instead of surfacing forty
minutes later as an unexplained strict-mode violation in a browser test.

It also corrected a miscount it found: this file claimed to cover 33 node types
where the catalogue holds 34, and `post` - the one type never seeded - was
exactly what the wrong number hid.

One thing the expansion got wrong, caught by `pnpm test:public` before it could
be committed: a seeded software subscription named a third-party brand, which
`check-public-release.mjs` bans from a tree that ships publicly. Replaced with an
unrelated developer-tooling subscription. Recorded rather than quietly fixed,
because it is the gate doing exactly what it exists for - the reference was
plausible demo content and would not have looked wrong to a reader.

## Lint warnings

`pnpm lint` reports **0 errors and 74 warnings**, which is why the gate passes.
The warnings are concentrated in two React rules: 25 `react-hooks/
set-state-in-effect` and 12 `react-hooks/exhaustive-deps`, plus 3
`react-hooks/refs`, 2 `consistent-type-imports` and 1
`react-hooks/incompatible-library`.

All 74 predate this sweep and none is in a file it touched. They are recorded
rather than fixed: `set-state-in-effect` in particular is usually a real
finding about render-loop risk, but clearing thirty-seven React hook warnings
is a refactor of live UI with its own regression surface, and doing it inside a
verification sweep would mean shipping unreviewed behaviour change under cover
of a test run.

## What this release actually changes

Nothing that production runs.

```
apps/web/src   no files changed
apps/api/src   one file, src/scripts/seed-demo.ts, which the server never calls
```

The rest is `.gitignore`, the gate script, one browser spec, the generated
reference and this report. The web bundle rebuilds to the same output and the
API serves exactly what it served before.

Recorded because "verified and deployed" would otherwise imply a behaviour
change that was not made. What shipped is a gate that no longer depends on the
developer's Docker state, a generated artifact that matches its own commit, a
locator that cannot go ambiguous, a demo space worth showing, and the written
record of a test program that had none.

## Known gaps, stated rather than papered over

- **`services/buildsvc` has no tests of its own.** Not one test file. It is
  covered only indirectly - through the API's resilience suite, which asserts
  its absence is handled, and through the e2e compiles that exercise it as a
  black box. Its own request signing, timeout handling and page counting have no
  unit coverage. This sweep did not add any; that is a body of work, not a fix.
- **The buildsvc image was reused, not rebuilt.** `docker buildx` is absent on
  this machine, and the service pins its TeX cache with `RUN --network=none`,
  which only BuildKit understands. The gate's documented fallback reused the
  existing `vitae/buildsvc:local`. The image build was therefore *not* verified
  from source here.
- **No load or stress testing.** The repository has no harness for it and this
  sweep did not invent one.
- **No WebKit coverage anywhere.** Not in the gate, which is Chromium, and not
  in this sweep, because the engine cannot start on this host (V-005). Safari is
  therefore entirely unverified. Two `apt` packages and one re-run would change
  that, and it is the cheapest real coverage still available.
- **Mobile is unverified in the same practical sense.** 39 of 45 cases pass at a
  phone width, but the six that fail are desktop specs that should never have
  run there, so the number describes the harness rather than the product.
- **The GitHub workflow still has never run**, for billing reasons. That is why
  the local script is the gate, and why `test:mirror` exists to keep it honest.
