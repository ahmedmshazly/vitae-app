---
id: PRD-JOURNEYS
title: The journeys that must work
summary: The register defines eight journey identifiers. Three carry a statement and an executable test; five are empty placeholders the numbering implies.
audience: [maintainer, developer]
domain: product
type: reference
status: verified
verified_at: 2026-08-24
sources:
  - docs/registry/journeys.json
  - docs/generated/traceability.json
  - docs/generated/tests.json
  - e2e/tests/journeys.spec.ts
  - e2e/playwright.config.ts
  - apps/api/src/__tests__/api.integration.test.ts
  - .github/workflows/ci.yml
  - scripts/check-docs-traceability.mjs
related: [PRD-CAPABILITIES, PRD-PURPOSE]
---

# The journeys that must work

## What a journey is, and why it is not a capability

A capability says the product can do something. A journey says a person can get
all the way through something, crossing several capabilities without falling into
a gap between them.

The distinction earns its keep because capabilities are tested where they are
built, and the failures that hurt most live between them. Capture can be correct
and search can be correct while a newly captured record still takes long enough
to reach the index that it cannot be found afterwards. No unit test of either
capability sees that. A journey is the unit that does.

Journeys are curated in `docs/registry/journeys.json`. That file is the
authority, and this page explains what it contains and what it deliberately
refuses to contain.

## What the register defines

Eight identifiers, `J1` through `J8`. Three have a title, a statement, the
capabilities they cross, and an executable end-to-end test. Five have none of
those.

| Journey | State | Crosses |
| --- | --- | --- |
| `J1` — capture a person in under a minute | Verified end to end | `CAP-CAPTURE`, `CAP-SEARCH` |
| `J2` | No statement exists | — |
| `J3` | No statement exists | — |
| `J4` — turn a job description into a tailored résumé | Verified end to end | `CAP-RESUME` |
| `J5` | No statement exists | — |
| `J6` | No statement exists | — |
| `J7` | No statement exists | — |
| `J8` — recover a deleted record from trash | Verified end to end | `CAP-ORGANIZE`, `CAP-DATA-CORE` |

Between them, the three journeys name five of the sixteen capabilities. Eleven
capabilities — including relationships, import, identity, export and everything
the hosted plane does — are crossed by no registered journey. That is a gap in
the journey register, not a gap in testing: the browser suite has dedicated specs
for most of those areas. It means nobody has written down which end-to-end path
through them must never break.

## The five that have no statement

`J2`, `J3`, `J5`, `J6` and `J7` exist because the numbering says they do.
Nothing else in the repository names them — no document, no test, no comment.

They are recorded as empty rows with status `unknown` rather than being quietly
renumbered away or filled in. Renumbering would break the live citations that
`J1`, `J4` and `J8` already have in test titles and in continuous integration.
Filling them in would be worse: a reconstructed journey statement is
indistinguishable, once written, from a real product commitment, and there is no
evidence to reconstruct one from. An empty row is the only honest option, and it
makes the gap discoverable instead of invisible.

The gap itself is recorded as `DOC-D-029` in the
[documentation inventory](../meta/index.md).

## The three journeys with executable coverage

All three live in one file, `e2e/tests/journeys.spec.ts`, which drives the real
single-page application against the real API and Postgres.

**J1** opens the capture line from anywhere with a keyboard shortcut, types one
line naming a person with an organisation, a tag, a date and a note, checks the
parse appears as preview chips, commits it, and then finds the new record through
the fuzzy quick-switcher. Finding it afterwards is the point: it is the step that
proves the write reached the search index and not merely the database.

**J4** opens the tailoring surface, starts a target session, pastes a job
description, parses it into weighted keywords, auto-selects evidence against the
page budget, and compiles. It asserts a rendered PDF preview appears rather than
a LaTeX dump, which is what distinguishes a working compile service from a
successful template render.

**J8** captures a record, finds it through the quick-switcher, deletes it through
the confirmation dialog, then restores it from trash and checks the row leaves
the trash list.

Two of the three are also asserted below the browser. The API integration suite
carries a capture case and a soft-delete-and-restore case that name `J1` and `J8`
in their titles, so those two have coverage at both layers. `J4` is named only in
the browser suite.

### What J1 does not assert

The register gives `J1` a target of sixty seconds, and the header of the spec
file states it. No test enforces it. The spec asserts the steps complete, not the
elapsed time, and the file's own configured ceiling is 120 seconds — a budget for
a journey that waits on a search index and a PDF compile, not a performance
target.

So the sixty seconds is documented product intent. Treat it as a design
constraint to hold yourself to, not as a number continuous integration is
protecting.

## What continuous integration actually runs

This is worth stating plainly, because the step name is misleading in a way that
undersells it.

The workflow step is called *Run journeys (J1 capture · J4 résumé · J8
trash/restore)*. What it runs is `pnpm --filter @vitae/e2e test`, which is
Playwright over the whole `e2e/tests` directory: 45 spec files and 250 cases, the
entire browser acceptance suite. The three named journeys are three of those
cases.

The suite runs single-worker and not in parallel, deliberately — the journeys
share one data space and mutate the same graph, so parallel files race on drafts
and the search index and can starve the single API process during a compile.
Continuous integration allows one retry, because the stack under test is real and
a cold-start hiccup is not a product defect.

## What keeps a coverage claim honest

`scripts/check-docs-traceability.mjs` fails the build if a journey names an
end-to-end spec that does not exist, and — the check that matters — if the
journey's identifier cannot be found anywhere inside the spec it names. A path
that happens to exist is not evidence. The identifier has to be in the file, which
in practice means in the test title, where a person renaming the test will see it.

The gate also rejects a journey that names a capability the capability register
does not define, so the two registries cannot drift apart.

What the gate cannot do is notice a journey that should exist and does not. That
is the whole reason the five empty rows are written down.

## Related

[The capability map](capabilities.md) defines the capabilities these journeys
cross, and explains the requirement-to-code-to-test spine that sits underneath
them.
