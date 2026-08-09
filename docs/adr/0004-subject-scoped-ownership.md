# ADR 0004: Subject-scoped ownership: many people in one graph

- **Status:** accepted
- **Date:** 2026-07-31
- **Amends:** SRS §4.3.1 (the `is_self` anchor), §6.6 (résumé model)

## Context

Vitae is a single-**user** system, and until now that was quietly read as a
single-**subject** graph: every record in it was assumed to be the owner's. That
assumption held while the only writer was the owner. It stopped being true the
moment imports began bringing in other people's profiles.

A production audit on 2026-07-30 found **219 of the graph's records belong to six
scraped LinkedIn profiles**, not the owner: 88 of 93 roles, 38 of 39
certifications, 16 of 18 education records, all 48 posts, all 4 publications.

The consequence was not cosmetic. Every section builder in
`services/resume-model.ts` read `graph.nodesByType.get(<type>)` directly, and
only `name`/`tagline`/`contacts` went through the `is_self` anchor. A résumé
generated at that point printed **16 degrees and 10 awards belonging to other
people**. `buildExperience`/`buildProjects` happened to be safe: they default
unselected entries to `disabled`, so the renderer drops them. Skills,
education, awards and research had no such gate.

The graph already knew the answer. `NODE_FORM_DESCRIPTORS[type].subject`
(`packages/core/src/forms/node-forms.ts`) declares the edge that ties a record to
its person: `HELD person→role`, `EARNED person→certification|award`, `ATTENDED
person→education`, `AUTHORED person→publication|repository|post`, `WORKED_ON
person→project`, `COMPLETED person→course`. Only the *forms* layer read it.
Ownership existed at creation time and was forgotten at query time.

## Decision

**Subject edges are authoritative and are read on the query path.** Three rules
follow.

### 1. Ownership is declared once, and derived everywhere else

`packages/core/src/forms/subjects.ts` exposes `subjectEdgeFor(type)`,
`SUBJECT_BEARING_TYPES`, `isSubjectBearing()` and `subjectAssignment()`, all
**derived from `NODE_FORM_DESCRIPTORS`** rather than restating it. A new
subject-bearing type is picked up automatically, and the form layer and the read
layer cannot drift. `apps/api/src/services/subjects.ts` turns that into a whole-
graph answer in one pass over the edge list (`buildOwnerIndex`), because the
résumé needs ownership for every node at once and a query per record would be a
scan per record.

Skills are deliberately **not** owned. A skill node is shared vocabulary that
several people reference; it is *used*, never possessed. `skillIdsFor()` counts a
skill as a person's when a `USES_SKILL` edge starts at them directly (a claimed
résumé skill) or at any record they own (evidence). Both patterns exist in the
data, so either alone loses half the answer.

### 2. Ownership is a total function: unowned is anonymous, never mine

A subject-bearing record with no subject edge belongs to the reserved
**"Unattributed"** person (`props.is_placeholder`, identity key
`vitae:system:unattributed`), not to the graph owner.

"Not mine" and "nobody said" must stay distinguishable. Collapsing them is
precisely the reasoning error that produced the original bug: the old convention
was that an ownerless record was implicitly the owner's, which is a guess, and a
wrong owner is far harder to notice than a missing one. Attributing orphans to an
explicit placeholder keeps them visible and reassignable while stating plainly
that nobody has claimed them. `backfill:subjects` therefore defaults to the
placeholder; `--to-self` is the opt-in for a genuinely single-subject graph.

### 3. The résumé is single-subject; everything else labels the owner

The résumé is the one surface where a foreign record is a *lie about the user*,
so it is scoped strictly to the `is_self` anchor. With no anchor it renders an
**empty** model. Previously it rendered the entire graph under the name "Your
Name", which is the same bug in its worst form.

Every other surface keeps showing the whole graph and says whose each record is:
`GET /nodes/:id` returns `owner`, `GET /nodes?withOwner=true` and `GET /search`
carry it, the people directory carries `recordCount`, and the dashboard reports
`myRecords` / `allRecords` / `unownedRecords` instead of one conflated number.
`GET /people/:id/profile` renders any person's own records as a structured
profile, which turns the imported profiles from contamination into the
warm-intro feature they were imported for.

## Consequences

**Positive.** One definition of ownership, derived from the schema, used by the
résumé, profiles, timeline, search, browse and the audit script. The imported
profiles become useful rather than dangerous. `audit:graph` can now report
`unowned-record` and `contested-record`, so the failure mode is visible instead
of silent.

**Negative / accepted.** Resolving owners needs the whole edge table, so it is a
graph pass. That is why it is opt-in on the node list (`?withOwner=true`) and
free on the detail endpoint (the edges are already loaded). Acceptable at the
single-user scale ceiling (SRS A5), consistent with ADR 0001's existing
acceptance of in-memory passes.

**Migration.** A record created before subjects were explicit has no owner edge
and now belongs to nobody rather than implicitly to the user. Run
`pnpm --filter @vitae/api backfill:subjects` to see them and `--apply` to
attribute them. Production had **0 unowned records** at the time of this ADR, so
the change was behaviour-neutral there.

## Alternatives rejected

**Treat unowned as the owner's.** Backwards compatible and it kept one
integration test passing unchanged. Rejected: it silently re-opens the leak the
next time an importer forgets to write subject edges, and it is the exact
assumption that caused this.

**Move the scraped profiles into a separate data space.** The `demo`/`real`
space mechanism already exists and would isolate them completely. Rejected:
spaces are a *dataset* boundary, not a subject boundary. Warm intros and
who-to-call need the other people in the same graph as the owner to be useful at
all.

**Filter in the UI only.** Cheapest change. Rejected: every new view would
re-derive the rule and one of them would forget, which is how six résumé
builders came to disagree with the form layer in the first place.

## Guard

`apps/api/src/__tests__/resume-scope.test.ts` builds a two-person graph and
asserts that no record owned by the other person reaches the model *or* the
rendered LaTeX. It fails if any single builder loses its scope.
`apps/api/src/services/subjects.test.ts` covers the index itself, including that
an unowned record is never the owner's.
