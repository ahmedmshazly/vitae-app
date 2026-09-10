# ADR 0012: Productivity analytics are private, deterministic, and computed on read

- **Status:** accepted
- **Date:** 2026-09-11

## Context

Fourfold computes figures (throughput, quadrant balance, waiting, habits, goals)
from items plus events, privately, with no product telemetry. Vitae's
constitution already forbids opaque scoring and outbound analytics (ADR 0003).

Revisions on older Vitae records can be sparse: imports, seeds, and early writes
did not always record a full field-level diff. A chart that treats missing
history as zero completions would invent a past the owner never recorded.

## Decision

1. Productivity analytics are **computed on read** from current records plus
   revisions. They are not a stored rollup and not a telemetry stream.
2. **No telemetry.** Nothing about placement, completion, or time spent leaves
   the workspace.
3. Figures are **deterministic**: same records, same revisions, same window,
   same timezone argument, same numbers.
4. Every analytics read model **declares history completeness**:
   `complete | sparse | unknown`. Sparse means revisions do not cover the
   requested window (or exist only as coarse ops). The UI must surface that
   declaration rather than drawing a confident empty chart.
5. Sensitive / private records follow the existing envelope `sensitivity`
   flag (Vitae `sensitive` <-> Fourfold `private`). Analytics that list titles
   must honour it; they do not exfiltrate those rows.

## Consequences

- Task 3 can project figures without a warehouse or a nightly job.
- A workspace with only node snapshots and no useful revisions reports
  `sparse` or `unknown` instead of a fake zero.
- Completeness is part of the contract, not a UI flourish, so tests can lock
  the declaration.
- Percent-complete grades stay out of the core figures, matching Fourfold's
  "counts, not a score" rule.

## Alternatives considered

- **Persist daily rollups.** Rejected; they drift from the rule table and hide
  sparse history behind a confident number.
- **Ship anonymous usage events.** Rejected; it contradicts ADR 0003 and the
  privacy mapping this integration exists to keep.
- **Treat missing revisions as zero completions.** Rejected; silence is not a
  measurement.
