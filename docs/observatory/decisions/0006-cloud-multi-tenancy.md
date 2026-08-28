---
id: ADR-0006
title: 'ADR 0006: workspace-partitioned multi-tenancy'
summary: The missing decision record for the hosted Cloud plane, reconstructed from the migrations and middleware because no record was written.
audience: [maintainer, security, developer]
domain: decisions
type: decision
status: needs-review
requirements: [FR-105]
sources:
  - GOVERNANCE.md
  - .env.example
  - apps/api/src/app.ts
  - apps/api/src/db/migrations/007-cloud-control-plane.ts
  - apps/api/src/db/migrations/008-billing-event-ordering.ts
  - apps/api/src/db/migrations/009-workspace-primary-keys.ts
  - apps/api/src/db/migrations/010-legacy-space-default-workspace.ts
  - apps/api/src/db/repository.ts
  - apps/api/src/db/search-index.ts
  - apps/api/src/db/space.ts
  - apps/api/src/middleware/workspace.ts
  - apps/api/src/services/control-plane.ts
  - apps/api/src/services/storage/cloudinary.ts
  - apps/api/src/cloud/config.ts
  - apps/api/src/cloud/paddle.ts
  - apps/api/src/routes/v1/auth.ts
  - apps/api/src/routes/v1/billing.ts
  - apps/api/src/routes/v1/export.ts
  - apps/api/src/routes/webhooks/paddle.ts
  - apps/api/src/routes/v1/cloud.integration.test.ts
  - apps/api/src/scripts/purge.ts
  - packages/core/src/cloud/individual-plan.ts
  - apps/web/src/lib/paddle.ts
  - apps/web/src/public/site.ts
  - docs/CLOUD-LAUNCH.md
  - docs/testing/source-test-map.json
related: [ADR, ADR-CATALOG]
---

# ADR 0006: workspace-partitioned multi-tenancy

- **Status:** reconstructed from evidence. No record was written, and this page
  is not a substitute for one.
- **Decided:** 2026-08-23, in `a6cf2b0 feat(cloud): add tenant-safe workspace
  and billing foundation`.
- **Reconstructed:** 2026-08-24, against the working tree at
  `a55a677 fix(testing): let the coverage map see the tests beside it`.
- **Extends:** ADR 0005 (Postgres instead of Firestore). Supersedes nothing.

## What this page is, and what it cannot be

`GOVERNANCE.md:12` requires an architecture decision record and an upgrade path
for major changes to storage, authentication, public APIs or deployment policy.
The Cloud plane changed all four in a single commit, and no record was written.
`docs/adr/` holds `0001` through `0005`; there is no `0006` there, and
publishing this page does not create one.

The decision below is read out of the schema, the middleware and the routes.
That part is safe to state, because the code is the authority for what is
implemented, and every claim here was checked against the file it names.

**The reasoning is not evidenced.** Nothing in this repository records why a
composite primary key was chosen over a schema per tenant, why the boundary is
enforced in the application layer rather than by the database, why this payment
provider, or why the signature tolerance is the value it is. A decision record
exists mainly to carry that reasoning forward, and the reasoning did not
survive. Where a written ADR would argue, this page reports, and it says so
each time. The status badge is `needs-review` for exactly this reason: the
facts are checked, and no one who was present has confirmed the account.

## Context

Until this commit the graph was partitioned by a `space` column with two
values, `real` for the owner's records and `demo` for a self-contained sample.
A browser selected between them with an `x-vitae-space` request header.
Migration 007 states plainly why that cannot carry tenancy: the value was
chosen by a request header and there were only two of them.

ADR 0005 had moved the data plane to Postgres three weeks earlier and kept
`(space, id)` as the primary key of every document table. That key was correct
for one owner and one sample dataset. It is wrong for two customers, because
two customers legitimately hold rows with the same id - most obviously the
singleton documents the application allocates by name rather than by UUID.

The requirements document of the time denied multi-tenant hosting outright.
That sentence has since been withdrawn: `docs/specs/srs.md:29-38` now records
that the supported operating model is a single-operator self-hosted install,
that the repository additionally contains a workspace-partitioned control plane
held closed by two gates, and that the earlier denial was corrected rather than
repeated.

## Decision

### Tenant identity moves into the primary key

Migration 007 adds a `workspace_id` column to every one of the twenty-four
durable document tables, defaulted to a claimable legacy workspace, moves the
existing demo rows to a system workspace, and constrains the column with a
foreign key to `workspaces` that is `ON DELETE RESTRICT`. It creates a unique
`(workspace_id, id)` index beside the old key rather than replacing it.

Migration 009 promotes that index to the primary key with
`PRIMARY KEY USING INDEX` and drops `(space, id)`. Its header gives the reason:
a unique index alone still leaves the historical key in place, so a singleton
document such as `meta/search_generation` would collide between two Cloud
workspaces.

What the composite key buys is that the boundary stops depending on a query
being written correctly. Under `(space, id)`, a read that forgot its workspace
filter could return another tenant's row for a colliding id, and a write that
forgot it could overwrite one - 007's own comment on the unique index says
upserts must target the tenant key, never the legacy key, or a reused
identifier could overwrite another customer's row. Under `(workspace_id, id)`,
the id alone is no longer an identity, so the same mistake produces a
constraint error or an empty result instead of a cross-tenant read.

The same treatment reaches the child tables. Import rows, import chunks and
metadata runs referenced their parents through `(space, parent_id)`; 007 adds
workspace-aware foreign keys and 009 drops the old ones, so a child cannot be
attached to a same-id parent in another workspace.

The `space` column stays. Migration 010 adds a `BEFORE INSERT` trigger to every
document table that rewrites `workspace_id` to the system demo workspace when a
row arrives carrying `space = 'demo'` with the legacy default still on it. The
stated purpose is compatibility: pre-Cloud scripts and fixtures that insert
directly keep working. Migration 008 is unrelated to the graph and belongs to
the webhook, below.

### The workspace is resolved from membership, never from the request

Migration 007 also creates a control plane that sits outside the graph
repository: identities, workspaces, memberships, a lifecycle row per workspace,
and the billing records. `control-plane.ts` explains the separation - these are
control-plane records, not exportable career data, and they are deliberately
not reachable through the repository that serves the graph.

`workspaceMiddleware` (`apps/api/src/app.ts:66`) runs after the default-deny
auth gate (`:62`). It accepts an optional `x-vitae-workspace` header, and that
header can only choose among workspaces the authenticated user is already a
member of. A workspace that is named but not a membership is a 404; no
membership at all is a 409 telling the caller to finish account setup. Neither
outcome creates access, and the legacy `x-vitae-space` header is ignored
entirely once Cloud mode is on.

Enrolment is a separate, authenticated endpoint. `POST /api/v1/auth/bootstrap`
requires a verified identity, is idempotent, and gives a first-time user
exactly one personal workspace. The one exception is the configured owner
email, which gets a one-time claim on the pre-Cloud graph rather than a copy of
it, so the existing records keep their identity instead of being duplicated
into a new partition. An email already bound to a different identity is refused
rather than merged.

Access state is enforced by `entitlementGate` (`:67`), and it is deliberately
method-based rather than route-annotated so that a route someone forgets to
annotate cannot stay writable. A read-only or deletion-pending workspace keeps
its reads, its export, its billing routes and its logout; every other mutation
is refused with a payment-required error naming the state. Time-based
transitions run at request resolution and are idempotent, so a missed
background run cannot leave a lapsed workspace writable, and a lifecycle row
that does not parse falls back to read-only rather than to full access.

### Every graph query carries the workspace, through one module

`db/space.ts` holds the current `{space, workspaceId}` in an
`AsyncLocalStorage`; `workspaceMiddleware` is what puts a resolved workspace
there. `db/repository.ts` reads it per call and adds `workspace_id = ...` to
every read, write, upsert and delete it issues.

That is the whole enforcement surface for the graph, and it holds because the
graph tables are reached through nothing else: no non-test module in
`apps/api/src` outside the repository issues a select, insert, update or delete
against any of the twenty-four tables.

Two derived surfaces are keyed the same way rather than left to inherit
isolation. The search index keeps one instance per workspace id. Attachment
storage puts the workspace id into the object key, because attachments are
content-addressed and a shared hash across two tenants would itself be an
information leak. Export takes a per-workspace lock (`FR-105`), so one
workspace's export cannot block another's.

### The payment provider authenticates with a signature, not a session

`/webhooks/paddle` is mounted at `apps/api/src/app.ts:50` - before the JSON body
parsers and outside `/api` altogether, so the default-deny gate never sees it.
Both halves of that placement are deliberate and both are documented in the
code. It is outside `/api` because a provider request carries no user session
to check. It is before the body parsers because the provider signs the raw
bytes, and re-serialising the JSON would invalidate the signature.

In place of a session it verifies an HMAC. The `paddle-signature` header
carries a timestamp and one or more digests; the expected value is SHA-256 over
the timestamp, a colon, and the untouched request body, keyed by the configured
webhook secret. A timestamp more than five seconds from the server's clock is
rejected before any comparison, which is the replay bound. Candidate digests
are checked for hexadecimal shape and length before the constant-time
comparison, so malformed input is a clean rejection rather than an exception.
With no secret configured the verification returns false, and with the server
flag off the handler answers 404 before it looks at the body: it fails closed
twice.

Three further properties follow, and they are the ones that make an
unauthenticated write path tolerable:

- **Exactly once.** The provider's event id is the primary key of the event
  table and the insert conflicts to nothing, so a redelivery is recorded as a
  duplicate and changes no state.
- **In order.** Migration 008 adds the provider's own update timestamp and an
  index on it. Before applying an event the transaction locks the workspace's
  lifecycle row - chosen over locking the subscription row because a first-ever
  subscription event has no subscription row to lock - and then discards any
  event whose provider timestamp is not newer than the stored one. An
  untimestamped retry counts as stale once a timestamp exists, so a late
  delivery cannot roll an entitlement backwards. Stale events are still
  persisted as evidence; they do not move access.
- **Bound to a workspace, or bound to nothing.** The workspace comes from the
  provider's custom data and is checked against the workspace table before use.
  An event naming no known workspace is stored unlinked and grants nothing.

Entitlement is webhook-only in both directions. The API creates a transaction
from a plan catalogue it owns - `packages/core/src/cloud/individual-plan.ts`
holds the plan code, the permitted billing periods, the entitlement names and
the lifecycle windows, while provider price identifiers stay in deployment
configuration because they belong to a particular provider catalogue rather
than to the offer. The browser receives an opaque transaction id and nothing
else: no price, no customer identifier, no entitlement, and a return URL that
is a navigation target rather than a grant. Checkout refuses with a
service-unavailable error, without calling the provider at all, when the
server-side price or API key is missing.

### Two independent flags hold the plane closed

The server flag is `VITAE_CLOUD_ENABLED`, false in `.env.example:40`. While it
is false, `workspaceMiddleware` and `entitlementGate` return immediately, the
webhook and every billing route answer 404, and bootstrap answers 409 naming
self-hosted mode.

A default self-hosted build still gets the migrated schema. Every row lives in
the legacy workspace or the system demo workspace, the old `x-vitae-space`
header still selects between them, and the composite primary key is in force
whether or not anybody is using it for tenancy. The schema change is not gated;
only the tenancy behaviour is.

The web flag is `VITE_PUBLIC_CLOUD_ENABLED`, false in `.env.example:28`, and
setting it true is not sufficient on its own. `apps/web/src/public/site.ts`
additionally requires a canonical site URL, a support email, a legal entity
name, a legal-terms version, and a client token shaped like a real
checkout-scoped token; anything missing is reported as an unmet launch
requirement and the public surface stays in its pre-launch state. The comment
there gives the reason: the API has its own stricter release gate, and this one
exists so the public promise cannot get ahead of it.

## Consequences

**Positive.** The tenant boundary is a database constraint and not only a
convention in a query builder, so the most likely implementation mistake fails
loudly. The graph has one enforcement point to audit. The single unauthenticated
write path has its authentication, replay bound, idempotency and ordering in one
file. Self-hosted installations are unaffected by default, and the migration
moved existing rows without rewriting their documents.

**Accepted.** Two partition columns now coexist on every document table, and
migration 010's trigger can rewrite a tenant key from the legacy one. In Cloud
mode the repository always writes `space = 'real'`, so the trigger's condition
cannot be reached through a request - but it is a write path that changes a
tenant key based on a legacy column, and it is compatibility scaffolding that
will need removing rather than leaving.

**Accepted.** The five-second signature tolerance bounds replay tightly and
makes the receiver correspondingly sensitive to clock skew and delivery delay.
A late retry is rejected at the signature check, which is before the event
table would have deduplicated it.

**Accepted.** The export lock is a set held in one process. It satisfies FR-105
within a single API instance and provides nothing across two.

### Where isolation still depends on the caller

`currentWorkspaceId()` has a fallback. With no async-local store it returns the
system demo workspace under `VITAE_SPACE=demo` and the legacy workspace
otherwise. That fallback is not "no workspace"; it is a real tenant's
workspace.

Request traffic never reaches it in Cloud mode, because `workspaceMiddleware`
either establishes a context or fails the request. Everything that runs outside
a request does reach it. Eight of the twelve scripts in `apps/api/src/scripts/`
establish no context at all - the graph audit, the subject backfill, the export
bundle, the migration runner, the résumé probe, the restore, the seed and the
import tidy - so each operates on the legacy workspace regardless of what the
operator intended, and none takes a workspace argument. The retention purge and
the API's scheduled sweep do it correctly, by enumerating the active
non-system workspaces and running once inside each.

The blast radius is bounded by the fact that these scripts are privileged and
local, and by the repository scoping their writes to whichever workspace is
current. It is still the case that the safe default for an operator tool would
be to refuse without an explicit workspace, and the default here is to pick one.

## What no document records

A written record would have argued the choice. This one can only report it, so
the following are stated as gaps rather than filled in:

- **Why a composite key rather than a schema or database per tenant, or
  row-level security.** The code shows a shared schema with an application-level
  filter and a composite key behind it. Nothing shows that a schema per tenant,
  a database per tenant, or Postgres row-level security keyed to a session
  variable was weighed, and this page does not claim they were.
- **Why keep `space` at all.** Migrations 007 and 010 give compatibility as the
  purpose. Neither says what the exit is, or when the column and its trigger
  are meant to come out.
- **Why this payment provider**, and why a provider-hosted overlay checkout
  rather than a redirect.
- **Why five seconds**, and why ordering is by the provider's update timestamp
  rather than by a sequence number.
- **Why the lifecycle transition runs at request resolution.** The code says a
  missed worker run must not leave a lapsed workspace writable, which is a
  reason for the property but not a reason for there being no worker.

## What would have to be true before this is operated for more than one tenant

Each of these is a gap in the repository as it stands, not a criticism of the
design above.

1. **Deletion is scheduled and never performed.** A deletion date is written
   when a workspace goes read-only, and nothing in this repository reads it.
   `deletion_pending` is a declared lifecycle state that no code path ever
   assigns; only the gate and the state validator mention it. The export window
   is therefore recorded rather than enforced, and the promise implied by
   scheduling a deletion is kept by no job here.
2. **There is no rate limiting anywhere in the API.** `docs/CLOUD-LAUNCH.md:42`
   requires workspace-aware rate limits, redacted audit logging and operational
   alerts on the import, export, attachment and compilation paths.
3. **The incident response runbook required by `docs/CLOUD-LAUNCH.md:58` does
   not exist.** `docs/runbooks/` has restore, secret rotation, emulators and
   toolchain procedures, and nothing for a security or billing incident.
4. **Provider events are retained indefinitely.** Each verified webhook stores
   its whole payload, and the retention sweep covers graph trash only. Nothing
   prunes the billing event table or the lifecycle event log.
5. **Test depth is one example per property.** All five server-side Cloud
   modules are mapped as covered in `docs/testing/source-test-map.json`, and
   every one of them names the same suite: `cloud.integration.test.ts`, which
   is four cases. They assert the right properties - a second user's workspace
   is isolated, a header cannot select a workspace the caller is not a member
   of, a read-only workspace still reads and exports but cannot mutate,
   checkout will not reach a provider without a server-owned catalogue, and a
   signed event is accepted once while a stale later delivery is ignored - at
   roughly one example each. The webhook has one negative case, a
   correctly-shaped signature carrying a non-hexadecimal digest, and none for a
   missing signature header, for a timestamp outside the tolerance, for an event
   naming an unknown workspace, or for two deliveries arriving at once. The
   browser-side checkout module is mapped `deferred`, because its own test
   substitutes a mock for it.
6. **The two items above under "where isolation still depends on the caller"**:
   an operator tool that silently defaults to a tenant, and a lock that does not
   cross processes.

## Open questions that this repository cannot settle

These have commercial or legal consequences and no answer here is authoritative.
Each needs confirmation from outside the repository before anything in this
plane is offered to a customer.

- Whether the commercial terms encoded in
  `packages/core/src/cloud/individual-plan.ts` and described in
  `docs/CLOUD-LAUNCH.md` are an offer that anyone has approved. The launch
  guide describes them as intended, and opens by saying it is not a customer
  contract and does not mean the service is open.
- Which legal entity would contract with a subscriber. The entity name is a
  required build variable and is unset.
- The merchant-of-record arrangement, the selling jurisdictions it covers, and
  how tax is handled in each. The launch guide lists these as things to verify;
  nothing in the repository records an answer.
- Whether the trial, payment-grace and export-grace windows encoded as
  constants match any published terms, and what is owed to an existing
  subscriber if a constant is changed after they sign up.
- Refund and cancellation policy, terms of service, privacy notice, data
  processing addendum, and subprocessor list. All are named in the launch guide
  as required publications and none is present.
- Where the control-plane records may be stored and for how long: email
  addresses, provider customer identifiers, and the raw provider payloads
  described in item 4 above.
- Whether the one-time legacy claim is intended to survive launch. As written,
  the configured owner email claims the pre-Cloud graph on first bootstrap,
  which binds one person's existing records to whoever controls that address.
- Whether any hosted service is operating. This repository cannot answer that,
  and does not assert it: both gates default to closed and `docs/specs/srs.md`
  states that no hosted service is asserted to be operating.

## Related

- [The decisions on record](catalog.md)
- [Decisions](index.md)
- [Architecture](../architecture/index.md)
