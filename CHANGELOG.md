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
- The ⌘K keycap inside the sidebar's capture button kept the raised surface it
  uses everywhere else while inheriting that button's dark ink, so it painted
  dark on dark at 1.12:1 and failed the contrast scan on every screen the
  sidebar appears on.
- The entity catalog's print stylesheet styled `.ec button`, which outranks
  `.vt-btn--primary` and repainted the primary action near-white on near-white.
- Four screens announced one failure twice, once from a status line in the
  header and once from the error region in the body. In those states the header
  line is chrome, not a second voice.
- First run nested a button inside a link, so one control carried two roles.
- Two buttons on the résumé target rail were both named only "Edit". They now
  say which panel they open, and say Cancel while it is open.
- Escape out of the ⌘K or ⌘P palette left focus on the document body instead of
  the control that opened it.
- The faint ink token promised AA against every surface and cleared it against
  only some. The lightest ground in the palette is the selected-row fill, a step
  above the overlay, and faint landed on it at 4.49:1. The token is a shade
  lighter now and clears 4.7:1 on the lightest ground it can sit on.
- Every mutation that reported its own failure said the same sentence twice, in
  two stacked toasts. The app-wide net fired alongside a local handler rather
  than instead of one. It now yields to any mutation that names its own failure,
  and the one handler that rolled back without saying why now says why.
- Every navigation mounted the destination screen twice. The route wrapper waited
  for its own fade-out before swapping, but a wrapper renders whatever screen is
  current, so the incoming one mounted inside the outgoing wrapper, faded itself
  out, and was then destroyed and mounted again. Anything done in those 90ms went
  with it: a dialog that had just opened, a character that had just been typed, a
  click that had just landed. Each screen now mounts once.
- A link inside a sentence was told apart from the sentence by its colour alone,
  at 2.41:1 where the rule asks for 3:1. Prose links carry an underline now, so
  the difference is a shape and not only a hue.

## 1.0.0

The first public stable release establishes the supported architecture,
security policy, release process, public documentation, and fictional example
data set.
