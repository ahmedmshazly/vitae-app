# Reference additions (P23-P25)

The original design-handoff pages (`P01-P22 *.dc.html` in the parent folder)
are static exports and stay untouched. New screens added by the 2026-07
makeover are specified here as lightweight markdown references, written
against the same token system (`packages/ui/src/styles/tokens.css`) and the
P00 Design DNA ("a quiet, precise instrument": mono-for-data, provenance
chips, explainable scores, keyboard-first, no gradients/glassmorphism).

> **Note:** the 2026-08 "Quiet" identity supersedes **both** P00's palette and
> P26's. It is specified in full in [`../brand-book.html`](../brand-book.html),
> with a plain-markdown extract at [`../IDENTITY.md`](../IDENTITY.md). Gradients
> are banned again, along with glows, texture and any accent hue. The rest of
> the DNA (mono-for-data, provenance, keyboard-first, density) still holds.

| ID | Screen | Spec | Live route |
|----|--------|------|-----------|
| P23 | Entity forms (all 28 types) | [P23-entity-forms.md](P23-entity-forms.md) | `+ New` in the top bar · `n` · Edit on Person/Org/Record |
| P24 | Connection editor | [P24-connection-editor.md](P24-connection-editor.md) | "+ add" on Record/Person connections · "edit" on the strength card |
| P25 | Graph explorer v2 | [P25-graph-explorer-v2.md](P25-graph-explorer-v2.md) | `/graph` |
| P26 | "Aurora Signal" product identity (**superseded**) | [P26-aurora-identity.md](P26-aurora-identity.md) | every screen (token-level rebrand) |

Design-QA screenshots are captured against the seeded dev stack with
`e2e/aurora-shots.mjs`; the landing-page assets in `apps/web/public/landing/`
are regenerated with `e2e/landing-assets.mjs`.
