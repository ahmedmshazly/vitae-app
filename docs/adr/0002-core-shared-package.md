# ADR 0002: The intelligence lives in a pure, shared `@vitae/core` package

- **Status:** accepted
- **Date:** 2026-07-11

## Context

Vitae's value is its deterministic intelligence: tie strength, who-to-call,
JD parsing, résumé selection, dedup. These must be identical on the server (where
they run against real data) and available to the client (for live previews), and
they must be provable in isolation because the constitution makes explainability
and determinism correctness properties.

## Decision

Put all Zod schemas and all §10.7 algorithms in **`packages/core`**, a pure
TypeScript package with **no I/O and no framework dependency** (only `zod`). Both
`apps/api` and `apps/web` import it directly as workspace source.

## Consequences

- The algorithms are unit-tested and property-fuzz-tested with zero
  infrastructure (`pnpm test:core`), independent of the database or Express.
- The data model (Zod) is a single source of truth: the API validates writes and
  the web builds forms from the same schemas.
- Because the algorithms take plain data in and give plain data out, the storage
  backend is swappable (see ADR 0001 / ADR 0005) without touching the science.
- Cost: workspace source resolution. Dev works via `tsx`/Vite reading the `.ts`
  source directly; a production build compiles `core` to `dist` first.

## Alternatives considered

- **Duplicating logic between client and server.** Rejected; guarantees drift
  and breaks the "identical inputs → identical outputs" contract.
- **Putting the logic in the API only.** Rejected; the web needs live scoring
  previews (the tailoring workspace), and testing UI-embedded logic is harder.
