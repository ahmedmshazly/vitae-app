# ADR 0009: Persist Vitae statuses; placement is a read-model

- **Status:** accepted
- **Date:** 2026-09-11

## Context

Fourfold items persist `open | done | waiting | dropped | someday`. Vitae tasks
already persist `inbox | next | doing | waiting | done | dropped`. Fourfold also
separates **importance** (an assertion that places an item on the vertical axis)
from **priority** (the intra-list tie-break). Vitae already has `priority`
`p1 | p2 | p3 | p4` and no importance field yet.

If Vitae stored Fourfold `open`, every existing inbox / next / doing workflow
would collapse. If placement wrote a quadrant or inferred importance from a due
date, the card would lie about why it moved, and a date change would silently
rewrite an assertion the person never made.

## Decision

1. **Persist Vitae statuses only.** Fourfold `open` maps to `{inbox, next, doing}`
   on **read models**. The stored row keeps the Vitae status. The Fourfold source
   status, when known, lives in provenance and is never inferred back into
   `task.status`.
2. **Fourfold `done` / `dropped` map onto Vitae `done` / `dropped`.** Fourfold
   `waiting` maps onto Vitae `waiting` plus a future `WAITING_ON` edge. Fourfold
   `someday` persists as Vitae `inbox` with provenance `source_status: someday`.
3. **Importance is not priority.** Vitae `priority` remains `p1 | p2 | p3 | p4`.
   Fourfold importance `none | important | critical` is a separate optional
   assertion (added on the write schema in a later task). Do not infer
   importance from dates, and do not invent a fourth importance value.
4. **Placement is a read-model.** A `Placement` is `{ quadrant, reason, params }`
   and cannot be constructed without a reason. Quadrants are
   `do | schedule | delegate | eliminate`. Derived `quadrant` and `open` may
   appear on the task read model; they are not persisted fields.

## Consequences

- Existing tasks keep parsing and listing as they do today. A sparse
  `{ status: 'inbox' }` document remains valid.
- Open-work queries in productivity views union inbox / next / doing rather than
  reading a stored `open` flag.
- Priority stays the intra-list tie-break. Fourfold `P0` has no Vitae member;
  an imported P0 is provenance, not a new `p0` enum.
- Task 3 can implement `placeItem` against this contract without reopening
  status or importance.

## Alternatives considered

- **Persist Fourfold statuses and derive Vitae ones.** Rejected; it rewrites
  every legacy task and breaks Today, planner, and capture defaults.
- **Treat a near due date as importance.** Rejected; urgency is a threshold,
  importance is an assertion. Dates never write importance.
- **Store the computed quadrant on the task.** Rejected; a stored projection
  drifts the moment the rule table changes, and undo could not tell a human
  placement from a computed one.
