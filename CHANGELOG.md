# Changelog

All notable changes are recorded here.

## Unreleased

### Changed

- **A six-workspace information architecture.** Today, Network, Career,
  Explore, Data, and Settings replace the flat route list. Every previous URL
  stays mounted, so existing bookmarks and links continue to resolve.
- **A written design system.** `DESIGN.md` records the "Living Ledger / Quiet
  Observatory" grammar: composition, the feedback vocabulary, a five-variant
  motion language on one easing curve, the accessibility floor, and the
  guardrails a contributor is held to. `scripts/check-brand-bans.mjs` enforces
  the mechanical half of it.
- **One feedback grammar across the app.** `QueryBoundary`, `Skeleton`,
  `EmptyState`, `ErrorState`, `Banner`, `StatusTrace`, and a queued toast API
  replace the per-screen loading and error dialects. A failed load no longer
  renders as an empty list.
- **Every screen on the design system.** The screens the first pass skipped are
  now on the same primitives and tokens as the rest: the Evidence library,
  Templates, the three Tailor panes that sat beside three refreshed ones, the
  data tools, the record browsers, the 404, and the schema observatory at
  `/reference/entities`.
- **Records are lists.** Browse, search, the person and organization profiles,
  collections and repositories each built rows from sibling divs, so nothing
  could count them or skip past them. They share one ruled register, and only
  the title and subtitle are inside the row's link; the chips, provenance and
  date sit beside it as separate facts.
- **Résumé accents carry names.** Swatches were labelled by hex, which told a
  screen reader nothing; they are Cobalt, Teal, Violet, Amber, Crimson, and Ink.

### Fixed

- The Atlas map reported a failed style or tile load as an endless "Loading map
  tiles" behind a blank panel. It now states the failure, offers a retry, points
  at the keyboard-readable list, and clears `aria-busy`.
- The relation matrix was 1156 buttons in a grid with no rows: nothing to
  count, 1156 tab stops, and cells that only shaded themselves. It is a real
  grid with one tab stop the arrow keys move, and a cell that names the
  relations it holds.
- The observatory cockpit put an `aria-label` on an element with no role, wrote
  a `listbox` whose options were buttons, left its state summary unannounced,
  named its tool buttons after their glyphs, printed a hardcoded relation total
  beside a live count, let the degree filter empty the scene with no upper
  bound, and deleted a saved workspace with no confirmation.
- Twenty dialogs and inline widgets fetched data and rendered as though the
  answer had already arrived, so a slow query and an empty result were the same
  picture.
- Radix selects wrapped in a `<label>` reached the browser with no accessible
  name, because the trigger is a button. They carry their own labels.

## 1.0.0

The first public stable release establishes the supported architecture,
security policy, release process, public documentation, and fictional example
data set.
