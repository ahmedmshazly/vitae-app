---
id: ARC
title: Architecture
summary: How Vitae is put together, from the request path down to the typed career graph, the deterministic algorithms and the résumé compiler.
audience: [developer, maintainer, security]
domain: architecture
type: index
status: verified
verified_at: 2026-08-24
sources:
  - docs/ARCHITECTURE.md
  - docs/generated/packages.json
  - docs/generated/api.json
---

# Architecture

Vitae is a private career instrument. It stores a person's work and
relationships as a typed, versioned graph, runs closed-form algorithms over
that graph, and compiles a one-page résumé from the result. Nothing in it calls
a language model. Every score it shows decomposes back into the evidence that
produced it, because that decomposition is what makes the output defensible to
the person relying on it.

These pages explain how that is built. They are written for someone who has to
change the system and needs to know which seam a change belongs behind.

## Where to start

If you are new to the codebase, read [The system in one view](system-overview.md)
first. It names the eight workspace packages, says what each one owns, and gives
the dependency rule that keeps them from collapsing into one another.

Then follow a request: [What happens to a request](request-lifecycle.md) walks
one call from the browser through the middleware stack to a router, a service, a
repository and back, and says which gates it passes on the way.

## The pages

| Page | What it answers |
| --- | --- |
| [The system in one view](system-overview.md) | What the packages are, what each owns, and what may depend on what. |
| [What happens to a request](request-lifecycle.md) | The middleware order, the gates, the error contract and the layering rule. |
| [The typed career graph](career-graph.md) | Nodes, edges, the shared envelope, ownership, and how many types there really are. |
| [Storage, migrations and versioning](persistence.md) | Why every table is one JSON document, how revisions work, and how the partition key changed. |
| [From graph to compiled résumé](resume-pipeline.md) | The path from a job description to a compiled PDF, and where it degrades. |
| [The deterministic algorithms](algorithms.md) | Every algorithm module: inputs, formula, tuned constants and limits. |
| [Trust boundaries and data handling](security.md) | The real public surface, the default-deny gate, and the sanitisation layers. |
| [The Cloud workspace and billing plane](cloud-plane.md) | The tenant partition, the entitlement gate, the payment webhook, and what is closed. |

## What these pages are checked against

Running code, schemas, migrations and generated artifacts decide what is
implemented here. Where an older document disagreed with the code, the
disagreement is resolved on the page rather than repeated, and the older claim
is named so a reader who remembers it can see it was withdrawn. Five such
corrections live in this section: the real public surface of the API, how much
of the API the OpenAPI document actually describes, the number of résumé
templates, the number of node types, and the existence of the Cloud plane at
all.

Prose here never lists what a generator can index. Endpoints, configuration
keys, tables, migrations, components and design tokens each have a generated
catalog derived from source; these pages explain the shape and the exceptions
and point at the catalog for the enumeration.

The audit that produced those corrections is in
[About these documents](../meta/index.md). What the product is for is in
[Product](../product/index.md); working the product is in [Use](../use/index.md);
what the screens look like and why is in [Design](../design/index.md); running
an instance is in [Operate](../operate/index.md); making a change is in
[Develop](../develop/index.md); and the architecture decisions on record are in
[Decisions](../decisions/index.md).
