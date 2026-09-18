---
id: USE-KNOWLEDGE
title: Reviewing source knowledge
summary: Inspect what a local source supports, compare it with the curated graph, settle conflicts, and preserve an undo path.
audience: [user, developer]
domain: use
type: task
status: verified
verified_at: 2026-09-12
sources:
  - apps/web/src/routes/Knowledge.tsx
  - apps/web/src/features/EntityEvidence.tsx
  - apps/api/src/routes/v1/knowledge.ts
  - apps/api/src/services/knowledge.ts
  - apps/api/src/services/gmail-sqlite.ts
  - packages/core/src/knowledge.ts
covers:
  - route:/data/knowledge
related: [USE-PORTABILITY, USE-GRAPH, USE-TROUBLE]
---

# Reviewing source knowledge

Open **Data → Knowledge review** after a source run. The coverage register says
how many source records were examined and how many entities they support. Each
run states whether coverage is complete and keeps its limitations beside the
counts; a missing date, unavailable attachment, or bounded run is visible rather
than counted as understood.

## Read a comparison

Each assertion names the entity and field, shows the accepted graph value in the
middle, and places what the source says beside it. The status distinguishes an
accepted supporting fact, a suggestion for an empty field, and a conflict with a
nonempty value. Basis and confidence say whether the statement was explicit or
inferred. The excerpt is deliberately short, and the locator is the stable path
back to the source record.

Entity pages show the same evidence below their normal details and connections,
so evidence does not require a separate mental model when reading a person,
organization, project, or career record.

## Decide and recover

Press **Accept fact** for a supported suggestion. Vitae rereads the entity inside
a transaction, fills a missing value or complements a list, and records the graph
revision it wrote. A different existing scalar becomes a conflict and stays in
review. **Reject** closes an assertion without changing the graph.

Run rollback uses the recorded before and after values. It restores a field only
when the entity still has the revision and value written by that decision. A
later manual edit is reported as a refusal and remains intact.

## Gmail boundaries

The Gmail adapter reads a local SQLite database without changing it. It retains
message identifiers, hashes, direction, participants, useful extracted facts,
and excerpts of at most 160 characters. Full message bodies remain in the source
database. Automated messages and bulk recipient lists cannot create personal
relationships, and old requests do not become current tasks.
