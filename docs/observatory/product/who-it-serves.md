---
id: PRD-PEOPLE
title: Who Vitae is for
summary: One person signs in to an installation; everybody else in the graph is a record, not a user. Four personas now name who that one person is, and what each of them would pay for.
audience: [user, designer, maintainer]
domain: product
type: explanation
status: verified
verified_at: 2026-08-26
sources:
  - PRODUCT.md
  - apps/api/src/middleware/auth.ts
  - apps/api/src/db/space.ts
  - apps/api/src/middleware/workspace.ts
  - docs/CLOUD-LAUNCH.md
  - docs/adr/0007-product-definition-regeneration.md
related: [PRD-PURPOSE, PRD-BOUNDARIES, PRD-CAPABILITIES, PRD-PERSONAS]
---

# Who Vitae is for

## In short

An installation of Vitae has exactly one person who can sign in to it. The graph
inside can hold hundreds of people, but none of them has an account, receives a
notification, or can see what has been written about them. That asymmetry is the
single most important fact about who this product is for: it is a private
instrument for one professional, not a shared workspace, and every design
decision downstream follows from it.

## How it works

### The operator

The person who runs an installation is called the operator throughout this
repository. They are assumed to be an experienced professional with a long
history worth connecting - enough past roles, projects and relationships that
remembering them unaided has stopped working - and enough concern about where
that history goes that running the software themselves is worth the effort.

The operator does everything: captures records, resolves duplicates, decides
what an imported row means, tailors a résumé, and takes the backups. There is no
role below them to delegate to and no administrator above them to appeal to. A
product that assumed otherwise would need permissions, invitations and an audit
trail of who changed what; this one needs none of that, and is smaller for it.

Since 2026-08 the operator has four researched faces, named P1 through P4 and
profiled in [the four people](personas.md): the deliberate mover preparing a
career move in private, the consultant whose practice runs on relationships and
per-engagement evidence, the periodic prover who must periodically compile a
verifiable account of their own history, and the privacy-first self-hoster who
runs the free system because ownership is the point. They are one operator role
seen at four buying moments, not four kinds of account.

### The people in the graph

Everyone else is a subject, not a user. A `person` node exists because the
operator wrote it down or imported it, and it holds whatever the operator
recorded: an organisation, an interaction history, a tie strength the product
computed, notes.

This puts a real obligation on the operator rather than on the software, and the
repository says so directly: a self-hosted deployment is operated by its owner,
who is responsible for access control, retention and lawful handling of the data
in it. The product supplies the tools that make that possible - a sensitivity
flag on every record, a real-and-demo split for anything that will be shared, a
full export, and a purge that actually deletes - but it cannot supply the
judgement.

### Who this documentation is written for

The documentation serves six named audiences, and every page states which of
them it is for: someone using Vitae, someone changing how a surface looks or
behaves, someone changing the code, someone responsible for the shape of the
system over time, someone deploying and recovering an instance, and someone
reviewing trust boundaries. Those are reader roles, not product roles. Only the
first describes the operator, and all six may be the same person on a
self-hosted install.

### The customer the hosted plane was designed for

A hosted offering is designed and partly built, and it is not open. Its intended
customer is P1, the deliberate mover: an experienced professional preparing a
deliberate career move, who already has meaningful work and relationships but
needs those facts connected before an opportunity arrives - explicitly not
someone managing a sales pipeline, recruiting a team, or generating generic
résumés at volume. P2 and P3 shape retention and expansion rather than the
launch pitch, and P4 never pays by design - the flywheel that keeps the paid
product honest.

Read that as a design brief rather than as a description of anyone being served.
No hosted service is asserted to be operating, and the intended shape is one
private workspace per verified person, which is the single-operator model moved
to someone else's server rather than a different product.

## Mechanics

### How "one operator" is enforced

In a default build the request gate admits exactly one address. `authGate` in
`apps/api/src/middleware/auth.ts` resolves the caller's identity from either a
verified Google sign-in or a local development session, and then compares the
resulting email against a single configured owner address. Anything else is
refused with a deliberately neutral message - the response never reveals what the
allow-list contains, so an unauthorised caller learns nothing about who the
operator is.

The workspace middleware, which is what would resolve a per-user tenancy, returns
immediately whenever the hosted flag is off. There is no code path in a default
build that produces a second account.

### One graph, two spaces

Within the single operator's installation the data is split two ways, chosen by
the `x-vitae-space` request header: `real` is the operator's own graph, and
`demo` is a self-contained sample dataset. The default is `real`, and only the
exact string `demo` selects the other.

This is a product feature, not a test fixture. It is how the operator explores an
unfamiliar screen, reproduces a bug, or shows the product to someone without
exposing a single real person. The repository's own privacy guidance leans on it
directly, asking that issues be reproduced in the demo space.

### Where the operator model changes

Enabling the hosted control plane changes the identity rule and nothing else
about who the product is for. The gate stops comparing against one owner address
and starts admitting any verified identity, after which the workspace middleware
resolves that identity to a workspace it is a member of. A client header may
choose among memberships; it can never create one. Each of those workspaces is
still a single person's private graph.

The important consequence for this page: even fully open, the hosted plane does
not introduce a second user to any one graph. It introduces more graphs.

## Related

[The four people](personas.md) profiles the personas this page names, with the
market evidence behind each. [What Vitae is for](what-vitae-is.md) describes
what the operator is actually working with. [What Vitae does not do](boundaries.md)
states the hosting and commercial boundaries this page only summarises,
including exactly what the hosted plane is and is not.
