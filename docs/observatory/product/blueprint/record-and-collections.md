---
id: PRD-BP-RECORD
title: "Blueprint: records and browsing"
summary: The generic record screen is the workhorse for nineteen long-tail types and gets the biggest elevation in the product — provenance made visible and history made legible.
audience: [maintainer, designer, developer]
domain: product
type: reference
status: planned
related: [PRD-BP, USE-SCREENS]
sources:
  - apps/web/src/routes/Record.tsx
  - apps/web/src/routes/Browse.tsx
  - docs/registry/requirements.json
---

# Blueprint: records and browsing

Nineteen of the thirty-four record types have no bespoke screen by design -
the substrate decision. That makes the generic record view the most-leveraged
screen in the product: improving it improves nineteen types at once.

## `/n/:id` - The record

**Verdict: ELEVATE.**

Stays: labelled properties, notes, the connections editor, pin with rollback,
delete to trash, per-section failure isolation.

Elevations, both reading data every record already carries - and both
**delivered 2026-08-26** (an honesty note: the source-and-confidence chip
turned out to predate this blueprint as a design-system primitive on eight
screens; what the elevation genuinely added was the source reference and the
diffs):

- **A provenance header** (FR-PROV-001): source and confidence as the
  existing chip, now joined by the source reference - *which batch, which
  upload, which sync this fact arrived in*. Linking the reference to its
  import batch remains follow-on polish. For P3 this is the difference
  between a note and an exhibit.
- **History opens** (FR-PROV-003): revision rows with changes disclose their
  field-level diff - what changed, from what, to what, by which operation.
  The stored revision rows carried all of it all along.

Acceptance: provenance renders on every type including the long-tail ones;
a record with no stated source says so plainly rather than showing an empty
chip; diffs match stored revisions exactly; failures stay isolated per
section (NFR-REL-004).

## `/browse/:type` - Browse a type

**Verdict: KEEP.** The plain register with honest counts, a distinct
first-record action, bulk select, and the unknown-type answer. It is the
substrate's front door and needs nothing but the provenance chip the rows
gain globally (FR-PROV-001).
