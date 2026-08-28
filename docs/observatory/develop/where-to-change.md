---
id: DEV-WHERE
title: Where a change belongs
summary: Eight workspaces in two layers, five edges between them, and the rule that decides which one owns a change, plus what really holds the boundary.
audience: [developer, maintainer]
domain: develop
type: explanation
status: verified
verified_at: 2026-08-24
sources:
  - pnpm-workspace.yaml
  - packages/core/package.json
  - packages/ui/package.json
  - packages/config/package.json
  - packages/testkit/package.json
  - tsconfig.base.json
  - apps/api/tsconfig.json
  - apps/web/tsconfig.json
  - apps/api/src/app.ts
  - apps/api/src/routes/v1/index.ts
  - eslint.config.js
  - docs/generated/packages.json
related: [DEV, DEV-SETUP, DEV-TESTING, DEV-GATES, DEV-ENDPOINT, DEV-NODETYPE, DEV-TEMPLATE]
---

# Where a change belongs

## In short

The repository is eight workspaces. Three of them hold nearly everything you
are likely to change: `packages/core` is the vocabulary and the deterministic
logic, `apps/api` is the HTTP surface over Postgres, and `apps/web` is the
screens. The rule for deciding between them is about dependencies, not about
subject matter: anything that has to be identical on both sides of the wire, or
that has to produce the same answer twice, belongs in `packages/core`, because
that is the only workspace both applications can import. Everything else stays
where its side effects are.

## How it works

### Two layers, five edges

`pnpm-workspace.yaml` takes in `apps/*`, `packages/*`, `services/*` and `e2e`,
which is eight workspaces. The dependency graph between them has exactly five
edges, and they sort into two layers with nothing cyclic:

| Layer | Workspaces | Depends on |
| --- | --- | --- |
| Foundation | `@vitae/config`, `@vitae/core`, `@vitae/ui`, `@vitae/buildsvc`, `@vitae/e2e` | nothing in the workspace |
| Applications | `@vitae/api`, `@vitae/web`, `@vitae/testkit` | the foundation |

`@vitae/api` imports `@vitae/core` and `@vitae/config`. `@vitae/web` imports
`@vitae/core` and `@vitae/ui`. `@vitae/testkit` imports `@vitae/core`. That is
the whole graph. Nothing else crosses a package boundary, and the generated
package catalog carries the same five edges, derived from the imports rather
than from the manifests.

Two consequences follow, and they are the reason the graph is worth knowing.
The web application never sees `@vitae/config`: it reads configuration through
Vite's own `import.meta.env`, so an environment key added for the API is not
automatically available to a screen. And nothing outside `apps/web` imports
`@vitae/ui`, which makes the design system a leaf that only one consumer can
break - and, as [the gates page](quality-gates.md) records, one whose own tests
no gate runs.

### Inside the API

`apps/api/src/app.ts` is the application factory, and reading it top to bottom
is the fastest way to understand what happens to a request. The order of
registration is load-bearing rather than incidental: the provider webhook is
mounted before any JSON parser because its signature is over the raw bytes, the
import route's larger body limit is registered before the default one because
Express runs body parsers in registration order, and the health endpoints are
registered above the authentication gate rather than declared public.

Below that, three directories and a rule:

- `routes/v1/` - one router per mount prefix, registered in `routes/v1/index.ts`.
  Routes stay thin: read the request, call a service, shape the response.
- `services/` - the application work. This is where a new behaviour normally goes.
- `db/` - persistence. `repository.ts` owns reads and writes, soft deletion,
  transactions and the revision trail; `space.ts` owns the tenancy scoping that
  every query runs inside.

The rule is that a route may not talk to the database directly and a repository
may not know about HTTP. It is a convention rather than a compiled constraint,
and it is what keeps a behaviour testable without a request.

### Inside the web application

`apps/web/src/` splits by lifespan rather than by feature:

- `app/` - the shell, the route table, the command palette registry. Long-lived.
- `routes/` - one module per screen, grouped into `career/`, `marketing/`,
  `reference/`, `tailor/`, `workspaces/` and `docs/`. Screens are lazily loaded
  from `App.tsx`, which is why a new screen costs almost nothing in the entry
  bundle and why a screen imported eagerly costs a great deal.
- `features/` - cross-screen behaviour: capture, the quick switcher, bulk
  actions, forms.
- `components/`, `lib/`, `styles/` - application-local presentation, helpers
  and stylesheets.

A component that more than one application could use belongs in `@vitae/ui`
instead. A component that only this application uses does not: `@vitae/ui` is
imported by every screen, so anything added there is paid for by all of them.

### What the packages own

`packages/core` owns the vocabulary and the deterministic logic: the node and
edge type unions and their Zod schemas under `schema/`, the form descriptors
under `forms/`, and nineteen algorithm modules under `algorithms/`. Nothing in
it performs I/O, and nothing in it is allowed to be non-deterministic - the same
inputs must produce the same outputs, and there are tests that assert exactly
that. It is the only workspace both applications import, which is why anything
that must agree across the wire lives here.

`packages/ui` owns the design system: components, hooks and the stylesheets that
define the tokens. `packages/config` owns one file, the environment schema.
`packages/testkit` owns fixture factories and a controllable clock, so test data
stays schema-valid instead of drifting into shapes the product cannot produce.

`services/buildsvc` is the LaTeX compiler, and it is deliberately not part of
the pnpm dependency graph at build time: it has its own lockfile and is built
inside its own container. `e2e` holds the browser suite.

## Mechanics

### Imports are relative, with an explicit `.js`

There are no path aliases in this repository. No `tsconfig.json` anywhere in
the tree declares `paths` or `baseUrl`. Every intra-package import is a relative
path with an explicit `.js` extension, including from a `.ts` file:

```ts
import { asyncHandler, HttpError } from '../../middleware/error.js';
import { EDGE_TYPES, NODE_TYPES } from '../types.js';
```

The extension is not a style choice. `apps/api/tsconfig.json` sets
`moduleResolution: "NodeNext"`, which requires it. `packages/core` is compiled
by that same resolver whenever the API imports it, so core's own relative
imports have to carry the extension too, even though the web build resolves
them under `Bundler` and would not have insisted. Writing `'./auth'` inside the
API is a type error; writing it inside core is a type error at the API's
expense, several files away from where you typed it.

Cross-package imports use the package name, and only the subpaths the package
publishes.

### What actually holds the boundary

Each package's `exports` map is the boundary, and it is a narrow one:

| Package | Published subpaths |
| --- | --- |
| `@vitae/core` | `.`, `./schema`, `./algorithms` |
| `@vitae/ui` | `.`, plus five stylesheets under `./styles/` |
| `@vitae/config` | `./env` only |
| `@vitae/testkit` | `.`, `./clock`, `./ids`, `./factories` |

An import of an unpublished subpath, say `@vitae/core/src/algorithms/dedup.js`,
does not resolve. That is the mechanism that stops one workspace reaching into
another's internals, and it fails at build time in both the type checker and the
bundler.

> [!IMPORTANT]
> The header of `eslint.config.js` states that the configuration "enforces the
> module boundary (INT-2 / NFR-MNT-002): nothing outside packages/core may reach
> into another workspace's internals." No rule in that file does so. The
> configuration's rules are the React hook diagnostics, unused variables,
> consistent type imports, and two type-aware rules scoped to `apps/api`
> (`no-floating-promises` and `await-thenable`). There is no restriction on
> imports anywhere in it. The boundary is real, but it is the `exports` maps
> above that hold it, not the linter. Treat the header as a description of
> intent that has outlived its implementation, and do not rely on lint to catch
> a boundary violation.

### Which workspace owns which change

| The change | Where it goes | Why |
| --- | --- | --- |
| A new field on an existing record type | `packages/core/src/schema/node-props.ts` | one schema, validated identically on both sides |
| A new record or relationship type | `packages/core/src/types.ts`, then its registries | see [adding a node or edge type](add-a-node-type.md) |
| A new HTTP operation | `apps/api/src/routes/v1/` plus a service | see [adding an API endpoint](add-an-endpoint.md) |
| New application logic behind an endpoint | `apps/api/src/services/` | keeps the route thin and the behaviour testable without a request |
| A new query, index or column | `apps/api/src/db/` and a new migration | migrations are append-only and numbered |
| A scoring, ranking or selection rule | `packages/core/src/algorithms/` | determinism is asserted, and the constants are catalogued |
| A new screen | `apps/web/src/routes/`, lazily loaded from `App.tsx` | keeps it out of the entry bundle |
| A reusable primitive or a token | `packages/ui` | every screen pays for it, so it has to be worth it |
| A new environment key | `packages/config/src/env.ts` and `.env.example` | the schema is the declaration; the example is the documentation |
| A résumé layout | `templates/` and the compiler service | see [adding a résumé template](add-a-resume-template.md) |

### Two rules that are easy to break by accident

**A screen that must not enter the entry bundle must be lazily imported.** The
bundle-size gate has a total budget and a largest-chunk budget, and the graph
explorer's rendering library alone is over a megabyte. It stays out of the entry
graph by being lazily loaded twice over. An eager import of a heavy screen shows
up as a budget failure in the production build job, not in local development.

**A behaviour added to a service is not reachable until a route exposes it.**
Five production modules in this repository are imported by nothing but their own
tests. They are tested, and they pass, and no part of the product reaches any of
them. Adding a service function without wiring it to a route produces exactly
that state, and no gate reports it.

## Related

[How this repository tests itself](testing.md) explains what has to prove the
change once you have placed it. [The gates a change must
pass](quality-gates.md) is the reference for what will refuse it. The three worked procedures -
[an endpoint](add-an-endpoint.md), [a node or edge type](add-a-node-type.md),
[a résumé template](add-a-resume-template.md) - each take one of the rows above
end to end.

The reasoning behind the layering itself, rather than its current shape, is in
[Architecture](../architecture/index.md).
