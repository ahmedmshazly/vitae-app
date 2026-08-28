# P23: Entity forms (structured create/edit, FR-CAP-002)

**Job:** the second capture path beside ⌘K. Every one of the 28 node types has
a Zod-driven structured form with field-level validation and inline edge
sub-editors, rendered by ONE engine from a descriptor registry
(`packages/core/src/forms/node-forms.ts`).

## Entry points

- **`+ New`** button in the top bar (and the `n` shortcut): a grouped dropdown
  (Career / Life / Long tail) with entity glyphs, laid out in columns.
- **"New {type}"** buttons on People, Orgs, and every `/browse/:type` list.
- **"Edit"** on Person, Org, and Record detail pages (same dialog, edit mode).
- **⌘K handoff:** once the grammar parse shows chips, `⇥ Open full form`
  pre-seeds the dialog with the parsed title/notes/date. Quick capture is
  never replaced; the form is the detail path.

## Layout

Modal dialog (`--ae-surface-overlay`, 1px `--ae-border-strong`, radius-lg,
`min(760px, calc(100vw − 32px))`), title "New {type}" / "Edit {type}".

1. **Envelope row:** title (per-type label, e.g. "Full name" for person,
   required, autofocus) + subtitle where the type uses one + start/end dates
   (mono, per-type labels like Started/Ended, Departed/Returned) when the type
   is date-ranged (role, project, education, trip).
2. **Sections:** per-type fieldsets with mono uppercase legends (11px,
   0.14em letter-spacing, `--ae-faint`), two-column grid, textareas and lists
   spanning both columns. Widget inventory: text · textarea · select (Radix,
   portal) · tags · date · datetime · number · checkbox · rating (closeness-dot
   language) · url · email-list · string-list · money (amount + ISO currency,
   optional monthly/yearly period) · object-list (favors, key results,
   follow-ups: bordered rows with an add affordance).
3. **Connections:** edge sub-editors per descriptor (e.g. role → ROLE_AT org
   picker + USES_SKILL multi; application → APPLIED_TO + REFERRED_BY). Each is
   an EntityPicker (async fuzzy search, keyboard nav) with trailing
   "Create {type} '{query}'" stub rows, and per-link inline props (department,
   involvement, nights...).
4. **Notes:** markdown textarea.
5. **Actions:** Cancel + primary "Create {type}" / "Save changes".

## States

- Field errors inline under the input (danger text, `role="alert"`); the same
  Zod schemas the API enforces run client-side first.
- Busy: primary button → "Saving...", disabled.
- Create success: toast "Created {title}" with **Undo** (soft-delete
  compensating call), navigate to the new record.
- Sensitive types (health_log) default envelope sensitivity to `sensitive`.

## A11y / motion

Radix Dialog: focus trap, Esc, `aria-modal`; first form control focused on
open. Entrance 160ms fade+scale at `--ae-ease`; object-list rows rise in
(`vt-rise-in`); everything zeroed under `prefers-reduced-motion`.
