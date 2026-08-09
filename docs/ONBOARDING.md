# Vitae Onboarding

Welcome. This gets you from a fresh clone to a running app and a first change.

## 1. Prerequisites

| Tool | Version | Why |
|---|---|---|
| Node | ≥ 20 (22 recommended) | runtime |
| pnpm | ≥ 9 | workspace package manager (`corepack enable`) |
| Java | 21 | Firebase Auth emulator |
| Firebase CLI | latest | runs the Auth emulator |
| Docker | latest | Postgres locally, and the LaTeX build service (optional for résumé compile) |

```bash
corepack enable && corepack prepare pnpm@9.15.0 --activate
npm i -g firebase-tools   # if not already installed
```

## 2. First run

```bash
cp .env.example .env        # fill in values; real .env is git-ignored
pnpm install

# Terminal 1: Postgres :5433 + migrations
pnpm dev:db

# Terminal 2: Auth emulator only (no Firestore)
pnpm dev:emulators

# Terminal 3: API + web
pnpm dev

# Load the sample graph
pnpm seed

# Optional: real PDF compilation
docker compose up -d buildsvc
```

Open <http://localhost:5173>, click **Developer sign-in**, and press **⌘K**.

> Postgres listens on **5433** here (5432 is often taken on the dev machine).
> Auth emulator: **9099**, emulator UI: **4001**.

## 3. Code tour (read in this order)

1. **`packages/core/src/schema/`**: the data model. `envelope.ts` is the common
   node/edge shape; `node-props.ts` is the per-type fields.
2. **`packages/core/src/algorithms/`**: the science. Start with
   `tie-strength.ts` and `selection.ts`; each has a doc-comment mapping to its
   SRS §10.7 subsection, and a `*.test.ts` next to it.
3. **`apps/api/src/db/repository.ts`**: how nodes/edges/revisions are read and
   written (soft-delete, transactions, audit). See `space.ts` before touching
   query helpers.
4. **`apps/api/src/routes/v1/`**: the REST surface. `capture.ts` and
   `resumes.ts` are the most interesting.
5. **`apps/web/src/app/Shell.tsx`**: the chrome; `features/QuickAdd.tsx` is the
   ⌘K capture bar; `routes/Tailor.tsx` is the résumé workspace.

## 4. How to add a node type (worked example)

Say you want a `podcast` type.

1. Add `'podcast'` to `NODE_TYPES` in `packages/core/src/types.ts`.
2. Add a `podcastProps` Zod schema in `node-props.ts` and register it in
   `NODE_PROPS_SCHEMAS`.
3. Add a glyph mapping in `packages/ui/src/glyphs.tsx` (`NODE_GLYPH`).
4. (Optional) add it to the Browse nav in `apps/web/src/app/Shell.tsx`.

That's it. The generic node routes, capture, search, revisions, and export all
work automatically because they operate on the envelope.

## 5. Testing

```bash
pnpm test:map            # every prod module mapped in docs/testing/source-test-map.json
pnpm test:prose          # test title/comment prose gate
pnpm test:unit           # core + @vitae/testkit
pnpm test:web            # web Vitest (jsdom)
pnpm test:api            # API integration (needs pnpm dev:db / vitae_test)
pnpm test:coverage       # core V8 coverage report under coverage/core
pnpm test:all            # map + prose + unit + web
pnpm typecheck
pnpm lint
```

Full layer list and reproduction notes: [`docs/testing/`](testing/). Prefer
`@vitae/testkit` factories for new fixtures.

The escape layer has a **property-based fuzz suite**. If you touch
`latex-escape.ts`, keep it green: arbitrary input must always compile and never
leak an active TeX control sequence.

## 6. Conventions

- **Mono-for-data**: dates, counts, scores, IDs, and grammar always render in
  IBM Plex Mono (`.u-mono` / `<Mono>`). This is part of the brand.
- **Explainability**: any score shown to the user must decompose into visible
  factor chips. Don't add a ranking you can't fully explain.
- **Provenance everywhere**: data surfaces carry a `<ProvenanceChip>`.
- **Determinism**: no randomness in the algorithms; identical inputs → identical
  outputs. Tests assert this.
