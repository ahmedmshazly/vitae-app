# ADR 0005: Postgres instead of Firestore

- **Status:** accepted
- **Date:** 2026-07-31
- **Supersedes:** ADR 0001 (Firestore instead of Postgres)
- **Scope:** the data plane only. Firebase **Auth** stays; Cloudinary stays.

## Context

ADR 0001 chose Firestore over the SRS's Postgres on an explicit stack
preference, and was candid about the trade: Postgres was *"the technically
superior fit for this workload, rejected only because of the owner's stack
constraint."* It closed by noting that the `@vitae/core` algorithms *"are
storage-agnostic and could be re-hosted on Postgres without rewriting the logic,
which is exactly why they live in a pure package."*

That escape hatch is now being used, for a reason ADR 0001 did not anticipate:
**read amplification made the free tier unusable, and then made backups
impossible.**

Every read surface loads the whole graph. `loadGraph()` is
`allLiveNodes() + allLiveEdges()` (1,412 documents), and there were 61
full-graph read sites across 26 files. A short session cost ~7,000 reads against
a 50,000/day cap, so the quota ran out after roughly seven sessions. This is not
a Firestore defect; it is what a document store costs when the workload wants
joins.

The consequence that forced the decision: **the nightly backup reads every
document, so once ordinary usage exhausted the quota, the backup could not
run.** Every scheduled run from 2026-07-29 onward died with
`8 RESOURCE_EXHAUSTED: Quota exceeded`. A database that cannot be read cannot be
backed up, and cannot be migrated off either.

## Decision

Move the data plane to **Postgres** (RDS in production, a container locally).
Keep Firebase Auth, because `verifyIdToken` is free, unmetered, and was never
the constraint. This is a data-plane migration, not a de-Firebase-ing.

### Storage model: `data jsonb` + generated columns

Each record is stored whole in a `jsonb` column, with the queryable fields as
`GENERATED ALWAYS ... STORED` columns derived from it.

A typed column per field was the obvious port and was rejected. The risk in this
migration is **fidelity, not throughput**: the export bundle must round-trip or
data is silently lost, and a hand-written codec across 21 collections is 21
chances to drop a field. The repository already writes whole documents
(`stageNodeUpdate` merges the patch and writes all of it, never a partial UPDATE),
so one `jsonb` column matches the existing write model exactly and is lossless
by construction. The generated columns beside it are computed by Postgres, so an
index can never disagree with the record it indexes.

This keeps the relational win that motivated the move. Generated columns index
like any other, so the joins and `WHERE` clauses Firestore could not do are
available:

```sql
SELECT e.data FROM edges e JOIN nodes n ON n.space = e.space AND n.id = e.src
 WHERE e.space = $1 AND e.type = 'HELD' AND n.deleted_at IS NULL;
```

### Timestamps stay `TEXT`

`nowIso()` writes ISO-8601 UTC with milliseconds, which sorts lexicographically
in exactly timestamp order, so `ORDER BY updated_at DESC` and
`deleted_at < $cutoff` behave identically to before. `timestamptz` would buy
date arithmetic the application does not do, at the cost of a formatting
round-trip through every timestamp in the database.

### Data spaces become a column

`demo` was a `demo_` collection-name prefix resolved by `COL` getters. It is now
a `space` column inside every primary key, injected by one query helper, so a
forgotten filter is a missing-column error rather than a silent cross-space
leak.

## Consequences

**Positive**

- Reads are not metered, so full-graph access stops being a budget question and
  the backup can always run.
- Constructs that were workarounds simply disappear: `recursiveDelete` →
  `ON DELETE CASCADE`; `where('in')` chunked at 30 → `= ANY`; 500-operation
  batch limits → ordinary multi-row inserts; `listNodes`' cursor walk and scan
  ceiling → `LIMIT`; `FieldValue.increment` → arithmetic in an upsert; and the
  `parsed_json` string encoding, which existed only because Firestore forbids
  nested arrays, → native `jsonb`.
- The layering rule is real again. `repository.raw` had eroded to 162 uses
  across 32 files; there is no escape hatch now, and `firebase-admin` is
  imported by exactly one file.

**Negative / accepted**

- ~$15/month for `db.t4g.micro`, where Firestore's free tier was $0. This is the
  thing being bought: the free tier is what caused the outage.
- An operational component to run, patch, and monitor. Mitigated by using
  managed RDS with automated snapshots and PITR rather than a self-hosted
  container. A container on the API host would die with the host, which is the
  exact failure the migration was asked to protect against.
- `jsonb` normalises key order, so comparing two export bundles must canonicalise
  rather than diff bytes. Pinned by test in `db/schema.test.ts`.

**Deliberately deferred**

`db/search-index.ts` still uses FlexSearch, and described itself as *"the
Node-layer replacement for Postgres FTS given the Firestore stack."* Postgres
does this natively (`tsvector` + GIN, `pg_trgm` for the ⌘P switcher, and
`LISTEN/NOTIFY` in place of the generation counter). Keeping it for now made the
cutover a pure data-plane swap; replacing it is its own change with its own
tests. `pg_trgm` is already installed by migration 001 so that change is a query
change, not a migration.

Likewise the 61 full-graph read sites: the migration makes them free, it does
not make them right.

## Alternatives considered

- **Stay on Firestore, enable Blaze.** Cheapest immediate fix: the cap becomes
  billing rather than a hard stop. Rejected because it pays to keep an access
  pattern that a relational store serves better for less, and it leaves every
  workaround above in place.
- **A Firestore-shaped compatibility shim over Postgres** (`collection().doc()
  .where()`). Would have spared the 162 call sites, but preserves every
  document-store weakness on a relational engine (no joins, in-memory
  filtering, batch chunking), so the whole migration cost is paid and none of
  the benefit collected.
- **Postgres in a container on the existing EC2 host.** $0, but the database
  dies with the instance, which defeats the durability requirement that prompted
  the work.
