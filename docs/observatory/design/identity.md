---
id: DSN-IDENTITY
title: The Fourfold identity
summary: Light, dark, and high-contrast themes ship from one token file; a build script refuses the patterns superseded identities prescribed.
audience: [designer, developer, maintainer]
domain: design
type: explanation
status: verified
verified_at: 2026-09-11
sources:
  - packages/ui/src/styles/tokens.css
  - packages/ui/src/styles/base.css
  - packages/ui/src/theme-provider.tsx
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

# The Fourfold identity

## In short

Vitae ships a light default with dark and high-contrast themes. Colour is
semantic rather than absent: red Do, blue Schedule, yellow Delegate (the action
colour), and dashed Eliminate. Three typefaces — Archivo Black, Space Grotesk,
Space Mono — and three easings on a 140 / 260 / 520 ms scale. `ThemeProvider`
writes `data-theme` on `<html>` and stores an explicit choice under
`vitae.theme`. **Quiet** (achromatic, dark-only, August 2026) is superseded;
hundreds of call sites still name `--ae-*` tokens, and every one is aliased onto
the new system until migrated. A script fails the build on several patterns the
older identities asked for.

See [`docs/design/IDENTITY.md`](../../design/IDENTITY.md) for the cheap-to-load
extract; where this page and that file disagree on current values, the token
file renders.

## How it works

### One identity ships, and three are history

Four identities appear in this repository, and only one of them is current.

| Identity | When | What it looked like | Status |
| --- | --- | --- | --- |
| Warm onyx | before 2026-07 | Warm near-black, paper-and-ink, a muted blue action colour | Superseded |
| Aurora Signal | 2026-07 | Deep space-blue, electric cyan, gradients, glow, spring motion | Superseded |
| Quiet | 2026-08 | Achromatic dark, paper white as the only accent, flat chrome, one easing | Superseded |
| Fourfold | 2026-09 | Light / dark / hc, quadrant semantics, three easings, self-hosted faces | **Current, and shipped** |

Values are declared in `packages/ui/src/styles/tokens.css`, every screen
resolves through them (often via `--ae-*` compatibility aliases), and
`scripts/check-brand-bans.mjs` runs in continuous integration against the two
source trees that matter.

### Three themes, and one provider

Light is the default on `:root`. `ThemeProvider`
(`packages/ui/src/theme-provider.tsx`) sets `data-theme` to `light`, `dark`, or
`hc` on `<html>`. A stored `vitae.theme` beats the operating system; among
system queries, `prefers-contrast: more` beats `prefers-color-scheme: dark`.
`tokens.css` also carries `@media` fallbacks for documents that have made no
explicit choice.

`html` declares `color-scheme: light dark` in `packages/ui/src/styles/base.css`
so form controls and scrollbars follow the active theme.

### The one light surface (documents only)

Résumé previews, the live document editor and the schema atlas render a
simulated sheet of paper inside the application chrome. A separate `--paper-*`
family exists for that surface only. It is a document, not a fourth theme, and
nothing outside a document preview may use it. Print stylesheets use literal
black on white; those files are exempted in `docs/design/brand-ban-allowlist.json`.

### Quadrant colour is semantic

`--do` (red) is never a button. `--sched` (blue) is live / scheduled.
`--deleg` (yellow) is the action colour: primary buttons, links, focus,
selection. `--elim` is the dashed box you empty on purpose. Because hue on
chrome always means something, a hue appearing anywhere on screen is carrying
information — an outcome, a record type, a state. Nothing may introduce "just
one accent for this screen".

Colour is never the only carrier of meaning. Every state ships a glyph and a
word alongside its tone. See [Layout and component patterns](patterns.md).

## Mechanics

### What the ban script actually refuses

`scripts/check-brand-bans.mjs` walks `packages/ui/src/styles` and
`apps/web/src/styles` for stylesheets, and `packages/ui/src` and
`apps/web/src` for TypeScript, skipping `node_modules`, `dist`, and any
`*.test.*` or `*.spec.*` file.

Seven rules run over stylesheets:

- **gradient** - any `linear-`, `radial-` or `conic-gradient(`.
- **backdrop-filter** - the glassmorphism ban.
- **shadow** - a blurred `box-shadow` that does not name a token. Overlay and
  focus-ring tokens (`--shadow-overlay`, `--focus-ring`, and their `--ae-*`
  aliases) are exempt.
- **easing** - the first `cubic-bezier()` on a line, if it is not one of the
  three curves declared in `tokens.css`. Exits may use `linear`.
- **duration** - on a timing declaration, any millisecond value outside
  `0`, `25` (stagger only), `140`, `260`, `520`, or any value written in seconds.
- **hover-transform** - `transform:` under `:hover`, except `.ff-hover-lift`.
- **raw-hex** - any hex literal outside the token file and outside a print block.

TypeScript is also scanned for gradients, `backdropFilter`, and Tailwind's
`animate-bounce`, `animate-ping`, and `animate-pulse`.

Deliberate exceptions go in `docs/design/brand-ban-allowlist.json` with a
reason.

### A fossil name, and why it is harmless

`apps/web/src/styles/entity-observatory.css` still declares local properties
called `--obs-cyan` and `--obs-cyan-soft`. The names survived earlier rebrands;
both are aliases onto the current ramp. Nothing cyan ships.

### What is convention rather than law

The ban script is silent on several commitments that still matter: no ninth
categorical hue, the display face never labelling a control, four screen states
on every route, and brand assets staying in sync across three hand-maintained
copies. See [motion](motion.md) for blind spots in duration enforcement.

### Where the values live

`packages/ui/src/styles/tokens.css` is the definition site. `docs/design/IDENTITY.md`
is the hand-maintained extract. Where the two disagree on current values, the
token file is authoritative.

## Related

- [Tokens and the scales they enforce](tokens.md)
- [Motion](motion.md) - three easings, three durations, two registers.
- [Layout and component patterns](patterns.md)
- [Voice and content design](voice.md)
- [About these documents](../meta/index.md)
