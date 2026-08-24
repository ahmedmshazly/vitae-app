---
id: ARC-RESUME
title: From graph to compiled résumé
summary: The path from a pasted job description to a compiled one-page PDF, the three templates it can take, and every point where it degrades instead of failing.
audience: [developer, maintainer]
domain: architecture
type: explanation
status: verified
verified_at: 2026-08-24
sources:
  - apps/api/src/services/resume.ts
  - apps/api/src/services/resume-model.ts
  - apps/api/src/services/template-renderers.ts
  - apps/api/src/services/buildsvc-client.ts
  - apps/api/src/routes/v1/resumes.ts
  - packages/core/src/schema/resume.ts
  - packages/core/src/algorithms/jd-parser.ts
  - packages/core/src/algorithms/selection.ts
  - packages/core/src/algorithms/fit-loop.ts
  - packages/core/src/algorithms/latex-escape.ts
  - services/buildsvc/src/server.ts
  - services/buildsvc/src/calibrate.ts
  - templates/argon/line-model.json
  - templates/cobalt/line-model.json
  - templates/onyx/line-model.json
requirements: [FR-RES-005, FR-RES-008, FR-RES-009, FR-RES-011, FR-RES-012, FR-RES-013, FR-RES-014, FR-RES-015, FR-018]
related: [ARC-ALGORITHMS, ARC-GRAPH, ARC-SECURITY, ARC-OVERVIEW]
---

# From graph to compiled résumé

## In short

You paste a job description. Vitae parses it into weighted keywords, scores
every résumé bullet in your graph against those keywords, and picks the set that
covers the most of them within one page. It assembles those bullets into a
document model scoped to you and nobody else, renders that model as LaTeX, and
sends it to a sealed container that compiles a PDF.

The compiler then checks its own work: it reads the text back out of the PDF and
reports what fraction of the job description's weight actually appears in the
document. If the result ran to two pages, it trims and recompiles, up to three
times.

## How it works

Every step in this pipeline is deterministic. The same graph, the same job
description and the same template produce the same PDF, byte for byte, because
the compile is given a fixed source date. That matters more than it might sound:
it is what makes a résumé reproducible months later, and it is why nothing in
the path calls a language model.

The pipeline splits cleanly between deciding and rendering. Deciding — parsing,
scoring, selection, the trim plan — is pure functions in the shared domain
package, testable without a database. Rendering — turning the chosen bullets
into LaTeX — happens in the API, because that is where escaping belongs: every
value that reaches the document passes the sanitisation layer on the way, and
the build service is deliberately too ignorant to be trusted with the job.

The build service is the only part that can fail for reasons outside the
system's control, so it is the only part with a fallback. If it cannot be
reached, the client returns an offline result rather than an error, and the
caller offers the LaTeX source as a download. A person can still send a résumé
on a day the container is down.

## Mechanics

### The stages, in order

1. **Parse.** A pasted job description becomes a weighted keyword set, using a
   dictionary of the skill nodes already in the graph plus novel candidate terms
   found in the text. The result is stored as a target record and is editable —
   the parse proposes, the person decides.
2. **Score.** Every atom (a résumé bullet with its variants, metrics and
   provenance) is scored against those keywords, with a recency factor and a
   bonus for quantified claims.
3. **Select.** A budgeted greedy optimiser picks the subset that maximises
   saturating keyword coverage plus quality within the template's line budget,
   forcing in pinned bullets and excluding blocked ones.
4. **Assemble.** The selected bullets are grouped by the record they belong to
   and folded into a document model together with skills, education, awards and
   contact details drawn from the graph.
5. **Render.** The model is spliced into the template's LaTeX source through a
   per-template renderer, with every dynamic value escaped.
6. **Compile.** The LaTeX goes to the build service over a signed request and
   comes back as a PDF, a page count and the extracted text.
7. **Check.** Keyword coverage is measured against that extracted text.
8. **Fit.** If the document is longer than one page, a trim step is planned and
   applied, and stages 4 through 7 repeat.

The same stages as a sequence, with the isolated build service at the end:

```diagram
DGM-RESUME-BUILD
```

The formulas behind stages 1, 2, 3 and 8 are on
[The deterministic algorithms](algorithms.md); this page is the path they sit in.

### There are three templates, not two

`templates/` contains **`argon`, `cobalt` and `onyx`**. Each directory holds a
LaTeX source and a line model. The architecture guide's monorepo diagram
(`docs/ARCHITECTURE.md:28`) names only two of them, "Onyx, Argon", and the one
it omits, `cobalt`, is the default
(`apps/api/src/services/resume.ts:80`).

They differ in three ways that matter to the pipeline:

| Template | Strict for parsers | Page size | Accent choices |
| --- | --- | --- | --- |
| `argon` | yes | Letter | one, monochrome |
| `onyx` | no | Letter | six |
| `cobalt` | no | A4 | six |

A template's line model declares how many characters fit on a line, how many
lines fit on a page, and the overhead of an entry header and a section header.
Those four numbers are what the selection budget and the live page meter are
computed from, which is why they are calibrated rather than guessed — see below.

There are three templates but only two renderers. `cobalt` has its own macro
vocabulary and gets a bespoke renderer; `onyx` and `argon` share a generic one
built from plain sectioning and item lists
(`apps/api/src/services/template-renderers.ts:132`). Adding a template with a
new macro vocabulary means adding a renderer; adding one that reuses an existing
vocabulary does not.

### The document model is single-subject

`buildFullModel` looks for the person node marked as self and scopes every
section to the records that person owns. When there is no such anchor it
produces an **empty** model rather than a full one, and the reason is written
into the code: rendering every node in the graph under a placeholder name is the
worst available answer, because this graph holds other people's roles and
degrees. [The typed career graph](career-graph.md) covers the ownership rule
that scoping depends on.

The model carries disabled items rather than dropping them, so the visual editor
can show what was excluded; the renderers skip anything disabled at every level.
Section order, per-section enablement and per-item ordering are configuration
carried into the build, not properties of the template.

### Rendering and escaping

A template's source contains guillemet tokens — the accent colour, the name, the
contact line, the headline, the tagline block, the summary block and the
sections — which the renderer replaces. After splicing, the output is asserted
to contain no surviving token; an unresolved one throws rather than compiling to
a document with `«SECTIONS»` printed in it.

Every dynamic value passes the escape layer. Plain fields are escaped inline,
bullet text goes through the whitelisted mini-markdown renderer, and link
targets go through a separate URL escape that keeps them working as links. Macro
text emitted by the renderer itself is never escaped, which is precisely why the
renderers are the only thing allowed to emit macros. A contact whose scheme is
not on the allow-list degrades to plain text rather than disappearing: the
reader still sees the value; it is not clickable.
[Trust boundaries and data handling](security.md) covers why that layer exists
and what it defends against.

### The build service

The compiler is a container running Tectonic and poppler, reached over HTTP.
Every request is signed with an HMAC over the timestamp and the raw body, with a
five-minute skew window, and the service refuses to start without a secret or
with one of the published development defaults in production. Compilation runs
`--untrusted`, with no shell escape, in a per-request temporary directory,
against a package cache warmed at image build time — the runtime has no network,
so `--only-cached` makes a cache miss fail immediately rather than spending
minutes in DNS timeouts. The source date is passed in, which is what makes
repeat exports byte-identical.

The service returns the PDF, its page count from `pdfinfo`, and, when asked, the
extracted text from `pdftotext`. A compile failure comes back as a 400 with a
guessed section name and the tail of the log, so the error can be pointed at a
part of the document.

### Line models are calibrated, not asserted

`services/buildsvc/src/calibrate.ts` runs during the image build. It compiles
every shipped template with a fixture containing every construct the renderers
can emit — each weight and size of each font family, links, and every glyph
macro the escape layer can produce — which is what warms the package cache with
the exact preamble each template needs. It then binary-searches the number of
body lines that still fit on one page and compares that measured capacity with
the template's configured `lines_per_page`, failing the image build if they
differ by more than three lines.

That gate is strict because the knapsack budget trusts the configured number.
It runs twice: once with the network on to populate the cache, and once with the
network disabled to prove the cache is complete. The resulting manifest is what
the service's health probe reports.

### Where it degrades instead of failing

- **Build service unreachable.** The client catches any transport failure and
  returns an offline result with a named error code instead of throwing; callers
  fall back to a LaTeX download.
- **Compile error.** A non-2xx response becomes a structured error carrying the
  provider's code and a log tail, not a 500.
- **Text extraction unavailable.** Coverage is computed only when the compile
  succeeded; otherwise it is reported as absent rather than as zero.
- **Overflow that cannot be trimmed.** The fit loop stops after three
  iterations, or immediately if the only remaining bullets are pinned, and
  reports that manual trimming is needed rather than dropping something the
  person pinned.

### The coverage gate

Coverage is measured from the text extracted from the compiled PDF, not from the
model that produced it. Each parsed keyword's weight counts as covered when its
term appears in that text; the score is the covered weight over the total
weight, and the gate passes at 0.95. Measuring the output rather than the input
is the point — it catches a keyword that the selection intended to include but
that the template swallowed, hyphenated or pushed off the page.

## Related

- [The deterministic algorithms](algorithms.md) has the formulas for parsing,
  scoring, selection and the trim plan.
- [The typed career graph](career-graph.md) explains atoms, ownership and the
  self anchor.
- [Trust boundaries and data handling](security.md) covers the escape layer and
  the build service's sandbox.
- [The system in one view](system-overview.md) places the build service in the
  package graph.
