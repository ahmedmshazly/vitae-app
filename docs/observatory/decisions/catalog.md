---
id: ADR-CATALOG
title: The decisions on record
summary: All seven architecture decisions, what each settled, which supersede which, and the governing document two of them cite that this repository does not contain.
audience: [maintainer, developer, security]
domain: decisions
type: reference
status: verified
verified_at: 2026-08-26
sources:
  - GOVERNANCE.md
  - docs/adr/0001-firestore-over-postgres.md
  - docs/adr/0002-core-shared-package.md
  - docs/adr/0003-deterministic-intelligence.md
  - docs/adr/0004-subject-scoped-ownership.md
  - docs/adr/0005-postgres-over-firestore.md
  - docs/adr/0007-product-definition-regeneration.md
  - docs/ARCHITECTURE.md
  - docs/specs/srs.md
  - docs/registry/requirements.json
related: [ADR, ADR-0006]
---

# The decisions on record

Seven decisions have shaped this system. Six are written down in `docs/adr/`.
One was made only in the code, and is reconstructed at
[ADR 0006](0006-cloud-multi-tenancy.md).

## When a decision has to be recorded

`GOVERNANCE.md:12` sets the threshold:

> Major changes to storage, authentication, public APIs, or deployment policy
> need an architecture decision record and an upgrade path.

Four categories, and a record is owed if a change touches any one of them. The
same file puts technical decisions in issues and pull requests "whenever
practical" and weights maintainability, data safety, backward compatibility and
documented behaviour above novelty, so the record is meant to be the artefact
that survives the pull request rather than a formality alongside it.

## The seven

| # | Decision | Dated | Status as written | What it settled |
| :--- | :--- | :--- | :--- | :--- |
| 0001 | Firestore instead of Postgres | 2026-07-11 | superseded by ADR 0005 | Put the data plane on Firestore against the specification's choice of Postgres, and re-implement ranking, search, revisions and export in the Node layer. |
| 0002 | The intelligence lives in a pure, shared `@vitae/core` package | 2026-07-11 | accepted | Put every schema and every scoring algorithm in one package with no I/O and no framework dependency, imported as workspace source by both the API and the web application. |
| 0003 | Deterministic intelligence (no AI), grounded in the literature | 2026-07-11 | accepted | Every intelligent behaviour is a closed-form algorithm from published work, implemented as a pure function whose output decomposes into visible factors. No model, no embeddings, no generative phrasing. |
| 0004 | Subject-scoped ownership: many people in one graph | 2026-07-31 | accepted | Subject edges become authoritative on the read path, an unowned record belongs to a reserved placeholder person rather than to the graph owner, and the résumé alone is scoped strictly to the `is_self` anchor. |
| 0005 | Postgres instead of Firestore | 2026-07-31 | accepted | Move the data plane to Postgres with each record whole in a `jsonb` column and its queryable fields as generated columns. Firebase Auth and Cloudinary stay. |
| 0006 | Workspace-partitioned multi-tenancy | 2026-08-23 | **no record was written** | Make `(workspace_id, id)` the identity of every graph table, resolve a workspace from server-side membership after authentication, and gate the whole plane behind two deployment flags. Reconstructed from evidence at [ADR 0006](0006-cloud-multi-tenancy.md). |
| 0007 | The product definition is authored forward | 2026-08-26 | accepted | Author personas, journeys, stories, and a full non-functional set into the register under the existing gates; mark every authored statement as a decision rather than a recovery; keep every legacy identifier cited through a durable anchor in the requirements document. |

The dates are the ones each record gives itself. ADR 0006 has no self-declared
date; 2026-08-23 is the author date of `1e2c502 feat(cloud): add tenant-safe
workspace and billing foundation`, the commit that introduced every file the
reconstruction reads.

## What supersedes what

Only one supersession relation exists between two records, and both ends of it
agree - which is worth stating, because the usual failure is a record that has
been replaced without being told so.

| Record | Supersedes | Superseded by |
| :--- | :--- | :--- |
| 0001 | `SRS §4.1 / §12.3-D1` (see below) | ADR 0005 |
| 0002 | nothing | nothing |
| 0003 | nothing | nothing |
| 0004 | amends `SRS §4.3.1`, `§6.6` (see below) | nothing |
| 0005 | ADR 0001 | nothing |
| 0006 | nothing | nothing |
| 0007 | nothing (amends the epistemic status of `docs/specs/srs.md`) | nothing |

ADR 0005 bounds its own reach: its scope line reads "the data plane only.
Firebase **Auth** stays; Cloudinary stays." So what it withdrew from ADR 0001
is the storage engine and everything ADR 0001 built to compensate for it - the
in-memory ranking passes, the FlexSearch index standing in for full-text
search, the JSON-string encoding for nested arrays. It did not withdraw the
Firebase identity provider or the Cloudinary storage adapter, which ADR 0001
had carried alongside its main choice.

ADR 0006 supersedes nothing. It extends the storage model ADR 0005 established
rather than replacing it: records are still whole documents in a `jsonb`
column with generated columns beside them, and the change is to which columns
form the key. That extension does strain a premise ADR 0001 introduced and ADR
0004 relied on - a single-user system with a hard scale ceiling, where an
in-memory pass over the whole graph is acceptable - because a hosted service
runs that pass once per tenant. Neither record has been revisited, and this
catalogue is not the place to revise them.

## What still binds

Binding today: **0002**, **0003**, **0004**, **0005** and **0007**. Each is
marked accepted in its own file and none is superseded. The first four are
visible in the code they describe; 0007 governs the definition corpus itself,
and what makes it visible is the register's mixture of recovered and authored
statements, each marked which.

Replaced: **0001**, in full, by ADR 0005. It is worth reading anyway, because
ADR 0005 argues against it directly and quotes it while doing so. ADR 0001 was
candid at the time that Postgres was "the technically superior fit for this
workload, rejected only because of the owner's stack constraint", and left the
escape hatch that ADR 0005 later used.

In force without a record: **0006**. The decision governs every request the
API serves, and no document in this repository ratifies it.

ADR 0003 is the one most easily assumed stale, so it is worth confirming that
it is not: `docs/specs/srs.md:26` still states that Vitae does not provide
"runtime LLM features", so the no-AI boundary the record set is also the
boundary the current requirements document draws.

## A cited authority that this repository does not contain

Two of the five records rest part of their authority on a constitution.

- `docs/adr/0002-core-shared-package.md:11` justifies the pure package by
  saying the algorithms "must be provable in isolation because the
  constitution makes explainability and determinism correctness properties".
- `docs/adr/0003-deterministic-intelligence.md:3` gives its status as
  "accepted (mandated by SRS A2 and the constitution)".

Neither record gives the file a path. `docs/ARCHITECTURE.md:6` does, naming
`constitution.md` as "the non-negotiable principles". That file
is not in the working tree and `git ls-files` returns nothing for it,
so it was never committed to this repository. The citation therefore does not
resolve, and repeating it as though it did would pass an unverifiable claim
forward. This is already on record as `DOC-D-023` in the meta section's
contradiction inventory.

The practical consequence is narrow but real. ADR 0003 in particular treats
determinism and explainability as mandated properties rather than as choices it
is free to make, and the document said to mandate them cannot be read. A reader
deciding whether ADR 0003 may be relaxed has the record's own reasoning, which
is substantial, and no access to the authority it defers to.

### The section numbers have the same problem

The same two records, and the other three, also cite the requirements
specification by section and assumption number: `SRS §4.1 / §12.3-D1` and
`SRS A5` in ADR 0001, `§10.7` in ADR 0002, `A2` and `§10.6` in ADR 0003, and
`§4.3.1` / `§6.6` / `A5` in ADR 0004. The current `docs/specs/srs.md` contains
no `§` character anywhere and no `A2` or `A5`; it is organised into named
sections carrying `FR-`, `INT-` and `NFR-` identifiers instead.

The identifier-shaped citations do still resolve - `FR-SET-004` in ADR 0003 and
`FR-SET-001` elsewhere are both defined in `docs/registry/requirements.json`.
The numbered sections and lettered assumptions do not, and the register's own
note explains why: it says of its entries that "none has been confirmed against
an authored specification, because none survives". The specification the ADRs
were written against is gone; what carries its identifiers today was recovered
from the code.

Treat a `§` or a bare letter-digit assumption in these records as a pointer to
a document that no longer exists, and an `FR-`, `INT-` or `NFR-` identifier as a
pointer that still lands.

## Related

- [ADR 0006: workspace-partitioned multi-tenancy](0006-cloud-multi-tenancy.md)
- [Decisions](index.md)
- [Architecture](../architecture/index.md)
