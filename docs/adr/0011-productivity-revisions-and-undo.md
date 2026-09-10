# ADR 0011: Revisions are the productivity log; undo is a compensating command

- **Status:** accepted
- **Date:** 2026-09-11

## Context

Vitae already writes a revision on every graph mutation and exposes that history
as the change ledger. Fourfold has its own event store. Adding a second log
would make undo, analytics, and export disagree about what happened.

Clients already send an `expected_rev` on some writes (dossiers). Lost updates
must fail closed: applying an undo after a later edit would silently drop the
later edit.

## Decision

1. **Revisions are the audit / event log** for productivity. Every future
   productivity mutation (task commands, time entries, rules, templates,
   recurrence) must be revisioned on the same log the graph already uses.
2. Commands are versioned (`version: 1`) and carry `operation_id` for
   idempotency. `expected_revision` is optional on create and required in
   spirit on any mutation that can race, including undo.
3. **Undo is a compensating command**, not a row delete and not a second stack
   outside revisions. The compensator carries `expected_revision` equal to the
   revision the client last observed.
4. If a later edit exists, the command fails with **409**. The later edit
   stands. The client reloads and may compose a new compensating command.

## Consequences

- Analytics and the ledger can replay the same revisions. Sparse history is a
  completeness fact (ADR 0012), not a reason to start a second log.
- Idempotency receipts (Task 4) key on `operation_id` so a retried command
  does not double-apply.
- Core stays free of HTTP. The 409 is an API mapping of "expected revision
  does not match the head".
- A create that never received a revision yet omits `expected_revision`.

## Alternatives considered

- **A Fourfold-style event table beside revisions.** Rejected; two logs will
  drift, and export / ledger already read revisions.
- **Undo by restoring a snapshot without `expected_revision`.** Rejected; it
  clobbers concurrent edits.
- **Soft-delete the command row.** Rejected; compensating writes keep the
  history complete and replayable.
