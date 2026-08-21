# Vitae design system

This document records the interface that is implemented now. Product truth remains in
[`PRODUCT.md`](./PRODUCT.md); the authoritative design tokens and shared primitives live in
`packages/ui`, while app composition lives in `apps/web`.

## Identity

Vitae is a **Living Ledger / Quiet Observatory** (concept seed `7fdb9c86`): a private body of
evidence that can be read through relationship, career, time, place, and custody lenses. It should
feel like a precise instrument at rest, not a feed or a generic dashboard.

The visual thesis is matte near-black fields, bone-white ink, one-pixel ruling, open registers,
pinned traces, and restrained semantic colour. The interaction thesis is equally important:
orient the user, expose the evidence, make the next action clear, and keep capture available
without breaking the flow.

Two composition rules are deliberate:

- Do not build pages as equal-card dashboard grids. Establish one lead action or question, then
  use ruled indexes, ledgers, dossiers, lanes, or an instrument canvas for the supporting work.
- Do not use generic or decorative gradients. Chrome is flat. Ambient washes, glow, glass,
  backdrop blur, shimmer, and textured backgrounds are excluded. A tiny data-encoding half-fill
  or a literal document preview is not permission to introduce gradient styling elsewhere.

## Visual foundation

`packages/ui/src/styles/tokens.css` is the palette and geometry authority. Chrome is achromatic;
paper white is the action accent, so colour remains available for state and data meaning.

| Role                     | Token                                       | Value / use                                               |
| ------------------------ | ------------------------------------------- | --------------------------------------------------------- |
| Frame                    | `--ae-rail`                                 | `#0a0a0a`                                                 |
| Canvas                   | `--ae-bg`                                   | `#0f0f0f`                                                 |
| Surface                  | `--ae-surface`                              | `#151515`                                                 |
| Raised                   | `--ae-surface-raised`                       | `#1c1c1c`                                                 |
| Overlay                  | `--ae-surface-overlay`                      | `#232323`                                                 |
| Recessed register        | `--ae-surface-sunken`                       | `#0d0d0d`                                                 |
| Hairline / strong rule   | `--ae-border`, `--ae-border-strong`         | `#2b2b2b`, `#3f3f3f`                                      |
| Control boundary         | `--ae-border-control`                       | `#727271`; use when a border alone defines a control      |
| Strong / body / soft ink | `--ae-fg-strong`, `--ae-fg`, `--ae-fg-soft` | `#fafaf8`, `#e8e8e6`, `#c9c9c6`                           |
| Muted / faint ink        | `--ae-muted`, `--ae-faint`                  | `#a3a3a0`, `#8c8c89`; faint is the contrast floor         |
| Action accent            | `--ae-accent`, `--ae-accent-ink`            | paper white on near-black; there is no default accent hue |

Outcome colours are `success #7eb795`, `warning #c8a344`, `danger #e17263`, `info #9a9484`, and
celebratory `ember #c98a3d`. Danger does not fill routine destructive controls; only the final
confirmation inside a dialog may use a filled danger button. Every outcome also needs a word,
glyph, shape, or pattern; colour is never the only signal.

Workspace ink is a semantic trace through otherwise neutral chrome:

| Workspace | Ink                                |
| --------- | ---------------------------------- |
| Today     | paper white (`--ae-fg-strong`)     |
| Network   | person / relationship, `#1f9c86`   |
| Career    | work, `#b08a18`                    |
| Explore   | place, `#6e8fd0`                   |
| Data      | event / custody process, `#c8503f` |
| Settings  | soft neutral ink, `#c9c9c6`        |

Stable data roles are person `#1f9c86`, work `#b08a18`, place `#6e8fd0`, event `#c8503f`, idea
`#a87bc0`, practice `#7e9b3a`, media `#d4649b`, and other `#c56a2a`. Workspace-home action tones
reuse those roles: relationship → person, career → work, time → event, place → place, and data →
media. Generic visualizations use the same eight slots in fixed order. A ninth series becomes
“Other” or gains a second encoding; do not generate or cycle hues.

Geometry is tight and cut-edged: radii are `2 / 3 / 5px`, with a full radius reserved for true
dots, rings, meters, and compact badges. Spacing comes from the seven-step `4 / 8 / 12 / 16 / 24 /
32 / 48px` scale. Dense rows begin at `36px`; app ledgers commonly resolve to `42–44px`. Precise
pointer targets never fall below `32px`, and coarse-pointer targets become `44px`.

Reserve `--ae-shadow-overlay` for transient overlays—dialogs, sheets, popovers, tooltips, toasts,
and compact floating instrument/map controls. Ordinary panels, cards, canvases, and document
previews use containment and ruling rather than elevation.

## Typography

- Instrument Sans Variable is the primary UI and prose face. The final app layer renders page
  titles in normal case at a responsive `27–38px`, medium weight, with tight tracking.
- IBM Plex Mono carries data, dates, counts, provenance, keyboard hints, stage numbers, register
  labels, and compact uppercase section labels. The `--ae-font-display` token also resolves to this
  mono face, but it is for headings—not clickable controls or small body copy.
- App section and card headings are compact mono labels; page titles remain visibly larger and
  sans. Do not collapse those two levels into one treatment.
- Source Serif 4 is an editorial exception used by the public manifesto body and quotations.
- The body default is `14px / 1.55`; nothing renders below `11px`.

All fonts are bundled through `@fontsource` imports in `apps/web/src/main.tsx`. There is no external
runtime font or font-CDN dependency. Keep system fallbacks, but do not add a network-loaded font.

## Shell and navigation hierarchy

The authenticated shell has four persistent levels:

1. The primary rail contains the Vitae mark, global find (`⌘P`), the six workspace hubs—Today,
   Network, Career, Explore, Data, Settings—the primary Capture action (`⌘K`), Help, system status,
   and the user-controlled collapse button.
2. The top bar contains the breadcrumb, a second global command/search affordance, demo-space
   control, structured-new and Capture actions, reminders, and sign-out.
3. The workspace strip names the current workspace and exposes only its local destinations. Explore
   may append saved views; system health sits at the far edge where space permits.
4. The routed content region changes while the shell stays still. Navigation updates the document
   title, moves focus to the content region after the first route, and announces the breadcrumb in
   a polite live region. Preserve the skip link to `#main-content`.

The rail is `272px` expanded and `68px` compact. Active destinations use a neutral selected ground,
stronger text, an `aria-current` value, and a two-pixel workspace trace; the semantic colour does
not flood the chrome.

`apps/web/src/app/routes.ts` owns navigation language and topology. `App.tsx` owns lazy component
loading. New navigation must use the canonical task-led routes under `/today`, `/network`,
`/career`, `/explore`, `/data`, and `/settings`. Supported legacy URLs stay mounted for bookmarks,
but they are not a second IA. When adding a route, update the route registry, workspace navigation,
`hubForPath`, breadcrumbs/commands where applicable, and active matching together.

Query parameters are addressable state, not hidden UI state: network intelligence uses `lens`, the
library and saved views use `q`, and list filters belong in the URL when the screen already follows
that convention. Use `entityHref` for record links. Keep graph and map dependencies route-lazy.

Public `/welcome`, `/tour`, `/manifesto`, and `/reference/entities` routes do not wait on auth or
the API. The marketing shell is editorial and uses real product captures labelled “Real interface
· fictional demo data”; do not fabricate screenshots, endorsements, or commercial claims.

`/reference/entities` is deliberately standalone and stays that way. The entity catalog and its
observatory are generated from the same type constants the API validates against: they describe the
schema, not a person’s records, and they read no user data. Giving them a workspace hub would claim
they operate on your graph, which they do not, and would put a documentation surface behind an
account it does not need. They are reached from Help, the app’s other standalone reference surface,
and from a direct link. Because the route mounts outside `Shell` it carries no breadcrumb, no
workspace strip and no rail, so it must supply its own heading and its own way back into the app.

## Workspace and screen composition

Network, Explore, Data, and Settings share `WorkspaceHome`: eyebrow, `PageHeader`, a ruled workflow
trace, a short editorial purpose statement, one dominant numbered lead destination, then an ordered
ruled index. The trace names the sequence **Orient → Inspect → Decide → Act**, with Orient current
on entry. The lead is deliberately larger than the remaining destinations. At narrower widths the
statement stops being sticky and the composition becomes one column.

Today and Career are intentional exceptions. Today opens directly on the daily agenda. Career opens
on an application runway with a ruled summary, next moves, five meaningful pipeline lanes, and
outcomes. Do not force either into the generic workspace-home template merely for symmetry.

Common screen grammar:

- Start with `PageHeader`, optional actions/help, then `RegisterRule`. Use `Section` for real
  information groups, not to create decorative boxes.
- A record dossier leads with identity and a compact definition ledger, keeps provenance/status or
  the next decision nearby, then separates evidence from activity/context. Network dossiers use a
  ruled sunken masthead and facts rail; application dossiers use a main evidence column plus a
  narrower context register.
- A list is a semantic `ul`/`ol` of ruled rows. Rows carry a leading glyph or index, title and
  subtitle, optional chips/provenance, then right-aligned dates, counts, state, or actions. Numeric
  metadata is monospace and tabular. Put row actions beside the row’s main link, never inside it.
- Selection needs semantic state plus a marker/check or label; hover only changes tone. Do not make
  a `Link` itself a `listitem`, nest controls inside links, or hide essential actions from keyboard
  focus.
- Relationship rankings are a single expandable ledger. Scores sit beside factor chips and their
  source evidence; they are not oracles and not a stack of disconnected result cards.
- Explore screens are instruments: explicit control bands above a flat graph/timeline/map canvas,
  with a readable list, trail, or dossier tied to the same selection. Chronograph’s list is the
  keyboard-readable twin of the canvas. Atlas puts a provenance trace before the place/route
  dossier.
- Data screens share a numbered chain-of-custody trace. Imports, identity review, repositories,
  exports, and trash use source registers, evidence queues, definition ledgers, and recovery rows.
  “Done”, “current”, and “upcoming” remain textual/structural as well as coloured.
- Cards are allowed for a singular bounded module, a stage item, or a document/record preview. A
  static card does not react on hover. Use `vt-card--interactive` only when an actual control inside
  warrants the response.

## Feedback grammar

Feedback is both textual and animated, but animation never substitutes for the text.

- `QueryBoundary` is the default data-state contract: shape-matched skeleton while pending,
  retryable error, distinct first-use and filtered-empty states, then content. Cached data stays
  visible during refresh; refresh failure becomes a banner rather than a false blank screen.
  Secondary-query failures degrade the affected detail without erasing truthful primary content.
- Skeletons pulse opacity only—never shimmer—and include a polite loading label. The skeleton
  unmounts before resolved content enters; do not cross-fade the two.
- Empty states are compact invitations with a real next action or filter escape, not decorative
  illustration. Error states use `role="alert"`, plain-language detail, and Retry where possible.
- `StatusTrace` is the inline grammar for refreshing, saving, staging, success, warning, and failure:
  a short label, optional evidence/timestamp, a line and node, and the proper polite/assertive live
  behavior. Its node arrives once; idle status never loops or pretends to progress.
- Toasts are the one transient channel. They queue (maximum four), pause on hover and focus, support
  swipe dismissal, are reachable with `F8` and normal tab order, and keep Undo attached to its own
  operation. Neutral/success messages last about five seconds, errors eight, and actionable toasts
  up to twelve. Success and error add both a glyph and the words “Done” / “Error”.
- Mutation failures that lack a local handler reach the global error toast. Destructive actions use
  a confirmation where consequences are material and an Undo toast where reversal is available.

## Motion

The shared motion vocabulary is intentionally small:

| Change                 | Treatment                                 |
| ---------------------- | ----------------------------------------- |
| Enter / open           | opacity plus at most `4px` rise, `130ms`  |
| Exit / close           | opacity only, linear, `90ms`              |
| In-place emphasis      | brightness pulse, no travel, `130ms`      |
| Reorder / layout shift | transform/FLIP only, `220ms`              |
| Route swap             | content opacity only; shell does not move |

Use the single `cubic-bezier(0.32, 0.72, 0, 1)` easing except for linear exits. List entrances step
by `25ms` and cap at five positions (`125ms` total); later rows arrive with the fifth. Opening
surfaces never scale, overshoot, or bounce. A small active press response is acceptable because it
reports direct manipulation. Hover is not a state change and must not move the layout.

Ask “what state change does this report?” before adding motion. Loading indicators may loop only
while work is genuinely active. Under `prefers-reduced-motion: reduce`, duration tokens become zero,
CSS animations/transitions are disabled, and React motion variants resolve immediately without
travel.

## Responsive behavior

The shell and content recompose instead of shrinking desktop chrome:

- Above `1100px`, use the full shell unless the operator has collapsed the rail.
- From `701–1080px`, the rail is forced compact by the shell media query. At `1100px` the top bar
  also condenses and the workspace identity cell is removed; local destinations remain in the
  horizontally scrollable strip.
- At `900px`, workspace homes, Help, and the Tailor workspace stack; the system-status end cap is
  hidden. Explore and Data screens have additional local stacking around `840/820px`.
- At `700px` and below, the rail disappears. A safe-area-aware six-column dock shows Today,
  Network, a center Capture slot, Explore, Career, and More. Capture is a raised 48px control over
  the center slot. More opens the shared Sheet containing all six hubs plus Help, so Data and
  Settings never become unreachable. The workspace strip remains horizontally scrollable and
  content reserves dock space.
- Shared primitives commonly reflow at `640px`. Public marketing compositions stack at `960px`,
  simplify navigation and grids at `720px`, and make primary action groups full-width at `520px`.
- `pointer: coarse` is independent of viewport width: interactive targets become at least `44px`.

Do not remove horizontal overflow from true instruments such as the Career runway; preserve the
stage relationships and provide a deliberate scroll region rather than compressing them into
illegible columns.

## Accessibility requirements

The product contract is WCAG 2.2 AA. New work must preserve the mechanisms already built:

- real landmarks, lists, headings, anchors, and buttons; valid nesting; programmatic labels for
  icon-only controls; `aria-current`, `aria-selected`, `aria-expanded`, and `aria-busy` where the
  visible state requires them;
- complete keyboard operation, visible `--ae-focus-ring`, a forced-colours outline fallback, focus
  restoration/management in shared overlays, route focus, the skip link, and the tour’s arrow/Home/
  End tab behavior;
- text contrast at or above the token floor, and control boundaries using `--ae-border-control`
  when no other affordance defines them;
- no colour-only meaning: pair colour with text, glyph shape, node geometry, line style, position,
  or native semantics;
- polite announcements for loading, routes, refresh, selection counts, and ordinary completion;
  assertive alerts only for failures that need interruption; avoid duplicate live regions;
- `32px` minimum precise targets, `44px` coarse targets, safe-area handling, reduced-motion support,
  and readable alternatives to visual canvases where the screen supplies one.

Use the shared Radix-backed Dialog, Sheet, Select, Menu, Tooltip, and Toast primitives rather than
rebuilding focus trapping, escape behavior, announcement timing, or swipe handling.

## Contributor guardrails

1. Reuse tokens and `@vitae/ui` primitives before adding app CSS. App-specific CSS should describe
   screen composition, not fork Button, Row, Card, feedback, or overlay behavior.
2. Keep new chrome achromatic. Introduce colour only as an existing semantic/data role, with a
   redundant non-colour signal. Do not add a one-off “accent colour.”
3. Keep surfaces flat: no decorative gradients, glow, halo, glass, blur, ambient wash, shimmer,
   background texture, or card shadow. Keep radii and spacing on the token scales.
4. Do not use an equal-card dashboard as a page skeleton. Prefer one lead, a ruled register, a
   dossier, a stage lane, or a purpose-built instrument. Preserve the explicit exceptions described
   above.
5. Use `QueryBoundary`, `EmptyState`, `ErrorState`, `Banner`, `StatusTrace`, and the shared toast API.
   Do not hand-roll a new loading/error/notification dialect.
6. Use the motion helpers in `apps/web/src/lib/motion.ts`; honor the five variants, travel cap,
   stagger cap, and reduced-motion behavior.
7. Update routing as one system and keep new links canonical. Keep heavy graph/map code lazy and
   public claims derived from product/core truth.
8. Bundle fonts locally. No runtime font, analytics, AI-provider, or decorative asset dependency may
   become necessary for the interface to render.
9. Test the semantic structure and keyboard path, not only pixels. Mirror every hover-only reveal
   with focus behavior, and run the relevant accessibility tests when shared patterns change.

When a screen feels generic, the correction is usually structural: strengthen the lead question,
show the trace to its evidence, and replace repeated containers with a ledger—not add decoration.
