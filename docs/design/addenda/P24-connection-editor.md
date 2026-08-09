# P24: Connection editor (relationships are records, SRS §4.4 / FR-CON-001)

**Job:** create, edit, and remove typed edges from any record, and edit the
KNOWS edge (the relationship itself) in place on the person profile.

## Add connection (Record · Person · Org)

"+ add" affordance on the Connections card opens a modal:

1. **Relationship select** (mono): options filtered by src/dst compatibility
   with the node in hand from `EDGE_FORM_DESCRIPTORS`; direction shown as
   `label →` (node is source) or `← label` (node is destination), with the
   catalog description as help text.
2. **Entity picker** for the other endpoint, restricted to the edge's legal
   node types; inline "Create …" stubs allowed.
3. **Props mini-form** per edge type (department, involvement, level,
   centrality, nights, outcome, shared_on…).
4. Primary "Create link" → `POST /edges`; toast with **Undo** (edge
   soft-delete).

## Edge rows (Record connections card)

Hover/focus reveals two 22px square actions on each row:

- **edit** (pencil) → popover with the edge's editable props; Save PATCHes
  `{props: {...existing, ...draft}}` (merge; derived fields survive).
- **unlink** (×, danger on hover) → ConfirmDialog ("records themselves are
  untouched") → soft `DELETE /edges/:id` with an Undo toast that restores.

## KNOWS editor (person profile strength card)

"edit" in the card title (or clicking the closeness dots) swaps the read-only
decomposition for the editor:

- **Closeness:** interactive 1-5 dots (the ClosenessDots visual, 16px,
  hover-scaled), toggling off allowed.
- **Reconnect cadence:** mono number input auto-filled from
  `CADENCE_BY_CLOSENESS` (5→30 · 4→60 · 3→120 · 2→365 · 1→none) until manually
  overridden; the default shows as help text.
- **Met via / met on:** free text + mono date.
- **Topics:** TagInput; help: "feeds Who should I call".
- **Do not ping:** checkbox; surfaces as a warning chip in the read view.
- Save → `PATCH /edges/:id` with full-props merge; the server recomputes tie
  strength; summary/people queries invalidate; toast "Relationship updated".

## A11y

All icon actions carry `aria-label`s; ConfirmDialog is a focus-trapped Radix
dialog; the editor is reachable by keyboard from the card title button.
