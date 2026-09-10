# ADR 0013: Productivity routes and default-off feature flags

- **Status:** accepted
- **Date:** 2026-09-11

## Context

Vitae already ships `/today`, `/today/planner`, and `/today/ledger`. Fourfold's
Today surfaces (tasks, waiting, review, analytics, automation, templates) need
homes that do not steal those three routes or ship enabled to every existing
workspace.

A flag that defaults on would change Today for operators who never asked for
the integration. A flag that exists only in docs will be reinvented with a
different name in the API and web apps.

## Decision

1. **New routes** (named now, mounted in a later task):
   - `/today/tasks`
   - `/today/waiting`
   - `/today/review`
   - `/today/analytics`
   - `/today/automation`
   - `/today/task-templates`
2. **Unchanged routes:** `/today`, `/today/planner`, `/today/ledger`.
3. **Feature flags**, default false:
   - API: `VITAE_PRODUCTIVITY_ENABLED`
   - Web: `VITE_PUBLIC_PRODUCTIVITY_ENABLED`
4. This task does not mount the routes, wire the flags, or add UI. Later tasks
   must use these names and this default.

## Consequences

- Existing e2e coverage of Today, planner, and the change ledger stays
  meaningful; those URLs do not move.
- Both apps can gate work behind the same pair of names. A third flag name is
  a defect.
- Operators keep the current Today until they opt in.
- Deep links for the new surfaces are stable before any page exists.

## Alternatives considered

- **Reuse `/today` for the Fourfold matrix.** Rejected; it would change the
  shipped Today queue (reminders, reconnect, applications) without a flag.
- **Nest everything under `/productivity`.** Rejected; the work belongs in the
  Today workspace the operator already opens each morning.
- **Default the flags on.** Rejected; characterization of legacy Today would
  no longer hold.
