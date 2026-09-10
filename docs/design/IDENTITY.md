# Vitae identity quick reference (Fourfold, 2026-09)

The full guide is [`brand-book.html`](brand-book.html). Open it in a browser. This file is
the cheap-to-load extract: the rules that must not be broken, plus every token value. When
the two disagree, the brand book is right.

> **Status: shipped.** The light / dark / high-contrast identity is live in
> `packages/ui/src/styles/tokens.css` and across the web app. `ThemeProvider` writes
> `data-theme` on `<html>`; storage key `vitae.theme`. This file remains the cheap-to-load
> extract; the brand book is still authoritative for intent when the two disagree.

**Quiet** (achromatic, dark-only, August 2026) is **superseded** by this system. Hundreds of
call sites still name `--ae-*` tokens; every one is aliased onto the new tokens until
migrated. Supersedes [`addenda/P26-aurora-identity.md`](addenda/P26-aurora-identity.md) as well.
The two `brand/*.dc.html` pages and the header of `brand-assets/README.md` are historical.

## The one-line version

Light by default, with dark and high-contrast themes. **Colour is semantic:** red Do, blue
Schedule, yellow Delegate (the action colour), dashed Eliminate. Three typefaces. Three
easings on a 140 / 260 / 520 ms scale. Motion only ever reports a state change.

## Non-negotiables

1. **Quadrant colours are semantic, never decorative.** `--do` (red) is never a button.
   `--sched` (blue) is live / scheduled. `--deleg` (yellow) is the action colour: primary
   buttons, links, focus, selection. `--elim` is the box you empty on purpose (dashed).
2. **Backgrounds are flat.** No texture, noise, grain, grid, gradient, image, ambient wash,
   glow, or `backdrop-filter`. Elevation is tone plus a hairline.
3. **Motion reports a state change.** If you cannot name the change, delete the animation.
   No spring, no bounce, no shimmer, no looping, and routes never slide.
4. **Text clears 4.5:1** against the *lightest* surface it can appear on, not the canvas.
5. **Controls whose only boundary is a border use `--line` / `--ae-border-control`**
   (≥3:1, WCAG 1.4.11). Decorative hairlines are exempt.
6. **Never colour-alone.** Every state ships a glyph and a word too.
7. **Data is monospace** with tabular figures.
8. **The display face never labels a control** and never appears below 15px.
9. **Every screen ships four states**: loading, empty, error, populated.
10. **Viz slots are fixed and never cycled.** A ninth series folds into "Other".

Standing bans, all tried in a previous identity and removed on purpose: gradients on chrome,
glow/halo shadows, glassmorphism, shimmer sweeps, ambient washes, decorative illustration in
empty states.

## Themes

| Theme | How it is selected |
|---|---|
| **light** | Default on `:root` and `[data-theme='light']` |
| **dark** | `[data-theme='dark']` or `prefers-color-scheme: dark` when nothing is stored |
| **hc** | `[data-theme='hc']` or `prefers-contrast: more` when nothing is stored |

`ThemeProvider` (`packages/ui/src/theme-provider.tsx`) resolves: stored `vitae.theme` beats
system preference; among system queries, `prefers-contrast: more` beats `prefers-color-scheme:
dark`.

## Tokens

Authoritative values live in `packages/ui/src/styles/tokens.css`. New names use `--bg`,
`--ink`, `--do`, etc. Legacy call sites still use `--ae-*`; each alias is a `var()` onto a
new token so theme switches flow through.

### Surfaces (light default)

| Token | Value | Use |
|---|---|---|
| `--bg` | `#F2F0EA` | Page ground |
| `--bg-2` | `#E9E6DE` | Raised rows, inputs, chips |
| `--card` | `#FFFFFF` | Cards, panels, overlays |
| `--ink` | `#0B0B0D` | Primary text |
| `--ink-2` | `#5B584F` | Secondary text, labels |
| `--line` | `#D6D2C8` | Hairlines, control borders |

Dark and high-contrast redeclare every surface and ink token; see `tokens.css`.

### Quadrant colours (semantic)

| Token | Light | Role |
|---|---|---|
| `--do` | `#D8321A` | Do — red. **Never a button.** |
| `--sched` | `#1E4FD6` | Schedule — blue. Live / scheduled. |
| `--deleg` | `#E0A800` | Delegate — yellow. **Action colour.** |
| `--elim` | `#7A756A` | Eliminate — dashed outline |

### Compatibility aliases (still resolving)

| Legacy | Maps to |
|---|---|
| `--ae-bg` | `var(--bg)` |
| `--ae-surface` | `var(--card)` |
| `--ae-surface-raised` | `var(--bg-2)` |
| `--ae-fg` | `var(--ink)` |
| `--ae-muted` | `var(--ink-2)` |
| `--ae-accent` | `var(--deleg)` |
| `--ae-accent-2` | `var(--sched)` |
| `--ae-border-control` | `var(--line)` |

The full alias table is in `tokens.css`. Type scale (`--ae-text-*`) keeps Quiet pixel values
on purpose so existing screens are not silently restyled.

### Semantic states (literal, no quadrant counterpart)

`--ae-success #7EB795` · `--ae-warning #C8A344` · `--ae-danger #E17263` ·
`--ae-ember #C98A3D` (streaks only) · `--ae-info #9A9484`

### Categorical viz: fixed order, never cycled

`#1F9C86` `#B08A18` `#6E8FD0` `#C8503F` `#A87BC0` `#7E9B3A` `#D4649B` `#C56A2A`

### Type

| Token | Family | Job |
|---|---|---|
| `--display` / `--ae-font-display` | Archivo Black | Page and section titles only |
| `--sans` / `--ae-font-sans` | Space Grotesk | All interface and body text |
| `--mono` / `--ae-font-mono` | Space Mono | Data: IDs, dates, counts, scores |

Self-hosted latin woff2 subsets in `packages/ui/src/styles/fonts/` (SIL OFL 1.1).

Legacy scale (unchanged): `xs 11 · sm 12 · base 14 · md 15 · lg 17 · xl 21 · 2xl 30 · 3xl 44 · 4xl 64`.
Leading `1.2` tight / `1.55` normal. Sentence case everywhere except the display face.

New scale (`--t-*`) is for rebuilt screens; do not remap legacy `--ae-text-*` onto it yet.

### Geometry and motion

Radii `2 / 3 / 5 / 999` · spacing `4 8 12 16 24 32 48` · row height `36px` ·
control target min `32×32` (44px on coarse pointers).

Durations `--d-quick 140ms` / `--d-base 260ms` / `--d-long 520ms` (aliased as
`--ae-dur-fast` / `--ae-dur` / `--ae-dur-slow`).

Three easings: `--e-out` `cubic-bezier(0.2, 0.7, 0.2, 1)` (default),
`--e-pop` `cubic-bezier(0.34, 1.56, 0.64, 1)`, `--e-settle` `cubic-bezier(0.22, 1.2, 0.36, 1)`.
Exits use `linear`. `prefers-reduced-motion` zeroes all three duration tokens.

Five named variants in `apps/web/src/lib/motion.ts`: **enter** (260ms, opacity + 4px rise,
stagger 25ms capped at 5 children) · **exit** (140ms, opacity, linear) · **emphasis** (260ms,
brightness only, no movement) · **reorder** (520ms, transform only) · **route** (260ms in,
140ms out, opacity only).

Utility classes in `packages/ui/src/styles/motion.css` use the same tokens. `.ff-hover-lift`
is the one permitted hover transform.

## The mark: Weighted V

One closed path on a 40×40 grid. Thick arm 5.2 units, thin arm 1.8 (ratio 2.9:1).

```
M6.8 7.5 L20 31 L31.2 7.5 L29.4 7.5 L20 26.6 L12 7.5 Z
```

Below 32px use the small variant (thin arm 3.1 units):

```
M6.4 7.5 L20 31 L32 7.5 L28.9 7.5 L20 25.6 L12.4 7.5 Z
```

The mark may use `--deleg` (primary variant) or `--ink` (secondary). Wordmark is Space Grotesk.
Never stretch it, rotate it, or put it in a badge inside the product.

Assets are **hand-synced and nothing enforces it**: `docs/design/brand-assets/` is the
archive, `apps/web/public/` holds the runtime copies, and `packages/ui/src/brand.tsx` is the
version the app actually renders. All three change together.

## Voice

Active voice; a control says what happens and the verb survives into the toast
("Save changes" → "Saved"). Errors state what failed and how to fix it. Never "Oops" or
"Sorry". Empty states invite an action. No exclamation marks, no emoji.

Lexicon: **record** (not node/entity) · **connection** (not edge) · **life map** (not graph
view) · **atom** · **target** · **output** · **capture** · **owner** · **demo data**.

## Where things live

| Path | Owns |
|---|---|
| `packages/ui/src/styles/tokens.css` | Every token value (authoritative) |
| `packages/ui/src/theme-provider.tsx` | Theme selection and `data-theme` |
| `apps/web/src/styles/theme.css` | Tailwind v4 `@theme inline` aliases |
| `packages/ui/src/styles/motion.css` | Keyframes and motion utility classes |
| `packages/ui/src/{components,forms,overlay,feedback}.tsx` | The primitives |
| `packages/ui/src/brand.tsx` | Mark and lockups |
| `apps/web/src/lib/motion.ts` | The five motion variants |
| `docs/design/brand-book.html` | The full guide |

Semantic utilities only in components: `bg-canvas`, `text-muted`, `border-control`. A hex
code in a component is a bug.
