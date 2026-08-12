# Motion contract

The law for product motion lives in [`brand-book.html`](brand-book.html) ch.08, summarised in
[`IDENTITY.md`](IDENTITY.md). This file is the working reference: read it before you add an
animation, not after review sends it back.

**Precedence.** On the product surface ch.08 governs unamended: where this file and the brand
book disagree about product motion, the brand book is right. Section 4 is the one exception,
and it is an exception by decision, not by reading. The two-register split is a **deliberate
amendment the product owner approved for this work**: ch.08 states the three durations and the
4px travel with no marketing carve-out, and this file adds one, scoped to exactly `/welcome`,
`/tour` and `/manifesto`. Nothing else inherits it, and it reaches timing and travel only.

**The standing bans hold in both registers, no exception**: gradients on chrome, glow or halo
shadows, glassmorphism, shimmer sweeps, ambient washes, decorative illustration, any accent
hue, spring, overshoot, bounce.

| | Product register | Marketing register |
|---|---|---|
| Where | Everything under the app shell, and all of `packages/ui` | `/welcome`, `/tour`, `/manifesto` only |
| Audience | Someone working inside a tool daily | A prospect visiting once |
| Job | Report a state change | Explain the product |
| Governed by | ch.08, unamended | ch.08 plus the section 4 amendment |
| Tooling | `apps/web/src/lib/motion.ts`, or CSS keyframes | Same easing token, same bans, longer durations and larger travel per section 4 |

## 1. The test

> **Before adding an animation, name the state change it reports. If you can't, delete it.
> If the user would not notice its absence, delete it.**

That is the whole gate. "It feels flat without it" is not a state change. Hover is not a
state change either, so hover gets tone, never travel.

## 2. Tokens

Defined in [`packages/ui/src/styles/tokens.css`](../../packages/ui/src/styles/tokens.css).

| Token | Value | Use |
|---|---|---|
| `--ae-ease` | `cubic-bezier(0.32, 0.72, 0, 1)` | Everything. There is one easing. |
| `--ae-dur-fast` | `90ms` | Exits, hover, anything leaving |
| `--ae-dur` | `130ms` | Default: entrances, emphasis, route swaps |
| `--ae-dur-slow` | `220ms` | Reorder and layout shifts only |
| `--ae-motion-rise` | `4px` | Entrance travel. Nothing moves further. |
| `--ae-motion-stagger` | `25ms` | Step between children, capped at 5 (125ms total) |

Exits use literal `linear`, not a token: an element that is leaving should not decelerate,
it should just go.

**From CSS.** Name the token, never the literal. `packages/ui` has no animation-runtime
*dependency* (`packages/ui/package.json`: Radix, cva, clsx, tailwind-merge, nothing else), so
design-system motion is CSS keyframes driven by Radix `[data-state]` attributes. It does now
carry two motion hooks in plain React, `use-reduced-motion.ts` and `use-animated-number.ts`,
and the second holds a copy of `--ae-ease` in TypeScript; see section 5.

```css
.vt-thing { animation: vt-rise-in var(--ae-dur) var(--ae-ease); }
.vt-thing[data-state='closed'] { animation: vt-fade-out var(--ae-dur-fast) linear; }
.card > .row:nth-child(3) { animation-delay: calc(var(--ae-motion-stagger) * 2); }
```

**From Tailwind utilities.** `apps/web/src/styles/theme.css` overrides
`--default-transition-timing-function` and `--default-transition-duration`, so a bare
`transition-*` utility is already on the brand curve at 130ms with nobody opting in.
`ease-quiet` names the curve explicitly. Tailwind v4 has no `duration-*` theme namespace, so
the supported spelling is the custom-property shorthand.

```html
<div class="transition-colors">already 130ms on the brand curve</div>
<div class="transition-opacity duration-(--ae-dur-fast) ease-quiet">leaving</div>
```

`animate-bounce`, `animate-ping` and `animate-pulse` are set to `initial` in `theme.css`, so
they no longer compile. `animate-spin` is left alone: an indeterminate spinner is permitted.

**From JS.** [`apps/web/src/lib/motion.ts`](../../apps/web/src/lib/motion.ts) ships two layers.

| Layer | What it is | Reach for it |
|---|---|---|
| `useEnter`, `useEnterItem(index)`, `useExit`, `useEmphasis`, `useReorder`, `useRoute` | Hooks. Each reads the reduced-motion preference itself, memoises on it, and returns exactly what the function of the same name returns | **Default.** A flag you have to remember to pass is a flag that gets forgotten |
| `enter`, `enterItem`, `exit`, `emphasis`, `reorder`, `route` | The primitive underneath: pure functions taking `reduced` explicitly | Only where the flag comes from somewhere other than the media query, or inside a `.map()`, where a hook cannot be called |
| `staggered(items)` | Pairs each item with its stagger index, capped at `STAGGER_CAP` (5) | Any list, either layer |

```tsx
function Row({ index, row }: { index: number; row: RowData }) {
  return <motion.li {...useEnterItem(index)}>{row.label}</motion.li>;
}

{staggered(rows).map(({ item, index }) => <Row key={item.id} index={index} row={item} />)}
```

Each hook reads the preference through one `useReducedFlag()` helper, which calls
`useReducedMotion` **from `@vitae/ui`**, not Framer's hook of the same name: one media-query
subscription per component, and a plain boolean with no unresolved third state. Only
`Transition` and `Variants` come from `motion/react`, and those are erased at compile time.
A component that still passes the flag into a bare function is not broken, but new code takes
the hook.

## 3. The product register

Five variants. Nothing outside this list gets animated without being added to the list first.

| Variant | Duration | Animates | Easing | Use |
|---|---|---|---|---|
| `enter` | 130ms | opacity + 4px rise, stagger 25ms capped at 5 children | `--ae-ease` | Entrances, list loads, dialogs opening |
| `exit` | 90ms | opacity only | `linear` | Anything leaving |
| `emphasis` | 130ms | brightness only, no movement | `--ae-ease` | A value changed in place, an optimistic save |
| `reorder` | 220ms | transform only (FLIP) | `--ae-ease` | Reorder, sort, filter, layout shifts |
| `route` | 130ms in, 90ms out | opacity only | `--ae-ease` in, `linear` out | Route and content-region swaps |

Choreography, verbatim from ch.08:

- Stagger is capped: **25ms step, at most 5 children, 125ms total**. The sixth item onward
  appears with the fifth. `STAGGER_CAP = 5` in `motion.ts`, `:nth-child(n + 5)` in the CSS.
- Only one thing animates per interaction. If a row updates and a toast appears, the row moves.
- Travel is short: **4px** for entrances. Nothing slides across the screen except a reorder,
  which moves the distance it actually moved.
- No spring, no overshoot, no bounce, no elastic. No scale on anything opening.
- No shimmer sweep, no gradient animation, no pulsing glow.
- Route changes never slide. A page that slides in implies spatial relationships between
  screens that don't exist.
- Nothing loops. The only repeating animation in the product is the skeleton opacity pulse,
  and it stops the moment content arrives.

### Event to motion, and what actually ships

The middle column is the law; the right column is the truth as of this commit, so you know
whether you are adding motion or fixing it.

| Event | Motion | State today |
|---|---|---|
| Route change | `route` on the content region only. The shell never animates. | **Partial.** `Shell.tsx` keys `.content` on `pathname` with `initial`/`animate`, but that region is not inside an `<AnimatePresence>`, so the `exit` half is unreachable. |
| List loads | `enter`, staggered, first five rows only | **Partial.** The Dashboard "Needs you" queue is the only JS caller of the per-item variant. The CSS half (`.card > .row` in `app.css`) covers card rows app-wide. |
| Row saved (optimistic) | `emphasis` on the row, then the toast appears with `enter` | **Partial.** `emphasis` runs on exactly one row, the Dashboard habit row. The toast half is app-wide in `Toast.tsx`. |
| Row deleted | `exit`, then the list closes the gap with `reorder` | **Not implemented.** No list does either half. |
| Sort or filter changes | `reorder`. Rows move, they do not re-enter. | **Not implemented.** `reorder()` has zero callers. |
| Dialog opens | `enter` at 130ms, backdrop fades at the same time. No scale. | **Implemented**, in CSS: `.vt-modal` / `.vt-overlay` in `packages/ui/src/styles/components.css`. |
| Dialog closes | `exit` at 90ms | **Implemented**, in CSS via `[data-state='closed']`. |
| Skeleton to content | Skeleton stops, content `enter`s. Never cross-fade the two. | **Partial.** The pulse ships and stops on unmount; content enters only where the CSS row stagger or `enterItem` reaches it. |

`enter` and `exit` also drive two things that are not table rows: the toast, and the nav rail
group disclosure in `Shell.tsx`, which is inside an `<AnimatePresence>`.

## 4. The marketing register

`/welcome`, `/tour` and `/manifesto` are read once by someone deciding whether to care. A
page that has to explain a product is allowed gestures a tool used daily is not. This is the
approved amendment named at the top of this file, not a reading of ch.08, and it is written
down here so it stops being an unwritten exception.

**Permitted on those three routes and nowhere else:**

- Scroll choreography, with varied gestures rather than one gesture repeated down the page.
- Longer durations than the three product tokens.
- Larger travel than `--ae-motion-rise`.
- Real product video and screen recordings.
- Count-ups on figures.

The easing is not part of the amendment: `--ae-ease` is still the only curve.

**Still banned here:** every standing ban at the top of this file, unchanged. The amendment
buys time and distance, nothing else.

**Every marketing gesture must short-circuit under `prefers-reduced-motion`.** Not shorten,
short-circuit: return the content unanimated. `Landing.tsx`'s `Reveal` is the shape to copy
(`if (reduced) return <>{children}</>;`).

Known debt: `Landing.tsx:28` and `Tour.tsx:116` pass a second easing curve
(`[0.16, 1, 0.3, 1]`) inline. Longer durations are within the amendment; a second curve never
was. Both should move onto `--ae-ease`.

## 5. Reduced motion

Five layers, all of which have to agree.

| Layer | What happens under `prefers-reduced-motion: reduce` |
|---|---|
| `packages/ui/src/styles/tokens.css` | Zeroes `--ae-dur-fast`, `--ae-dur` and `--ae-dur-slow` at the root, so every CSS transition and animation that names a token collapses to instant |
| `components.css` / `app.css` | `animation: none` on the loops and staggers a zero duration cannot switch off (`.vt-skel`, `.vt-skel-rows__row`, `.card > .row`, `.graph__peek`), and drops the `.vt-btn:active` transform |
| `apps/web/src/lib/motion.ts` | Every variant takes `reduced` and returns duration `0`, rise `0`, stagger `0`, and no brightness pulse |
| `packages/ui/src/use-reduced-motion.ts` | The one JS read of the query in the repo, for `packages/ui` (which has no runtime to borrow one from) and for `motion.ts`'s hooks alike: `useSyncExternalStore` over `matchMedia`, answering `false` when `window`, `matchMedia`, or both listener APIs are missing |
| `packages/ui/src/use-animated-number.ts` | Returns the target verbatim, with no `requestAnimationFrame` loop, so a number snaps. Two independent switches reach it: `useReducedMotion`, and the `--ae-dur` it reads off the root element once per mount, which `tokens.css` has already zeroed. It still **duplicates the `--ae-ease` control points (`0.32, 0.72, 0, 1`) in TypeScript**, the one value that has to be mirrored by hand; `easeFraction` is exported to keep that curve testable |

The rule: **a reduced-motion user still gets the state change, it just happens instantly.**
Nothing is left mid-transition, nothing becomes invisible. A variant returning `opacity: 0`
with no animation to raise it is a bug, not an accommodation, which is why `route()` returns
`opacity: 1` for its `initial` when `reduced` is true. The spinner is the one deliberate
exception: it slows to 1.5s rather than stopping, because a stopped spinner reads as a hang.

Under jsdom, `window.matchMedia` is stubbed to always return `{ matches: false }` and may
not implement `addEventListener`. Any hook you write must survive that.

## 6. Enforcement

```sh
node scripts/check-brand-bans.mjs      # or: pnpm test:brand
```

**What it reads.** `.css` under `packages/ui/src/styles` and `apps/web/src/styles`, block
comments blanked first (line numbers preserved) so prose about a banned thing is not read as
shipping it. `.ts`/`.tsx` under `packages/ui/src` and `apps/web/src`, **excluding `*.test.*`
and `*.spec.*`**, skipping lines that open with a comment marker but not trailing comments.
`node_modules` and `dist` are skipped, and nothing outside those four roots is read at all.

| Rule | Scans | Fails on |
|---|---|---|
| `gradient` | CSS + code | `linear-gradient(`, `radial-gradient(`, `conic-gradient(` |
| `backdrop-filter` | CSS + code | `backdrop-filter:` or `backdropFilter:` |
| `shadow` | CSS only | A `box-shadow` whose third length (the blur slot) is non-zero. The whole declaration is exempt if its value mentions `var(--ae-shadow-overlay)` or `var(--ae-focus-ring)`, or is `none`/`inherit`/`unset`. A zero-blur ring like `0 0 0 2px` passes |
| `easing` | CSS only | The **first** `cubic-bezier(...)` on the line, if it is not `cubic-bezier(0.32, 0.72, 0, 1)` |
| `duration` | CSS only | On a line declaring `transition`/`animation`/`*-duration`/`*-delay`: any `ms` value outside `0 25 50 75 90 100 125 130 220`, or any bare seconds value |
| `hover-transform` | CSS only | A line beginning `transform:` while the last-seen selector contains `:hover` |
| `raw-hex` | CSS only | Any `#hex` (3 to 8 digits) outside `tokens.css` and outside `@media print` |
| `tailwind-animate` | code only | `animate-bounce`, `animate-ping`, `animate-pulse` |

**What it does not catch.** Each of these was run against the checker, not assumed.

| Blind spot | Example that passes today |
|---|---|
| Timing and curves in JS. Only the three code rules run on `.ts`/`.tsx`, which is exactly how the marketing pages picked up a second curve | `transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}` |
| A second curve later on the same CSS line | `transition: opacity 130ms var(--ae-ease), transform 130ms cubic-bezier(0.16, 1, 0.3, 1);` |
| `transform` written on the same line as its `:hover` selector | `.card:hover { transform: translateY(-2px); }` |
| Travel and scale distance. `--ae-motion-rise` is not enforced anywhere | `transform: translateY(40px) scale(0.8);` |
| Stagger arithmetic. The cap of 4 steps is review's job | `animation-delay: calc(var(--ae-motion-stagger) * 9);` |
| Loops. `infinite` is never checked; a loop only trips `duration` if its duration is off scale | `animation: vt-x 130ms var(--ae-ease) infinite;` |
| Glow drawn some other way, or a blurred shadow sitting beside a token in one declaration | `text-shadow: 0 0 8px …`, `filter: drop-shadow(0 0 8px …)`, a `boxShadow` style object, `box-shadow: var(--ae-shadow-overlay), 0 0 12px …;` |
| Spring, overshoot, bounce, and whether a new animation has a reduced-motion path | nothing detects any of them |
| Anything outside the four scanned roots | `e2e/`, `index.html`, Tailwind config, docs |

**Adding a deliberate exception.** Put it in
[`brand-ban-allowlist.json`](brand-ban-allowlist.json) under the rule name, with a reason a
reviewer can argue with. `file` alone exempts the whole file for that rule; add `line` or
`match` to narrow it. Prefer fixing over allowlisting: that file is the record of what the
codebase knowingly owes. The seven entries in it today (the ProvenanceChip half-dot; the
spinner, its reduced-motion slowdown and the skeleton pulse; three paper-simulation files under
`raw-hex`) are the models to copy for tone and length.
