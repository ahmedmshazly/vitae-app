---
id: META
title: About these documents
summary: The evidence behind this documentation, the rules that keep it true, and the gates that fail when it drifts.
audience: [maintainer, developer, designer, operator, security]
domain: meta
type: index
status: verified
verified_at: 2026-08-24
---

# About these documents

Documentation drifts because nothing fails when it does. This section holds the
parts of the system that exist to make drift visible: the record of what the
previous documentation got wrong, and the rules the current documentation is
held to.

Nothing in this section is written for someone trying to use Vitae. It is
written for the people responsible for these pages staying true.

## What is here

[Documentation coverage and contradiction inventory](coverage-and-contradictions.md)
is the evidence base. Every entry names a file and a line, and every one was
checked against the source rather than inferred from a neighbouring document.
It records four kinds of defect: a quality gate that could not fail, reference
surfaces that under-reported what shipped, documents that contradicted the
running code, and facts that had simply gone stale. Each entry says whether it
has been repaired, and where.

## The rules these pages are held to

Running code, schemas, tests, migrations and real configuration are the
authority for what is implemented. Product specifications and roadmaps are the
authority for what is intended. Where the two disagreed, the disagreement is
resolved on the page and recorded in the inventory rather than reproduced.

Nothing here invents functionality, security guarantees, benchmarks, prices,
operating status or legal commitments. Where a fact needs confirmation from
someone outside this repository — commercial terms, legal entity, operating
status of any hosted service — the page says so and carries the needs-review
badge instead of a number.

Examples use fictional demonstration data. No screenshot is fabricated.
