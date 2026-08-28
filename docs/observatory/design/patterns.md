---
id: DSN-PATTERNS
title: Layout and component patterns
summary: How a Vitae screen is composed, what the shared primitives decide for you, and which composition rules are convention rather than gates.
audience: [designer, developer]
domain: design
type: explanation
status: verified
verified_at: 2026-08-24
sources:
  - packages/ui/src/layout.tsx
  - packages/ui/src/overlay.tsx
  - packages/ui/src/components.tsx
  - apps/web/src/app/Shell.tsx
  - apps/web/src/routes/workspaces/WorkspaceHomes.tsx
  - apps/web/src/styles/app.css
  - docs/generated/components.json
  - docs/generated/routes.json
related: [DSN-IDENTITY, DSN-TOKENS, DSN-STATES, DSN-A11Y]
order: 3
---

# Layout and component patterns

## In short

A Vitae screen is a ledger, not a dashboard. Instead of a grid of equally
weighted cards, a screen establishes one lead question or action and then uses
ruled indexes, registers, dossiers and lanes for everything supporting it. The
shared component library holds 60 components and 4 hooks, and several of them
make decisions on your behalf that are easy to get wrong by hand - which part of
a row is the link, whether a selected state is readable without colour, whether
a card that lights up under the cursor can actually be clicked. Almost none of
this is machine-checked; it holds because the primitives make the correct thing
the easy thing.

## How it works

### The shell is four levels, and it does not move

The signed-in application has a persistent frame: a primary rail carrying the
mark, global find, the six workspace hubs, the primary capture action and system
status; a top bar carrying the breadcrumb, a second search affordance, and
structured-new and capture actions; a workspace strip naming the current
workspace and its local destinations; and the routed content region.

Only the last one changes on navigation. That is a deliberate constraint rather
than an implementation detail: it is why route transitions animate opacity on
the content region alone and never slide, and it is why the breadcrumb, the
document title and a polite live region are the things that report where you
now are.

### The shell recomposes; it does not shrink

The rail is 272px expanded and 68px compact, and the compact state has three
different causes. The reader can collapse it. Between 701px and 1080px the shell
forces it compact - through a JavaScript media query rather than CSS, because
the rail's labels are React children and a media query cannot stop them
rendering. At 700px and below the rail is removed entirely and replaced by a
fixed six-column bottom dock with a raised capture control in the centre slot
and a "More" control that opens a sheet holding every hub, so no workspace ever
becomes unreachable. Content reserves the dock's height, and the dock respects
the bottom safe-area inset.

`pointer: coarse` is a separate axis from width. A touch device at desktop width
still gets 44px targets, because the hit-target token is promoted by the pointer
query rather than by a breakpoint.

### One lead, then a ruled index

The generic workspace home is a fixed composition: an eyebrow, the page header,
a ruled workflow trace, a short editorial purpose statement, one dominant
numbered lead destination, and then an ordered ruled index of the rest. The
trace names a four-stage sequence - orient, inspect, decide, act - with the
first stage current on entry.

Two workspaces are deliberate exceptions. The daily view opens straight onto its
agenda, and the career workspace opens on an application runway with pipeline
lanes. Neither should be forced into the generic template for symmetry; the
template exists to give a workspace with several equally plausible entrances one
obvious first move, and those two already have one.

The rule this replaces is worth stating directly, because it is the most common
way a screen goes generic: **do not use an equal-card dashboard grid as a page
skeleton.** When a screen feels bland the correction is almost always
structural - strengthen the lead question, show the trace to the evidence, and
replace repeated containers with a ledger. It is not decoration, and there is no
decoration available to add.

## Mechanics

### What the primitives decide for you

The three composition primitives are small and opinionated.

`PageHeader` renders the page's only `h1`, an optional one-line subtitle, a slot
for contextual help, and a right-aligned action slot. Every screen explains
itself the same way.

`Section` is a titled region, and it is a labelled `section` element with a real
`h2` - a landmark a reader can jump between, not a box. Regions are separated by
a heading and space rather than by card chrome, because a screen of bordered
boxes all at the same weight has no hierarchy at all.

`RegisterRule` is the hairline under the header, optionally carrying ticks. The
ticks must encode something true about the page - revisions of a record, days of
the current week, decade boundaries on a timeline - and a screen with nothing
true to encode passes none and gets a plain rule. There is deliberately no prop
for how many ticks would look nice.

### The row is the workhorse, and it has one subtle rule

A list is a semantic list of ruled rows: a leading glyph or index, a title and
subtitle, optional chips or provenance, then right-aligned dates, counts, state
or actions, with numeric metadata in tabular monospace.

The subtle part is what the link is. `Row` takes a render prop for its main
region, and only that region becomes the click target. The pattern it replaces
wrapped the whole row in one anchor, which gave the link an accessible name
made of the glyph, title, subtitle, every chip, the strength bar and the date
concatenated together, and turned any row action into a control nested inside a
link. Scoping the target to the main region gives the link the name a person
would give it and keeps the actions operable. Row actions therefore sit beside
the row's link, never inside it.

Selection is the other decision the component makes. A selected row is not just
a background and a bar; `Row` emits `aria-selected` when the caller gave it a
role from a selectable collection, and `aria-current` otherwise - which is the
honest meaning of a master-and-detail list - and it also grows a check glyph and
the word for its state, so the selection survives being read without colour.

Hover changes tone and never position. That one is enforced: the
`hover-transform` rule in `scripts/check-brand-bans.mjs` fails a stylesheet that
translates on hover.

### Cards are allowed, and narrower than they look

A card is for a singular bounded module, a stage item, or a document or record
preview. It is not a page skeleton.

`Card` is presentational on purpose. Its `interactive` flag buys the hover
border and nothing else: the component renders a plain container with no role,
no tab index and no key handling, and the flag adds none of them. Hanging a
click handler on the card and setting the flag produces a mouse-only control
that no keyboard and no screen reader can operate. The correct shape is a real
button or anchor inside the card, usually around the title, with the flag set so
the card reports that the control inside it is under the cursor. A static card
does not react at all, because hover feedback on something that does not respond
is a promise the card cannot keep.

A card title is deliberately not a heading element. Cards sit inside a section
that already carries the `h2`, and promoting every card title to an `h3` would
fabricate a document outline the page does not have.

Worth knowing before you reach for it: the shared `Card` is fully implemented
and styled and has no importers at all - the generated component catalogue lists
it among the unused. The application's cards are a screen-local `.card` class
in `apps/web/src/styles/app.css:329`, and the hover rule just below it lights
every card's border whether or not anything inside it responds. That is exactly
the behaviour the primitive's gate was built to prevent, and it is the clearest
live example of what forking a pattern costs. Reach for the primitive.

### Overlays are not yours to rebuild

Dialog, sheet, select, menu, tooltip, combobox and toast are Radix-backed in
`packages/ui`. Rebuilding focus trapping, escape behaviour, announcement timing
or swipe handling by hand is the single most reliable way to ship an
inaccessible screen, and every one of those behaviours has already been
argued through once here. `docs/generated/components.json` records which
components are Radix-backed, along with which are currently undocumented,
unused, or untested.

### One correction to carry forward

`DESIGN.md:120` lists the public routes that do not wait on authentication or
the API, and that list is out of date: it names six paths and a category of
legal and status pages, plus a legacy redirect. The generated route catalogue
records 23 public routes today, because a marketing rebuild and a documentation
surface both landed after that sentence was written.

Do not copy the prose list into anything. `docs/generated/routes.json` is
derived from the route tree in `apps/web/src/App.tsx` on every regeneration and
records, for each route, whether it is public, lazy, a redirect, and which
module answers it. That file is the list.

## Related

- [The Quiet Observatory](identity.md) - the identity these compositions
  express, and the bans that shape them.
- [Tokens and the scales they enforce](tokens.md) - the spacing, radius and
  control-height scales a composition is built from.
- [Loading, empty, error and unavailable](states.md) - what any of these
  compositions shows before its data arrives.
- [Accessibility commitments](accessibility.md) - the semantics the primitives
  emit, and which of them a test actually asserts.
