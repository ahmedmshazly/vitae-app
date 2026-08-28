---
id: PRD-PURPOSE
title: What Vitae is for
summary: A career is already written down and almost never connected. Vitae is the typed graph that connects it, and the arithmetic that reads it back.
audience: [user, developer, maintainer]
domain: product
type: explanation
status: verified
verified_at: 2026-08-24
sources:
  - PRODUCT.md
  - packages/core/src/types.ts
  - packages/core/src/schema/envelope.ts
  - docs/generated/algorithms.json
  - apps/web/src/App.tsx
related: [PRD-PEOPLE, PRD-CAPABILITIES, PRD-BOUNDARIES]
---

# What Vitae is for

## In short

Most of a career is already recorded somewhere, and almost none of it is
connected. The person who could vouch for a piece of work sits in one system,
the work itself in another, and the evidence that it happened in a third. Vitae
is where those become one record: a typed graph of people, organisations, roles,
projects, skills and the interactions between them, kept privately by the person
whose career it is. Because the graph is typed rather than a pile of notes, the
product can answer questions a folder of documents cannot - who to reconnect
with before an opportunity closes, which evidence supports a line on a résumé -
and it answers them with arithmetic you can inspect instead of a model you
cannot.

## How it works

### One graph, several lenses

There is one store of records and no second copy of anything. What look like
separate products - a contact list, a timeline, a map, a job pipeline, a résumé
builder - are lenses over the same nodes and edges. Adding an interaction with a
person changes what the reconnect list suggests, what the timeline shows, and
which evidence is available to a résumé, because all four are reading the same
rows.

This is why the graph is worth the cost of typing everything. A note that says
"caught up with Dana about the migration" is prose. A typed `interaction` node
joined by a typed edge to a `person` and to the `project` it was about is a fact
four different surfaces can use without any of them parsing English.

### Evidence before inference

Every conclusion the product draws is required to show the records behind it. A
contact ranking arrives with the factors that produced it; a warm-introduction
suggestion arrives with the hops it would travel; a résumé line arrives attached
to the evidence it was selected from. The reason is not transparency as a
virtue. It is that a suggestion you cannot check is a suggestion you cannot act
on, and career decisions are exactly the kind where acting on an unexamined
recommendation is expensive.

### Deterministic on purpose

Nothing in the product calls a language model at runtime. Ranking, deduplication,
job-description parsing and résumé selection are named algorithms with published
constants: the same graph and the same job description produce the same résumé
today and next year. This is a product decision before it is a technical one. It
means a recommendation can be argued with, a regression can be caught by a test,
and the record does not leave the machine it is kept on.

### What a working session looks like

The private application is organised around five task-led areas rather than
around the data model: a daily view, the network, career work, exploration, and
the data itself, with settings and help alongside. A session is usually short -
capture what just happened, look at what the day suggests, act on one thing -
with the long sessions reserved for tailoring a résumé or reconciling an import.

## Mechanics

### The vocabulary is the product

`packages/core/src/types.ts` holds the closed vocabulary that the API, the web
application and the algorithms all share. It is not a suggestion; the schemas
validate against it and an unknown type is rejected at the boundary.

| Tier | Count | What it covers |
| --- | ---: | --- |
| Career | 16 | People, organisations, roles, projects, skills, credentials, and the job-search records - posting, application, interview |
| Life | 11 | The things that happen around the career: events, interactions, tasks, goals, habits, writing, links, documents |
| Long-tail | 7 | Places, trips, media, highlights, assets, health logs, accounts |

That is 34 node types, joined by 29 edge types. Every one of them is creatable
and editable through the schema-driven entity form; a test asserts that the
new-entity menu offers exactly the type catalog, so a type cannot be added and
left reachable only through an import. What the long-tail tier lacks is a
bespoke workflow of its own, not a way in.

The edge vocabulary is deliberately larger than a naive model needs. `HELD` and
`ROLE_AT` are different facts, and so are `KNOWS`, `REFERRED_BY` and
`REPORTS_TO`. Collapsing them into one generic relation would make the graph
cheaper to write and useless to read, because none of the ranking or path-finding
work could tell which kind of connection it had found. The generated reference
catalogs the full vocabulary; this page is only claiming why it has the shape
it does.

### One envelope, per-type contents

Every node carries the same envelope regardless of type - title, optional
subtitle, notes, a start and end date with an explicit precision, a status, a
pinned flag, a sensitivity marker, a provenance source with a reference, and a
confidence between 0 and 1 - and puts everything type-specific in `props`,
validated by a schema chosen by the node's type. Edges carry a matching
envelope with a source, a destination and an `is_current` flag.

Two envelope fields are doing more work than they look like they are. `source`
records which of ten provenance kinds a record came from, so an imported claim
and a hand-entered one are never confused. `confidence` and `sensitivity` travel
with the record rather than being decided by whichever screen is showing it.

Persisted records add the system fields that make the graph durable rather than
merely stored: creation and update timestamps, an `archived_at`, a `deleted_at`,
a `merged_into` pointer, and a revision number. Deletion is a timestamp, not a
DELETE, which is what makes recovery a product feature instead of a backup
procedure.

### What runs over the graph

The generated algorithm catalog reports 19 modules exporting 122 symbols, with
87 tuned constants in 9 groups. Its own summary reports none of them untested,
none impure, and none unreferenced by the product. That last figure matters more
than the first: an algorithm nothing calls is a paper claim, and the catalog is
generated precisely so the claim cannot outlive the call site.

The named ones are ordinary, published techniques rather than novel ones -
Hawkes tie strength, Personalized PageRank, BM25F keyword weighting,
Fellegi-Sunter record linkage, budgeted submodular selection. Choosing
well-understood methods is part of the same decision as choosing determinism:
the behaviour can be explained to the person it affects.

### What the product does not depend on

No package manifest in this repository declares a dependency on an AI provider
SDK, and no analytics or telemetry library appears in `apps/`, `packages/` or
`services/`. The absence is the feature. What the product cannot call, it cannot
leak to.

## Related

[Who Vitae is for](who-it-serves.md) covers the single-operator model this page
assumes. [The capability map](capabilities.md) turns the shape described here
into the units the repository actually tracks, and [what Vitae does not
do](boundaries.md) states the edges of it.

[Architecture](../architecture/index.md) explains how the graph is stored,
validated and served.
