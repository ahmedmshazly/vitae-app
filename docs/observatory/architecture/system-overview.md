---
id: ARC-OVERVIEW
title: The system in one view
summary: Eight workspace packages, what each one owns, and the dependency rule that stops them collapsing into one another.
audience: [developer, maintainer]
domain: architecture
type: explanation
status: verified
verified_at: 2026-08-24
sources:
  - docs/generated/packages.json
  - docs/generated/atlas-summary.json
  - packages/core/src/index.ts
  - packages/ui/package.json
  - packages/config/package.json
  - packages/testkit/package.json
  - apps/api/src/db/repository.ts
  - apps/web/package.json
  - services/buildsvc/src/server.ts
  - e2e/playwright.config.ts
requirements: [FR-019, NFR-MNT-002, INT-2]
covers:
  - package:@vitae/core
  - package:@vitae/ui
  - package:@vitae/config
  - package:@vitae/testkit
  - package:@vitae/api
  - package:@vitae/web
  - package:@vitae/buildsvc
  - package:@vitae/e2e
related: [ARC-REQUEST, ARC-GRAPH, ARC-ALGORITHMS, ARC-SECURITY]
---

# The system in one view

## In short

Vitae is one repository holding eight packages. Two of them are the product a
person uses - a browser application and an HTTP API - and two more are the
shared libraries it is built from: the domain model with its algorithms, and the
design system. The remaining four are supporting parts - the environment
schema, the test fixtures, a container that turns LaTeX into a PDF, and the
browser acceptance suite.

The organising decision is that the thinking lives in the shared domain package
and not in the API or the browser. Ranking, parsing and selection are pure
functions over plain data, so the same code runs on both sides of the network
and can be tested without a database, a browser or a network.

## How it works

The eight packages form two layers and no cycles. Four packages depend on
nothing inside the repository; four depend only on packages in the layer below.
Nothing depends on the API, and nothing depends on the browser application:
those two are the top of the graph, which is what makes it safe to change either
one without reading the other.

The seam between the API and the browser is the HTTP contract, not a shared
module. The browser cannot import a server module, so a change to how a record
is stored cannot leak into a screen by accident. What the two genuinely share -
the node and edge vocabulary, the validation schemas, the algorithms, the
résumé plan - lives in one place that both may import.

Inside the API there is a second rule with the same shape: a route may call a
service, a service may call the repository, and only the repository knows how a
record reaches Postgres. That rule is written into `apps/api/src/db/repository.ts`
as the reason the file exists, after an earlier storage engine let it erode into
several hundred direct database calls spread across the codebase.

The two lower layers are deliberately ignorant. The design system knows nothing
about careers - it exports inputs, dialogs and glyph shapes, and would serve a
different product without noticing. The build service knows nothing about
résumés - it receives a LaTeX document and returns a PDF. Neither can be
tempted into a domain decision, because neither has the vocabulary to express
one.

## Mechanics

The counts below come from `docs/generated/packages.json`, which is derived
from the manifests and the import graph. Read it for the exact dependency
lists, script coverage and per-package export counts; the rules are here.

### The two shared libraries

`@vitae/core` (`packages/core`) owns the domain vocabulary: the node and edge
type unions, the Zod envelope and per-type property schemas, the form
descriptors, the deterministic algorithms, and the hosted plan contract. It is
pure TypeScript with no I/O and no workspace dependencies. **Nothing in the
repository may be imported by it; everything else may import it.** That
direction is the whole point - a shared shape defined anywhere else would need
two definitions or a dependency pointing the wrong way, which is what FR-019
forbids. Its entry point is one of the most depended-on modules in the
repository.

`@vitae/ui` (`packages/ui`) owns the design system: the token stylesheets, the
form and overlay primitives, and the entity glyphs. It depends on no workspace
package and declares React only as a peer dependency, so it cannot pull a
second copy of React into the application bundle. **It may not import
`@vitae/core`, and only the browser application may import it.** Keeping the
domain out of it is what stops a primitive growing a `person` special case. It
is the most depended-on code in the repository, and - as the documentation
audit records - the one package whose 226 test cases no continuous-integration
job runs, so a regression in it would reach nearly every screen unseen.

### The two supporting libraries

`@vitae/config` (`packages/config`) owns the environment contract: one
Zod schema that parses the server's configuration at boot, refuses to start on a
missing or malformed value, and additionally refuses combinations that are each
valid alone but unsafe together in production. **Only the API imports it.** It
publishes TypeScript source through its `exports` map rather than a build
output, which is why it is type-checked as a side effect of every consumer even
though it declares no `typecheck` script of its own.

`@vitae/testkit` (`packages/testkit`) owns deterministic factories, fixed
clocks and fixtures shared between suites. It depends on `@vitae/core` for the
shapes it builds. **It is a development dependency of the API and must never be
imported by production code** - a factory reachable from a route is a way to
write fixture data into a real graph.

### The two product packages

`@vitae/api` (`apps/api`) owns the HTTP surface, the services that orchestrate
it, the repository, the migrations and the operational scripts. It depends on
`@vitae/config` and `@vitae/core`. **Nothing depends on it.** Within it the
layering rule is route → service → repository, and the repository is the only
module permitted to know the storage shape.

`@vitae/web` (`apps/web`) owns the browser application: routing, screens, the
query cache and the typed fetch client. It depends on `@vitae/core` and
`@vitae/ui`. **Nothing depends on it, and it may not depend on the API.** Its
manifest still describes it as a React 18 application while it pins React 19;
the generated package catalog reproduces that description faithfully because it
reads the manifest, so treat the pinned version as the fact.

### The two standalone services

`@vitae/buildsvc` (`services/buildsvc`) owns LaTeX compilation. It is a
container running Tectonic and poppler, reached only over HTTP with a signed
request, with its package cache warmed at image build time and no runtime
network. It exports nothing and is imported by nothing. **The only way to reach
it is the HTTP boundary**, which is what lets it be sandboxed as hard as it is.

`@vitae/e2e` (`e2e`) owns the browser acceptance suite. It has no source files
at all - every file in it is a test - and nothing imports it. **It depends on
the built product from outside, never on its modules**, which is also why
nothing type-checks it: it declares neither a `typecheck` nor a `build` script,
so its 250 cases are compiled only at the moment Playwright runs a file.

### What the shape guarantees

The import graph has no cycles and exactly five cross-package edges. Every
manifest dependency is used and every import is declared, so the manifests and
the graph agree. Two packages are skipped by the workspace type-check as units
(`@vitae/buildsvc`, `@vitae/e2e`), and two have no tests of their own
(`@vitae/config`, `@vitae/buildsvc`); both facts are recorded in the generated
catalog's summary rather than inferred here.

## Related

- [What happens to a request](request-lifecycle.md) follows one call across
  these seams in order.
- [The typed career graph](career-graph.md) is what the shared domain package
  actually defines.
- [The deterministic algorithms](algorithms.md) covers every module in that
  package's algorithm directory.
- [Trust boundaries and data handling](security.md) explains why the build
  service and the environment schema are shaped the way they are.
- [Design](../design/index.md) documents the design system this page only
  places in the dependency graph.
