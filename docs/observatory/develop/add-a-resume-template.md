---
id: DEV-TEMPLATE
title: Adding a résumé template
summary: The three template families that ship, the token and line-model contracts they obey, the offline build path that warms them, and what a fourth would need.
audience: [developer]
domain: develop
type: task
status: verified
verified_at: 2026-08-24
sources:
  - templates/argon/main.tex
  - templates/argon/line-model.json
  - templates/cobalt/main.tex
  - templates/cobalt/line-model.json
  - templates/onyx/main.tex
  - templates/onyx/line-model.json
  - services/buildsvc/src/calibrate.ts
  - services/buildsvc/src/server.ts
  - services/buildsvc/Dockerfile
  - apps/api/src/services/resume.ts
  - apps/api/src/services/template-renderers.ts
  - apps/api/src/routes/v1/resumes.ts
  - packages/core/src/schema/resume.ts
  - packages/core/src/algorithms/line-model.ts
  - packages/core/src/algorithms/latex-escape.ts
  - apps/web/src/routes/Templates.tsx
  - apps/web/src/routes/Settings.tsx
  - apps/web/src/routes/Outputs.tsx
  - .github/workflows/ci.yml
covers: [template:templates/argon, template:templates/cobalt, template:templates/onyx]
related: [DEV, DEV-WHERE, DEV-TESTING, DEV-GATES]
---

# Adding a résumé template

## The three families

A template family is a directory under `templates/` holding exactly two files:
`main.tex`, a self-contained LaTeX document with guillemet-delimited holes in
it, and `line-model.json`, the gallery metadata plus the four numbers the
selection algorithm uses to decide what fits on a page.

Three ship. They are not three skins of one layout; they differ in page size,
type, macro vocabulary and how much text they hold.

### Cobalt

The default (`DEFAULT_TEMPLATE_KEY`), and the only one with a macro vocabulary
of its own.

A 9pt `extarticle` on A4 with narrow margins — 1.35 cm at the sides, 0.9 cm at
the top — setting Charter for the body and a scaled Helvetica-alike for the
name and headings, with `microtype` for spacing. Section headings are set in
the accent colour above a rule. Three macros carry the layout: `\cventry`
places a role, a subtitle line and a right-aligned date range in a
`tabularx` row; `\skillrow` places a fixed-width label beside flowing content;
and `pts` is a tightened `itemize` whose bullets take the accent colour. A
`\dotsep` command draws the muted separator between contact items.

108 characters per line and 58 lines per page, the most of the three. It is the
only template that uses the optional tagline token. Six accent options, not ATS
strict, and described in its own metadata as balanced, compact and modern.

### Onyx

A 10.5pt `article` on Letter, 0.55 inch at the sides and 0.5 inch top and
bottom. Serif throughout, with section headings in accent-coloured small
capitals over a horizontal rule, and the name and the contact line sharing one
header line through `\hfill`. It uses the plain `\section` and `itemize`
vocabulary rather than cobalt's macros.

96 characters per line, 49 lines per page. Six accent options, not ATS strict,
classic and editorial in intent.

### Argon

The parser-safe one. An 11pt `article` on Letter with 0.7 inch margins, no
colour, no tables, no graphics, hyphen bullets, and conventional section names
so that an applicant tracking system reading the extracted text finds what it
expects. `ats_strict` is true in its metadata, and it is the only template for
which that is so.

88 characters per line, 40 lines per page — the least capacity of the three,
which is the direct cost of the wider margins and the larger body size. Its
single accent option is near-black. It still accepts the accent token, and its
own comment says why: the token contract is shared across every template, so
argon takes the value and ignores it rather than diverging from the contract.

> [!NOTE]
> The header comment in `templates/argon/main.tex` and
> `templates/onyx/main.tex` each restate that template's line model inline, and
> both copies are stale: argon's comment says 52 lines per page where its
> `line-model.json` says 40, and onyx's says 54 where its JSON says 49. The JSON
> is the authority — it is the file the compiler service calibrates against and
> the file the API loads — and the figures above are taken from it. Cobalt
> carries no such comment.

## The contracts a template obeys

### Seven tokens, and no others

`renderTemplate` in `apps/api/src/services/resume.ts` performs exactly seven
substitutions on the file: `«ACCENT_HEX»`, `«NAME»`, `«CONTACT_LINE»`,
`«HEADLINE»`, `«TAGLINE_BLOCK»`, `«SUMMARY_BLOCK»` and `«SECTIONS»`. There is
no eighth, and there is no mechanism for adding one from inside a template — a
new token means editing the renderer.

Every value is escaped before it is spliced. That is the whole point of doing
the rendering in TypeScript rather than in LaTeX: the escape layer lives in one
place, the build service stays ignorant, and URLs go through a separate
`escapeUrl`. Macros are never escaped, because they are produced by the
renderer rather than by a person.

After splicing, `assertNoUnresolvedTokens` scans the output for any remaining
`«…»` and throws. A template with a typo in a token name fails the compile with
a message naming the token rather than producing a résumé with a guillemet in
it.

### One renderer per macro vocabulary

`apps/api/src/services/template-renderers.ts` maps a template key to an
implementation of a four-method interface: `contactLine`, `taglineBlock`,
`summaryBlock` and `sections`. Cobalt has its own, because it needs
`\cventry`, `\skillrow` and `pts`; onyx and argon share the `generic` renderer,
which emits `\section` and `itemize`.

The registry is typed `Record<string, TemplateRenderer>` and `rendererFor()`
falls back to `generic`. Nothing forces a new key to be registered — an
unregistered template silently gets the generic renderer, which is correct only
if the template's LaTeX defines no macros of its own.

### The line model has to be true

The four numbers in `line-model.json` are not documentation. `estimateLines`
divides a string's length by `chars_per_line` and rounds up;
`estimateSectionLines` adds `section_overhead` once per section and
`entry_overhead` per entry; `estimatePages` divides the total by
`lines_per_page` to produce the fill meter and the overflow figure the tailoring
screen shows. The submodular knapsack that chooses which bullets make the page
budgets against the same number.

So a wrong `lines_per_page` does not produce a wrong label. It produces a
résumé that selects the wrong content — too little, or one that spills to a
second page.

That is why the number is measured rather than trusted. `verifyLineModel` in
the calibration script binary-searches the real capacity: it compiles a fixture
with N calibration bullets, checks whether the PDF is still one page, and
narrows. If the measured capacity differs from the configured one by more than
**three lines**, the image build fails with `line model drift, configured N
lines/page, rendered capacity M (tolerance ±3)`.

## The build path

Templates are not read from disk at request time by the compiler. They are
baked into its image.

`services/buildsvc/Dockerfile` copies `templates/` into the image and then runs
the calibration script twice:

1. `node dist/calibrate.js` with the network available. For every directory
   under `templates/`, it splices rich sample content into the template,
   compiles it with Tectonic, and fails if the result is not exactly one page.
   Then it calibrates the line model as above. This pass populates the Tectonic
   package cache with the exact preamble, fonts, macros and glyphs that
   template can emit.
2. `RUN --network=none node dist/calibrate.js --only-cached`. The same work
   with no network and no cache misses permitted. If anything a template needs
   was not fetched in the first pass, the image build fails here rather than
   the compile failing on somebody's résumé six months later.

It writes `warmed-manifest.json` — the honest list of `key@version` pairs the
image actually warmed, plus the configured and measured line figures — and the
service serves that from `/healthz`. The version is scraped out of the first
`vN.N.N` in the template's own `main.tex`, which is why the header comment
carries one.

The templates screen reads that manifest through the API and compares it
against the template catalog, reporting "3 of 4 calibrated" rather than an
unconditional ready when they disagree.

At request time the service compiles with `tectonic --untrusted` — no shell
escape — in a per-request `/tmp` working directory, with no network, honouring
`SOURCE_DATE_EPOCH` so a re-export is byte-identical. The calibration job in
continuous integration builds this image and reruns the offline pass on every
commit.

## Adding a fourth

### 1. Create the directory

`templates/<key>/main.tex` and `templates/<key>/line-model.json`. The key is
the directory name and must match the `key` field in the JSON.

Write the LaTeX self-contained and against standard TeX Live packages only. The
runtime container has no network; anything exotic has to be fetchable during
the first calibration pass or the image will not build.

### 2. Fill in the metadata

`line-model.json` is validated by `templateSchema` in
`packages/core/src/schema/resume.ts`. `key`, `version`, `name`, `engine`
(the literal `"tectonic"`), `ats_strict` and `line_model` are required;
`description`, `traits`, `page_size` and `accent_options` are optional and
default to nothing, `"Letter"` and an empty list.

Start `lines_per_page` from an estimate. Calibration will tell you the real
number, and you will correct it — see step 6.

### 3. Decide the macro vocabulary

If the template emits only `\section` and `itemize`, it needs no renderer and
the generic one will serve it. If it defines macros of its own, add a
`TemplateRenderer` in `apps/api/src/services/template-renderers.ts` and
register the key in `RENDERERS`. Remember that forgetting this step is silent.

### 4. Give the calibration script sample content

This is the step that is easy to miss and fails at image-build time.

`splice()` in `services/buildsvc/src/calibrate.ts` chooses between two token
maps with a literal comparison — `templateKey === 'cobalt' ? COBALT_TOKENS :
GENERIC_TOKENS`. A template with its own macros gets the generic sample
content, whose `«SECTIONS»` block uses `\section` and `itemize`, and the
compile will fail on the undefined macro. If your template needs a different
map, add it and extend that branch.

The sample content is not arbitrary. Its comment states the rule: everything
the renderers can emit must appear at least once — regular, bold and italic in
both serif and sans at every size the template uses, `\href`, and every glyph
macro the escape layer can produce. Anything missing from the fixture is a font
or a glyph the cache never warms, and the failure lands at runtime with the
network switched off.

### 5. Register it where the product lists templates

Four places, none of which discovers your directory on its own:

| File | What it holds |
| --- | --- |
| `apps/api/src/services/resume.ts` | `listTemplates()` maps over the literal array `['cobalt', 'onyx', 'argon']` |
| `apps/web/src/routes/Settings.tsx` | `TEMPLATE_OPTIONS`, the default-template picker |
| `apps/web/src/routes/Outputs.tsx` | `TEMPLATE_OPTIONS`, the outputs filter |
| `docs/registry/coverage.json` | the template catalog's ratchet, which will list your directory as undocumented until a page claims it |

The first is the one that surprises people. The calibration script discovers
templates by listing the directory, so a new family is warmed, calibrated and
reported in `/healthz` without any registration at all — while `listTemplates()`
does not return it, `GET /api/v1/resumes/templates` does not offer it, and
`PATCH /api/v1/resumes/templates/default` rejects it as unknown. The two halves
of the system disagree about what exists, and the half that compiles is the
half that is right.

### 6. Calibrate, then correct the number

```bash
docker compose build buildsvc
```

Read the calibration output. It prints, per template, the page count and then
`line model <configured>, rendered capacity <measured> (±3)`. If the build
fails with `line model drift`, put the measured number in `line-model.json` and
build again. Do not widen the tolerance — the whole selection budget rests on
this figure.

### 7. Compile something real

```bash
pnpm buildsvc:up
curl localhost:8787/healthz     # your key@version should be in templates_warmed
```

Then produce a résumé on the tailoring screen with the new template selected
and check both the fill meter and the PDF. The meter is the line model's own
claim about itself; the PDF is the truth.

## What the gates will catch

| Mistake | Where it fails |
| --- | --- |
| LaTeX that will not compile | the calibration job, on the first pass |
| A package or font that needs the network | the calibration job, on the `--network=none` pass |
| A fixture that spills to a second page | `Calibration FAILED: <key> fixture compiled to N pages (expected 1)` |
| `lines_per_page` off by more than three | `<key>: line model drift, configured N lines/page, rendered capacity M` |
| A token this repository does not splice | a compile error naming the unresolved token |
| Macros with no matching sample content | `template <key>: no sample content for token «X»` |
| Not registering the key in `listTemplates()` | nothing — the template is warmed and never offered |
| Not registering a renderer | nothing — the generic renderer is used silently |

The last two are the reason this page exists rather than a three-line recipe.

Templates need no source-to-test map entry: the map gate walks only
`packages/core/src`, `apps/api/src` and `apps/web/src`, and `templates/` and
`services/buildsvc` are outside all three. If you add a renderer, you are
editing a file that already has an entry.

## Verifying

```bash
pnpm typecheck
docker compose build buildsvc      # the real gate for a template
pnpm buildsvc:up
pnpm test:api                      # needs pnpm dev:db
pnpm test:web
pnpm docs:gen && pnpm docs:check
```

## Related

[The gates a change must pass](quality-gates.md) covers the calibration job and
the image supply chain in the context of the whole pipeline. [Where a change
belongs](where-to-change.md) explains why the escaping lives in
`packages/core` and the rendering in the API rather than in the template. The
selection algorithm that spends the line budget is documented in
[Architecture](../architecture/index.md).
