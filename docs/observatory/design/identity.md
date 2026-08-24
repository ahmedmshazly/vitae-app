---
id: DSN-IDENTITY
title: The Quiet Observatory
summary: One identity ships, two are on record, and a build script refuses the patterns the most recent superseded one prescribed.
audience: [designer, developer, maintainer]
domain: design
type: explanation
status: verified
verified_at: 2026-08-24
sources:
  - packages/ui/src/styles/tokens.css
  - packages/ui/src/styles/base.css
  - scripts/check-brand-bans.mjs
  - docs/design/brand-ban-allowlist.json
  - docs/design/IDENTITY.md
  - docs/design/addenda/P26-aurora-identity.md
  - apps/web/index.html
  - apps/web/src/styles/entity-observatory.css
requirements: [INT-3]
related: [DSN-TOKENS, DSN-MOTION, DSN-PATTERNS, DSN-VOICE]
order: 1
---

# The Quiet Observatory

## In short

Vitae looks like a precise instrument at rest. The interface is dark only,
achromatic, and flat: matte near-black fields, bone-white ink, one-pixel ruling,
and no accent colour at all. Brightness does the work an accent hue usually
does, which leaves the entire colour budget free to mean something — a record
type, an outcome, a state. This identity is called Quiet, it landed in August
2026, and it is the third one this repository has on record. The other two were
tried and removed, and a script now fails the build on several of the things
they asked for.

## How it works

### One identity ships, and two are history

Three identities appear in this repository, and only one of them is current.

| Identity | When | What it looked like | Status |
| --- | --- | --- | --- |
| Warm onyx | before 2026-07 | Warm near-black, paper-and-ink, a muted blue action colour | Superseded twice |
| Aurora Signal | 2026-07 | Deep space-blue lit by electric cyan, a violet gradient partner, ambient washes, glow, spring motion | Superseded |
| Quiet | 2026-08 | Achromatic dark, paper white as the only accent, flat chrome, one easing | **Current, and shipped** |

Quiet is not a proposal. Its values are declared in
`packages/ui/src/styles/tokens.css`, every screen resolves through them, and
`scripts/check-brand-bans.mjs` runs in continuous integration against the two
source trees that matter.

The superseded one to know about is **Aurora Signal**, specified in
`docs/design/addenda/P26-aurora-identity.md`. It is the dangerous document in
this repository for anyone starting from the design folder, because until this
documentation was written its heading read as current guidance and its
prescriptions are not merely out of fashion — they are refused by the build.
Aurora asks for gradients on hero controls, a soft glow on hover, a cyan glow
focus ring, ambient radial washes on the shell, spring easing with overshoot,
and durations of 120/180/320ms. Each of those is a named failure in the ban
script or a direct contradiction of the token file. A contributor who
implements that page writes code that cannot go green.

That file is kept, because deleting the record of a decision is how the same
decision gets made again. It now carries a supersession marker in its own
heading and a paragraph under it saying what replaced it.

### Dark only, and it is not a theme

There is no light theme, no theme provider, and no toggle. This was checked
rather than assumed:

- `color-scheme: dark` is declared exactly once, on `html` in
  `packages/ui/src/styles/base.css:16`.
- `apps/web/index.html:2` carries a static `data-theme="dark"` attribute, and
  no stylesheet or component in `apps/web/src` or `packages/ui/src` reads it.
  It is a hint to the browser, not a switch.
- No `prefers-color-scheme` block exists anywhere in either source tree.

So "dark mode" is not a mode. It is the only mode, and a component may assume a
dark ground without guarding for anything else.

### The one light surface

There is exactly one place where the product draws light-on-dark's opposite: a
simulated sheet of paper. Résumé previews, the live document editor and the
schema atlas all render a printed page inside a dark application, and the
interface ramp cannot express that — body ink on white is invisible and a
hairline on white is not there at all. A separate `--paper-*` family exists for
that surface only.

It is a document, not a second theme, and nothing outside a document preview may
use it. Note that these are on-screen tokens: the `@media print` halves of those
same stylesheets deliberately use literal black on white instead, because a
print rule resolving through a custom property is at the mercy of whatever the
browser decided that property was. Those literals are the reason two print
stylesheets are exempted by name in `docs/design/brand-ban-allowlist.json`.

### Brightness is the accent

The primary fill, the active marker, the focus ring and the selection ground are
all the same near-white. That single decision is what makes the rest possible:
because no hue is spent on chrome, a hue appearing anywhere on screen means
something. Green, amber and red are outcomes. The eight categorical inks are
record types. Nothing else earns colour, and nothing may introduce "just one
accent for this screen".

The corollary is a hard rule rather than a preference: colour is never the only
carrier of meaning. Every state ships a glyph and a word alongside its tone, and
every categorical encoding ships a shape and a direct label. The components
enforce this for you where they can — see [Layout and component
patterns](patterns.md).

## Mechanics

### What the ban script actually refuses

`scripts/check-brand-bans.mjs` walks `packages/ui/src/styles` and
`apps/web/src/styles` for stylesheets, and `packages/ui/src` and
`apps/web/src` for TypeScript, skipping `node_modules`, `dist`, and any
`*.test.*` or `*.spec.*` file. Nothing outside those four roots is read at all.

Block comments in stylesheets are blanked before scanning, with line numbers
preserved, so prose describing a banned pattern is not mistaken for shipping it.

Seven rules run over stylesheets:

- **gradient** — any `linear-`, `radial-` or `conic-gradient(`.
- **backdrop-filter** — the glassmorphism ban, in CSS or in a style object.
- **shadow** — a `box-shadow` whose blur slot is non-zero. A zero-blur shadow is
  a ring, which is a border drawn outside the box, and passes. A declaration
  naming the overlay-shadow or focus-ring token is exempt.
- **easing** — the first `cubic-bezier()` on a line, if it is not the one curve.
- **duration** — on a timing declaration, any millisecond value outside the nine
  allowed numbers, or any value written in seconds.
- **hover-transform** — a line beginning `transform:` under a `:hover` selector.
  Hover is not a state change, so it gets tone and never travel.
- **raw-hex** — any hex literal outside the token file and outside a print block.

Two of them also run over TypeScript, alongside one rule that applies only
there: gradients, `backdropFilter`, and Tailwind's `animate-bounce`,
`animate-ping` and `animate-pulse`.

A deliberate exception goes in `docs/design/brand-ban-allowlist.json` with a
reason, narrowed by line or by matched text. That file holds six entries today,
and it is best read as the list of what the codebase knowingly owes rather than
as a set of blessings.

### Where Aurora's prescriptions land

Read against the script, the superseded specification fails in five separate
ways. This is the concrete reason it cannot be treated as guidance.

| What Aurora asks for | What refuses it |
| --- | --- |
| A cyan-to-violet gradient on the wordmark and the primary button | The `gradient` rule, in both CSS and TypeScript |
| A soft glow on hover and a glow focus ring | The `shadow` rule, which passes only zero-blur rings and the two named tokens |
| Ambient radial washes on the shell and sign-in surfaces | The `gradient` rule again, and the standing ban on ambient washes |
| A spring easing with soft overshoot | The `easing` rule: there is one curve, and it does not overshoot |
| Durations of 120 / 180 / 320ms | The `duration` rule, whose allowed set is built from the current token scale |
| Its whole palette, quoted as hex | The `raw-hex` rule, outside the token file |

### A fossil name, and why it is harmless

`apps/web/src/styles/entity-observatory.css` still declares local properties
called `--obs-cyan` and `--obs-cyan-soft`. The names survived the rebrand; the
colour did not. Both are aliases onto the achromatic ramp — the accent and the
soft ink — and the file's own comment says so. Nothing cyan ships. It is worth
knowing about only so that finding the word in a grep does not send anyone
looking for a second palette.

### What is convention rather than law

The ban script is silent on a great deal that still matters, and the [motion
page](motion.md) lists its blind spots in detail. At identity level the largest
unchecked commitments are these: that chrome stays achromatic, that no ninth
categorical hue is generated, that a state never travels on colour alone, that
the display face never labels a control, and that the brand assets stay in
sync. None of those has a gate. They hold because a reviewer holds them.

The asset case is the one with a real failure mode: the archive under
`docs/design/brand-assets/`, the runtime copies in `apps/web/public/`, and the
component that renders the mark in `packages/ui/src/brand.tsx` are three copies
of the same geometry, kept aligned by hand, with nothing checking that they
agree. Change one and change all three.

### Where the values live

`packages/ui/src/styles/tokens.css` is the definition site for every value, and
the `raw-hex` rule exists to keep it that way — a hex code in a component is a
bug the build will report. `docs/design/IDENTITY.md` is a hand-maintained
extract of that file and has already drifted from it in at least one place: it
publishes the contrast floor as `#8C8C89` at 5.7:1, while the token file
declares `#8f8f8c` and records 5.9:1 on canvas and 4.7:1 on the lightest ground
a value can appear on. Where the two disagree, the token file is the one that
renders.

## Related

- [Tokens and the scales they enforce](tokens.md) — the scales this identity is
  made of, and why each one has the number of steps it has.
- [Motion, and why there is so little](motion.md) — the one easing, the three
  durations, and the two registers.
- [Layout and component patterns](patterns.md) — how the identity turns into a
  screen.
- [Voice and content design](voice.md) — the same restraint applied to words.
- [About these documents](../meta/index.md) — the audited record of what the
  older design documents claimed and where each claim was corrected.
