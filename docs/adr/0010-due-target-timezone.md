# ADR 0010: Hard due versus soft target; date-only in the workspace timezone

- **Status:** accepted
- **Date:** 2026-09-11

## Context

Vitae already stores `task.due` and `task.scheduled` as date-only `YYYY-MM-DD`
(`isoDate`). A timestamptz string is rejected by that schema today. Fourfold
stores `due_at` (hard) and `target_at` (soft) as instants and reads them in a
workspace timezone.

The API already pins calendar arithmetic to the request's IANA zone via
`x-vitae-tz`. Treating a date-only due as "midnight UTC" would move the calendar
day when the offset changes, including every spring and autumn DST transition.

A passed hard due may be described as late. A passed soft target may only be
described; it is never called overdue.

## Decision

1. **Hard due** is the existing Vitae `task.due` (date-only).
2. **Soft target** is a new optional field named `target` (date-only). The write
   schema lands in a later task; commands and the compatibility spec name it now.
3. Date-only fields are **calendar dates in the workspace timezone** supplied by
   `x-vitae-tz`. They are never interpreted as UTC midnights.
4. **DST non-shift:** a stored due or target does not change when the zone's
   offset changes. `2026-03-08` in `America/New_York` stays 8 March through the
   spring-forward. Placement compares calendar dates, not instants.
5. Recurrence exceptions are date-only in the same timezone. Modes match
   Fourfold: `fixed` (calendar) and `from_completion` (count from the last
   completion).

## Consequences

- Existing `isoDate` rejection of timestamptz dues remains correct and is a
  compatibility invariant, not a bug to relax.
- `@vitae/core` still takes the timezone and "today" as arguments. It does not
  read `Date.now()` or HTTP headers.
- Copy and analytics may say a due is past; they must not call a past `target`
  overdue.
- Task 3 can expand recurrence against date-only + timezone without inventing
  a stored instant.

## Alternatives considered

- **Store dues as timestamptz.** Rejected; it breaks every existing task document
  and reintroduces the midnight-UTC shift this record exists to prevent.
- **Call a past target overdue.** Rejected; that is Fourfold's hard/soft split
  and the reason the fields are not one column.
- **Let core read the host clock.** Rejected; it would make placement and
  recurrence depend on the runner's zone (ADR 0002, ADR 0003).
