---
id: USE-RESUME
title: Producing a résumé
summary: Paste a job description, let it score your evidence, steer the selection, compile a real PDF, and get a finalised output that passed both gates.
audience: [user]
domain: use
type: task
status: verified
verified_at: 2026-08-24
sources:
  - apps/web/src/routes/ResumeHub.tsx
  - apps/web/src/routes/tailor/Tailor.tsx
  - apps/web/src/routes/tailor/TargetRail.tsx
  - apps/web/src/routes/tailor/SelectionPane.tsx
  - apps/web/src/routes/tailor/DocumentPane.tsx
  - apps/web/src/routes/tailor/PreviewPane.tsx
  - apps/web/src/routes/tailor/types.ts
  - apps/web/src/routes/Atoms.tsx
  - apps/web/src/routes/Outputs.tsx
  - apps/web/src/routes/Letters.tsx
  - apps/web/src/routes/Templates.tsx
  - apps/api/src/routes/v1/resumes.ts
  - apps/api/src/routes/v1/targets.ts
  - apps/api/src/services/resume.ts
  - packages/core/src/algorithms/fit-loop.ts
  - packages/core/src/schema/resume.ts
  - templates/argon/line-model.json
  - templates/cobalt/line-model.json
  - templates/onyx/line-model.json
requirements: [FR-RES-004, FR-RES-005, FR-RES-006, FR-RES-007, FR-RES-008, FR-RES-009, FR-RES-011, FR-RES-013, FR-RES-014, FR-RES-015, FR-RES-018, FR-RES-019, FR-RES-020, FR-011, FR-018]
covers:
  - route:/career/resume
  - route:/career/resume/tailor
  - route:/career/resume/outputs
  - route:/career/resume/letters
  - route:/career/resume/templates
  - route:/resume
  - route:/resume/tailor
  - route:/resume/outputs
  - route:/resume/letters
  - route:/resume/templates
related: [USE-GRAPH, USE-APPLY, USE-SCREENS, USE-TROUBLE]
---

# Producing a résumé

Vitae does not write a résumé for you. It selects, from evidence you already
wrote, the subset that best answers a specific job description, packs it onto
one page, and typesets it with LaTeX. Every step is deterministic and every
number it shows can be broken open.

That has one consequence worth stating before anything else: **the quality of
the output is the quality of your atoms.** If the library is thin, the
selection is thin, and no amount of tailoring will hide it.

> [!NOTE]
> Examples on this page use fictional demonstration data. Jordan Kim, Aurora
> Dynamics and the roles named are invented.

## Before you start

You need atoms. An atom is one achievement bullet owned by a role or project;
[Capturing people, work and evidence](build-your-graph.md) explains how to
write good ones. The atom library flags those with a single wording variant or
no skills, and those are the ones that will be dropped first.

You also need the build service running if you want a PDF. Vitae compiles with
Tectonic in a separate service. Without it you still get the complete LaTeX
source and every number on the screen, but no rendered page — the interface says
so plainly rather than failing silently.

The résumé hub at `/career/resume` is the front door: counts of atoms, targets
and outputs, the five screens the work moves through, and your most recent
outputs.

## Step 1 — Make a target from the job description

A **target** is a job description you have parsed. Open Tailor
(`/career/resume/tailor`), press **New target** in the left rail, and fill
three fields: role title, company, and the description itself. Press **Parse
keywords**.

The parser turns the description into weighted keywords, using your own skill
catalogue and its aliases as its dictionary. That is why the skill aliases in
Settings matter: teaching it that `k8s` means Kubernetes changes every future
parse.

The active target lands in the URL as `?target=…`, so a tailoring session
survives a reload and can be reopened from a bookmark.

A target carries a status of saved, active, applied or closed, and can be
archived. The rail lists your targets and can show archived ones.

### Correcting the keywords

The parse is a starting point, not a verdict. In the rail you can edit any
keyword's term, change its weight, remove one, or add a term the description
implied but did not spell. A target holds at most 40 keywords; the API refuses
more with *"a target may contain at most 40 keywords"*.

Correcting the keywords is usually the minute best spent in the whole
process, because everything downstream is scored against them.

## Step 2 — Let it score, then steer

As soon as a target is active, every atom in your library is scored against its
keywords, independently of whether it is selected. Each score opens into its
components, so a bullet that ranks low tells you why.

The selection pane has two modes.

**Auto** scores every atom and packs the best set onto one page against a line
budget derived from the template's line model. You steer it rather than
overrule it:

- **Pin** forces an atom in, whatever it scored.
- **Exclude** keeps one out.
- Drag to reorder the result.

The page meter shows lines used against the budget, so you can see the packing
decision rather than guess at it. If no atom scored against the keywords, the
pane says so and names both fixes — pin one in, or widen the target's keywords.

**Manual** hands you every atom grouped by role and project with a checkbox
each, and the included set is fully drag-orderable. Use it when you know
exactly what this application needs.

Both modes re-run themselves as you change things, debounced, so the page
estimate stays honest while you work.

## Step 3 — Shape the document

The middle pane is the document as it will be typeset, and it is editable in
place:

- toggle and reorder **sections** — summary, and whichever sections your
  evidence produces;
- reorder entries within a section, and bullets within an entry;
- disable a contact field, a skill, an entry or a bullet you do not want on
  this particular document;
- write a **headline**, which defaults to the role title;
- write a **summary paragraph**, which is optional.

The right pane holds the presentation choices:

- **Template** — the layout, from the three below.
- **Accent** — a colour from the template's own curated palette. The API
  refuses anything else with *"Accent must be selected from the curated
  palette."*
- **Wording emphasis** — which variant of each atom to prefer: technical,
  leadership, concise or detailed. You can also override the emphasis for a
  single atom.

Everything you change is autosaved to that target, debounced, and the header
says which of four states the save is in. If saving stops working the header
says so in words — *"Not saving. Your last changes are only in this tab."* —
rather than continuing to show a stale "draft saved".

## Step 4 — Compile

**Compile PDF** sends the assembled model to the build service, which renders
LaTeX and returns a real PDF plus its page count and its keyword coverage.

Coverage is weighted: each keyword contributes its weight, and the gate is
95%. The panel shows the percentage, whether it passed, and which keywords are
not covered — capped in the display, with a count of how many more there are so
a document missing 25 keywords never looks like it is missing 12.

Compiling can end in one of three honest ways, and the screen distinguishes
them:

- a **PDF**, previewed inline;
- **Build service offline**, with the LaTeX source still offered for download
  and the command that starts the service;
- **Compile failed**, with the error code, the message, the section it happened
  near if known, the LaTeX log tail behind a disclosure, and the source to
  download.

None of those is a dead end, which is the point: the document is complete
either way, and the failure is about typesetting it.

## Step 5 — Finalise

**Finalize** is the step that produces a saved output, and it does more than
save. It runs a one-page fit loop and then judges the result against two gates.

The **fit loop** reacts to the real page count from Tectonic rather than to the
line estimate. Each iteration prefers swapping an atom to its concise variant —
same coverage, fewer lines — and only drops the lowest-scoring unpinned atom if
no swap is available. It runs at most three iterations. If the document is still
over one page after that, the output is marked **needs manual trim** and you are
told to drop or reword bullets and finalise again.

The two gates are:

- **one page** — the compiled document is exactly one page;
- **coverage** — weighted keyword coverage is at least 95%.

An output that clears both is saved with status **final**. An output that
clears neither, or only one, is saved as a **draft**. The receipt on screen
says which, shows both gates as separate chips, and lists each fit-loop step
that ran.

Final is an invariant rather than a label. You cannot mark a draft as sent, and
you cannot set a draft as the base résumé; both refuse with an explanation
rather than doing it quietly.

## The templates

Three layouts ship, each with its own line model — the characters-per-line
figure the page budget is computed from.

| Template | What it is | Page size | ATS-strict |
| --- | --- | --- | --- |
| Cobalt | Polished serif body with a modern coloured hierarchy and compact one-page density. The default. | A4 | No |
| Onyx | Classic editorial layout with restrained typography and a clear reading rhythm. | Letter | No |
| Argon | Strict monochrome single-column layout optimised for parsers and conservative employers. | Letter | Yes |

Argon offers a single accent, which is the point of it. Cobalt and Onyx offer a
palette.

The templates screen sets the default for **new** drafts only. It never edits a
document you have already produced or sent. It also shows the build service's
own state, because an unavailable service means nothing will compile anywhere
in this workspace, and that is worth knowing before you start rather than after.

## Outputs

`/career/resume/outputs` is every résumé you have produced. Each carries the
target snapshot it was built from, its coverage, its fit decisions, the
evidence it selected, and its stored artifacts. From here you can:

- **Download** the stored PDF or LaTeX source;
- **Rebuild artifacts** when a document has no stored file — recompiling from
  its saved selection, which is what makes an output reproducible rather than
  merely archived;
- **Duplicate** it as a starting point;
- **Set as base**, so later finals show what changed against it;
- **Mark sent**, which is where the résumé workspace hands over to the
  application pipeline.

**Mark sent** creates an application record from the target — role title,
company, today's date, status applied — and links the résumé to it. It refuses
a draft with a message that says exactly what to do: re-run Finalize, and it
must fit one page and cover at least 95% of the job description's keywords. It
also refuses a second send, because re-sending would create a duplicate
application.

From there, [Tracking applications](track-applications.md) takes over.

## Cover letters

`/career/resume/letters` attaches a short letter to a job target, built from
structured **hook**, **body** and **closer** blocks. A block is either free text
or a reference to an atom, and a letter may hold up to 24 blocks.

There is no generative text anywhere in this screen. It is a structured drafting
surface, not a writer. With no targets yet it says *"Add a job target first"*
instead of offering a form that cannot be saved.

## A worked pass, end to end

With fictional data: Jordan Kim is applying for a Machine Learning Engineer
role at Aurora Dynamics.

1. Paste the description into a new target. The parse returns keywords such as
   Python, PyTorch, reinforcement learning and ETL, weighted by how the
   description used them.
2. Two terms came back weighted low that the role clearly cares about. Raise
   them in the rail.
3. Auto-select. The pane packs eleven atoms onto the page and the meter shows
   the budget nearly full. Two atoms about embedded work score poorly for this
   target — leave them out.
4. Pin the atom about the pipeline rebuild, because it is the strongest thing
   in the library for this role and it should not be a casualty of the fit
   loop.
5. Set the wording emphasis to technical, and override one atom to its
   leadership variant because the role mentions mentoring.
6. Compile. The document comes back at one page with 93% coverage and two
   uncovered keywords.
7. One of them is a skill Jordan has, on an atom that was not selected. Pin
   that atom, drop a weaker one, compile again: 96%.
8. Finalise. Both gates pass, the output is saved as final, and it appears in
   Outputs.
9. Mark it sent. An application record for *Machine Learning Engineer @ Aurora
   Dynamics* appears in the career runway with today's date.

## When it goes wrong

Every failure this process can produce — an offline build service, a compile
error, a failed autosave, a scoring failure, a refused finalise — is described
in [When something does not work](troubleshooting.md), with the message the
code actually emits.
