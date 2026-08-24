---
id: DEV-ENDPOINT
title: Adding an API endpoint
summary: A procedure for adding an operation to the v1 API — the route, the service, the tests, the map entry, the OpenAPI refresh, and the gates that judge each.
audience: [developer]
domain: develop
type: task
status: verified
verified_at: 2026-08-24
sources:
  - apps/api/src/app.ts
  - apps/api/src/routes/v1/index.ts
  - apps/api/src/routes/v1/duplicates.ts
  - apps/api/src/openapi/mounts.ts
  - apps/api/src/openapi/spec.ts
  - apps/api/src/openapi/generate.ts
  - apps/api/src/middleware/error.ts
  - apps/api/src/middleware/auth.ts
  - apps/api/src/middleware/workspace.ts
  - apps/api/src/__tests__/helpers/app.ts
  - apps/api/src/__tests__/contracts/openapi.contract.test.ts
  - apps/api/src/__tests__/contracts/error-envelope.contract.test.ts
  - docs/testing/source-test-map.json
related: [DEV, DEV-WHERE, DEV-TESTING, DEV-GATES]
---

# Adding an API endpoint

## What you are adding to

The v1 API is 137 registered operations across 34 mount prefixes. One router
file owns each prefix, `apps/api/src/routes/v1/index.ts` mounts them all onto
`v1Router`, and `apps/api/src/app.ts` mounts `v1Router` at `/api/v1` behind
three middlewares that apply to everything under `/api`: the authentication
gate, the workspace resolver, and the entitlement gate.

Nothing you add is exempt from those three by default, which is the point of
mounting them at the prefix rather than annotating routes. Read
[the four things that are true of your endpoint before you write
it](#four-things-that-are-already-true-of-your-endpoint) before deciding where
the operation goes.

Two paths through this page: [an operation on a mount that already
exists](#adding-an-operation-to-an-existing-mount), which is most changes, and
[a new mount prefix](#adding-a-new-mount-prefix), which adds four steps.

## Four things that are already true of your endpoint

**It requires authentication.** `authGate` is mounted at `/api`, so every path
below it is default-deny. The gate's public-path list is matched against
`req.baseUrl + req.path`, which under that mount always begins `/api`, so an
entry there has to be spelled in full — `/api/v1/auth/logout`, not `/logout`.
An endpoint that must be reachable with no identity at all is better registered
above the gate in `app.ts`, which is how the liveness and readiness endpoints
work.

**It is blocked in a read-only workspace if it writes.** `entitlementGate`
refuses any method other than `GET`, `HEAD` or `OPTIONS` when the workspace's
access state is `read_only` or `deletion_pending`, returning
`402 PAYMENT_REQUIRED`. Three paths are exempt because a customer must always
be able to leave or to pay: `/api/v1/export`, anything under `/api/v1/billing`,
and `/api/v1/auth/logout`. The rule is method-based on purpose, so a missing
annotation cannot leave a mutation writable. If your new write operation must
work in that state, it needs an explicit allowance in that gate and a reason.

**Its request body is capped at 2 MB.** Express runs body parsers in
registration order, and `app.ts` registers a 15 MB parser for
`/api/v1/imports` before the 2 MB default. A router-local parser added later
never gets a say. If your endpoint accepts something large, it belongs on the
imports mount or it needs its own parser registered in `app.ts` above the
default.

**Its errors have one shape.** Every error response is
`{ error: { code, message, details?, request_id } }`, produced centrally by
`errorHandler`. A contract suite asserts that shape on 401, 404, 422 and 400.

## Adding an operation to an existing mount

### 1. Put the work in a service

`apps/api/src/services/` is where application logic goes. A route reads the
request, calls a service, and shapes the response; it does not reach the
database directly. Keeping the work in a service is what makes it testable
without a request, and it is the convention every existing router follows.

### 2. Add the handler

Open the router for the mount you are extending and add the operation. The
shape is uniform across the codebase:

```ts
const checkSchema = z.object({
  limit: z.number().int().min(1).max(20).optional(),
});

widgetsRouter.post(
  '/check',
  asyncHandler(async (req, res) => {
    const parsed = checkSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(422, 'VALIDATION', 'invalid widget check', parsed.error.issues);
    }
    res.json(await checkWidget(parsed.data));
  }),
);
```

Three things are doing work there.

`asyncHandler` wraps the async function so a rejection reaches the error
middleware instead of hanging the request. Every async handler in this codebase
is wrapped; an unwrapped one is a bug that shows up as a timeout.

`safeParse` and an explicit `HttpError(422, 'VALIDATION', …, issues)` is the
validation idiom. Passing the Zod issues as the fourth argument puts them in
`error.details`, which the contract suite checks for on a 422.

`HttpError(status, code, message, details?)` is how a route chooses a status.
The two repository errors map themselves: `ValidationError` becomes 422
`VALIDATION` and `NotFoundError` becomes 404 `NOT_FOUND`, so a service that
throws them needs nothing from the route.

Imports are relative with an explicit `.js` extension —
`import { asyncHandler, HttpError } from '../../middleware/error.js'`. There are
no path aliases, and `apps/api` compiles under `NodeNext`, which requires the
extension.

### 3. Write the test

Route suites sit beside the router as `<name>.integration.test.ts` and drive
the whole application through the shared helper:

```ts
import { authHeader, getAuthedApp } from '../../__tests__/helpers/app.js';

const { app, token } = await getAuthedApp();
const res = await request(app).post('/api/v1/widgets/check').set(authHeader(token)).send({ limit: 5 });
```

`getAuthedApp()` boots the Express application once per worker and mints a
developer token. These suites need Postgres — `pnpm dev:db` first — and they
create and migrate their own `vitae_test` database rather than touching the one
you seeded.

Cover the error path as well as the happy one. The contributing guide asks for
an error, authorisation or empty-state case wherever the behaviour has one, and
the risk classes in the coverage matrix expect a negative path on anything
critical.

### 4. Add the map entry

This step is easy to miss and the gate will not let you.

The route suite drives the application through the helper rather than importing
the router, so the source-to-test gate does not count it as a sibling test —
see [what counts as a test beside
it](testing.md#what-counts-as-a-test-beside-it). A router file therefore needs
an entry in `docs/testing/source-test-map.json`:

```json
"apps/api/src/routes/v1/widgets.ts": {
  "risk": "high",
  "layers": ["integration"],
  "status": "covered",
  "tests": ["apps/api/src/routes/v1/widgets.integration.test.ts"]
}
```

You only add an entry for a **new file**. Adding an operation to a router that
already exists needs no map change, though it is worth checking that the entry
still names every suite that proves it.

### 5. Refresh the generated artifacts

```bash
pnpm openapi     # rewrites docs/api/openapi.json
pnpm docs:gen    # rewrites docs/generated/*.json
```

The first is only needed when you have edited `apps/api/src/openapi/spec.ts`.
The second is needed for any route change at all, because
`docs/generated/api.json` is derived from the routers and `pnpm docs:check`
re-runs every generator and fails on a stale artifact.

## Adding a new mount prefix

Four extra steps, in this order.

**Create the router file.** `apps/api/src/routes/v1/widgets.ts`, exporting
`export const widgetsRouter: Router = Router();`.

**Mount it.** Add `v1Router.use('/widgets', widgetsRouter);` in
`routes/v1/index.ts`. Registration order matters where one prefix is a prefix
of another: `/people/:personId/favors` is registered before `/people` for
exactly that reason.

**Declare the prefix.** Add it to `V1_MOUNT_PREFIXES` in
`apps/api/src/openapi/mounts.ts`. Express parameters are written in OpenAPI
form there — `:personId` becomes `{personId}`. Both the OpenAPI builder and the
contract suite import this list, and the generated API catalog compares the
declared list against the mounted one, so a mismatch in either direction is
reported by `pnpm docs:check` as a stale artifact.

**Document at least one operation.** The contract suite requires a documented
path for every declared prefix. Be aware of how that requirement is currently
satisfied: `stubPathsForMounts()` emits a placeholder `GET` for any prefix with
no hand-written path, so the requirement passes whether or not you write
anything. Today 47 of the 137 operations are described in detail and the rest
are covered by stubs. Writing a real operation in `detailedPaths()` is what
makes the document useful to a client; the gate will not make you.

## What the gates will catch

| Mistake | Which gate | What you see |
| --- | --- | --- |
| Un-awaited repository call inside a transaction | `pnpm lint` | `no-floating-promises`, an error rather than a warning |
| Relative import missing its `.js` | `pnpm typecheck` | unresolved module under `NodeNext` |
| New router file with no map entry | `pnpm test:map` | `Unmapped production modules (1): apps/api/src/routes/v1/widgets.ts` |
| Map entry naming a test that is not there | `pnpm test:map` | `…: missing test …` |
| Mount registered but not declared, or the reverse | `pnpm docs:check` | `docs/generated/api.json` reported stale |
| Edited the OpenAPI builder without regenerating | `pnpm test:contract` | the committed document does not equal the generated one |
| An error path that does not use the envelope | `pnpm test:contract` | the envelope assertion fails |
| An em dash or a filler phrase in a test title | `pnpm test:prose` | `<file>:<line>: title matches …` |

Nothing checks that your endpoint is reachable from the product. Five modules
in this repository are imported only by their own tests; an endpoint with no
caller joins them silently.

## Verifying

```bash
pnpm dev:db
pnpm typecheck
pnpm lint
pnpm test:map
pnpm --filter @vitae/api test -- --passWithNoTests=false
pnpm test:contract
pnpm docs:check
```

`--passWithNoTests=false` is the flag the pipeline uses. A suite that skips
itself must fail rather than pass, which is how authentication and revision
coverage once went missing.

## Related

[Where a change belongs](where-to-change.md) covers the route, service and
repository split this procedure assumes. [The gates a change must
pass](quality-gates.md) is the reference for every gate named above. [How this
repository tests itself](testing.md) explains the source-to-test map in full.
