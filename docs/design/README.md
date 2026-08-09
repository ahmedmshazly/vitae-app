# Design sources

The interface guidance lives beside the code it informs.

| Path | What it is |
|------|------------|
| [`brand-book.html`](brand-book.html) | The brand and interface guide for the current identity: colour, type, the mark, layout, motion, components, voice, accessibility, data visualisation, and implementation. Open it in a browser. |
| [`IDENTITY.md`](IDENTITY.md) | The quick reference extracted from the brand book: the non-negotiable rules and every token value, in plain markdown. |
| [`addenda/`](addenda/README.md) | Markdown specs for screens added after the original pack: P23 entity forms, P24 connection editor, P25 graph explorer v2, P26 Aurora identity (superseded). |
| [`brand-assets/`](brand-assets/README.md) | Logo, icon, app-icon, and background assets for the Quiet identity. `packages/ui/src/glyphs.tsx` copies brand-icon geometry from `brand-assets/icons/*.svg`. Regenerate rasters with `node scripts/generate-brand-assets.mjs`. |

`packages/ui/src/styles/tokens.css` is authoritative for values, and
`brand-book.html` is authoritative for intent.
