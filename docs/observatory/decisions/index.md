---
id: ADR
title: Decisions
summary: The architecture decisions on record, which of them still bind, and the one that was made in code and never written down.
audience: [maintainer, developer]
domain: decisions
type: index
status: verified
verified_at: 2026-08-24
sources: [GOVERNANCE.md, docs/adr/0001-firestore-over-postgres.md, docs/adr/0005-postgres-over-firestore.md]
related: [ADR-CATALOG, ADR-0006]
---

# Decisions

A decision record exists so that a choice can be argued with later. It states
what the situation was, what was chosen and what the choice cost, so that
whoever inherits the result knows what they are inheriting, and whoever wants
to reverse it knows what they are reversing.

Vitae keeps its records in `docs/adr/`. Five were written, between 2026-07-11
and 2026-07-31. A sixth decision was taken on 2026-08-23, changed four things
that this project requires a record for, and has no record. Saying that out
loud is most of what this section is for.

## What is here

[The decisions on record](catalog.md) is the catalogue. It lists all six
decisions, what each one settled, which of them replaced which, and which
still bind today. It also records that two of the five written records rest
their authority on a document of governing principles that this repository
does not contain.

[ADR 0006: workspace-partitioned multi-tenancy](0006-cloud-multi-tenancy.md)
is the missing record, reconstructed from the migrations, the middleware and
the commit that introduced them. It carries the needs-review badge for a
specific reason: the decision is evidenced by running code, and the reasoning
behind it is not. Nothing in this repository says why these choices were made
over the obvious alternatives, so that page states what was decided and
declines to invent why.

## The rule that makes a missing record a defect

`GOVERNANCE.md:12` is unambiguous about when a record is required:

> Major changes to storage, authentication, public APIs, or deployment policy
> need an architecture decision record and an upgrade path.

The hosted Cloud plane changed all four in one commit. It moved the primary
key of every graph table, put a membership lookup between an authenticated
request and the data it reaches, added two routes to the public surface, and
introduced two deployment flags that decide whether any of it is reachable.
The rule was not applied selectively; it was not applied at all.

## What these pages are not

These are documentation pages, not governance artefacts. `docs/adr/` still
holds `0001` through `0005` and no `0006`, and publishing a reconstruction
here does not change that. A reconstruction can say what the code does and how
confident a reader should be about it; only a maintainer who was present can
supply the reasoning, and that is the part a decision record is actually for.

Readers who want the system described rather than the choices behind it should
start at [Architecture](../architecture/index.md).
