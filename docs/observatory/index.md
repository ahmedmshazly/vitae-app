---
id: DOCS-HOME
title: Vitae documentation
summary: How this documentation is organised, what its status badges mean, and where to start reading.
audience: [user, designer, developer, maintainer, operator, security]
domain: meta
type: index
status: verified
verified_at: 2026-08-24
---

# Vitae documentation

Vitae is a private career instrument: a typed, versioned graph of the people,
work and evidence behind a deliberate career move, with deterministic
algorithms over it and a résumé compiler at the end. It runs self-hosted from
this repository. A hosted Cloud offering is designed and partly built, and is
not open.

This documentation is written to be read by six different people with six
different questions, and it says which one each page is for.

## Two halves that are maintained differently

Everything here belongs to one of two halves, and the difference matters more
than any other organising idea in these documents.

**Curated pages** are written by hand. They explain what something is for, why
it works the way it does, and what it feels like to use. A person decides what
goes in one, and a person is wrong sometimes, so every curated page carries a
status badge saying how far its claims have been checked.

**Generated reference** is derived from the source by a script and never edited
by hand. It answers what exists, what depends on it, and what proves it: every
route, endpoint, configuration key, table, migration, token, component, tuned
constant and exported symbol. A check in continuous integration regenerates it
and fails if the committed copy has drifted, so it cannot quietly go stale.

Prose never lists what a generator can index. That separation is what makes it
possible to document every small part of a system this size without the
readable half turning into a code dump nobody maintains.

## What the status badges claim

Every curated page states its relationship to the running system. The badge is
not decoration; a gate reads the same field and the reading surface renders
from the same file.

| Badge | What it claims |
| --- | --- |
| Verified | Checked against the code at the date on the page. |
| Partly implemented | Some of what it describes ships. The page says which parts do not. |
| Planned | Intent. Nothing on the page is claimed to run today. |
| Gated | Built, but not reachable in a default build. A flag or a launch step holds it closed. |
| Deprecated | Kept so existing links resolve. Points at what replaced it. |
| Historical | True when written, kept as a record rather than as guidance. |
| Generated | Derived from source. Editing it by hand will be overwritten. |
| Needs review | Reconstructed from evidence rather than from a record, and not yet confirmed by someone who would know. |

A page with no badge does not exist here. If something is unknown, it is
labelled unknown rather than left to read as fact.

## Reading this while it is being built

This corpus is being assembled in reviewable slices, and it is honest about how
far it has got: the navigation shows the sections that exist, not the sections
that are planned. The inventory of what the older documentation gets wrong, and
what is still missing, is itself a page here rather than a private note.

Start with [About these documents](meta/index.md) to see what has been checked
so far.
