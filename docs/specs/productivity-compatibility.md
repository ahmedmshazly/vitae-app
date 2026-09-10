# Productivity compatibility specification

Field-level contract for the Fourfold-to-Vitae productivity integration.
Algorithms, API routes, and UI must obey this document. This task freezes the
contract; it does not implement placement, recurrence expansion, capture
parsing, rule evaluation, or analytics projections.

Binding ADRs: [0008](../adr/0008-productivity-on-vitae-graph.md),
[0009](../adr/0009-task-status-and-placement.md),
[0010](../adr/0010-due-target-timezone.md),
[0011](../adr/0011-productivity-revisions-and-undo.md),
[0012](../adr/0012-private-productivity-analytics.md),
[0013](../adr/0013-productivity-routes-and-flag.md).

Fourfold sources (reference only; do not copy their runtime):

- `fourfold/packages/core/src/placement.ts`
- `fourfold/packages/core/src/analytics`
- `fourfold/packages/core/src/capture`
- `fourfold/packages/core/src/recurrence`
- `fourfold/packages/core/src/rules`

## Canonical ownership

Canonical records stay Vitae nodes. There is no Fourfold item table and no
second event store (ADR 0008).

| Record | Vitae node / collection | Notes |
|---|---|---|
| Task / item | `task` | Persist Vitae `taskProps` plus future optional fields named below |
| Habit | `habit` | Existing `habitProps` unchanged in this task |
| Goal | `goal` | Existing `goalProps` unchanged in this task |
| Project | `project` | Existing `projectProps` unchanged in this task |
| Person | `person` | Waiting-on and FOR targets |
| Organization | `organization` | FOR targets |
| Application | `application` | Existing pipeline; not a Fourfold item type |
| Reminder | `reminders` collection (API) | Core reminder-shaped input is `interactionProps.follow_ups` |
| Change ledger | `revisions` | `/today/ledger` already projects this |
| Favor ledger | `KNOWS.props.favors` | Existing `knowsProps` |

Future collections (Task 4, name only): `time_entries`, `automation_rules`,
idempotency / execution receipts.

Future edges (Task 3, name only; do not add to `EDGE_TYPES` here): `DEPENDS_ON`,
`SERVES_GOAL`, `WAITING_ON`, `FOR`.

## Statuses

Vitae persists `task.status`: `inbox | next | doing | waiting | done | dropped`.

| Fourfold `item.status` | Persist | Read model |
|---|---|---|
| `open` | the Vitae status already stored (`inbox`, `next`, or `doing`) | `open: true` when status is in `{inbox, next, doing}` |
| `done` | `done` | `open: false` |
| `dropped` | `dropped` | `open: false` |
| `waiting` | `waiting` | `open: false`; pair with `WAITING_ON` in Task 3 |
| `someday` | `inbox` | `open: true`; provenance `source_status: someday` |

Never infer a Vitae status back from provenance. Store the Fourfold source
status when importing or capturing from Fourfold; do not write it to
`task.status`.

`open` is a derived read-model boolean. It is not a persisted field.

## Hard due versus soft target

| Field | Meaning | Overdue language |
|---|---|---|
| `task.due` | Hard date the world set | A past due may be described as late |
| `task.target` (Task 3) | Soft date the person set | Never called overdue |
| `task.scheduled` | When the person means to work | Existing date-only field |

Both `due` and `target` are date-only (`YYYY-MM-DD`). Existing `isoDate`
**rejects a timestamptz** such as `2026-09-04T12:00:00.000Z`. That rejection is
current Vitae behavior and a compatibility invariant.

## Importance versus priority

Importance is an assertion. Priority is an intra-list tie-break. Do not infer
importance from dates (ADR 0009).

| Concept | Values | Where |
|---|---|---|
| Vitae `task.priority` | `p1 \| p2 \| p3 \| p4` | persisted today; optional |
| Fourfold `priority` | `P0 \| P1 \| P2 \| P3 \| P4` | map `P1`..`P4` to `p1`..`p4`; `P0` stays in provenance |
| Fourfold / Vitae importance | `none \| important \| critical` | `task.importance` in Task 3; optional |

There is no fourth importance value. `high | normal | low` is not this product.

## Timezone and DST

- Workspace timezone arrives via existing `x-vitae-tz` (IANA).
- Date-only fields are calendar dates in that timezone. Never treat them as
  UTC midnights.
- DST non-shift: a stored `due` or `target` does not move when the zone offset
  changes. Placement and recurrence compare calendar dates.
- `@vitae/core` receives `timeZone` and `today` as arguments. It does not read
  the host clock or HTTP headers.

## Recurrence

Adapted from Fourfold `Recurrence`:

```
{ rrule: string, mode: 'fixed' | 'from_completion', exceptions: YYYY-MM-DD[] }
```

- `fixed` stays on the calendar.
- `from_completion` counts from the last completion.
- Exceptions are skipped occurrences (facts), not inferred misses.
- Expansion is Task 3. This spec only names the stored shape and the
  `set_recurrence` command.

## Privacy

Vitae envelope `sensitivity: 'sensitive'` corresponds to Fourfold `private`.
`normal` is the default and corresponds to a non-private Fourfold item.
Analytics and export already honour sensitivity; new productivity surfaces
must not leak sensitive titles.

## Revisions and undo

Revisions are the audit / event log (ADR 0011). Every productivity mutation
writes one.

Commands share this envelope:

```
{ version: 1, operation_id: string, expected_revision?: number }
```

`expected_revision` is omitted on create. On update, complete, drop, restore,
reorder, wait, follow-up, time entry, recurrence, rule, and template upsert it
is the head revision the client last saw.

Undo is a compensating command with `expected_revision`. If a later edit
exists, the API responds **409**.

## Analytics completeness

Analytics are private, deterministic, and computed on read from records plus
revisions (ADR 0012). No telemetry.

Every analytics read model declares `history_completeness`:

| Value | Meaning |
|---|---|
| `complete` | Revisions cover the requested window with field-level diffs |
| `sparse` | Some mutations in the window have no usable revision payload |
| `unknown` | The store cannot say (no revisions, or only coarse ops) |

A sparse or unknown figure must carry the declaration. Silence is not a zero.

## Route ownership

Mounted later; named now (ADR 0013).

| Route | Owner | Flag |
|---|---|---|
| `/today` | existing Today queue | unchanged |
| `/today/planner` | existing planner | unchanged |
| `/today/ledger` | existing change ledger | unchanged |
| `/today/tasks` | productivity matrix | both flags |
| `/today/waiting` | waiting list | both flags |
| `/today/review` | review | both flags |
| `/today/analytics` | private figures | both flags |
| `/today/automation` | rules | both flags |
| `/today/task-templates` | templates | both flags |

Flags, default false:

- API: `VITAE_PRODUCTIVITY_ENABLED`
- Web: `VITE_PUBLIC_PRODUCTIVITY_ENABLED`

## Field map

| Fourfold concept | Vitae field (now or Task 3) | Notes |
|---|---|---|
| item status `open` | `task.status` in `{inbox,next,doing}` | persist Vitae; provenance keeps source |
| item status `done` / `dropped` | `done` / `dropped` | |
| `due_at` | `task.due` | date-only |
| `target_at` | `task.target` (Task 3) | soft; never called overdue |
| `importance` | `task.importance` (Task 3) | assertion only |
| `priority` | `task.priority` | `p1`–`p4` |
| `private` | existing sensitive flag | |
| waiting | `status=waiting` + `WAITING_ON` (Task 3) | |
| project / goal / habit / application | existing node types | |

Additional mappings used by commands and fixtures:

| Fourfold concept | Vitae | Notes |
|---|---|---|
| `follow_up_at` | command `follow_up` / read-model `follow_up` (Task 3) | date-only |
| `scheduled_at` | `task.scheduled` | date-only today |
| `quadrant_override` | read-model / command override (Task 3) | reason `placed_by_you` |
| `quadrant` | derived on the read model | not persisted |
| `recurrence` | `set_recurrence` payload | RFC 5545 subset + mode |
| `P0`..`P4` | `p1`..`p4` plus provenance for `P0` | do not add `p0` |

## Placement contract (types only)

A `Placement` requires a reason. Quadrants are
`do | schedule | delegate | eliminate`. Reason keys are the Fourfold
`ReasonKey` union from `placement.ts`:

`due_within_window`, `due_past`, `target_within_window`, `target_past`,
`follow_up_due`, `waiting_patience_exceeded`, `stage_patience_exceeded`,
`importance_asserted`, `project_default`, `serves_goal`, `placed_by_you`,
`no_signal`.

Precedence (first match wins) is Fourfold's table: override, then urgency
(due past, due in window, target past, target in window, follow-up due,
waiting patience, stage patience), then importance assertions, else
`eliminate` / `no_signal`. Importance is never derived from a date.

Fixture rows that encode these cases live at
`packages/core/src/productivity/__fixtures__/`. Task 3 executes them through
`placeItem`. This task only proves the rows are well-formed.

## Versioned commands

Discriminated on `type`, envelope `version: 1`. Payloads are defined in
`packages/core/src/productivity/commands.ts`:

`create_task`, `update_task`, `complete_task`, `drop_task`, `restore_task`,
`reorder_tasks`, `wait_on_task`, `follow_up_task`, `add_time_entry`,
`set_recurrence`, `upsert_rule`, `upsert_template`.
