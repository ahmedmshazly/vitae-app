---
id: DSN-TOKENS
title: Tokens and the scales they enforce
summary: Why each scale has the number of steps it has, which values are floors that must not move, and what a value off the scale costs.
audience: [designer, developer]
domain: design
type: explanation
status: verified
verified_at: 2026-08-24
sources:
  - packages/ui/src/styles/tokens.css
  - packages/ui/src/styles/base.css
  - apps/web/src/styles/theme.css
  - scripts/check-brand-bans.mjs
  - docs/generated/tokens.json
requirements: [INT-3]
related: [DSN-IDENTITY, DSN-MOTION, DSN-PATTERNS, DSN-A11Y]
order: 2
---

# Tokens and the scales they enforce

## In short

Every colour, size, radius, gap and duration in the interface resolves to a
named value declared in one file. There is no second palette and no screen-local
exception: a hex code written anywhere else fails the build. What makes the
system usable is not the list of names but the shape of each scale — how many
steps it has, what the steps mean, and which end of it is a floor. This page
explains the shapes and the reasons. The full inventory is generated from source
into `docs/generated/tokens.json`, which counts 182 custom properties across 22
stylesheets, and that file is the place to look up a value.

## How it works

### One definition site

`packages/ui/src/styles/tokens.css` declares the values. Everything else refers
to them. That is not a style preference — it is the enforced arrangement: the
`raw-hex` rule in `scripts/check-brand-bans.mjs` fails on any hex literal in a
stylesheet outside that one file, so re-declaring a colour locally is a build
error rather than a review comment. The exceptions are print blocks, where a
literal is deliberate, and two print stylesheets named in the ban allowlist.

The consequence is that changing the identity is an edit to one file. That is
exactly what happened in August 2026: the whole product recoloured atomically
because nothing had a private copy of anything.

### Contrast is measured against the worst case, not the average

This is the single most important idea in the colour scales, and the easiest one
to get wrong. Every ink value is quoted against the *lightest* surface it can
appear on, not against the page background. Body ink sitting on the canvas has
plenty of room; the same ink inside a dialog has less, and inside a selected row
less again.

The ramp's floor exists because of that reasoning. Nothing in the interface may
be dimmer than the faint ink, and the faint ink is pinned by the lightest ground
it can land on — the selected-row fill — where it clears 4.7:1. An earlier value
cleared the canvas comfortably and missed that ground at 4.49:1, which is how
the floor got its comment in the token file telling you not to darken it.

### Scales, and why each one is the length it is

**Six surfaces.** A frame below the canvas, the canvas, a panel, a raised
element, an overlay, and one recessed well. The steps between them are small on
purpose. Depth in this interface comes from containment and ruling, not from
elevation, so the surfaces need to be distinguishable without ever looking like
floating cards.

**Five inks.** Strong, body, soft, muted, faint. Emphasis is weight and
brightness, because there is no accent hue to promote something with.

**Three borders, and only one of them is structural.** A decorative hairline, a
stronger emphasis rule, and a control boundary. The third exists for a specific
reason: any border that is the *only* thing defining a control has to clear the
3:1 non-text contrast that WCAG 1.4.11 asks for, and the emphasis rule does not.
Reaching for the control boundary is not a matter of taste — if nothing else
marks the control, that is the token.

**One accent.** Paper white, used for the primary fill, the active marker, the
focus ring and the selection ground alike. A separate quiet grey carries "live"
— provenance, sync, edges — and is never an action.

**Five semantic colours**, each clearing 4.5:1 on all four surfaces, each always
shipped with a glyph and a word, and none of them ever used as a chart series.
Danger is a special case: it fills nothing. A destructive control is an outline,
and only the final confirmation inside a dialog may be a filled danger button.
The celebratory ember is not a second accent and is not a warning.

**Eight categorical inks, in fixed slot order, never cycled.** They were
validated together against both the canvas and the overlay ground: a lightness
band, a chroma floor, adjacent-pair separation under colour-vision deficiency,
and 3:1 contrast. Cycling them or generating a ninth would break the validation
that makes them safe, so a ninth series folds into "Other" or gains a second
encoding. A parallel set of named data roles aliases those slots, so a person is
the same ink on every screen rather than "series 1 here, series 4 there".

**Nine type sizes, from 11px to 64px, and 11px is a floor.** Two leadings, tight
for headings and single-line rows and normal for everything else. Three
families: a sans for interface and prose, a mono for data, and a display face
that resolves to the same mono. The display treatment is caps plus wide tracking
plus a weight, which a single `font-family` property cannot carry, so it is
bundled into a `.u-display` utility in `base.css` instead. The display face
never labels a control and never renders below 15px.

**Four radii: three real ones and a full round.** They are deliberately tight —
2, 3 and 5 pixels. A large radius is the strongest single signal of a generated
card grid, and 3px reads as a cut edge rather than a pill. The full radius is
reserved for things that are actually circular: dots, rings, meters, compact
badges.

**Seven spacing steps.** Gaps come from flex and grid `gap`, never from
per-element margins, because margins collapse and double and a scale cannot
survive that.

**Control sizing is a target promise, not a look.** There is a dense row height,
three control heights, and a hit-target token. A painted control may stay
compact on a precise pointer, but the target never drops below 32px, and under
`pointer: coarse` the same token becomes 44px — so a component does not have to
invent a phone-only size.

**One elevation token, and one focus ring.** Dialogs and popovers may carry the
soft shadow. Nothing else may, which is why the `shadow` rule in the ban script
exempts exactly those two declarations and refuses every other blurred shadow.

### The two conditional overrides

The token file carries exactly two media queries, and they are the only places
where a token's value changes at runtime.

`pointer: coarse` promotes the hit target from 32px to 44px.
`prefers-reduced-motion: reduce` sets all three duration tokens to zero, which
collapses every CSS transition and animation that names a token. Both are
described in full on [Motion, and why there is so little](motion.md) and
[Accessibility commitments](accessibility.md).

## Mechanics

### What Tailwind sees, and what it deliberately does not

`apps/web/src/styles/theme.css` bridges the tokens into Tailwind v4 with
`@theme inline`, so `bg-canvas`, `text-muted`, `border-control`, `rounded-lg`
and `text-sm` resolve to the same custom properties as everything else. `inline`
rather than a plain `@theme` block, because the values reference properties
defined in another file rather than literals Tailwind could bake in.

The bridge also overrides Tailwind's two motion defaults, so a bare
`transition-colors` utility is already on the brand curve at the default
duration with nobody opting in, and it sets Tailwind's `bounce`, `ping` and
`pulse` animations to `initial` so those utilities no longer compile at all.
`spin` is left alone: an indeterminate spinner is permitted.

Two things are left unbridged on purpose, and the reasons are worth knowing
before someone "finishes" the job:

- **Spacing.** The seven-step scale has no step 7, and Tailwind's spacing is a
  single multiplier that also backs `w-*`, `h-*` and `size-*`. Aliasing it would
  resize controls as a side effect — `h-8` would go from 32px to 48px. Steps 1
  to 4 already agree; 5, 6 and 8 do not, and each usage has to be looked at.
- **Z-index.** Tailwind v4 has no theme namespace for it, so the three layer
  tokens are reachable only as custom properties. Layering is the design
  system's call, not a utility's.

### Legacy aliases and dead tokens

The token file ends with a short block of aliases kept alive for screens not yet
rebuilt under the current identity. Each is meant to be deleted when its last
consumer lands, and each still has one.

Separately, the generated catalogue reports four properties that are declared
and referenced by nothing: three of the named data roles and one trace colour.
They are genuinely unreferenced rather than assembled dynamically, because the
data-role family is written out by literal name throughout the app stylesheets
and never composed from a variable. A reader looking at the catalogue should
treat those four as declared-unused rather than as part of the working palette.

### What is enforced and what is not

Enforced by `scripts/check-brand-bans.mjs`, on every push: no hex outside the
definition file; no gradient; no blurred shadow except the two named tokens; no
second easing curve; no duration off the scale; no travel on hover; and none of
the three banned Tailwind animations.

Not enforced anywhere: that a value comes from the right scale at all. Nothing
checks that a padding is a spacing step, that a font size is on the type scale,
that a radius is one of the four, or that travel stays within the entrance
distance. Those are review's job, and the scales are short enough that a value
off them is visible to anyone who knows what to look for.

### Where to look a value up

`docs/generated/tokens.json` is regenerated from source and is the authority for
what exists. It records every declaration and its file, which properties are
declared outside the definition file, which have conditional overrides, and
which are unused. `docs/design/IDENTITY.md` is a hand-maintained extract of the
same values and has drifted at least once — it publishes an older contrast floor
than the one that ships. Where a document and the token file disagree, the token
file is what renders.

## Related

- [The Quiet Observatory](identity.md) — why the palette is achromatic and what
  the tokens are protecting.
- [Motion, and why there is so little](motion.md) — the duration and easing
  tokens, and the enforcement around them.
- [Layout and component patterns](patterns.md) — the scales as they appear in a
  composed screen.
- [Accessibility commitments](accessibility.md) — the contrast floors and target
  sizes the scales encode, and which of them a test actually checks.
