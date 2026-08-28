---
id: DSN-MOTION
title: Motion, and why there is so little
summary: One easing curve, three durations, five named variants, and a gate that catches some of it, plus the marketing scoping rule that the shipped routes outgrew.
audience: [designer, developer]
domain: design
type: explanation
status: partial
verified_at: 2026-08-24
sources:
  - packages/ui/src/styles/tokens.css
  - packages/ui/src/styles/components.css
  - apps/web/src/lib/motion.ts
  - apps/web/src/app/Shell.tsx
  - apps/web/src/styles/marketing.css
  - apps/web/src/routes/marketing/Tour.tsx
  - packages/ui/src/use-reduced-motion.ts
  - packages/ui/src/use-animated-number.ts
  - scripts/check-brand-bans.mjs
  - docs/design/MOTION.md
  - docs/design/brand-ban-allowlist.json
related: [DSN-IDENTITY, DSN-TOKENS, DSN-STATES, DSN-A11Y]
order: 5
---

# Motion, and why there is so little

## In short

Motion in Vitae exists to report a state change and for no other reason. Before
adding an animation you name the change it reports; if you cannot name one, the
animation is deleted. That single test is what keeps the vocabulary at five
named variants, three durations, one easing curve, and a maximum travel of four
pixels. Hover is not a state change, so hover gets a tone shift and never
movement. Nothing loops except a spinner and a skeleton pulse, and both stop the
moment they have something to report.

## How it works

### The test, and what fails it

"It feels flat without it" is not a state change. Neither is hover, neither is
arriving on a page, and neither is a number being interesting. What does count:
something opened, something closed, something was saved in place, a list
reordered, the route changed.

The reason for the severity is that this is a tool someone uses daily. An
animation a person sees four times is charming; the same animation seen four
hundred times is a delay. So the vocabulary is deliberately closed: five
variants, and nothing outside the list gets animated without being added to the
list first.

### The five variants

| Variant | Duration | What moves | Used for |
| --- | --- | --- | --- |
| enter | 130ms | Opacity, plus at most 4px of rise | Entrances, list loads, a dialog opening |
| exit | 90ms | Opacity only, linear | Anything leaving |
| emphasis | 130ms | Brightness only, no movement | A value that changed in place, an optimistic save |
| reorder | 220ms | Transform only, by the distance the thing actually moved | Reorder, sort, filter, layout shift |
| route | 130ms in | Opacity only | Route and content-region swaps |

Exits use a literal linear curve rather than the token, and that is the one
principled exception to "there is one easing": an element that is leaving should
not decelerate into nothing, it should just go.

List entrances step by 25ms and stop after five positions. The sixth row onward
arrives with the fifth. That cap is the difference between a list that settles
and a list that trickles for as long as it happens to be.

Nothing overshoots, nothing bounces, nothing springs, and nothing opening ever
scales. Routes never slide, because a page that slides in implies a spatial
relationship between screens that does not exist.

### Two registers, and the scoping rule that expired

The product register is everything under the application shell and all of the
design system. The marketing register is the public pages someone reads once
while deciding whether to care, and it is allowed gestures a daily tool is not:
scroll choreography, longer durations, larger travel, real product recordings,
and count-ups on figures. The easing is not part of that latitude - there is
still one curve - and every standing ban holds in both registers unchanged.

The written amendment scopes the marketing register to three routes and says
"and nowhere else" (`docs/design/MOTION.md:151`; its opening precedence note at
`:11` also names a fourth path that is now only a legacy redirect). **That
scoping is superseded.** Five more marketing pages have since shipped -
verified against the route tree in `apps/web/src/App.tsx`, where eight public
pages now render inside the marketing chrome, with a ninth path redirecting into
them. Read literally, the older rule makes every one of those five pages
non-compliant for existing.

The rule that actually applies: **the marketing register is defined by the
surface, not by an enumerated list of paths.** A page that renders inside the
marketing chrome is in the marketing register; everything else is in the product
register. Scoping a design rule to a path list guarantees it expires the next
time a page ships, which is exactly what happened here.

### The latitude is available and currently unused

Worth knowing before assuming the marketing pages are doing something exotic:
they are not. `apps/web/src/styles/marketing.css` names only the three product
duration tokens and the one easing token. The single marketing page that
animates from JavaScript runs 130ms in and 90ms out on the brand curve, and
short-circuits to no animation under reduced motion. Nothing currently uses the
longer durations or larger travel the amendment permits.

The known debt that the motion contract records - a second easing curve passed
inline on two marketing pages - is no longer present. One of those two files no
longer imports a motion runtime at all, and the other declares the brand curve
as a local constant. That fixes the curve but not the underlying shape: the
control points now exist as hand-typed copies in three TypeScript files, and the
easing rule in the ban script reads stylesheets only.

## Mechanics

### Where motion is written

From stylesheets, name the token and never the literal. The design system has no
animation-runtime dependency at all, so its motion is CSS keyframes driven by
the state attributes its overlay primitives already set.

From Tailwind utilities, the theme bridge overrides the default transition
duration and timing function, so a bare `transition-*` utility is already on the
brand curve at the default duration without anyone opting in, and a named
utility spells the curve explicitly where it has to be set. Tailwind's `bounce`,
`ping` and `pulse` are set so they no longer compile.

From JavaScript, `apps/web/src/lib/motion.ts` ships each variant twice: as a
hook that reads the reduced-motion preference itself, and as the pure function
underneath that takes the preference explicitly. **Prefer the hook.** A flag you
have to remember to pass is a flag that gets forgotten, and the primitive exists
only for the two cases a hook cannot serve - a preference coming from somewhere
other than the media query, and a call inside a `.map()`.

The preference has exactly one source in the repository. The design system's own
`matchMedia` hook is what the application layer uses too, rather than the
identically named hook shipped by the motion library, because running both
inside one component means two subscriptions to one media query that can
disagree for a render.

### What actually animates today

The contract and the implementation are not the same size, and the difference is
worth stating rather than glossing.

| Variant | State in the code today |
| --- | --- |
| enter | Shipped. Drives dialogs and overlays in CSS, the boundary component's resolved phases, and per-item list entrances where a screen opts in |
| exit | Shipped. Drives dialog and overlay closes in CSS, the toast, and the bulk-action bar |
| emphasis | Shipped, on exactly one row in the daily view |
| route | Shipped, entrance only - see below |
| reorder | **Defined and unused.** No production code calls it; only its own tests do |

The route case is a correction to the motion contract's own status table, which
records the exit half as unreachable because the content region is not wrapped
in an exit-animation boundary. The code now records that as a decision rather
than a gap: wrapping it held the outgoing element on screen until its exit
finished, but that element renders whatever its children currently are, so every
navigation mounted the incoming screen inside the outgoing wrapper, faded it
out, destroyed it, and mounted it a second time - losing an open dialog, a typed
character, or a click that had just landed. Keying the region on the path mounts
each screen once and still carries it in. Route swaps enter and do not exit, on
purpose.

### Reduced motion is five layers that have to agree

1. The token file zeroes all three duration tokens at the root, which collapses
   every CSS transition and animation that names one.
2. The component and application stylesheets set `animation: none` on the loops
   and staggers that a zero duration cannot switch off, and drop the active-press
   transform on buttons.
3. Every JavaScript variant returns zero duration, zero rise, zero stagger, and
   no brightness pulse.
4. The design system's `matchMedia` hook is the one read of the query, and
   answers "not reduced" when the window, `matchMedia`, or both listener APIs
   are missing.
5. The animated-number hook returns its target verbatim with no frame loop, and
   is reached by two independent switches: the preference, and the zeroed
   duration token it reads off the root element once per mount.

The governing rule is that a reduced-motion reader still gets the state change;
it just happens instantly. Nothing is left mid-transition and nothing becomes
invisible. A variant that returns zero opacity with no animation to raise it is a
bug rather than an accommodation, which is why the route variant returns full
opacity for its initial frame when the preference is set.

The spinner is the one deliberate exception: under reduced motion it slows
rather than stopping, because a stopped spinner reads as a hang, which is a
worse outcome than a slow one.

### What the gate catches, and what it cannot

`scripts/check-brand-bans.mjs` catches, in stylesheets only: a second easing
curve (the first one on a line), a duration off the token scale or written in
seconds, and a `transform` line under a `:hover` selector. In TypeScript it
catches only gradients, backdrop filters, and the three banned Tailwind
animations.

What it does not catch is a longer list, and every item here was run against the
checker rather than assumed:

- Timing and curves written in JavaScript. This is exactly how the marketing
  pages picked up a second curve in the first place.
- A second curve appearing later on the same stylesheet line as a valid one.
- A `transform` written on the same line as its own `:hover` selector.
- Travel and scale distance. The entrance-travel token is enforced nowhere.
- Stagger arithmetic. The cap is review's job.
- Loops. An infinite animation only trips a rule if its duration is off scale.
- Glow drawn some other way - a text shadow, a drop-shadow filter, a shadow set
  from a style object, or a blurred shadow sitting beside an approved token in
  one declaration.
- Spring, overshoot and bounce, and whether a new animation has a reduced-motion
  path at all.
- Anything outside the four scanned roots.

### The allowlist

Deliberate exceptions live in `docs/design/brand-ban-allowlist.json` with a
reason a reviewer can argue with, narrowed by line or by matched text. It holds
six entries: a hard-stop two-colour gradient used to draw a half-filled dot
rather than a wash; the spinner, its reduced-motion slowdown, and the skeleton
pulse; and two print stylesheets that use literal colour on purpose. The motion
contract describes that file as holding seven, which is one more than it does.

Prefer fixing over allowlisting. That file is best read as the record of what
the codebase knowingly owes.

## Related

- [Tokens and the scales they enforce](tokens.md) - the duration, easing,
  travel and stagger tokens, and the two media queries that change them.
- [Loading, empty, error and unavailable](states.md) - where the skeleton, the
  spinner and the entrance actually appear.
- [The Quiet Observatory](identity.md) - the standing bans that hold in both
  registers.
- [Accessibility commitments](accessibility.md) - reduced motion as an
  accessibility promise rather than a preference.
