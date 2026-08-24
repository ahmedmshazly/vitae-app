---
id: ARC-PERSISTENCE
title: Storage, migrations and versioning
summary: Why every table is one JSON document with generated columns beside it, how revisions and soft deletes work, and how the partition key changed under Cloud.
audience: [developer, operator]
domain: architecture
type: explanation
status: verified
verified_at: 2026-08-24
sources:
  - apps/api/src/db/migrations/001-initial-schema.ts
  - apps/api/src/db/migrations/007-cloud-control-plane.ts
  - apps/api/src/db/migrations/009-workspace-primary-keys.ts
  - apps/api/src/db/migrations/010-legacy-space-default-workspace.ts
  - apps/api/src/db/repository.ts
  - apps/api/src/db/schema.ts
  - apps/api/src/db/space.ts
  - apps/api/src/db/write-signal.ts
  - apps/api/src/db/search-index.ts
  - apps/api/src/scripts/migrate.ts
  - apps/api/src/services/retention.ts
  - apps/api/src/services/export.ts
  - apps/api/src/routes/v1/export.ts
  - docs/generated/database.json
requirements: [FR-001, FR-002, FR-006, FR-012, FR-017, FR-105, NFR-REL-003]
related: [ARC-GRAPH, ARC-CLOUD, ARC-REQUEST, ARC-SECURITY]
---

# Storage, migrations and versioning

## In short

Vitae stores each record as one JSON document in a Postgres column, with a
handful of queryable fields computed from that document by the database itself.
Nothing writes those computed fields, so they can never disagree with the record
they were derived from.

Every change is versioned. A write and its history entry commit in the same
transaction, so there is no window in which a record has changed and the audit
log has not. Deletes never remove anything immediately: they set a timestamp,
the record stays restorable for thirty days, and a separate purge is what
actually destroys it.

## How it works

The obvious design — a typed column per field — was considered and rejected.
The risk this schema is built against is not query speed; it is fidelity. The
export bundle has to round-trip the whole graph without loss, and a hand-written
codec across two dozen collections is two dozen chances to drop a field. The
repository already writes whole documents: an update merges the patch into the
record and writes all of it, never a partial statement. A single JSON column
matches that write model exactly and is lossless by construction.

What the database needs to filter, sort and join on is then promoted to
generated columns computed from the document and stored. They index like
ordinary columns, so the joins that a document store could not express are
available, and they are typed in the query builder as always-generated, which
makes writing one a compile error rather than a bug.

Timestamps are stored as text, not as a timestamp type. They are written as
ISO-8601 UTC with milliseconds, which sorts lexicographically in exactly
timestamp order. Converting them would buy date arithmetic the system does not
do, at the cost of a formatting round-trip that could quietly reshape every
timestamp in the database.

Migrations are plain TypeScript files run by the query builder's own migrator
under `tsx`. There is no build step anywhere in the API — it runs TypeScript
directly in production — and a migration tool that needed compiling would be the
first thing to break that. Every migration in the tree defines both directions.

## Mechanics

### The document table shape

Each durable table carries the same three columns — the legacy space selector,
the document identifier, and the document itself as `jsonb` — plus whatever
generated columns that table needs. The generator function in the initial
migration takes the queryable field list and emits
`GENERATED ALWAYS AS (data->>'field') STORED` for each.

The query builder's view of that schema (`apps/api/src/db/schema.ts`) is
hand-written rather than generated, deliberately: the tables are three columns
each, which is cheaper to write than to wire a code generator for, and adding a
generator would introduce the build step the deployment model avoids.

The trigram extension is installed by the first migration rather than by a later
one, so a change in full-text strategy is a query change and not a migration.

For the current table, column, index and migration inventory, read
`docs/generated/database.json`; it is derived from the migrations themselves.

### Two partition keys, and why there are two

The original partition was a `space` column with two values, `real` and `demo`,
part of every primary key and injected by one query helper — chosen so that a
forgotten filter is a missing-column error rather than a silent data leak.

That column cannot represent customer tenancy. A browser chose it with a
request header, and it has exactly two values. The Cloud work therefore added a
second, server-selected partition column, `workspace_id`, to all twenty-four
document tables, backfilling existing rows into a claimable legacy workspace and
demonstration rows into an unassigned system workspace, with a foreign key that
restricts deletion of a workspace that still owns rows.

Adding a unique index on the new pair was not enough. As long as `(space, id)`
remained the primary key, a singleton document — the search generation marker,
for instance, whose identifier is a fixed string — would collide between two
Cloud workspaces. `009-workspace-primary-keys` therefore promotes the existing
`(workspace_id, id)` unique index to be each table's primary key and drops the
old one, replacing the child foreign keys with workspace-aware equivalents in
the same step. That is the migration that makes the workspace the record's
actual identity.

A last migration keeps the old contract working: a trigger on each document
table rewrites the workspace of a row inserted with the demonstration space and
the default workspace, so scripts and fixtures that still insert by `space`
alone land where they used to. Repository writes always pass an explicit
workspace and never rely on it.

The repository filters on **both** columns on every read and every write, and
its upserts conflict on the tenant key rather than the legacy one — the comment
in the migration is explicit that conflicting on `(space, id)` could let a
reused identifier overwrite another workspace's row.

### Versioning is a write, not a log

Every mutation goes through `Repository.transaction`. Inside that transaction
the record is written and an append-only `revisions` row is written beside it,
carrying the subject kind and identifier, the new revision number, the
operation, a timestamp, the actor, the provenance source, a full snapshot and a
shallow diff against the previous state. Because both writes are in one
transaction there is no state in which the record moved and its history did not.
That is the audit log and the undo substrate at the same time, and it is why
multi-document work — an import, a merge, a résumé finalisation — composes
staged writes inside one transaction rather than issuing them one at a time.

Revision numbers are monotonic per record. An update merges the patch over the
prior record, restores the immutable fields explicitly (identity, type, creation
and capture timestamps), stamps a new update time and increments the revision.

### Deletion is two steps

A delete sets `deleted_at` and writes a revision with the delete operation;
restore clears it and writes another. Reads hide soft-deleted records unless a
caller asks for them, and edges touching a deleted node are hidden by query
filters rather than removed, which is what makes restore lossless.

The two steps, and what can bring a record back from each:

```diagram
DGM-DELETION-LIFECYCLE
```

The thirty-day promise is kept by a separate purge, which hard-deletes records
past the cutoff along with everything that exists only to describe them — their
revisions, reminders, taggings, attachments, and for nodes the edges that
touched them. Audit history for records that still exist is untouched, and the
merge ledger keeps its pre-images so a merge stays undoable inside its own
window. The purge is idempotent, so it is safe to run on an interval, from the
command line, or from an external scheduler.

### Cache invalidation is a counter

A committed transaction bumps an in-process write generation and publishes a
cross-process search generation as an ordinary arithmetic update. Read models
that memoise a full-graph scan store the generation alongside their snapshot and
rebuild only when it moves — a timer alone is wrong in both directions, too long
and a record created a moment ago is missing, too short and the scan never stops.
The search index uses a generation rather than a dirty flag for a subtler
reason: a mutation arriving during an in-flight rebuild bumps the counter, and
the finishing rebuild publishes itself only if it read at that generation, so the
write it missed is not lost until some unrelated later write.

The in-memory search index is instantiated once per workspace, keyed by the
server-derived partition, so one tenant never serves another's cached graph.

### Export and restore

Export streams a bundle of newline-delimited JSON plus a Markdown vault, entry
by entry into a ZIP, so a large graph does not have to be held in memory.
Records marked sensitive are excluded unless explicitly opted in, and the
exclusion is transitive: edges touching a sensitive node, and the revisions and
atoms that describe it, go too.

Where integrity is checked, which is before anything is written:

```diagram
DGM-EXPORT-BUNDLE
```

One export runs at a time per workspace. The lock is a process-local set
(`apps/api/src/routes/v1/export.ts:17`), which is correct for a single instance
and is documented in place as needing a shared lease before it would hold across
instances. Treat that as a stated limit, not an oversight.

## Related

- [The typed career graph](career-graph.md) defines what is inside the document
  column.
- [The Cloud workspace and billing plane](cloud-plane.md) explains where the
  workspace partition value comes from, and where it does not.
- [What happens to a request](request-lifecycle.md) covers how the partition
  reaches the repository.
- [Trust boundaries and data handling](security.md) covers the sensitivity rule
  and the storage of attachments.
- [Operate](../operate/index.md) is where the procedures for migrating,
  backing up and restoring an instance live.
