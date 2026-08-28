---
id: PRD-CAPABILITIES
title: The capability map
summary: Sixteen capabilities are the unit the repository tracks product scope in, and each one joins to requirements, code and tests through a generated spine.
audience: [maintainer, developer]
domain: product
type: reference
status: verified
verified_at: 2026-08-26
sources:
  - docs/registry/capabilities.json
  - docs/registry/requirements.json
  - docs/generated/traceability.json
  - docs/generated/routes.json
  - scripts/check-docs-traceability.mjs
  - docs/ROADMAP.md
related: [PRD-JOURNEYS, PRD-PURPOSE, PRD-BOUNDARIES]
---

# The capability map

## What a capability is

A capability is a coherent area of product scope large enough to be argued about
and small enough to be evidenced. It sits between two things that already exist
and are both bad units for reasoning about a product: a requirement, which is too
fine to see the shape of anything, and a release, which is too coarse to be
wrong about in a useful way.

Capabilities are curated, not derived. They live in `docs/registry/capabilities.json`,
and that file is the authority. This page explains what the rows mean and where
the map is thin; it deliberately does not restate the file, because a prose copy
of a registry is a second source that will disagree with the first.

## What the register contains

Sixteen capabilities, of which fifteen are implemented and one is gated. The
register's own vocabulary is precise about what those words claim: *implemented*
means enforced by shipped code and reachable by someone running a self-hosted
install; *gated* means shipped in the repository but withheld from the public
surface by a build or provisioning gate; *planned* would mean intent with no
enforcing code, and nothing currently carries it.

They fall into four structural groups, which is more useful than reading them as
a flat list.

| Group | Capabilities | What the group is |
| --- | --- | --- |
| Substrate | `CAP-FOUNDATION`, `CAP-AUTH`, `CAP-DATA-CORE` | The toolchain, the request gate, and the typed graph everything else is written into |
| Working the graph | `CAP-CAPTURE`, `CAP-ORGANIZE`, `CAP-SEARCH`, `CAP-RELATIONSHIPS`, `CAP-EXPLORE`, `CAP-IMPORT`, `CAP-IDENTITY` | Getting records in, keeping them findable and correct, and reading them back |
| Career output | `CAP-RESUME`, `CAP-CAREER`, `CAP-EXPORT` | Turning the graph into documents, applications and portable bundles |
| Around the edges | `CAP-OPERATE`, `CAP-PLATFORM`, `CAP-CLOUD` | Running an instance, the constraints that hold across every screen, and the hosted control plane |

`CAP-PLATFORM` is the one that reads oddly and is doing the most work. It holds
the cross-cutting behaviour no single screen owns - request correlation, error
mapping, timezone handling, accessible overlays, the shared contracts, the rules
that keep the graph read once per view. Without a row of its own, that behaviour
would be attributed to whichever feature last touched it and would lose its
evidence the moment that feature changed.

`CAP-CLOUD` is the single gated row, and the only one whose closure is a product
decision rather than an implementation state. [What Vitae does not do](boundaries.md)
covers what it is and is not.

## How a capability reaches requirements, code and tests

The spine has three links, and each one is a different kind of statement.

1. **Capability to requirement.** Every requirement in
   `docs/registry/requirements.json` names exactly one capability, and all 99 of
   them do. This link is curated: a person decided the requirement belongs there.
2. **Requirement to file.** `docs/generated/traceability.json` scans 780 tracked
   files, finds every file that writes a requirement's identifier, and records
   the file and line. 134 files cite something; 352 citations exist in total.
   This link is mechanical and cannot be argued with.
3. **File to kind of evidence.** Each citation is bucketed by where it was
   found - production source, test, or document - because those are not equal
   evidence. A citation in source shows the behaviour exists. A citation in a
   test shows something is protecting it. A citation in a document shows only
   that somebody wrote it down.

The generator then inverts the first two links into `by_capability`, which is
how a capability arrives at its evidence: pick the capability, take its
requirements, take each requirement's cited files.

A worked example, in the relationship-intelligence capability. One of its
requirements is cited from an API route, the screen that renders the result, the
ranking algorithm itself, and two shared components - and from one algorithm
test. Four production citations and one test citation, so the generator classes
it as implemented and tested, and a maintainer changing the ranking has the five
places to look handed to them.

## What the evidence classes actually measure

This is the part that is easy to read wrong, and reading it wrong produces a
false claim about test coverage.

| Class | Count | What it means |
| --- | ---: | --- |
| `implemented-and-tested` | 19 | The identifier appears in production source and in a test |
| `implemented-untested` | 57 | The identifier appears in production source and in no test |
| `tested-only` | 2 | The identifier appears in a test and in no production source |
| `documents-only` | 21 | The identifier appears only in documents |

These measure where an *identifier is written*, not whether behaviour is covered.
A capture requirement is cited from a route, a service, a screen and the capture
grammar module, and from no test file at all, so it counts as
`implemented-untested` - while the generated algorithm catalog reports that
same grammar module has tests, along with every other algorithm module. The
behaviour is covered; the citation is missing from the test.

So `implemented-untested` should be read as "nothing links this requirement to a
test", which is a documentation defect worth fixing, and never as "this is
untested", which would be a false statement about the software. The 21
`documents-only` rows are the genuinely weak ones: the identifier survives in a
roadmap row and nowhere in the code.

## Where the map is thin

The map is honest about being reconstructed, and these are its known soft spots.
None is hidden inside the registry; each is stated in the file's own notes or is
visible from the join.

**Every requirement statement is recovered rather than authored.** No original
specification survives that defines these identifiers, so each statement was
reconstructed from the citations that name it, and all 99 rows carry a
`needs-review` marker saying so. 82 statements could be recovered; 17 are
attributed only by a grouped or ranged citation and carry no statement at all,
because splitting a range into individual statements would be inventing product
claims.

**Two capabilities have no requirements.** `CAP-FOUNDATION` and `CAP-CAREER`
both join to an empty list. For the foundation that is expected - a monorepo and
a continuous-integration pipeline are not the sort of thing anyone wrote a
numbered requirement for. For career tracking it is a real gap: applications,
the pipeline overview and the application dossier are shipped, reachable
features with no requirement identifier anywhere in the code that names them.

**One capability has no roadmap row.** `CAP-CLOUD` was added to the register from
shipped code rather than recovered from `docs/ROADMAP.md` like the other fifteen,
because the hosted control plane shipped without ever appearing on the roadmap.
That is recorded as `DOC-D-011` in the [documentation inventory](../meta/index.md),
along with the missing architecture decision record it implies.

**The `surfaces` field is not machine-checked.** Each row lists the routes
through which its capability is reached. Seven of the entries used to name
paths the router does not mount - an earlier information architecture the route
tree moved past - and were corrected against `docs/generated/routes.json` on
2026-08-26. No gate holds them there: a future route move can silently strand
them again, so treat a `surfaces` value as a claim to spot-check against
`docs/generated/routes.json`, not as a checked address.

## What is checked, and what is not

`scripts/check-docs-traceability.mjs` is the gate, and knowing its edges tells
you which parts of this registry can rot silently.

It **does** fail the build when a requirement names a capability that does not
exist, when a capability's `evidence` path is missing from the repository, when a
journey names an unknown capability, and when a journey names an end-to-end spec
that does not exist or that never mentions the journey by name. That last check
is the sharp one: a coverage claim has to be findable in the file it claims,
otherwise it is only a path that happens to exist.

It **does not** check `surfaces` against the mounted route tree, which is why the
seven wrong entries above survive. It also cannot judge whether a curated
statement is a good description of the behaviour it was recovered from; that is
what the `needs-review` marker is for.

## Related

[The journeys that must work](journeys.md) is the other half of this spine: a
capability says what the product can do, a journey says which paths through
several capabilities are held by an executable test. [What Vitae is for](what-vitae-is.md)
describes the graph these capabilities operate on.
