---
id: ARC-CLOUD
title: The Cloud workspace and billing plane
summary: The tenant partition, where isolation is enforced and where it is caller-supplied, how the payment webhook authenticates, and what a default build holds closed.
audience: [maintainer, security, operator]
domain: architecture
type: explanation
status: gated
verified_at: 2026-08-24
sources:
  - apps/api/src/db/migrations/007-cloud-control-plane.ts
  - apps/api/src/db/migrations/008-billing-event-ordering.ts
  - apps/api/src/db/migrations/009-workspace-primary-keys.ts
  - apps/api/src/db/migrations/010-legacy-space-default-workspace.ts
  - apps/api/src/middleware/workspace.ts
  - apps/api/src/services/control-plane.ts
  - apps/api/src/cloud/config.ts
  - apps/api/src/cloud/paddle.ts
  - apps/api/src/routes/v1/billing.ts
  - apps/api/src/routes/v1/auth.ts
  - apps/api/src/routes/webhooks/paddle.ts
  - apps/api/src/routes/v1/cloud.integration.test.ts
  - apps/api/src/db/space.ts
  - apps/api/src/index.ts
  - apps/api/src/scripts/purge.ts
  - apps/web/src/public/site.ts
  - packages/core/src/cloud/individual-plan.ts
  - docs/generated/config.json
  - docs/CLOUD-LAUNCH.md
  - GOVERNANCE.md
requirements: [FR-105]
related: [ARC-PERSISTENCE, ARC-SECURITY, ARC-REQUEST, ARC-OVERVIEW]
---

# The Cloud workspace and billing plane

## In short

Vitae has a complete hosted-service layer in the repository: a tenant partition
on every stored record, a control plane that owns identities, memberships and
subscription lifecycle, a checkout path, and a signed webhook receiver that is
the only thing allowed to grant paid access. It is switched off — a default
build does not enable it, the public surface refuses to present itself as
launched without several deliberately configured values, and nothing here
asserts that a hosted service is operating.

The schema change is not optional in the same way: the migrations that add the
tenant column and make it part of every record's identity run on every install,
self-hosted included, so the multi-tenant *shape* is always there and only the
behaviour is gated. The architecture guide, the roadmap and the changelog
mention no workspace, tenant, billing or payment provider at all. This page
exists because that silence was the largest gap in the previous documentation.

## How it works

A workspace is the unit of tenancy. Every durable record carries the workspace
it belongs to, and after the migration that promoted it, that column is part of
the record's primary key rather than merely indexed beside it. Two records with
the same identifier in two workspaces are two different records, and the
database will say so.

The value never comes from the browser. After the authentication gate has
proved an identity, a second middleware looks up that identity's memberships
and puts the resolved workspace into the request's async context. A request may
name which of its own memberships it wants; it cannot name a workspace it is
not a member of, and it cannot conjure a workspace context by asserting one.
The legacy browser-controlled partition header is ignored entirely in this mode.

Money never grants access directly. A checkout creates a provider transaction
using a plan catalog the server owns; the browser cannot choose a price, and
returning from a checkout page proves nothing. The only thing that changes what
a workspace may do is a webhook whose signature verified, applied inside a
transaction that also records the event exactly once.

The lifecycle moves forward on its own. Access states expire — a trial ends, a
payment grace period ends — and rather than depending on a scheduled worker
that might not have run, the expiry transition is evaluated when a request
resolves its workspace. It is idempotent, so a missed job cannot leave a lapsed
workspace writable.

## Mechanics

### What the partition actually is

The Cloud migration added a `workspace_id` column to all twenty-four document
tables, with a foreign key to a new control table that restricts deleting a
workspace still owning rows, a unique index on the workspace-and-identifier
pair, and an index on the workspace alone. Existing rows were assigned without
rewriting their documents: real rows to a claimable legacy workspace, demo rows
to an unassigned system workspace, both seeded by the same migration.

That index alone was not enough. As long as the legacy `(space, id)` pair
remained each table's primary key, a singleton document — one whose identifier
is a fixed string, such as the search generation marker — would collide between
two tenants. `009-workspace-primary-keys` therefore promotes the existing
unique index to be the primary key of every document table, drops the old one,
and replaces the legacy child foreign keys with workspace-aware equivalents in
the same step. After it, the workspace is the record's identity, not a filter
applied to it. A final migration adds an insert trigger so scripts and fixtures
that still write by the legacy partition alone land where they used to.

The control-plane tables are deliberately outside the graph repository.
Identities, memberships, lifecycle states, lifecycle events and provider events
are operational records, not exportable career data, and keeping them out of the
repository is what stops them appearing in an export bundle.
[Storage, migrations and versioning](persistence.md) covers the document shape
they sit beside.

### Where isolation is enforced

Four layers, in the order a request meets them.

1. **Membership resolution.** `workspaceMiddleware` runs after authentication.
   It reads the optional workspace header, resolves it against the verified
   identity's active memberships, and fails with a not-found when the requested
   workspace is not one of them or a conflict when the account has no workspace
   at all. Three authentication-control paths are exempt so that a person
   without a workspace can still discover who they are, enrol, or sign out.
2. **Async context.** The resolved workspace is placed in async-local storage
   for the rest of the request. The repository reads it on every call rather
   than caching it, filters every read and every write on it, and directs its
   upserts at the tenant key — the migration comment is explicit that
   conflicting on the legacy key could let a reused identifier overwrite
   another tenant's row.
3. **The database.** The primary key and the foreign keys make cross-tenant
   collision a constraint violation rather than a silent overwrite.
4. **Derived caches and external keys.** The in-memory search index is
   instantiated once per workspace, keyed by the same server-derived value, and
   an uploaded file's storage identifier is namespaced by workspace so that two
   tenants uploading identical bytes do not share an object.

The browser-controlled legacy partition header is short-circuited in this mode:
the compatibility middleware installs a fixed context and never reads it.

### Where it depends on the caller passing the right value

Everything above holds inside a request. Outside one there is no async context,
and `currentWorkspaceId()` falls back to the legacy workspace, or to the system
demo workspace when the process-level space variable says so. A script, a
background job or anything else running outside a request therefore operates on
the legacy workspace **by default**, and the only way to change that is for the
caller to wrap the work in `runInWorkspace` with an identifier it supplies
itself.

The two maintenance paths that exist today do this correctly and are worth
reading as the pattern: the retention purge — both the daily interval on the
running process and the command-line script — asks the control plane for the
active non-system workspaces and wraps each one, falling back to the legacy
two-space behaviour when the hosted mode is off. Any new job must do the same;
nothing enforces it, and forgetting it is not an error but a silent operation on
the wrong tenant.

One further caller-supplied boundary: the export lock is a process-local set
keyed by workspace (FR-105). It serialises exports within one instance and,
as its own comment says, would need a shared lease to hold across several.

### Entitlement is method-based on purpose

A separate gate runs after workspace resolution. When a workspace's access state
is read-only or pending deletion, it refuses every method that is not a read,
allowing only export, billing management and sign-out through. It is written
against the HTTP method rather than a per-route annotation deliberately: a route
added without an annotation then fails closed instead of remaining writable.
The refusal carries a payment-required status, the access state and the action
that would resolve it, so the interface can say something specific.

### Lifecycle states and how they move

Five access states exist: trialing, active, past due, read-only, and pending
deletion. Two things move between them.

The states a hosted workspace can be in, and what moves it between them:

```diagram
DGM-SUBSCRIPTION-LIFECYCLE
```

**Expiry**, evaluated when a request resolves its workspace. A trial past its
end date, or a payment grace period past its end, becomes read-only and gets a
deletion date scheduled from the export grace window. The transition is
idempotent and writes a lifecycle event, and the code says plainly why it lives
on the request path: a missed worker run must not leave a lapsed workspace
writable. There is no lifecycle worker in the repository; a future one would
call the same function.

**Provider events**, applied only from verified webhooks. A malformed or
unreadable state in the control row resolves to read-only rather than to
anything permissive, so a corrupt row fails closed at the request gate.

### Enrolment

Bootstrap is idempotent and is deliberately not a public route, even though the
identity endpoint beside it is, because it creates a private workspace and
starts a trial. It refuses when a verified email already belongs to a different
account identifier, rather than merging two people. A first-time user gets
exactly one personal workspace on a trial. The configured legacy owner gets a
one-time claim on the pre-Cloud graph — taking ownership of the legacy workspace
if and only if it is still unowned — rather than a silent copy of the data.
Billing control rows are created before any checkout is requested, so the
workspace's own record of its state exists even if the person closes the
checkout overlay. Every branch writes a lifecycle event.

### How the payment path authenticates

**Checkout** builds a provider transaction from the server-owned plan catalog
and a price identifier that comes from deployment configuration. The browser
supplies only which billing interval it wants, validated against the two the
plan defines. Custom data on the transaction carries the workspace, the user,
the plan code and the interval, which is what lets a later webhook be attributed.
No entitlement is inferred from a return URL, and the customer portal link never
changes access locally.

The webhook has no session to check, so this is what it does instead:

```diagram
DGM-BILLING-WEBHOOK
```

**The webhook** is the only thing that grants access, and it is the one route in
the system that answers without a session on the strength of a shared secret.
It is registered above every JSON parser because the signature covers the exact
bytes the provider sent. Verification requires a timestamp within five seconds,
validates the candidate digest's textual form and length before comparing so
that malformed input is a clean false rather than an exception, and compares in
constant time. With the hosted mode off, the handler returns a not-found before
doing anything else.

A verified event is then applied in one transaction:

1. Insert into the provider-event table, keyed by the provider's own event
   identifier and doing nothing on conflict. That is the exactly-once guarantee;
   a duplicate delivery returns early and changes nothing.
2. Resolve the workspace from the event's custom data. An event that names no
   known workspace is recorded as unlinked evidence, marked processed, and
   grants nothing.
3. Lock the workspace's lifecycle row first. Locking the *lifecycle* row rather
   than the subscription row is the subtle part: on the very first subscription
   event there is no subscription row to lock, so serialisation would not hold
   under concurrent delivery.
4. Order by the provider's own timestamp. Once a timestamp has been recorded, an
   older — or an entirely un-timestamped — retry can only be audit evidence; it
   must never roll a customer's entitlement backwards. The column and its index
   were added by a follow-up migration precisely for this.
5. Upsert the customer and subscription records, then apply the derived access
   state.

Provider response bodies are never forwarded to the caller. They can contain
personal and payment detail, so a failure becomes a stable application error and
the exact diagnostics stay in the provider's own logs.

### What is closed in a default build

| Surface | Gate | Behaviour when closed |
| --- | --- | --- |
| Server behaviour | `VITAE_CLOUD_ENABLED`, off in the example environment | Workspace resolution and the entitlement gate become no-ops; the legacy two-space behaviour is retained |
| Payment webhook | same | Returns a not-found before parsing |
| Billing routes | same | Return a not-found |
| Enrolment | same | Returns a conflict naming self-hosted mode |
| Public marketing surface | `VITE_PUBLIC_CLOUD_ENABLED` **and** four further public values | Stays in its pre-launch state and reports which values are missing |
| Schema | none | Applies on every install, self-hosted included |

The public surface's gate is worth stating exactly, because it is stricter than
a single flag: the site URL, a support address, a legal entity name, a terms
version and a checkout token must all be present and well-formed, and the
checkout token must look like a checkout-scoped token, before the browser will
consider the offering launched. A partially configured deployment therefore
cannot appear live in search or on a pricing page.

### What runs today, and what does not

**Runs, and is exercised by tests:** the schema and its constraints; membership
resolution; the entitlement gate; enrolment including the legacy claim;
checkout refusal when no server-owned price is configured; and webhook
verification, exactly-once recording and stale-retry rejection. Coverage is one
integration file of four cases
(`apps/api/src/routes/v1/cloud.integration.test.ts`), plus a configuration unit
suite and a browser billing screen suite.

**Does not run in a default build:** all of it. The flag is off.

**Is not built at all:** a lifecycle worker — expiry is evaluated on the request
path and nothing runs on a schedule; a cross-instance export lease; a workspace
switcher in the browser — the middleware accepts a workspace header, and no
client in the repository sends one, so a person with two memberships would
always get the older; and the incident-response runbook that
`docs/CLOUD-LAUNCH.md` requires.

### Two gaps in the surrounding process

**Configuration.** Every hosted-mode and payment-provider variable is read
straight from the process environment rather than through the validated
environment schema. The generated configuration catalog lists all of them under
its unvalidated-server set. None of them is covered by the boot-time refusals
that protect the rest of the deployment, so a typo in one is a runtime
behaviour change rather than a startup failure.
[Trust boundaries and data handling](security.md) covers what those refusals do
protect.

**Governance.** `GOVERNANCE.md` requires an architecture decision record and an
upgrade path for major changes to storage, authentication, public APIs or
deployment policy. This work changed all four. `docs/adr/` holds five records,
numbered 0001 to 0005; there is no sixth.

### On commercial terms

The plan's code, currency, billing intervals, price, trial length and grace
windows are constants in `packages/core/src/cloud/individual-plan.ts`, so that
the API enforces the same offer any public surface would describe. Treat them as
**intent**. Nothing in this repository establishes that a hosted service is
operating, that these terms are on offer, or that any of them has been reviewed
outside it. The provider price identifiers are deployment configuration and are
absent from the repository entirely, which is a second reason a build cannot
transact without a deliberate act.

## Related

- [Storage, migrations and versioning](persistence.md) explains the document
  table shape the workspace column was added to.
- [Trust boundaries and data handling](security.md) covers the webhook among the
  routes that answer without a session.
- [What happens to a request](request-lifecycle.md) places the workspace and
  entitlement middlewares in the stack.
- [The system in one view](system-overview.md) shows where the control plane
  sits relative to the graph repository.
- [Operate](../operate/index.md) carries the deployment and configuration
  procedure this plane would be turned on through.
