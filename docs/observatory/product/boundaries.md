---
id: PRD-BOUNDARIES
title: What Vitae does not do
summary: The product's edges, stated precisely, including what the workspace-partitioned schema did and did not change, and why the hosted plane is closed rather than absent.
audience: [user, maintainer, security]
domain: product
type: explanation
status: verified
verified_at: 2026-08-24
sources:
  - docs/specs/srs.md
  - docs/ROADMAP.md
  - docs/PRIVACY.md
  - docs/CLOUD-LAUNCH.md
  - apps/api/src/middleware/auth.ts
  - apps/api/src/middleware/workspace.ts
  - apps/api/src/cloud/config.ts
  - apps/api/src/db/space.ts
  - apps/api/src/db/migrations/007-cloud-control-plane.ts
  - apps/api/src/db/migrations/009-workspace-primary-keys.ts
  - apps/web/src/public/site.ts
  - packages/core/src/cloud/individual-plan.ts
  - .env.example
related: [PRD-PURPOSE, PRD-PEOPLE, PRD-CAPABILITIES]
---

# What Vitae does not do

## In short

Vitae holds a deliberately small shape. It is one person's private records
rather than a shared workspace; it computes with published arithmetic rather
than a language model; and it publishes nothing outward. A hosted version does
exist in this repository (built, tested, and held closed by two separate gates),
but nobody is being served by it, and the prices attached to it are terms
written down rather than a service anyone can buy. This page states each of
those edges precisely, because the difference between *absent*, *closed* and
*intended* is exactly where product documentation usually goes wrong.

## How it works

### Boundaries that are product decisions

Some things are missing because leaving them out makes the rest work better.

**No runtime language model.** Ranking, deduplication, job-description parsing
and résumé selection are named algorithms, so the same inputs give the same
outputs and a recommendation can be argued with. Text generation and embeddings
are out of scope, and the absence is load-bearing rather than a gap waiting to be
filled.

**No telemetry, no profiling, no advertising.** Nothing measures the operator.

**No social layer.** People in the graph are records, not accounts. Nobody is
notified that they were written about, and nothing is published outward - there
is no public profile, no shared link, no web publishing surface.

**No live account sync.** External data arrives as a staged import that the
operator reviews, commits, and can roll back, with the source recorded on every
record it creates. Calendar and contact files are among the formats it accepts.
A continuous connection to a mail or calendar account is a different thing and is
out of scope: it would put records into the graph that nobody chose to put there,
which breaks the review step the import model exists for.

**One page, one convention.** The résumé engine targets a single-page,
US-oriented, applicant-tracking-safe document. Multi-page and non-US formats are
out of scope, which is what allows the selection algorithm to be a budget
problem with a real constraint rather than an open-ended layout engine.

**No native mobile application.** The product is web, used on desktop and mobile
browsers.

### The boundary that moved

Vitae's database is now partitioned by workspace. Its product is not
multi-tenant. Both of those are true, and the gap between them is the single
most misread thing about this system.

An earlier revision of the system requirements document stated flatly that Vitae
does not provide multi-tenant hosting. A migration then made a workspace key part
of the identity of every durable record, in every install. The specification was
wrong on the evidence and has been corrected rather than repeated; the migration
won, because running schema outranks a specification. But the correction is
narrower than it first looks, and the Mechanics section below states exactly what
did and did not change.

### The boundary that is closed rather than absent

The hosted control plane is the one thing in this repository that is neither
missing nor available. It is written, covered by integration tests, and switched
off. Documentation that called it absent would be wrong; documentation that
described it in the present tense would be worse, because it would imply a
service accepting customer data. It is described here as built and closed, with
its opening conditions named.

## Mechanics

### What a default install actually is

`.env.example` ships `VITAE_CLOUD_ENABLED=false`, and with that flag off the
product behaves exactly as it did before the workspace work:

- `authGate` resolves the caller's identity, then admits the request only if the
  resulting email equals the single configured owner address. There is no second
  account and no way to create one.
- `workspaceMiddleware` returns immediately without resolving anything, so no
  per-user tenancy is computed. Cloud mode is the only mode that reads the
  `x-vitae-workspace` header at all.
- Every request runs in one of exactly two fixed partitions, chosen by the
  `x-vitae-space` header: the operator's real graph, or the self-contained demo
  dataset. Those map to two constant workspace identifiers,
  `workspace-legacy-real` and `workspace-system-demo`.

So the shipped self-hosted default is: one authorised human, two data partitions,
no tenancy resolution, no billing, no lifecycle enforcement.

### What the schema does regardless of the flag

Migration 007 added a server-selected `workspace_id` to 24 durable tables and
moved existing rows onto the two constant workspaces above. Migration 009 then
promoted `(workspace_id, id)` to the primary key of all 24.

The reason for 009 is worth knowing, because it explains why the change could not
be confined to Cloud builds. A unique index alone would still have left the old
key in place, and singleton documents, a search-generation counter for instance,
would then collide between two workspaces that each legitimately hold one. The
partition had to become identity, not an extra column.

The consequence is that a self-hosted install has a workspace-partitioned schema
whether or not it will ever have a second workspace. That is a property of the
storage layer. It is not an offer, a capability the operator can reach, or a
change in who may sign in.

### The correction, and the one still outstanding

`docs/specs/srs.md` has been repaired: it now states that the supported operating
model is a single-operator self-hosted install, that the repository also contains
a workspace-partitioned control plane withheld by a build gate and a separate
server provisioning gate, and that no hosted service is asserted to be operating.
It also says in the document itself that the earlier sentence was withdrawn on
evidence, so a reader who remembers the old claim can see what happened to it.

One statement elsewhere still needs the same split. `docs/ROADMAP.md:45` lists
*multi-user/social* among the things deliberately out of scope. Read as *more
than one person inside one graph*, that remains accurate and is a genuine product
boundary. Read as *the system cannot host separate people*, it is contradicted by
migrations 007 and 009. Take the first reading; the second is a stale phrasing
that predates the control plane.

The same line lists *email/calendar sync*, which is accurate as written and
should not be confused with the staged calendar import the imports capability
already ships.

### What the hosted plane is

Enumerating it matters, because "gated" is easy to read as "unfinished".

- **Server-derived workspace scoping.** A verified identity is resolved to a
  workspace it is a member of. A client header may choose among memberships; it
  can never create one or grant access to one.
- **A lifecycle gate on mutations.** A workspace in a read-only or
  deletion-pending state refuses writes by HTTP method rather than by route
  annotation, deliberately, so a route somebody forgot to annotate cannot stay
  writable. Export, billing management and sign-out remain reachable, which is
  what makes "read-only" mean readable rather than locked.
- **A server-owned plan catalog.** Checkout maps only server-owned plan choices
  to provider prices; the browser cannot name its own.
- **Signed provider webhooks**, verified against the raw request body, with
  replay protection, idempotent event persistence and defined handling of
  out-of-order events.

### What the hosted plane is not

**Not operating.** Two independent gates hold it closed, and both must be opened
together. The server gate is `VITAE_CLOUD_ENABLED`. The browser gate is
`VITE_PUBLIC_CLOUD_ENABLED`, and asking for it is not enough on its own: the
public build stays in its pre-launch state unless a canonical site URL, a support
email, a legal entity name, a legal-terms version and a checkout-scoped payment
token are all configured and well-formed, and it reports which are missing when
they are not. The repository's privacy document states directly that the project
does not currently operate a public hosted data service and does not receive a
copy of self-hosted records.

**Not a team product.** The intended launch shape is one private personal
workspace per verified person. Team workspaces, recruiter workflows and
additional identity providers are outside the first release. Opening the plane
would create more graphs, not more people inside one graph - the boundary in
[who Vitae is for](who-it-serves.md) survives it intact.

**Not a substitute for published terms.** The launch guide is a release boundary,
not a customer contract, and it says so. Reviewed terms, a privacy notice, a data
processing addendum, a subprocessor list, a disclosure path and a
cancellation policy must be published before the gates open, and placeholders may
not be published as customer terms.

### The intended launch terms, and their status

These values are recorded in `packages/core/src/cloud/individual-plan.ts` so that
the API and the public surface cannot describe different offers. They are the
intended terms for a launch that has not happened.

| Term | Value recorded in the source |
| --- | --- |
| Currency | USD |
| Monthly | 2400 minor units |
| Annual | 21600 minor units |
| Trial | 14 days, no card |
| Payment grace | 7 days |
| Export grace after non-renewal | 30 days |

> [!IMPORTANT]
> None of this is a current commercial fact. No hosted service is operating, no
> price is being charged, and these figures may change before any launch. They are
> quoted here only as the terms the repository records, and any statement about
> what Vitae Cloud costs requires confirmation from outside this repository.

### What is genuinely absent from the code

Two of the boundaries above can be checked rather than trusted. No package
manifest in this repository declares a dependency on an AI provider SDK, and no
analytics, telemetry or product-measurement library appears anywhere in `apps/`,
`packages/` or `services/`.

That is not the same as saying the product makes no outbound requests. It
integrates an identity provider to verify sign-in, a file host behind a storage
adapter, and a compile service for résumés, and the hosted plane would talk to a
payment provider. The claim is narrower and exact: nothing here measures the
operator, and nothing here sends their records to a model.

## Related

[Who Vitae is for](who-it-serves.md) covers the single-operator model these
boundaries protect, and [what Vitae is for](what-vitae-is.md) covers why
determinism is treated as a feature rather than a limitation. [The capability
map](capabilities.md) records the hosted plane as the one gated capability.
