---
id: ARC-REQUEST
title: What happens to a request
summary: One call from the browser through the middleware stack to a router, a service and the repository, and the gates it passes on the way.
audience: [developer, security]
domain: architecture
type: explanation
status: verified
verified_at: 2026-08-24
sources:
  - apps/api/src/app.ts
  - apps/api/src/middleware/request-context.ts
  - apps/api/src/middleware/auth.ts
  - apps/api/src/middleware/workspace.ts
  - apps/api/src/middleware/error.ts
  - apps/api/src/middleware/health.ts
  - apps/api/src/db/space.ts
  - apps/api/src/db/timezone.ts
  - apps/api/src/routes/v1/index.ts
  - apps/api/src/openapi/mounts.ts
  - apps/api/src/openapi/spec.ts
  - apps/api/src/__tests__/contracts/openapi.contract.test.ts
  - apps/web/src/lib/api.ts
  - apps/web/src/main.tsx
  - docs/generated/api.json
requirements: [FR-010, FR-014, FR-025, FR-026, FR-102]
related: [ARC-OVERVIEW, ARC-SECURITY, ARC-CLOUD, ARC-PERSISTENCE]
---

# What happens to a request

## In short

Every call from the browser carries three things the server cannot work out for
itself: who is asking, which data partition to read, and what timezone the
person is in. It then passes a fixed stack of middleware in a fixed order,
lands on one of thirty-three mounted routers, and reaches a service that
composes work and a repository that talks to Postgres.

The order of that stack is not decoration. Two of the steps are only correct
because of where they sit relative to the others, and one of them — the payment
webhook — has to run before the request body is parsed at all, or its signature
stops verifying.

## How it works

The browser sends its request through one typed client, so there is exactly one
place where transport policy is decided. That client attaches the session
(a cookie in local development, a bearer token in production), the data-space
selector, and the browser's IANA timezone. Even file downloads go through it,
because a download issued with a bare `fetch` once inherited only the cookie —
which meant it failed in a bearer-only production and, worse, quietly exported
the real graph while the person was looking at demonstration data.

On the server the request meets middleware in registration order. First come
the parts that must observe everything: a request identifier, the security
headers, and the cross-origin allow-list. Then the body parsers. Then the
per-request context — data partition and timezone — held in async-local storage
so that any code reached from this request can ask for them without threading a
parameter through every call.

Only after all of that does the default-deny gate appear, mounted at the API
prefix. Everything registered above it is reachable without a session; that is
a property of *position*, not of a list, and it is the single most
misunderstood thing about this stack.

Past the gate, a router hands off to a service. Services orchestrate: they read
the graph, call the pure algorithms, and stage writes. The repository is the
only thing that knows how a record becomes a row. On the way back out, the
error handler turns any thrown domain error into one stable JSON envelope, and
the access log records the route pattern, status and duration.

## Mechanics

### The transport contract

`apps/web/src/lib/api.ts` sets every outbound header in one function. A request
carries the session (a bearer `authorization` header when the sign-in provider
supplies a token, otherwise the `httpOnly` session cookie sent by
`credentials: 'include'`), the selected data space, and the browser's resolved
timezone. Ordinary calls abort after 60 seconds; downloads get ten minutes,
because an export bundle is streamed entry by entry and is legitimately slow.
Responses are cached by TanStack Query with a five-second staleness window, no
retry and no refetch on window focus (`apps/web/src/main.tsx`) — a deliberately
dull cache, because the interesting invalidation happens on the server.

The timezone header exists because "today", "overdue", a habit streak and an
anniversary are calendar-date questions, and a calendar date does not exist
without a zone. The server previously derived all of them from a UTC timestamp,
which was wrong for several hours a day for anyone not on UTC.

### The order of the stack

`apps/api/src/app.ts` registers, in this order: request context, CSP nonce,
security headers, the cross-origin allow-list, the payment webhook with a raw
body parser, an enlarged JSON parser scoped to the import prefix, the default
JSON parser, cookie parsing, the data-space context, the timezone context, the
two health probes, the authentication gate, the workspace resolver, the
entitlement gate, and finally the versioned router. The error handler is last.

The whole path, with every place it can be refused:

```diagram
DGM-REQUEST-LIFECYCLE
```

Three of those positions are load-bearing.

**The payment webhook is registered before any JSON parser** (`app.ts:50`). Its
signature is computed over the exact bytes the provider sent; parsing and
re-serialising the body changes those bytes and invalidates the signature, so
this route takes a raw `Buffer` and nothing else may touch it first.

**The enlarged import parser is registered before the default one**
(`app.ts:51-52`). Express runs body parsers in registration order, so a
router-local parser mounted deeper never gets a say — the 2 MB default rejects
the request first. A connections export of a few megabytes therefore failed
with a generic 500 until the limit was hoisted here.

**The health probes are registered above the gate** (`app.ts:58-59`). That, and
not any allow-list, is why they answer without a session. Liveness asks whether
the process is up and never touches the database; readiness asks whether this
instance should receive traffic and fails while booting or draining, when
Postgres is unreachable, or when the build service is unreachable in production.
Readiness is bounded and cached, because a probe that hangs takes the instance
down with it.

### Per-request context

Two pieces of state travel with the request through async-local storage rather
than through function arguments: the storage partition and the timezone. The
repository resolves the partition on every call rather than caching it, so the
async context genuinely governs it; the same mechanism is what lets a
maintenance script run inside an explicit partition without any request at all.
[Storage, migrations and versioning](persistence.md) covers what the partition
means, and [The Cloud workspace and billing plane](cloud-plane.md) covers how it
is chosen when tenancy is on.

### The gates

Three middlewares sit at the API prefix, in this order:

1. **Authentication** proves an identity and refuses everything else with a
   neutral 401 that never reveals what would have been accepted.
2. **Workspace resolution** turns that identity into a tenant partition. It is a
   no-op unless the hosted mode is enabled.
3. **Entitlement** blocks state-changing methods when a workspace's lifecycle
   has gone read-only. It is method-based rather than route-annotated
   deliberately, so a route added without an annotation fails closed instead of
   staying writable.

The generated API catalog labels every endpoint with the gate that applies to
it. Of 135 registered endpoints it records 129 as authenticated, 3 as public
within the gate, and 3 as sitting outside it entirely.
[Trust boundaries and data handling](security.md) explains each of those six and
why it is where it is.

### Mounts, routers and the API description

The versioned router mounts thirty-three prefixes. The same list is declared
separately in `apps/api/src/openapi/mounts.ts`, and a contract test imports both
the declared list and the generated document and asserts that every prefix has
at least one documented path.

That assertion is worth understanding before trusting the OpenAPI document.
`apps/api/src/openapi/spec.ts:60` defines `stubGet`, and `:471` emits one
placeholder operation for each mount prefix that the hand-written paths do not
already cover. The contract test therefore passes on full mount coverage while
the document describes a minority of the operations: 48 paths and 52 operations
against 135 registered endpoints, of which 46 are documented and 6 documented
operations are not registered as routes at all.

**Use `docs/generated/api.json` as the API's description, not
`docs/api/openapi.json`.** The generated catalog is derived by walking the
routers and joining to the declared mount list, so it reports what is actually
served, with each endpoint's source location, gate, schemas and tests.

### The error contract

Every error leaves as `{ error: { code, message, details?, request_id } }`.
Validation failures are 422 with field-level detail, missing records are 404,
and a thrown `HttpError` carries its own status and code. Body-parser failures
are mapped explicitly — oversized to 413, unparseable to 400, unsupported
encoding to 415, an interrupted upload to 400 — because they used to fall
through to the generic handler and tell a person that something went wrong when
the real answer was that their file was too large. Anything unrecognised is
logged with the request id and answered with a neutral 500.

### Reading the graph once

Several read models need the whole graph. The rule (FR-102) is that a request
loads it once and threads it, rather than each helper reading it again: the
dashboard aggregate loads the graph and the atoms table once and passes them to
every consumer. On the write side, a committed transaction bumps an in-process
generation counter; memoised read models and the search index compare
generations and rebuild only when the graph actually moved.

## Related

- [Trust boundaries and data handling](security.md) is the full account of the
  authentication gate and the public surface.
- [The Cloud workspace and billing plane](cloud-plane.md) covers the workspace
  and entitlement middlewares in the mode where they do something.
- [Storage, migrations and versioning](persistence.md) picks up where the
  repository is reached.
- [The system in one view](system-overview.md) places these seams in the
  package graph.
