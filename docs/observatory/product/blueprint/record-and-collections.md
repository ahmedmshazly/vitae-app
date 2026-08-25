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

Nineteen of the thirty-four record types have no bespoke screen by design —
the substrate decision. That makes the generic record view the most-leveraged
screen in the product: improving it improves nineteen types at once.

## `/n/:id` — The record

**Verdict: ELEVATE.**

Stays: labelled properties, notes, the connections editor, pin with rollback,
delete to trash, per-section failure isolation.

Elevations, both reading data every record already carries:

- **A provenance header** (FR-PROV-001): source, source reference, and
  confidence as first-class chips — *this came from the 2026-03 LinkedIn
  import, confidence 0.8* — with the source linking to its batch where one
  exists. For P3 this is the difference between a note and an exhibit.
- **History opens** (FR-PROV-003): the revision ticks become entries; an
  entry opens into its field-level diff — what changed, from what, to what,
  by which operation. The stored revision rows already carry all of it.

Acceptance: provenance renders on every type including the long-tail ones;
a record with no stated source says so plainly rather than showing an empty
chip; diffs match stored revisions exactly; failures stay isolated per
section (NFR-REL-004).

## `/browse/:type` — Browse a type

**Verdict: KEEP.** The plain register with honest counts, a distinct
first-record action, bulk select, and the unknown-type answer. It is the
substrate's front door and needs nothing but the provenance chip the rows
gain globally (FR-PROV-001).
