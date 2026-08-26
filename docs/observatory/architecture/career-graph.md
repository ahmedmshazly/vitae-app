---
id: ARC-GRAPH
title: The typed career graph
summary: Thirty-four node types, twenty-nine edge types, one shared envelope, and the ownership rule that decides whose record a record is.
audience: [developer, maintainer]
domain: architecture
type: explanation
status: verified
verified_at: 2026-08-24
sources:
  - packages/core/src/types.ts
  - packages/core/src/schema/envelope.ts
  - packages/core/src/schema/node-props.ts
  - packages/core/src/schema/edge-props.ts
  - packages/core/src/schema/validate.ts
  - packages/core/src/forms/node-forms.ts
  - packages/core/src/forms/edge-forms.ts
  - packages/core/src/forms/subjects.ts
  - packages/core/src/algorithms/graph-paths.ts
  - apps/api/src/db/repository.ts
  - apps/api/src/services/subjects.ts
  - apps/api/src/scripts/seed-demo.ts
requirements: [FR-013, FR-019, FR-CAP-002]
related: [ARC-OVERVIEW, ARC-PERSISTENCE, ARC-RESUME, ARC-ALGORITHMS]
---

# The typed career graph

## In short

Everything Vitae stores is either a node — a person, a role, a project, a skill,
a talk — or an edge between two of them. An edge is a first-class record with
its own fields, not a pointer. The relationship *is* the data: what you know
about knowing someone lives on the edge that says you know them.

Both share one envelope of common fields, and both carry a `props` object whose
shape depends on the type. That is what lets thirty-four kinds of thing live in
one table without thirty-four tables, and still be validated field by field.

## How it works

The type vocabulary is defined once, in `packages/core/src/types.ts`, as plain
string-literal unions. The Zod schemas, the API, the browser and the forms
engine all read those unions, so adding a type is one edit rather than a search
for every place that listed them.

Node types come in three families. The career core is what the product is built
around and each of those types has bespoke screens. The life core is the
surrounding record — events, interactions, tasks, goals, habits, journal
entries, ideas, links, documents, subscriptions and posts — that gives the
career material its context. The proposed family is schema-only: the shapes
exist and validate, but the product has not grown surfaces for them.

Edges are typed the same way, and each type has its own property schema. The
richest by far is `KNOWS`, which carries how you met, self-reported closeness,
a contact cadence, topics and a favour ledger. Every edge property schema is
declared as pass-through, so a derived field written by a service survives a
round-trip through validation and a partial update instead of being silently
dropped.

The part that is easy to get wrong is ownership. This graph holds several
people's records, not only the owner's: an import brings in other people's
roles, degrees and publications. So "every role in the graph" is emphatically
not "every role of mine", and a read model that confuses the two puts a
stranger's credentials on someone's résumé.

## Mechanics

### How many types there are

**Thirty-four node types and twenty-nine edge types.** Counted from the source
of truth, `packages/core/src/types.ts`, where `NODE_TYPES` is composed from
three arrays: 16 career-core, 11 life-core and 7 proposed. `EDGE_TYPES` is a
single array of 29 — INTRODUCED joined it on 2026-08-26 (FR-COMM-003).

Three documents in this repository disagree with that, and all three are wrong:

| Claim | Where | What is actually true |
| --- | --- | --- |
| 33 node types | `apps/api/src/scripts/seed-demo.ts:3` | 34; the seed comment was not updated when a type was added |
| 28 node types | `docs/design/addenda/P23-entity-forms.md:3` | 28 is the **edge** count, not the node count |
| all 28 types | `docs/design/addenda/README.md:18` | same mistake, carried into the addendum index |

The code comment above `EDGE_TYPES` also cites a specification range of
eighteen edges, which the array outgrew.

Reproduce the count by composing the three arrays in `types.ts` rather than
trusting any of the four prose figures.

### `INTRODUCED` is not an edge type

`packages/core/src/algorithms/graph-paths.ts:102` branches on an edge whose
type is `INTRODUCED`, giving it a traversal weight in warm-introduction path
finding, and the module's own header describes it as a supported hop. No such
member exists in `EDGE_TYPES`, so edge validation rejects it on create and the
branch cannot execute.

This is dead code, not a feature. Record it that way: an introduction is
currently expressible only as an ordinary acquaintance edge, and any document
claiming Vitae models introductions as their own relationship is describing an
unreachable branch.

### The shared envelope

`packages/core/src/schema/envelope.ts` defines four schemas: what a caller may
send when creating a node, the system-managed fields a persisted node also
carries, and the same pair for edges. A create envelope covers identity and
provenance — title, subtitle, notes, a date range with an explicit precision,
status, pinning, sensitivity, the provenance source and reference, and a
confidence score. The system fields — the identifier, the timestamps, the
soft-delete and merge markers, and the revision number — are added by the
repository and are not settable by a caller.

The update envelopes are derived from the create envelopes by making every
field optional and removing the immutable ones: a node's `type` can never
change, and an edge's `type`, `src` and `dst` can never change. Deriving them
rather than writing them out is what stops a client-settable `deleted_at`
appearing the next time someone adds a field.

Nodes also carry external identity keys in the form `<system>:<kind>:<key>`,
lowercased on the way in so that a producer's casing cannot fork the derived
document identity. The first key is primary and determines that identity.

### Two-stage validation

`packages/core/src/schema/validate.ts` validates in two stages and returns a
discriminated result rather than throwing, so a route or an importer can show
field-level errors. Stage one parses the envelope. Stage two looks up the
per-type property schema — `propsSchemaFor(type)` for nodes,
`edgePropsSchemaFor(type)` for edges — and parses `props` against it, prefixing
any error path with `props` so the message points at the field a person can see.

### Edge endpoints are typed

An edge type constrains what it may connect. `edgeEndpointsAllowed` in
`packages/core/src/forms/edge-forms.ts:372` checks the source and destination
node types against the edge form descriptor's allowed lists, with one bespoke
case: `PART_OF` is checked against an explicit set of ordered pairs, because
"part of" means something different between a repository and a project than it
does between a school and a university.

The check runs on the write path, in the repository, before an edge is staged
(`apps/api/src/db/repository.ts:343`), and it runs against the *actual* types of
the referenced nodes, which the repository reads in the same transaction. A
missing or deleted endpoint fails first, with its own message. That is FR-013:
endpoint typing is a storage-layer invariant, not a form-layer courtesy.

### Whose record is this

Eleven node types are meaningless without a person, and each of them declares
its owning edge in its form descriptor: a role is held by someone, a project was
worked on by someone, a repository, publication, talk or post was authored by
someone, an education was attended, a certification or award was earned, a
course completed, a reference recommended. Seven edge types serve as subject
edges, all running person → record.

`packages/core/src/forms/subjects.ts` derives the subject rules from those
descriptors rather than restating them, so a new subject-bearing type is picked
up automatically and the two lists cannot drift. On the read side,
`apps/api/src/services/subjects.ts` makes one pass over the edges to build an
owner index — who owns what, what is unowned, and what is claimed twice.

Two invariants follow:

- **Ownership is total.** A subject-bearing record with no subject edge belongs
  to a reserved anonymous person, never implicitly to the user. "Not mine" and
  "nobody has said" must not collapse into the same answer.
- **The résumé is single-subject.** The résumé model scopes every section to
  the person marked as self, and renders an empty document when there is no such
  person. Every other surface shows the whole graph and labels the owner
  instead. [From graph to compiled résumé](resume-pipeline.md) covers what that
  scoping does.

Note that the architecture guide's account of this rule names six subject edges
and omits `RECOMMENDS`, and lists three authored types where the descriptors
declare four. The descriptors are the authority.

### Where the type list is enforced

Adding a node type means editing `packages/core/src/types.ts` and adding its
property schema in `schema/node-props.ts`; the forms engine, the API validation
and the browser pick it up from there. Adding an edge type additionally means
declaring its endpoints in `forms/edge-forms.ts`, or the repository will refuse
every instance of it.

## Related

- [Storage, migrations and versioning](persistence.md) explains how a node and
  its revision history become rows.
- [From graph to compiled résumé](resume-pipeline.md) is the largest consumer
  of the ownership rule.
- [The deterministic algorithms](algorithms.md) covers what the traversal
  weights on edge types are actually used for.
- [The system in one view](system-overview.md) says why this vocabulary lives
  in the shared package.
- [Design](../design/index.md) documents the forms and entity surfaces built on
  these descriptors.
