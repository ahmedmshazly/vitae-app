---
id: PRD-BP-EXPLORE
title: "Blueprint: Explore"
summary: The three lenses over one graph stay; the library's saved views get elevated from a convenience into the product's shareable unit of attention.
audience: [maintainer, designer, developer]
domain: product
type: reference
status: planned
related: [PRD-BP, USE-SCREENS]
sources:
  - apps/web/src/routes/Collections.tsx
  - apps/web/src/features/graph/GraphView.tsx
  - docs/registry/requirements.json
---

# Blueprint: Explore

Explore is where the "one living system, many lenses" principle is literal:
the same records against connection, time, and place. These screens are also
the substrate story made visible — a trip on the atlas explains a gap the
résumé never has to apologize for.

## `/explore/library` — Library and saved views

**Verdict: ELEVATE.**

The clause-chip query builder, live counts, per-type tiles, and view saving
all stay (FR-ORG-005). The elevation is conceptual: a saved view is already
a persisted, URL-round-tripping, nav-pinnable, CSV-exportable entity — the
blueprint names it the product's **unit of attention**. Concretely:

- A saved view can seed a dossier's evidence selection (FR-DOS-001) — the
  bridge between "the records I keep looking at" and "the packet I must
  produce".
- A view's query surfaces on its nav pin (hover/detail), so a pinned lens
  explains itself (NFR-PRIV-003 in spirit).
- Provenance clauses (`source:`, confidence) join the runnable examples
  (FR-PROV-001).

## `/explore/graph` — Life map

**Verdict: KEEP.** Mode/records/lens/kind toolbars, pathfinder, peek panel
with focus trail, full keyboard navigation with announced selection, the
element cap that says it capped (FR-VIS-001, NFR-PERF-002). The map is the
demo-day screen; its discipline is already right.

## `/explore/timeline` — Chronograph

**Verdict: KEEP.** Evidence lanes with the un-hideable last lane, brush to
season digest (FR-VIS-002, FR-VIS-005), the list equivalent. One sharpening
rides in: the brush digest links into the Ledger's view of the same range
when it ships (FR-PROV-002) — "what happened then" and "what changed then"
become one gesture apart.

## `/explore/atlas` — Atlas

**Verdict: KEEP.** City and trip dossiers, compare and corridor docks, the
unmapped dock and resolve panel, the list equivalent (FR-VIS-003). The atlas
is the substrate argument at its most persuasive; it needs no addition.
