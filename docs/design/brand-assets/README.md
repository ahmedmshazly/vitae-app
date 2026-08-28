# Vitae brand assets (quiet, 2026-08)

Accent is brightness, not hue: ink `#FAFAF8` on ground `#0F0F0F`. Instrument Sans +
IBM Plex Mono. The Weighted V mark is one closed path, two arm weights. Never coloured,
stretched, or rotated.

Regenerate runtime + archive rasters from the SVGs in `apps/web/public/`:

```bash
node scripts/generate-brand-assets.mjs
```

## logo/

- `vitae-mark`: primary Weighted V (svg · png via script)
- `vitae-logo-horizontal` / `vitae-logo-stacked`: mark + wordmark lockups
- `vitae-mark-paper` / `vitae-mark-mono-*` / `vitae-mark-reversed`: historical knockouts
  kept in the archive; the product renders `packages/ui/src/brand.tsx` instead
- `vitae-mark-animated.svg`: static Quiet mark (no looping glow; Quiet forbids
  motion that does not report a state change)

## app-icon/

- `favicon.svg` + `favicon-16/32/48/64.png`: mark on Quiet ground
- `vitae-appicon-*`: archive tiles; runtime uses `apps/web/public/apple-touch-icon.png`

## icons/

16 line icons (24px grid, 1.6px stroke). Geometry is mirrored in
`packages/ui/src/glyphs.tsx`.

## background/

- `vitae-bg.svg`: flat Quiet ground (no ambient wash). The old aurora field is retired.

Live guidance: [`brand-book.html`](../brand-book.html). Product tokens:
`packages/ui/src/styles/tokens.css`.
