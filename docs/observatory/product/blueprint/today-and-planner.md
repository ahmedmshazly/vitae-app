---
id: PRD-BP-TODAY
title: "Blueprint: Today and the planner"
summary: Today stays the calm agenda and gains the one thing it cannot answer — what changed since you last looked. The planner keeps its job. The Ledger is added here.
audience: [maintainer, designer, developer]
domain: product
type: reference
status: planned
related: [PRD-BP, USE-SCREENS]
sources:
  - apps/web/src/routes/Dashboard.tsx
  - apps/web/src/routes/workspaces/Planner.tsx
  - docs/registry/requirements.json
---

# Blueprint: Today and the planner

The Today hub is the retention ritual: the screen that must earn a daily open
from P1 between searches and from P2 always. Its current shape — needs-you
queue, habits, reconnect lane, momentum with published weights, getting
started — is right. What it lacks is memory of the operator's absence.

## `/today` — Today

**Verdict: SHARPEN.**

What already works stays untouched: the merged priority queue with inline
complete-and-undo, habit checks, the reconnect lane feeding the interaction
logger, the momentum ring that shows its arithmetic (the pattern NFR-PRIV-003
generalizes), and the six-step getting-started checklist that hides itself.

The better version adds one region and one rule:

- **A "since you were away" strip** — the Ledger's first three entries
  (FR-PROV-002) rendered compactly when anything changed since the last
  visit: records touched by an import commit, a merge, a purge warning.
  Absent entirely when nothing changed; never a zero-count box (the empty
  state discipline the screen already follows).
- **The reconnect lane names its evidence** on the card, not only in the
  logger: last interaction date and the cadence it broke. When Correspondence
  ships, the lane's ordering and the rollup's ordering must come from the
  same constants so the two screens cannot disagree (FR-COMM-002).

Personas: P1 (J2, J4 trigger point), P2 (J2 daily). Acceptance: the strip
appears only when the ledger has entries newer than the previous session;
each entry links to its record and its diff (FR-PROV-002, FR-PROV-003);
axe-scanned like every routed screen (NFR-A11Y-002).

## `/today/planner` — Planner

**Verdict: KEEP.**

Dated material laid forward, grouped by day, rows linking to records, "The
horizon is clear" when empty. It does its one job. The only planned change
rides in from elsewhere: rows gain the same provenance chip every record
surface gains (FR-PROV-001).

## The Ledger — ADD, under Today

**Verdict: ADD.** Route under the Today hub; reachable from the "since you
were away" strip and the workspace strip.

The system writes a complete, in-transaction revision history for every
mutation and then never shows it. The Ledger is that history as a surface: a
reverse-chronological feed answering *what changed since I last looked* —
each entry naming the operation, the record, the source (a capture, an
import batch, a merge, a purge), and opening into the field-level diff
(FR-PROV-002, FR-PROV-003).

Why it earns its place: it is near-zero new storage (the revisions table is
complete), high perceived intelligence, and the trust surface P3 and P4 cite
when they explain why they keep their history here. It also makes every
destructive act reviewable after the fact, which is the promise Trash makes
for deletes extended to all writes.

Acceptance: filterable by operation and source; an import batch groups as one
expandable entry; every entry's diff matches the stored revision exactly;
empty state distinguishes "no changes yet" from a failed load (NFR-REL-004).
