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
- **Résumé accents carry names.** Swatches were labelled by hex, which told a
  screen reader nothing; they are Cobalt, Teal, Violet, Amber, Crimson, and Ink.

### Fixed

- The Atlas map reported a failed style or tile load as an endless "Loading map
  tiles" behind a blank panel. It now states the failure, offers a retry, points
  at the keyboard-readable list, and clears `aria-busy`.
- Radix selects wrapped in a `<label>` reached the browser with no accessible
  name, because the trigger is a button. They carry their own labels.

## 1.0.0

The first public stable release establishes the supported architecture,
security policy, release process, public documentation, and fictional example
data set.
