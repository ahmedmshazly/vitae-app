---
id: PRD-BP-CAPTURE
title: "Blueprint: capture, search, and overlays"
summary: The capture grammar and the palette are the product's fastest habit loop and stay as they are; search gains visible provenance; the overlays keep their discipline.
audience: [maintainer, designer, developer]
domain: product
type: reference
status: planned
related: [PRD-BP, USE-SCREENS]
sources:
  - apps/web/src/features/QuickAdd.tsx
  - apps/web/src/features/QuickSwitcher.tsx
  - apps/web/src/routes/SearchResults.tsx
  - docs/registry/requirements.json
---

# Blueprint: capture, search, and overlays

Capture is the moment the memory research points at: accomplishments decay
within weeks, so the system's value compounds exactly as fast as capture is
frictionless. These surfaces are the product's best-engineered loop and the
blueprint's job here is mostly to protect them.

## ⌘K - Quick capture

**Verdict: KEEP.**

One line, parsed server-side, previewed as chips, committed as undoable
linked writes (FR-CAP-001, FR-002). Thirteen leading-key grammars with
clickable examples; escalation into the structured form. Nothing about this
should change shape.

One sharpening rides in with provenance work: a captured record's `source`
is already stamped; when provenance chips ship (FR-PROV-001), the capture
preview shows the source it will stamp, so the operator sees the provenance
story begin at the moment of writing.

Personas: all four; P1/P2 own the J1 stories.

## `n` - New record menu and forms

**Verdict: KEEP.**

Every node type creatable through schema-driven forms with inline duplicate
detection (FR-CAP-002, FR-008); the coverage test that forbids an
import-only type stays load-bearing. The long-tail types stay in the menu -
the substrate decision in `PRODUCT.md` is deliberate.

## ⌘P - The palette

**Verdict: KEEP.**

Records and thirty-one actions in one list, accent-insensitive matching
(FR-SRCH-004). When the Ledger, Correspondence, and Dossiers ship, each adds
its palette action in the same release - a surface that is not in the
palette does not exist.

## `/search` - Search results

**Verdict: SHARPEN.**

The filter grammar, URL-as-state, relevance as a share of the top match,
kind narrowing, and the self-explaining invalid-filter chip all stay
(FR-SRCH-001, FR-SRCH-002, FR-SRCH-003).

The better version makes provenance a first-class facet: the grammar already
parses `source:`, so results gain the provenance chip (FR-PROV-001) and the
idle screen's runnable examples gain one for source filtering. Search is
where P3 audits what came from where; today that power is invisible unless
you know the grammar by heart.

Acceptance: a `source:` query renders the matching chip on every result; the
idle grammar list shows a runnable `source:` example; no ranking change.

## Reminders drawer

**Verdict: KEEP.**

Complete-with-undo, snooze, the due badge. Its discipline - no mutation
fails silently (NFR-REL-004) - is the standard the new surfaces inherit.
