# Vitae identity quick reference ("Quiet", 2026-08)

The full guide is [`brand-book.html`](brand-book.html). Open it in a browser. This file is
the cheap-to-load extract: the rules that must not be broken, plus every token value. When
the two disagree, the brand book is right.

> **Status: shipped.** Quiet is live in `packages/ui/src/styles/tokens.css` and across the
> web app. This file remains the cheap-to-load extract; the brand book is still authoritative
> for intent when the two disagree.

Supersedes [`addenda/P26-aurora-identity.md`](addenda/P26-aurora-identity.md). The two
`brand/*.dc.html` pages and the header of `brand-assets/README.md` are historical. Both are
frozen on the pre-2026-07 palette.

## The one-line version

Achromatic, dark-only, flat. **There is no accent hue.** Brightness is the accent, and the
whole colour budget is spent on data. Two typefaces. Motion only ever reports a state change.

## Non-negotiables

1. **No accent hue.** Primary actions, active markers, focus rings and selection are all
   `#FAFAF8` on dark. Do not introduce a coloured accent for one screen.
2. **Backgrounds are flat.** No texture, noise, grain, grid, gradient, image, ambient wash,
   glow, or `backdrop-filter`. Elevation is tone plus a hairline.
3. **Motion reports a state change.** If you cannot name the change, delete the animation.
   No spring, no bounce, no shimmer, no looping, and routes never slide.
4. **Text clears 4.5:1** against the *lightest* surface it can appear on, not the canvas.
5. **Controls whose only boundary is a border use `--ae-border-control`** (≥3:1, WCAG 1.4.11).
   Decorative hairlines are exempt.
6. **Never colour-alone.** Every state ships a glyph and a word too.
7. **Data is monospace** with tabular figures.
8. **The display face never labels a control** and never appears below 15px.
9. **Every screen ships four states**: loading, empty, error, populated.
10. **Viz slots are fixed and never cycled.** A ninth series folds into "Other".

Standing bans, all tried in a previous identity and removed on purpose: gradients on chrome,
glow/halo shadows, glassmorphism, shimmer sweeps, ambient washes, decorative illustration in
empty states.

## Tokens

All values live in `packages/ui/src/styles/tokens.css` under the historical `--ae-*` prefix.

### Surfaces

| Token | Value | Use |
|---|---|---|
| `--ae-rail` | `#0A0A0A` | Nav rail only |
| `--ae-bg` | `#0F0F0F` | Page ground |
| `--ae-surface` | `#151515` | Cards, panels |
| `--ae-surface-raised` | `#1C1C1C` | Rows on hover, inputs, chips |
| `--ae-surface-overlay` | `#232323` | Dialogs, popovers, menus, toasts |

### Ink: contrast shown on canvas / on overlay

| Token | Value | Contrast | Use |
|---|---|---|---|
| `--ae-fg-strong` | `#FAFAF8` | 18.3 / 15.0 | Headings, active item, primary values |
| `--ae-fg` | `#E8E8E6` | 15.6 / 12.8 | Body text |
| `--ae-fg-soft` | `#C9C9C6` | 11.6 / 9.5 | Secondary prose |
| `--ae-muted` | `#A3A3A0` | 7.6 / 6.2 | Labels, inactive nav, metadata |
| `--ae-faint` | `#8C8C89` | 5.7 / 4.7 | 11px content. **The floor. Do not darken.** |

### Accent and borders

| Token | Value | Use |
|---|---|---|
| `--ae-accent` | `#FAFAF8` | Primary fill, active marker, focus ring, selection |
| `--ae-accent-ink` | `#0F0F0F` | Text on an accent fill (18.3:1) |
| `--ae-accent-bg` | `#262626` | Selected row / active tab ground |
| `--ae-accent-2` | `#A3A3A0` | "Live": provenance, sync, edges. **Never an action.** |
| `--ae-border` | `#2B2B2B` | Decorative hairlines only (1.35:1) |
| `--ae-border-strong` | `#3F3F3F` | Emphasis, chip outlines |
| `--ae-border-control` | `#727271` | **Any border that defines a control** (3.98 canvas / 3.26 overlay) |

### Semantic: all ≥4.5:1 on all four surfaces, always with an icon and a label

`--ae-success #7EB795` · `--ae-warning #C8A344` · `--ae-danger #E17263` ·
`--ae-ember #C98A3D` (streaks only) · `--ae-info #9A9484`

### Categorical viz: fixed order, never cycled

`#1F9C86` `#B08A18` `#6E8FD0` `#C8503F` `#A87BC0` `#7E9B3A` `#D4649B` `#C56A2A`

Validated against both `#0F0F0F` and `#232323`: lightness band, chroma floor, adjacent-pair
CVD separation, normal-vision separation and contrast all pass.

### Type

| Token | Family | Job |
|---|---|---|
| `--ae-font-display` | IBM Plex Mono 500, caps, 0.2em tracking | Page and section titles only |
| `--ae-font-sans` | Instrument Sans | All interface and body text |
| `--ae-font-mono` | IBM Plex Mono | Data: IDs, dates, counts, scores, provenance |

Scale: `xs 11 · sm 12 · base 14 · md 15 · lg 17 · xl 21 · 2xl 30 · 3xl 44 · 4xl 64`.
Leading `1.2` tight / `1.55` normal. Sentence case everywhere except the display face.

### Geometry and motion

Radii `2 / 3 / 5 / 999` · spacing `4 8 12 16 24 32 48` · row height `36px` ·
control target min `32×32` (WCAG floor `24×24`).

Durations `--ae-dur-fast 90ms` / `--ae-dur 130ms` / `--ae-dur-slow 220ms`;
one easing `cubic-bezier(0.32, 0.72, 0, 1)`; exits use `linear`.
`prefers-reduced-motion` zeroes all three.

Five named variants in `apps/web/src/lib/motion.ts`: **enter** (130ms, opacity + 4px rise,
stagger 25ms capped at 5 children) · **exit** (90ms, opacity, linear) · **emphasis** (130ms,
brightness only, no movement) · **reorder** (220ms, transform only) · **route** (130ms,
opacity only).

## The mark: Weighted V

One closed path on a 40×40 grid. Thick arm 5.2 units, thin arm 1.8 (ratio 2.9:1).

```
M6.8 7.5 L20 31 L31.2 7.5 L29.4 7.5 L20 26.6 L12 7.5 Z
```

Below 32px use the small variant (thin arm 3.1 units):

```
M6.4 7.5 L20 31 L32 7.5 L28.9 7.5 L20 25.6 L12.4 7.5 Z
```

Clear space is half the cap height on every side; minimum size 14px. Wordmark is IBM Plex
Mono 500, caps, 0.26em tracking. Never colour it, stretch it, rotate it, or put it in a
badge inside the product.

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
| `packages/ui/src/styles/tokens.css` | Every `--ae-*` value (authoritative) |
| `apps/web/src/styles/theme.css` | Tailwind v4 `@theme inline` aliases |
| `packages/ui/src/{components,forms,overlay,feedback}.tsx` | The primitives |
| `packages/ui/src/brand.tsx` | Mark and lockups |
| `apps/web/src/lib/motion.ts` | The five motion variants |
| `docs/design/brand-book.html` | The full guide |

Semantic utilities only in components: `bg-canvas`, `text-muted`, `border-control`. A hex
code in a component is a bug.
