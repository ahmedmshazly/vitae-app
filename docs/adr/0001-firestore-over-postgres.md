# ADR 0001: Firestore instead of Postgres

- **Status:** superseded by ADR 0005
- **Date:** 2026-07-11
- **Supersedes:** SRS §4.1 / §12.3-D1 (which chose Postgres/Neon)

## Context

The SRS chose Postgres/Neon because the module's core workload (who-to-call
ranking, relationship-decay metrics, revision history, full-text search, and
`pg_dump`-grade export) are join/CTE/FTS problems. The owner, however, requested
a **MERN-family stack using Firestore** (not Mongoose) with Cloudinary storage
and Firebase emulators, for consistency with the main site and zero-ops local
development.

## Decision

Use **Firestore** as the data plane, and re-implement the relational features in
the Node application layer:

- **Ranking / graph traversal** → in-memory computation over the live graph in
  `apps/api/src/services/crm.ts`, using the pure algorithms in `@vitae/core`
  (including Personalized PageRank via power iteration).
- **Full-text search** → a FlexSearch index built from live nodes
  (`db/search-index.ts`), rebuilt lazily on writes.
- **Revisions** → an append-only `revisions` collection written inside the same
  transaction as every mutation.
- **Export** → JSONL + Markdown vault + checksummed manifest
  (`services/export.ts`) replaces `pg_dump`.
- **Nested arrays** (which Firestore forbids) → stored as JSON strings where
  needed (e.g. parsed-JD keyword `spans`).

## Consequences

**Positive:** zero-ops local dev via emulators; one storage system shared with
the main site's mental model; no SQL migration tooling to maintain.

**Negative / accepted:** ranking and search are O(n) in-memory passes rather than
indexed queries. This is acceptable because Vitae is single-user with a hard
scale ceiling of ≤50k nodes / ≤250k edges (SRS A5), where an in-memory pass is
sub-second. If the ceiling is ever exceeded, the `@vitae/core` algorithms are
storage-agnostic and could be re-hosted on Postgres without rewriting the logic,
which is exactly why they live in a pure package.

## Alternatives considered

- **Postgres/Neon (the SRS choice):** the technically superior fit for this
  workload, rejected only because of the owner's stack constraint.
- **MongoDB (classic MERN):** rejected in favour of Firestore per the owner's
  explicit instruction and its emulator/auth integration.
