# ADR 0008: Productivity lives on the existing Vitae graph

- **Status:** accepted
- **Date:** 2026-09-11

## Context

Fourfold is a separate product with its own data plane (Electric / TanStack DB),
auth (Better Auth), event store, and application shell. Vitae already has a
Postgres `jsonb` graph (`task`, `habit`, `goal`, `project`, `person`,
`organization`, `application`, and the rest of the node catalog), subject-scoped
ownership (ADR 0004), a revision log, an Express API, and a Vite web shell.

The integration is a Fourfold-to-Vitae productivity enrichment, not a second
product hosted beside Vitae. A parallel store or shell would fork identity,
revisions, export, search, and ownership, and would break the "one graph, one
audit trail" contract the rest of the system already enforces.

## Decision

Host productivity on the **existing Vitae graph and shell**.

- Canonical records stay the Vitae node types: `task`, `habit`, `goal`,
  `project`, `person`, `organization`, `application`.
- Algorithms and versioned command / read-model schemas live in `@vitae/core`
  (ADR 0002). No browser, HTTP, database, or `Date.now()` in that package.
- Do not introduce Electric, TanStack DB, Better Auth, a second event store, or
  a second application shell.
- New collections (`time_entries`, `automation_rules`, idempotency / execution
  receipts) wait for the persistence task. New edge types (`DEPENDS_ON`,
  `SERVES_GOAL`, `WAITING_ON`, `FOR`) wait for the algorithm task. This record
  names them only.

## Consequences

- Placement, recurrence, capture, rules, and analytics become read-models and
  pure functions over Vitae records plus revisions, not a second source of
  truth.
- Import / export / search / ledger keep one graph. Provenance can store a
  Fourfold source status without creating a Fourfold row.
- Cost: Fourfold runtime pieces that assumed Electric sync or a dedicated item
  table must be re-expressed as Vitae commands and projections.
- Feature flags (`VITAE_PRODUCTIVITY_ENABLED`, `VITE_PUBLIC_PRODUCTIVITY_ENABLED`)
  default off so the existing Today / planner / ledger surfaces stay unchanged
  until later tasks mount routes.

## Alternatives considered

- **Vendor Fourfold's data plane beside Vitae.** Rejected; it duplicates auth,
  revisions, export, and ownership, and makes "one graph" a slogan.
- **Replace Vitae tasks with Fourfold items.** Rejected; legacy Vitae statuses,
  reminders, capture, and search already persist `task` nodes.
- **A new "productivity" node type.** Rejected; it would orphan existing tasks,
  habits, goals, and applications that already carry the work.
