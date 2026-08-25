# Vitae system requirements

**Status:** current for v1.0.0
**Audience:** maintainers, contributors, and self-hosters

Vitae is open-source, self-hosted software for keeping a life and career graph.
Each installation has one configured operator, while the graph can hold records
about many people. The system is designed for durable ownership: predictable
data, exportable records, and deterministic features instead of runtime AI.

## Product boundaries

Vitae does the following:

- Captures people, roles, projects, skills, interactions, and related records
  as typed nodes connected by typed edges.
- Keeps revisions, supports soft deletion and recovery, and separates real and
  fictional demo data spaces.
- Helps an operator reconnect with people and understand ranking results.
- Creates tailored, ATS-oriented one-page LaTeX résumés from verified career
  evidence.
- Imports structured data through reviewable batches and exports portable
  bundles with integrity metadata.

Vitae does not provide social networking, behavioural advertising,
telemetry-based profiling, or runtime LLM features. It is a tool an operator
runs for their own records.

The supported operating model is a single-operator self-hosted install. The
repository also contains a workspace-partitioned control plane intended for a
hosted offering: it is withheld by a build gate and a separate server
provisioning gate, and no hosted service is asserted here to be operating. Its
release conditions are in [the Cloud launch guide](../CLOUD-LAUNCH.md).

Earlier revisions of this section stated that Vitae does not provide
multi-tenant hosting. Migration `009-workspace-primary-keys` contradicts that by
making `(workspace_id, id)` the primary key of every graph table, so the
sentence has been corrected rather than repeated.

## Supported architecture

| Concern | Current implementation |
| --- | --- |
| Web application | React 19 and Vite in `apps/web` |
| API | Express and TypeScript in `apps/api` |
| Durable data | Postgres 17, accessed through repository boundaries |
| Identity | Firebase Auth, with Google sign-in in production |
| Files | Cloudinary behind a storage adapter |
| Résumé compilation | HMAC-protected Tectonic service in `services/buildsvc` |
| Shared logic | Zod schemas and deterministic algorithms in `packages/core` |
| Test stack | Vitest, Playwright, axe, and GitHub Actions |

The API follows `route → service → repository`. Application code outside
`apps/api/src/db` does not query the database directly. Every request is scoped
to `real` or `demo` through `x-vitae-space`; the default is `real`.

## Data and ownership rules

All records include stable IDs, timestamps, source information, confidence, and
sensitivity. Type-specific values are validated by schemas in `packages/core`.
Edges are records in their own right and can carry provenance and metadata.

Records that describe a person, such as roles, education, publications, and
projects, use subject edges to name that person. The résumé pipeline must use
only records owned by the `is_self` person. Imported records must not silently
be claimed by the operator.

Every write produces a revision in the same database transaction. Deleted
records remain recoverable for 30 days before retention removes them. Imports
are staged, reviewable, idempotent, and can be rolled back as a batch.

## Security and privacy requirements

The security posture is four defended boundaries, and the privacy posture is
three refusals. Each carries a numbered requirement in the register below.

- **The identity boundary is default-deny** (NFR-SEC-001). Requests are denied
  unless a verified identity is admitted by authorization: the configured
  `OWNER_EMAIL` on a self-hosted install, a server-resolved workspace
  membership when the hosted plane is enabled. Failures are neutral and never
  reveal the allow-list. Development sign-in is loopback-only and must be
  disabled in production.
- **The storage boundary is a single adapter** (NFR-SEC-002). Object storage
  is reached through one interface; uploads are content-addressed and delivery
  uses short-lived signed URLs, never public object URLs.
- **The compiler is sandboxed and authenticated** (NFR-SEC-003). Compilation
  accepts only requests signed with a shared-secret message authentication
  code, runs in an isolated container with no network egress, and user content
  is escaped before it reaches LaTeX. The API itself uses security headers and
  a nonce-based content security policy.
- **Secrets stay out of records and history** (NFR-SEC-004). Runtime secrets
  come from environment variables or a protected secret store, never from
  application records or Git; surfaces report a credential's presence, never
  its value. Postgres connections use certificate verification in production,
  and backups are sensitive exports requiring encryption plus tested restores.
- **No runtime AI** (NFR-PRIV-001). No runtime call to an external AI provider,
  and no AI-provider client in any dependency manifest.
- **No telemetry** (NFR-PRIV-002). No behavioural analytics, no tracking
  client, nothing sent to a service the operator did not configure.
- **Every ranking explains itself** (NFR-PRIV-003). A ranked or derived number
  must decompose into the named factors the interface presents.

See [SECURITY.md](../../SECURITY.md) for reporting and supported-version policy.

<!-- generated:requirement-register start -->

<!-- Generated by scripts/docs/gen-srs.mjs. Edit docs/registry/requirements.json, then run `pnpm docs:gen`. -->

## Requirement register

Every identifier below is cited somewhere in this repository. None of them was
defined here before this register existed: the identifiers were in the code and
the specification had none, so a reader following `SRS FR-RES-009` from a source
comment arrived at a document that never mentioned it.

The statements are therefore **recovered, not transcribed**. No authored
specification containing these identifiers survives in the repository, so each
statement is reconstructed from the code, tests and roadmap rows that cite it,
and every entry is marked for review. Identifiers are adopted exactly as written
and are never renumbered, because renumbering would invalidate live citations
across source and continuous integration.

Where a statement could not be recovered without inventing it, none is recorded.
An empty statement is an honest gap; a plausible one would be indistinguishable
from a fabricated product claim.

| Field | Meaning |
| --- | --- |
| Status | Whether the behavior is enforced by shipped code in this repository. |
| Evidence | Where the identifier is cited, derived by `scripts/docs/gen-traceability.mjs`. |
| Provenance | `reconstructed` if a statement was recoverable, `unrecoverable` if not. |

Exact citation locations are in `docs/generated/traceability.json`. They are not
repeated here, because line numbers move for reasons that have nothing to do with
what a requirement means.

### Identity and access

`CAP-AUTH` · Verified sign-in, a default-deny request gate, and an owner allow-list, with a loopback-only development shortcut.

#### FR-015 — Development sign-in is loopback-only

Development sign-in hands any caller a valid owner token, so it must be restricted to loopback requests and must be disabled outside development. The restriction is defence in depth, not the only control.

Status: implemented · Evidence: cited by source · Provenance: reconstructed, needs-review

#### FR-SET-001 — Authenticated and allow-listed access

Every request must be authenticated against a verified identity and authorized against the configured owner, denying by default. The development sign-in shortcut is available only behind an explicit flag.

Status: implemented · Evidence: cited by source · Provenance: reconstructed, needs-review

#### NFR-SEC-001 — The identity boundary is default-deny

Every request is denied unless it carries a verified identity that authorization admits: the configured owner on a self-hosted install, a server-resolved workspace membership when the hosted plane is enabled. Authorization failures are neutral and never reveal the allow-list. The development sign-in shortcut answers loopback requests only and is off in production.

Status: implemented · Evidence: cited by source · Provenance: reconstructed, confirmed

> Authored 2026-08-26 as a product decision under ADR 0007, modelling the trust boundary the T1 marker sits on; cited beside that marker in the header of apps/api/src/middleware/auth.ts. FR-015 and FR-SET-001 state the functional behaviors; this entry states the boundary they defend.

#### INT-1 — Google identity provider integration

Vitae authenticates a person against Google through the Firebase Web SDK in the browser and verifies the resulting identity token on the server before any request is served. A development sign-in shortcut may stand in for the provider only when it is explicitly enabled by configuration.

Status: implemented · Evidence: cited by source · Provenance: reconstructed, needs-review

> Recovered from three independent citations that each name the identifier and describe one face of the same integration: packages/config/src/env.ts:36 marks the authentication configuration block, apps/web/src/lib/firebase.ts:2 the browser sign-in bootstrap, and apps/api/src/middleware/auth.ts:2 server-side verification. docs/ROADMAP.md:13 pairs the identifier with the same behavior.

### The typed career graph

`CAP-DATA-CORE` · Typed nodes and typed edges validated per type, written transactionally, versioned by revision, and soft-deleted rather than destroyed.

#### FR-002 — Related records commit in one transaction

A capture, interaction, merge, or import commit that produces several records must write the nodes, edges, revisions, and reminders in a single database transaction. Identifiers are pre-allocated so related records can reference each other inside that commit, and every durable mutation records audit history.

Status: implemented · Evidence: cited by source and by tests · Provenance: reconstructed, needs-review

#### FR-013 — Edge endpoint types are enforced on create

Edge creation must reject a missing endpoint, and must reject an endpoint whose node type is not permitted for that edge type. The permitted matrix is enforced by the API, not only described by form descriptors.

Status: implemented · Evidence: cited by tests only · Provenance: reconstructed, needs-review

#### NFR-REL-003 — Multi-document writes are atomic

Multi-document writes must go through the transaction boundary so that imports, merges, and resume finalize are atomic. Every mutation is append-only audited, writing the record together with a revision row carrying the full snapshot, the field diff, the operation, and the source. Deletes are soft, and edges to a deleted node are hidden by query filters rather than removed, so that restore is lossless.

Status: implemented · Evidence: cited by source · Provenance: reconstructed, needs-review

### Capture

`CAP-CAPTURE` · A keyboard capture line and schema-driven entity forms that create valid, linked, undoable records.

#### FR-CAP-001 — Keyboard capture grammar

A single capture line must parse deterministically into a plan of linked records, be previewable before commit, and commit as undoable writes.

Status: implemented · Evidence: cited by source · Provenance: reconstructed, needs-review

#### FR-CAP-002 — Schema-driven entity forms

Every node type must be creatable and editable through a form rendered from a shared descriptor, which reports field-level validation errors without throwing and rejects a record missing a required property.

Status: implemented · Evidence: cited by source and by tests · Provenance: reconstructed, needs-review

#### FR-CAP-003 — Entry fields offer existing values

A form field must be able to offer existing values from the graph as debounced, keyboard-navigable suggestions.

Status: implemented · Evidence: cited by source and by tests · Provenance: reconstructed, needs-review

#### FR-CAP-004 — Attachments go through a storage adapter

Attachments must be stored through the storage abstraction, and delivery must use private, short-lived signed URLs.

Status: implemented · Evidence: cited by source · Provenance: reconstructed, needs-review

#### FR-CAP-005 — No statement recovered

_No statement is recorded for this identifier._

Status: implemented · Evidence: cited by documents only · Provenance: unrecoverable, needs-review

> Asserted only by the grouped citation FR-CAP-001/003/005 in docs/ROADMAP.md, whose row text reads "grammar + live preview + commit + undo-able writes". FR-CAP-001 and FR-CAP-003 are pinned individually elsewhere, leaving two unattributed behaviors ("live preview" and "undo-able writes") for one identifier. The statement cannot be recovered without inventing the split.

#### FR-CAP-008 — Note-append targets the last-viewed record

Capture in note-append mode must attach the note to the record the operator viewed most recently.

Status: implemented · Evidence: cited by source · Provenance: reconstructed, needs-review

### Organize, trash, and retention

`CAP-ORGANIZE` · Saved views, revision history, a thirty-day trash with restore, and a purge that makes the retention promise real.

#### FR-006 — The thirty-day trash promise is enforced by a purge

A soft-deleted record must be permanently removed once it ages past the retention window, by a scheduled purge with previewable and dry-runnable commands. Rolling back or discarding a staged import is a deletion intent: the raw upload and the parsed rows must be removed, not retained.

Status: implemented · Evidence: cited by source and by tests · Provenance: reconstructed, needs-review

#### FR-ORG-001 — No statement recovered

_No statement is recorded for this identifier._

Status: implemented · Evidence: cited by documents only · Provenance: unrecoverable, needs-review

> Asserted only by the grouped citation FR-ORG-001/002/007 in docs/ROADMAP.md, whose row text reads "Trash + restore + history/revisions". FR-ORG-002 is pinned individually as restore, leaving two unattributed behaviors for two identifiers with no evidence of which is which.

#### FR-ORG-002 — Restore revives a record and its hidden edges

Restoring a record from trash must also revive the edges that were hidden when it was deleted, so that recovery is lossless.

Status: implemented · Evidence: cited by source · Provenance: reconstructed, needs-review

#### FR-ORG-005 — A query round-trips through a URL

A search query and its filter clauses must round-trip through a URL so that a saved view is shareable and reloadable, and saved views can be named and pinned to the navigation.

Status: implemented · Evidence: cited by source · Provenance: reconstructed, needs-review

#### FR-ORG-007 — No statement recovered

_No statement is recorded for this identifier._

Status: implemented · Evidence: cited by documents only · Provenance: unrecoverable, needs-review

> Asserted only by the grouped citation FR-ORG-001/002/007 in docs/ROADMAP.md, whose row text reads "Trash + restore + history/revisions". FR-ORG-002 is pinned individually as restore, leaving two unattributed behaviors for two identifiers with no evidence of which is which.

### Search and wayfinding

`CAP-SEARCH` · Unified full-text search, a composable filter grammar, and a fuzzy quick-switcher, all scoped to the active data space.

#### FR-017 — Search invalidation is a generation counter

Search index invalidation must be a monotonic generation counter rather than a boolean flag, so that a mutation arriving during a rebuild is not lost.

Status: implemented · Evidence: cited by source · Provenance: reconstructed, needs-review

#### FR-SRCH-001 — Unified ranked full-text search

Search must run a single ranked full-text query over record titles, subtitles, notes, and properties, built from live data and scoped to the active data space.

Status: implemented · Evidence: cited by source · Provenance: reconstructed, needs-review

#### FR-SRCH-002 — Composable filter grammar

Search must accept a composable filter query that parses into a clause tree applied on top of the text query, and the parsed clauses must be reflected back to the operator as visible chips.

Status: implemented · Evidence: cited by source and by tests · Provenance: reconstructed, needs-review

#### FR-SRCH-003 — Deterministic ranking

Search ranking must be deterministic, combining exact-title bonus, recency, and pinned status.

Status: implemented · Evidence: cited by source · Provenance: reconstructed, needs-review

#### FR-SRCH-004 — Fuzzy quick-switcher

A command palette must offer a fuzzy match over record titles alongside actions, in one list with two lanes.

Status: implemented · Evidence: cited by source · Provenance: reconstructed, needs-review

### Relationship intelligence

`CAP-RELATIONSHIPS` · Typed relationship editing, one-tap interaction logging, Hawkes tie strength, reconnect ordering, and explainable contact ranking with warm-introduction paths.

#### FR-CON-001 — The relationship edge is the record

A person-to-person relationship must be editable as a record in its own right, carrying its own properties such as topics. A patch replaces properties wholesale, so the client merges before sending.

Status: implemented · Evidence: cited by source · Provenance: reconstructed, needs-review

#### FR-CON-002 — One-tap interaction logging

Logging an interaction must create the interaction node and its relationship edge from a single overlay.

Status: implemented · Evidence: cited by source · Provenance: reconstructed, needs-review

#### FR-CON-003 — An interaction can spawn a follow-up reminder

Logging an interaction, or committing a dated capture, must be able to create a follow-up reminder in the same commit.

Status: implemented · Evidence: cited by source · Provenance: reconstructed, needs-review

#### FR-CON-004 — Reconnect lane ordering

The dashboard reconnect lane must rank ties by a deterministic spaced-repetition score, presenting the strongest need first.

Status: implemented · Evidence: cited by source · Provenance: reconstructed, needs-review

#### FR-CON-005 — No statement recovered

_No statement is recorded for this identifier._

Status: implemented · Evidence: cited by documents only · Provenance: unrecoverable, needs-review

> Asserted only by the range citation FR-CON-001..009 in docs/ROADMAP.md, whose row lists five features across nine identifiers. No individual behavior can be attributed to this identifier from any source in the repository.

#### FR-CON-006 — Contact ranking decomposes into factor chips

A who-to-call ranking must decompose exactly into the per-factor contributions the interface displays, so that every rank is explained by name and number rather than by color alone.

Status: implemented · Evidence: cited by source and by tests · Provenance: reconstructed, needs-review

#### FR-CON-007 — Ranking weights come from settings

The weights that rank contacts must be read from settings rather than fixed in the route.

Status: implemented · Evidence: cited by source · Provenance: reconstructed, needs-review

#### FR-CON-008 — Warm-introduction paths carry per-hop evidence

A warm-introduction search must run a deterministic bounded traversal from the operator to a target organization and present each path with its per-hop evidence, scoring a path by the product of its hop strengths so that long weak chains rank below short strong ones.

Status: implemented · Evidence: cited by documents only · Provenance: reconstructed, needs-review

> Recovered by elimination: the identifier appears only inside a grouped citation, and every other identifier in that group is pinned individually elsewhere, leaving exactly one unattributed behavior in the group text. Here the group is FR-CON-006..009 on the network-intelligence row of docs/ROADMAP.md; FR-CON-006, FR-CON-007 and FR-CON-009 are pinned individually, leaving warm-introduction paths with per-hop evidence. The behavior is implemented by packages/core/src/algorithms/graph-paths.ts and apps/api/src/routes/v1/intros.ts.

#### FR-CON-009 — Tie strength recomputes immediately

Logging an interaction must recompute and persist the affected tie strength within the same request rather than deferring it to a batch.

Status: implemented · Evidence: cited by source · Provenance: reconstructed, needs-review

#### FR-CON-010 — The favor ledger is part of the relationship record

A favor must be recordable on the relationship it belongs to, in either direction — owed to the operator or owed by them — with a settle state and dates. The ledger is visible on the person and editable without leaving them, and a concurrent edit to the relationship is refused rather than silently overwritten.

Status: implemented · Evidence: cited by documents only · Provenance: reconstructed, confirmed

> Authored 2026-08-26 as a product decision under ADR 0007 — the ledger shipped with no requirement naming it. Enforced by the favor properties on the relationship edge in packages/core/src/schema/edge-props.ts and the favors route in apps/api/src/routes/v1/favors.ts, whose concurrency refusal is the EDGE_CHANGED conflict; neither cites this identifier, so the attribution is recorded here.

### Correspondence intelligence

`CAP-COMMS` · Deterministic analytics over logged interactions: reciprocity, reply latency, unanswered inbound, introduction events, brokers, and dormant-but-once-strong ties, computed with the constants the relationship algorithms already ship.

**Status: planned.** Planned under ADR 0007. The mathematics ships in packages/core (tie strength, decay, cadence constants); the import runbook specifies the analytics in full; no in-app surface computes or presents them yet.

#### FR-COMM-001 — A correspondence profile per person

For any person with logged interactions, a correspondence profile must be computable deterministically: reciprocity ratio, median reply latency in each direction, unanswered inbound count, and the distribution of contact days — each figure decomposing into the interactions that produced it.

Status: planned · Evidence: cited by documents only · Provenance: reconstructed, confirmed

> Authored 2026-08-26 as a product decision under ADR 0007. The constants and the interaction substrate ship in packages/core; no surface computes or presents the profile yet.

#### FR-COMM-002 — A network rollup of correspondence health

A network-level correspondence rollup must rank dormant-but-once-strong ties for reactivation and name the brokers through whom introductions have historically flowed, computed with the same constants the relationship algorithms ship with, so the rollup and the per-tie views cannot disagree.

Status: planned · Evidence: cited by documents only · Provenance: reconstructed, confirmed

> Authored 2026-08-26 as a product decision under ADR 0007.

#### FR-COMM-003 — Introductions are first-class facts

An introduction must be recordable as a first-class fact — who introduced whom, when, in what context — feeding broker detection, warm-path evidence, and the favor ledger.

Status: planned · Evidence: cited by documents only · Provenance: reconstructed, confirmed

> Authored 2026-08-26 as a product decision under ADR 0007. The relationship edge already stores met_via and an intro_path; this requirement is the recording surface and the computation over it, not new storage.

### Explore

`CAP-EXPLORE` · The Life map, the Chronograph timeline, and the Atlas of places, each with a keyboard and list equivalent and URL-backed state.

#### FR-VIS-001 — Life map

The graph must be explorable as a navigable life map with a keyboard and list equivalent and URL-backed state.

Status: implemented · Evidence: cited by source · Provenance: reconstructed, needs-review

#### FR-VIS-002 — Chronograph timeline

Career and life records must be explorable on a timeline with a keyboard and list equivalent and URL-backed state.

Status: implemented · Evidence: cited by source · Provenance: reconstructed, needs-review

#### FR-VIS-003 — Atlas of places

Places in the graph must be explorable on a navigable map with a keyboard and list equivalent and URL-backed state.

Status: implemented · Evidence: cited by source · Provenance: reconstructed, needs-review

#### FR-VIS-005 — Timeline brush feeds a review surface

Selecting a range on the timeline must carry that range into a review surface for the records it covers.

Status: implemented · Evidence: cited by source · Provenance: reconstructed, needs-review

> Recovered by elimination: the identifier appears only inside a grouped citation, and every other identifier in that group is pinned individually elsewhere, leaving exactly one unattributed behavior in the group text. Here the group is FR-VIS-002/005 in apps/web/src/features/timeline/TimelineView.tsx, whose text reads "Chronograph, career/life timeline with brush to review"; FR-VIS-002 is pinned as the chronograph itself by the Explore row of docs/ROADMAP.md, leaving the brush-to-review behavior.

### Staged import

`CAP-IMPORT` · External sources staged into reviewable batches that are idempotent, committable, rollbackable, and attributable to their origin.

#### FR-020 — Unassigned import lines stay retryable

An import line that was not assigned to a target creates nothing and must remain retryable with a stated reason. Only a clean run closes a batch, and the raw upload is purged once the batch closes.

Status: implemented · Evidence: cited by source · Provenance: reconstructed, needs-review

#### FR-IMP-001 — No statement recovered

_No statement is recorded for this identifier._

Status: implemented · Evidence: cited by documents only · Provenance: unrecoverable, needs-review

> Asserted only by the range citation IMP-001..006 in docs/ROADMAP.md, written without the FR- prefix. The row names seven import sources and four lifecycle behaviors across six identifiers, so no individual statement can be attributed. The capability itself is implemented and covered; only the per-identifier split is unrecoverable.

#### FR-IMP-002 — No statement recovered

_No statement is recorded for this identifier._

Status: implemented · Evidence: cited by documents only · Provenance: unrecoverable, needs-review

> Asserted only by the range citation IMP-001..006 in docs/ROADMAP.md, written without the FR- prefix. The row names seven import sources and four lifecycle behaviors across six identifiers, so no individual statement can be attributed. The capability itself is implemented and covered; only the per-identifier split is unrecoverable.

#### FR-IMP-003 — No statement recovered

_No statement is recorded for this identifier._

Status: implemented · Evidence: cited by documents only · Provenance: unrecoverable, needs-review

> Asserted only by the range citation IMP-001..006 in docs/ROADMAP.md, written without the FR- prefix. The row names seven import sources and four lifecycle behaviors across six identifiers, so no individual statement can be attributed. The capability itself is implemented and covered; only the per-identifier split is unrecoverable.

#### FR-IMP-004 — No statement recovered

_No statement is recorded for this identifier._

Status: implemented · Evidence: cited by documents only · Provenance: unrecoverable, needs-review

> Asserted only by the range citation IMP-001..006 in docs/ROADMAP.md, written without the FR- prefix. The row names seven import sources and four lifecycle behaviors across six identifiers, so no individual statement can be attributed. The capability itself is implemented and covered; only the per-identifier split is unrecoverable.

#### FR-IMP-005 — No statement recovered

_No statement is recorded for this identifier._

Status: implemented · Evidence: cited by documents only · Provenance: unrecoverable, needs-review

> Asserted only by the range citation IMP-001..006 in docs/ROADMAP.md, written without the FR- prefix. The row names seven import sources and four lifecycle behaviors across six identifiers, so no individual statement can be attributed. The capability itself is implemented and covered; only the per-identifier split is unrecoverable.

#### FR-IMP-006 — No statement recovered

_No statement is recorded for this identifier._

Status: implemented · Evidence: cited by documents only · Provenance: unrecoverable, needs-review

> Asserted only by the range citation IMP-001..006 in docs/ROADMAP.md, written without the FR- prefix. The row names seven import sources and four lifecycle behaviors across six identifiers, so no individual statement can be attributed. The capability itself is implemented and covered; only the per-identifier split is unrecoverable.

#### FR-SYNC-001 — Imports can propose field-level updates

A staged import that matches an existing record by identity key must be able to propose field-level updates, presented as a per-field diff for review; nothing updates without acceptance, and a rejected proposal leaves the record untouched.

Status: planned · Evidence: cited by documents only · Provenance: reconstructed, confirmed

> Authored 2026-08-26 as a product decision under ADR 0007. Today a repeat identity key returns the existing record unchanged, so longitudinal updates are impossible through any importer — the gap that forces manual reconciliation of every re-import.

#### FR-SYNC-002 — Re-import is longitudinal

Re-importing from the same source must be longitudinal: unchanged rows converge silently on their identity keys, changed rows become update proposals, and the batch report counts created, updated, unchanged, and skipped separately.

Status: planned · Evidence: cited by documents only · Provenance: reconstructed, confirmed

> Authored 2026-08-26 as a product decision under ADR 0007. Deterministic identifiers derived from identity keys already make convergence possible; the update path is what is missing.

### Identity integrity

`CAP-IDENTITY` · A duplicate candidate queue scored on shared evidence, an evidence-led merge, learned aliases, merge history, and a conflict-aware undo.

#### FR-003 — Merge undo refuses a record edited since the merge

Undoing a merge must refuse when any affected record has been edited since the merge was performed, and must report a conflict requiring manual recovery rather than silently destroying the later edit.

Status: implemented · Evidence: cited by source and by tests · Provenance: reconstructed, needs-review

#### FR-008 — Duplicate candidates require shared evidence

A pair may be offered as a duplicate candidate only when the two records share identity, contact, URL or domain, or geography evidence. Opening a screen must not start a full duplicate scan as a side effect.

Status: implemented · Evidence: cited by source · Provenance: reconstructed, needs-review

#### FR-ORG-008 — Identity integrity workflow

Duplicate candidates must be presented as a queue, merged on visible evidence, recorded in history with learned aliases, and undoable.

Status: implemented · Evidence: cited by documents only · Provenance: reconstructed, needs-review

> The only citation is the identity-integrity row of docs/ROADMAP.md:22, so the statement is that row restated as a requirement rather than recovered from code. The behavior is implemented: the candidate queue and merge live in apps/api/src/routes/v1/duplicates.ts, and the scoring in packages/core/src/algorithms/dedup.ts. Neither cites the identifier, which is why the attribution is recorded here instead of being inferred silently.

### Provenance and change history

`CAP-PROV` · Surfacing what every record already carries: where a fact came from, how confident it is, and what changed since the operator last looked, over the in-transaction revision history.

**Status: planned.** Planned under ADR 0007. Source, source reference, and confidence ship on every envelope, and every mutation writes a revision with a stored diff; the surfaces that would show them do not exist yet.

#### FR-PROV-001 — Provenance is visible on the record

Every record surface must be able to show where a fact came from — source, source reference, and confidence — as inspectable provenance rather than hidden columns, and provenance must be filterable wherever records are searched.

Status: planned · Evidence: cited by documents only · Provenance: reconstructed, confirmed

> Authored 2026-08-26 as a product decision under ADR 0007. The fields ship on every envelope and the search grammar already filters on source; the record surfaces do not yet present them.

#### FR-PROV-002 — The ledger answers what changed

A ledger must answer what changed since the operator last looked: a reverse-chronological feed over the revision history, each entry naming the operation and linking to its record and its diff.

Status: planned · Evidence: cited by documents only · Provenance: reconstructed, confirmed

> Authored 2026-08-26 as a product decision under ADR 0007. Every mutation already writes a revision carrying snapshot, diff, operation, and source in the same transaction; the feed is a read surface over what exists.

#### FR-PROV-003 — History opens into field-level diffs

A record's history must open into field-level diffs between revisions — what changed, from what, to what — not only a count of revision ticks.

Status: planned · Evidence: cited by documents only · Provenance: reconstructed, confirmed

> Authored 2026-08-26 as a product decision under ADR 0007. The stored revision rows already carry the field diff.

### Resume evidence and tailoring

`CAP-RESUME` · Atoms and variants scored against a parsed job description, selected to a one-page budget, escaped, rendered to LaTeX, compiled, and checked for coverage.

#### FR-011 — Final is an invariant, not a label

A resume may be marked as sent only when it has been compiled and finalized. A draft must be refused.

Status: implemented · Evidence: cited by source and by tests · Provenance: reconstructed, needs-review

#### FR-018 — Selection feasibility includes entry overhead

Resume selection must budget each candidate at its bullet lines plus its entry overhead, and must report the same cost that the greedy loop budgets with.

Status: implemented · Evidence: cited by source and by tests · Provenance: reconstructed, needs-review

#### FR-RES-001 — No statement recovered

_No statement is recorded for this identifier._

Status: implemented · Evidence: cited by documents only · Provenance: unrecoverable, needs-review

> Asserted only by the range citation FR-RES-001..018 on the resume-engine row of docs/ROADMAP.md, which lists eleven features across eighteen identifiers. Positional mapping would be invention, so no statement is recorded.

#### FR-RES-002 — No statement recovered

_No statement is recorded for this identifier._

Status: implemented · Evidence: cited by documents only · Provenance: unrecoverable, needs-review

> Asserted only by the range citation FR-RES-001..018 on the resume-engine row of docs/ROADMAP.md, which lists eleven features across eighteen identifiers. Positional mapping would be invention, so no statement is recorded.

#### FR-RES-003 — No statement recovered

_No statement is recorded for this identifier._

Status: implemented · Evidence: cited by documents only · Provenance: unrecoverable, needs-review

> Asserted only by the range citation FR-RES-001..018 on the resume-engine row of docs/ROADMAP.md, which lists eleven features across eighteen identifiers. Positional mapping would be invention, so no statement is recorded.

#### FR-RES-004 — An atom cites its provenance

A resume atom must be able to cite the records that evidence it. Provenance is held for review and is never rendered into the compiled document.

Status: implemented · Evidence: cited by source · Provenance: reconstructed, needs-review

#### FR-RES-005 — Job descriptions parse to weighted keywords

Pasting a job description must produce a set of weighted keywords deterministically, with no call to an external model.

Status: implemented · Evidence: cited by source · Provenance: reconstructed, needs-review

#### FR-RES-006 — The parsed keyword set is editable

The parsed keyword set must be fully editable downstream of the parser: keywords can be added, removed, and reweighted.

Status: implemented · Evidence: cited by source · Provenance: reconstructed, needs-review

#### FR-RES-007 — Atom scoring decomposes exactly

Every atom must be scored against the active target as soon as one exists, independently of selection, and the per-keyword contributions shown in the breakdown must sum to the reported relevance exactly.

Status: implemented · Evidence: cited by source and by tests · Provenance: reconstructed, needs-review

#### FR-RES-008 — Deterministic selection to a page budget

Selection must fill the page budget deterministically, so that identical inputs give identical proposals. Pinned atoms are forced in, a per-role bullet partition constraint applies, and a manual mode lets the operator hand-pick and order the selection instead.

Status: implemented · Evidence: cited by source and by tests · Provenance: reconstructed, needs-review

#### FR-RES-009 — Template line model and page-fill meter

Each template must carry a line model that estimates how many rendered lines a block of content will occupy, driving a page-fill meter against the one-page budget. The estimate must stay within a stated tolerance of real compiled output, verified by compiling calibration fixtures.

Status: implemented · Evidence: cited by source and by tests · Provenance: reconstructed, needs-review

#### FR-RES-010 — No statement recovered

_No statement is recorded for this identifier._

Status: implemented · Evidence: cited by documents only · Provenance: unrecoverable, needs-review

> Asserted only by the range citation FR-RES-001..018 on the resume-engine row of docs/ROADMAP.md, which lists eleven features across eighteen identifiers. Positional mapping would be invention, so no statement is recorded.

#### FR-RES-011 — Build the resume model and render LaTeX

Finalizing must assemble the selected evidence into a resume model, render it through the chosen template to LaTeX, and submit it for compilation.

Status: implemented · Evidence: cited by source · Provenance: reconstructed, needs-review

> Recovered by elimination: the identifier appears only inside a grouped citation, and every other identifier in that group is pinned individually elsewhere, leaving exactly one unattributed behavior in the group text. Here the group is FR-RES-011/012/013 in apps/api/src/routes/v1/resumes.ts, whose text reads "Build the resume model, render LaTeX, and compile"; FR-RES-012 is pinned as LaTeX escaping and FR-RES-013 as compile-service degradation.

#### FR-RES-012 — User content is escaped before it reaches LaTeX

All operator content must be escaped and sanitized before it is written into LaTeX, neutralizing shell-escape and injection attempts. This requirement is security-critical and is verified by property-based fuzzing that the escaped output always compiles.

Status: implemented · Evidence: cited by source and by tests · Provenance: reconstructed, needs-review

#### FR-RES-013 — Compilation degrades rather than fails the flow

Requests to the compile service must be authenticated by a message authentication code, and an unavailable compile service must degrade the affected step rather than fail the whole flow.

Status: implemented · Evidence: cited by source and by tests · Provenance: reconstructed, needs-review

#### FR-RES-014 — One-page fit loop after compile

When a compiled document overflows one page, a bounded fit loop must plan and apply reduction steps until it fits or the step cap is reached.

Status: implemented · Evidence: cited by source and by tests · Provenance: reconstructed, needs-review

#### FR-RES-015 — Coverage gate on the compiled document

Finalizing must extract the text of the compiled PDF and verify that it covers at least ninety-five percent of the selected evidence before the document is accepted.

Status: implemented · Evidence: cited by source · Provenance: reconstructed, needs-review

#### FR-RES-016 — No statement recovered

_No statement is recorded for this identifier._

Status: implemented · Evidence: cited by documents only · Provenance: unrecoverable, needs-review

> Asserted only by the range citation FR-RES-001..018 on the resume-engine row of docs/ROADMAP.md, which lists eleven features across eighteen identifiers. Positional mapping would be invention, so no statement is recorded.

#### FR-RES-017 — No statement recovered

_No statement is recorded for this identifier._

Status: implemented · Evidence: cited by documents only · Provenance: unrecoverable, needs-review

> Asserted only by the range citation FR-RES-001..018 on the resume-engine row of docs/ROADMAP.md, which lists eleven features across eighteen identifiers. Positional mapping would be invention, so no statement is recorded.

#### FR-RES-018 — Marking a resume sent creates the application record

Marking a resume as sent must create or link an application node, so that the career pipeline is a consequence of the send rather than a separate manual step.

Status: implemented · Evidence: cited by source · Provenance: reconstructed, needs-review

#### FR-RES-019 — Saved outputs can be recompiled and re-uploaded

A saved resume output must be recompilable, re-uploading its PDF and LaTeX source, so that a lost or corrupted artifact can be recovered.

Status: implemented · Evidence: cited by source · Provenance: reconstructed, needs-review

#### FR-RES-020 — Cover letters are stored as structured drafts

A cover letter must be storable against a target as structured blocks of hook, body, and closer, each sourced from text or from an atom, with full create, read, update, and delete support.

Status: partial · Evidence: cited by source and by tests · Provenance: reconstructed, needs-review

> The model and the generation interface are shipped. docs/ROADMAP.md records LaTeX and PDF compilation of a cover letter as deferred, so the requirement is partially implemented.

#### FR-RES-021 — Letters compile like résumés

A finalized cover letter must compile to the same artifact pair as a résumé — PDF plus source — through the same sandboxed compiler, with the same escape guarantees and the same graceful degradation when the compiler is unreachable.

Status: planned · Evidence: cited by documents only · Provenance: reconstructed, confirmed

> Authored 2026-08-26 as a product decision under ADR 0007, closing the parity gap FR-RES-020 records: the letters surface ships authoring without compilation, and shipping half a document pipeline silently was the alternative being declined.

#### NFR-COMP-002 — Compiled documents are reproducible and parseable

Compiling the same document twice with a pinned source date must produce byte-identical artifacts, so an operator can prove that an archived file is the one they sent. Compiled output must stay parseable by applicant tracking systems: one page, standard fonts, no content that only a human renderer can read.

Status: implemented · Evidence: cited by documents only · Provenance: reconstructed, confirmed

> Authored 2026-08-26 as a product decision under ADR 0007. Enforced by SOURCE_DATE_EPOCH handling in services/buildsvc and the template contract's strict mode; the enforcing code does not cite this identifier, so the attribution is recorded here.

### Evidence dossiers

`CAP-DOSSIER` · Derived evidence packets that generalize the résumé pipeline for audiences beyond hiring: a promotion review, a petition exhibit list, a clearance history — single-subject, deterministic, with a provenance appendix.

**Status: planned.** Planned under ADR 0007 for the periodic-prover persona. Selection, compilation, and reproducibility reuse the résumé machinery; what is new is the audience grammars and the provenance appendix.

#### FR-DOS-001 — A dossier is compiled evidence with a provenance appendix

A dossier is a named, single-subject selection of evidence records compiled deterministically into a document whose every claim cites the records behind it, closed by a provenance appendix carrying each claim's source, confidence, and revision trail.

Status: planned · Evidence: cited by documents only · Provenance: reconstructed, confirmed

> Authored 2026-08-26 as a product decision under ADR 0007, for the periodic-prover persona. Selection, compilation, reproducibility, and the single-subject rule reuse the résumé machinery and its requirements.

#### FR-DOS-002 — Dossier templates address named audiences

Dossier templates must address named audiences — a promotion review, a petition exhibit list, a clearance or background history — each with its own section grammar and inclusion rules, sharing one selection and compile pipeline underneath.

Status: planned · Evidence: cited by documents only · Provenance: reconstructed, confirmed

> Authored 2026-08-26 as a product decision under ADR 0007.

### Career tracking

`CAP-CAREER` · Applications as graph records with pipeline overview, linked posting, target, resume, company, referrer, and interview context.

#### FR-CAR-001 — An application is a typed record with a status machine

An application is a graph record carrying a typed status machine, and the career runway groups applications by live stage — draft, applied, screening, interview, offer — with terminal outcomes presented apart from the live stages rather than mixed into them.

Status: implemented · Evidence: cited by documents only · Provenance: reconstructed, confirmed

> Authored 2026-08-26 as a product decision under ADR 0007 — the career capability shipped with no requirement naming what it does. Enforced by the application property schema in packages/core/src/schema/node-props.ts and the runway grouping in apps/web/src/routes/career/CareerOverview.tsx; neither cites this identifier, so the attribution is recorded here.

#### FR-CAR-002 — The application dossier joins its whole context

An application's dossier must join the posting, the tailoring target, the sent résumé, the company, the referrer, and the interview loop into one surface, and must state in one line which context is missing rather than hiding the gap.

Status: implemented · Evidence: cited by documents only · Provenance: reconstructed, confirmed

> Authored 2026-08-26 as a product decision under ADR 0007. Enforced by the dossier read projection in packages/core/src/schema/application.ts and apps/web/src/routes/career/ApplicationDossier.tsx; neither cites this identifier, so the attribution is recorded here.

#### FR-CAR-003 — Applications get first-class write endpoints

Applications must be creatable and editable through first-class endpoints that validate the status machine and its transitions, not only through the generic record API.

Status: planned · Evidence: cited by documents only · Provenance: reconstructed, confirmed

> Authored 2026-08-26 as a product decision under ADR 0007. Today the application list is read-only at the API surface and writes travel through the generic node endpoints, so a status transition is validated as a property shape rather than as a transition.

#### FR-CAR-004 — The runway leads with next moves

The career runway must lead with next moves: the due and overdue next steps across live applications, ranked by date, each linking to the application it belongs to.

Status: implemented · Evidence: cited by documents only · Provenance: reconstructed, confirmed

> Authored 2026-08-26 as a product decision under ADR 0007. Enforced by the next-moves panel in apps/web/src/routes/career/CareerOverview.tsx, which does not cite this identifier, so the attribution is recorded here.

### Export and restore

`CAP-EXPORT` · A self-describing JSONL and Markdown bundle with checksums and a manifest, and a restore path that validates before it writes.

#### FR-001 — Full-fidelity export and restore

Export must write every collection with its document identity and subcollections intact, so that a restore round-trips the graph without loss. Restore must validate bundle integrity before performing any force-replacement write, and a force restore must prune only what the bundle omits.

Status: implemented · Evidence: cited by source and by tests · Provenance: reconstructed, needs-review

#### FR-009 — Export policy checks re-read their referents

An export policy decision about a referenced record must re-read that record rather than rely on a value retained from an earlier pass.

Status: implemented · Evidence: cited by source · Provenance: reconstructed, needs-review

#### FR-012 — Sensitive records are excluded transitively

A default export must exclude records marked sensitive and everything that depends on them, not only the sensitive records themselves.

Status: implemented · Evidence: cited by source and by tests · Provenance: reconstructed, needs-review

#### FR-021 — Spreadsheet formulas are neutralized in CSV output

A value written to CSV that a spreadsheet would interpret as a formula must be neutralized before it is written.

Status: implemented · Evidence: cited by tests only · Provenance: reconstructed, needs-review

#### FR-EXP-010 — Full-fidelity export bundle

A one-click export must produce a self-describing bundle of JSONL records and a Markdown vault with a checksummed manifest, streamed entry by entry.

Status: implemented · Evidence: cited by source · Provenance: reconstructed, needs-review

#### FR-SET-007 — Sensitive records are opt-in for export

Records marked sensitive must be excluded from an export unless the operator explicitly opts in.

Status: implemented · Evidence: cited by source · Provenance: reconstructed, needs-review

#### NFR-COMP-001 — Leaving is a supported feature

The complete graph must export to open formats — JSON Lines per collection and a Markdown vault readable by plain-text tools — with a checksummed manifest, and a restore from that bundle must round-trip document identity. No commercial state may degrade export: a locked workspace keeps its way out.

Status: implemented · Evidence: cited by documents only · Provenance: reconstructed, confirmed

> Authored 2026-08-26 as a product decision under ADR 0007. The behavior is enforced by apps/api/src/services/export.ts and services/restore.ts, and the locked-workspace escape hatch by the entitlement gate in apps/api/src/middleware/workspace.ts; none of them cites this identifier, so the attribution is recorded here. FR-001, FR-EXP-010 and FR-SET-007 state the functional halves; this entry states the portability promise they add up to.

### Operate and observe

`CAP-OPERATE` · Liveness and readiness probes, a health page, graceful shutdown, a storage adapter, an isolated compile service, and a secret store kept outside application data.

#### FR-004 — Third-party credentials live in a secret store

Credentials for third-party services must be read from a secret store or an injected environment variable, never persisted in application data. Postgres keeps only non-secret synchronization settings, and a surface that reports credential presence must report presence, not the value.

Status: implemented · Evidence: cited by source · Provenance: reconstructed, needs-review

#### FR-005 — Health counts come from aggregate queries

The status page is polled about once a minute, so its node and edge counts must come from aggregate queries rather than from loading the tables.

Status: implemented · Evidence: cited by source · Provenance: reconstructed, needs-review

#### FR-026 — Liveness, readiness, shutdown, and outbound deadlines

Liveness and readiness must be separate probes, shutdown must stop accepting traffic before letting in-flight requests finish, outbound HTTP must carry a deadline so a stalled connection cannot hold a request open, and every request must be correlated in the access log.

Status: implemented · Evidence: cited by source · Provenance: reconstructed, needs-review

#### FR-027 — No published fallback signing key

The build service signing key is the authentication, so there must be no published fallback value. A published fallback would let any caller sign a request.

Status: implemented · Evidence: cited by source · Provenance: reconstructed, needs-review

#### FR-EXP-012 — Scheduled off-box backups

The deployment must take scheduled encrypted backups to storage held outside the application host.

Status: partial · Evidence: cited by documents only · Provenance: reconstructed, needs-review

> Split inferred from the order of the two behaviors named in the backup row of docs/ROADMAP.md, which cites EXP-012/013 without the FR- prefix. Status is partial rather than planned because scripts/backup-to-s3.sh exists and is wired to the backup:s3 package script, while docs/ROADMAP.md still records scheduled backups as an unshipped production concern. That contradiction is recorded as DOC-D-028.

#### FR-EXP-013 — Periodic restore drill

The deployment must rehearse a full restore from a backup on a stated schedule, and the drill must be documented as a runnable procedure.

Status: partial · Evidence: cited by documents only · Provenance: reconstructed, needs-review

> Split inferred from the order of the two behaviors named in the backup row of docs/ROADMAP.md, which cites EXP-012/013 without the FR- prefix. docs/runbooks/restore-drill.md documents the procedure; whether it is rehearsed on a schedule is an operational fact this repository cannot evidence.

#### FR-SET-006 — Health page

A status route must report the health of the database, storage, and build service, together with live record counts.

Status: implemented · Evidence: cited by source · Provenance: reconstructed, needs-review

#### NFR-OPS-001 — Stated and rehearsed recovery objectives

A production or hosted deployment must state its recovery point and recovery time objectives, take scheduled encrypted backups to storage off the application host, and demonstrate the stated objectives by a rehearsed restore drill on a recorded cadence.

Status: partial · Evidence: cited by documents only · Provenance: reconstructed, confirmed

> Authored 2026-08-26 as a product decision under ADR 0007. The mechanics exist — scripts/backup-to-s3.sh, docs/runbooks/restore-drill.md, FR-EXP-012 and FR-EXP-013 — but the objectives themselves are numbers this repository cannot supply: backup retention and recovery targets are among the operational facts docs/CLOUD-LAUNCH.md records as needing outside confirmation. The stated remainder is exactly those numbers and their cadence.

#### NFR-SEC-002 — The storage boundary is a single adapter

Object storage is reached only through one adapter interface: uploads are content-addressed, delivery uses short-lived signed URLs, and no public object URL is ever handed out. Swapping the provider is a change to one binding, not a search across the application.

Status: implemented · Evidence: cited by source · Provenance: reconstructed, confirmed

> Authored 2026-08-26 as a product decision under ADR 0007, modelling the trust boundary the T5 marker sits on; cited beside that marker in the header of apps/api/src/services/storage/adapter.ts. INT-5 and FR-CAP-004 state the interface and the dedup rule; this entry states the boundary posture.

#### NFR-SEC-003 — The compiler is sandboxed and authenticated

Document compilation accepts only requests signed with a shared-secret message authentication code, runs untrusted input in an isolated container with no network egress, works in a per-request scratch directory, and ships no published fallback key. Operator content is escaped before it reaches the compiler.

Status: implemented · Evidence: cited by documents only · Provenance: reconstructed, confirmed

> Authored 2026-08-26 as a product decision under ADR 0007. Enforced by services/buildsvc/src/server.ts together with FR-027, FR-RES-012, and FR-RES-013, which state three of its clauses individually; the isolation posture as a whole had no identifier until this one.

#### NFR-SEC-004 — Secrets stay out of records and history

Credentials live in the environment or a protected secret store, never in application records, exports, or version control. A surface reports a credential's presence, never its value. A stored third-party token is encrypted at rest and is never returned to the browser.

Status: implemented · Evidence: cited by documents only · Provenance: reconstructed, confirmed

> Authored 2026-08-26 as a product decision under ADR 0007. FR-004 states the storage rule and the presence-not-value rule for one surface; apps/api/src/services/secrets.ts enforces the store and the GitHub token path enforces encryption at rest. The enforcing code does not cite this identifier, so the attribution is recorded here.

#### INT-5 — Attachment storage is reached only through an adapter

The application talks to object storage through one interface, so the provider can be replaced by changing a single binding. Uploads are content-addressed so identical bytes are stored once, and delivery is private through short-lived signed URLs rather than public object URLs.

Status: implemented · Evidence: cited by source · Provenance: reconstructed, needs-review

> Recovered from apps/api/src/services/storage/adapter.ts:2, which names the identifier and states the swap requirement, the content-addressing rule and the private-delivery rule in the same header. The dedup clause there cites FR-CAP-004 separately, so it is attributed to that identifier and only summarized here.

### Hosted workspace and billing control plane

`CAP-CLOUD` · Server-derived workspace scoping, idempotent workspace bootstrap, a server-owned plan catalog, signed provider webhooks with replay protection, and a lifecycle gate that keeps a locked workspace readable and exportable.

**Status: gated.** Shipped in the repository and covered by integration tests, but not enabled for the public. The public build gate is VITE_PUBLIC_CLOUD_ENABLED and the server provisioning gate is separate. No hosted service is asserted to be operating.

#### FR-105 — Export holds a per-workspace lock

Export must take a per-workspace lock so that one workspace export cannot block another.

Status: implemented · Evidence: cited by source · Provenance: reconstructed, needs-review

#### NFR-OPS-002 — A lapsed workspace stays readable, exportable, and honest

When payment lapses, a hosted workspace becomes read-only rather than deleted: reads, export, billing, and sign-out keep working while every other mutation is refused by the server with the access state and the way out named in the refusal. The interface must present the lock at the controls it disables, not only announce it globally.

Status: partial · Evidence: cited by source · Provenance: reconstructed, confirmed

> Authored 2026-08-26 as a product decision under ADR 0007. The server half is enforced by the method-based entitlement gate in apps/api/src/middleware/workspace.ts; the shell banner names the lock, and the shared write entry points — the new-record menu, both capture triggers, the entity form dialog, and the bulk bars — disable themselves with the lock explained at the control. The stated remainder is the long tail of per-screen inline mutations (the interaction logger, tailoring autosave, reminder completion), which still rely on the server refusal being surfaced rather than pre-empted.

### Cross-cutting platform behavior

`CAP-PLATFORM` · The constraints that hold across every screen and endpoint: request correlation, error mapping, timezone correctness, authenticated transport, accessible overlays, shared contracts, and the performance rules that keep the graph read once.

#### FR-007 — Continuous integration fails loudly rather than skipping

Every continuous-integration job must fail rather than skip when its preconditions are missing, and must upload the report and traces needed to diagnose a failure.

Status: implemented · Evidence: cited by source · Provenance: reconstructed, needs-review

#### FR-010 — Oversized and malformed bodies map to 413 and 400

The request body limit must accommodate a legitimate export or contacts payload of several megabytes, and an oversized or malformed body must produce 413 or 400 carrying a request identifier, never a generic 500. The limit must be applied early enough that a router-local parser cannot bypass it.

Status: implemented · Evidence: cited by source and by tests · Provenance: reconstructed, needs-review

#### FR-014 — Downloads use the authenticated transport

A file download must go through the shared API client so that it carries the bearer token and the active data space, rather than issuing a bare fetch.

Status: implemented · Evidence: cited by source · Provenance: reconstructed, needs-review

#### FR-016 — Workflow actions are pinned to commit SHAs

Continuous-integration actions must be pinned to commit SHAs rather than to moving tags, so that a compromised or retagged action cannot change what runs.

Status: implemented · Evidence: cited by source · Provenance: reconstructed, needs-review

#### FR-019 — Shared shapes are defined once in the core package

A shape used by both the API and the web application must be defined once in the shared core package rather than redefined route-locally.

Status: implemented · Evidence: cited by source · Provenance: reconstructed, needs-review

#### FR-022 — Overlays are real dialogs

An overlay must be a real dialog with an accessible name, a focus trap, dismissal on Escape, and focus restoration, rather than a hand-rolled backdrop element.

Status: implemented · Evidence: cited by source · Provenance: reconstructed, needs-review

#### FR-023 — Controls carry programmatic labels

Every visual label must be associated with its control, and a row that behaves as a control must be a real button, so that it is reachable by keyboard and announced as actionable.

Status: implemented · Evidence: cited by source · Provenance: reconstructed, needs-review

#### FR-025 — Calendar dates are answered in the user timezone

Any question about today, overdue, due, a streak, or a snooze target must be answered in the user timezone, which the client sends and the server carries for the life of the request.

Status: implemented · Evidence: cited by source · Provenance: reconstructed, needs-review

#### FR-102 — Read the graph once per request

When more than one helper in a request needs the whole graph, the request must load it once and thread it, rather than loading it once per helper.

Status: implemented · Evidence: cited by source · Provenance: reconstructed, needs-review

#### FR-104 — Per-type counts use one grouped query

Live node counts per type must come from a single grouped query.

Status: implemented · Evidence: cited by source · Provenance: reconstructed, needs-review

#### FR-SET-004 — Algorithm constants are editable, validated, versioned settings

The tunable constants of the intelligence layer must live in one place and be exposed through a constants editor with validated ranges, versioning, and live preview. Every algorithm reads its constants from that place, so a settings override is a single object spread over the documented defaults. Nothing in the layer is learned.

Status: implemented · Evidence: cited by source · Provenance: reconstructed, needs-review

> The phrase "constants editor, validated ranges, versioned, live preview" is quoted directly from the original requirement text inside packages/core/src/algorithms/constants.ts, which preserves it verbatim.

#### FR-VIS-004 — The Today aggregate is one call

The dashboard must assemble its widgets from a single aggregate request rather than one request per widget.

Status: implemented · Evidence: cited by source · Provenance: reconstructed, needs-review

#### NFR-A11Y-001 — Keyboard focus is always visible

Every element that can receive keyboard focus must show a focus indicator that meets WCAG 2.1 AA, and the indicator must survive a forced-colors display mode. The indicator is defined once for the whole product rather than per component, so a new control cannot ship without one.

Status: implemented · Evidence: cited by source · Provenance: reconstructed, needs-review

> Recovered from packages/ui/src/styles/base.css:123, its only citation in the repository, which reads "Visible focus everywhere (WCAG 2.1 AA: NFR-A11Y-001)" above a bare :focus-visible rule that replaces the user-agent outline with var(--ae-focus-ring), defined at packages/ui/src/styles/tokens.css:131 as a two-pixel background halo and a two-pixel accent ring. The word "everywhere" and the unqualified selector are the evidence for the scope; the @media (forced-colors: active) block at base.css:151, which restores an outline because a box-shadow is discarded in that mode, is the evidence that the indicator was required to survive rather than merely to exist. Like NFR-MNT-002, this identifier was missed by an earlier pass of this register, but for a different reason: the citation reader's family pattern could not spell A11Y, so the citation was unreadable rather than unread. See the FAMILY constant in scripts/docs/lib/citations.mjs.

#### NFR-A11Y-002 — Every routed screen is scanned for accessibility

Every route the application mounts must be scanned by an automated accessibility check in the end-to-end suite, and the count of scanned screens is a ratchet: it may grow and must not silently shrink. Visual surfaces — the graph, the timeline, the map — must each keep a keyboard-operable list equivalent, and motion must respect the reduced-motion preference.

Status: implemented · Evidence: cited by documents only · Provenance: reconstructed, confirmed

> Authored 2026-08-26 as a product decision under ADR 0007, not recovered from a citation. Enforced by the end-to-end ratchets in docs/testing/e2e-ratchets.json, which check accessibility coverage by screen, and by the list equivalents the explore surfaces ship; the enforcing files do not cite this identifier, so the attribution is recorded here.

#### NFR-MNT-002 — The module boundary is enforced, not merely agreed

No workspace outside packages/core may import another workspace's internal modules. The boundary must be machine-enforced so that a violation fails the build rather than depending on review to notice it.

Status: implemented · Evidence: cited by source · Provenance: reconstructed, needs-review

> Recovered from the header of eslint.config.js, which names this identifier beside INT-2 and states the rule the configuration enforces. This identifier was missed by the first pass of this register, which read only the source trees; a root-level configuration file carried the sole citation. It was recovered by docs/generated/traceability.json, which reads every tracked file, and it is the reason that generator scans the whole repository rather than a chosen subset.

#### NFR-MNT-003 — Undocumented surfaces fail the build

A route, package, algorithm, runbook, or template added without prose documentation must fail continuous integration: prose coverage is a ratchet whose undocumented list may only shrink. A source module without a colocated test fails the coverage map the same way. Documentation and tests are not favors to the future; they are the price of merging.

Status: implemented · Evidence: cited by documents only · Provenance: reconstructed, confirmed

> Authored 2026-08-26 as a product decision under ADR 0007. Enforced by scripts/check-docs-coverage.mjs and scripts/check-test-coverage-map.mjs; neither cites this identifier, so the attribution is recorded here.

#### NFR-PERF-001 — The web bundle is budgeted

The production web bundle must stay inside enforced size budgets, heavy visualization libraries must load only on the routes that use them, and a build carrying development artifacts must be refused before its size is even measured.

Status: implemented · Evidence: cited by documents only · Provenance: reconstructed, confirmed

> Authored 2026-08-26 as a product decision under ADR 0007. Enforced by scripts/check-web-budgets.mjs against docs/testing/web-budgets.json and by route-level lazy loading in apps/web/src/App.tsx; the enforcing files do not cite this identifier, so the attribution is recorded here.

#### NFR-PERF-002 — The interactive envelope is fifty thousand nodes

Interactive surfaces must stay responsive against a graph of about fifty thousand nodes and two hundred and fifty thousand edges. Inside that envelope, the whole graph is read at most once per request, per-type counts come from grouped queries, and a rendered view that caps its elements must say that it capped rather than degrade silently.

Status: implemented · Evidence: cited by documents only · Provenance: reconstructed, confirmed

> Authored 2026-08-26 as a product decision under ADR 0007, naming the design envelope the code already assumes: FR-102 and FR-104 state the read rules, and the explore services cap their elements. The envelope number itself appears in no source file; recording it here is what makes exceeding it a requirements change rather than a surprise.

#### NFR-PRIV-001 — No runtime AI, as a numbered requirement

The product must make no runtime call to an external AI provider and must carry no AI-provider client in any dependency manifest. Every intelligent behavior is a deterministic function whose inputs and factors the operator can inspect. This is the boundary ADR 0003 chose; it is restated as a numbered requirement so that changing it is a requirements change, not a drift.

Status: implemented · Evidence: cited by documents only · Provenance: reconstructed, confirmed

> Authored 2026-08-26 as a product decision under ADR 0007. Verifiable by inspection of every dependency manifest under apps/, packages/, and services/, and asserted in prose by README.md, PRODUCT.md, and docs/adr/0003-deterministic-intelligence.md; no code cites the identifier because the requirement is the absence of code.

#### NFR-PRIV-002 — No telemetry

The product must collect no behavioural analytics, embed no tracking or telemetry client, and send no operator content to any service the operator did not configure. What an operator does with their own record is not data for anyone else.

Status: implemented · Evidence: cited by documents only · Provenance: reconstructed, confirmed

> Authored 2026-08-26 as a product decision under ADR 0007. Verifiable by the absence of any analytics dependency in the manifests and asserted by docs/PRIVACY.md; the error boundary in apps/web/src/components/ErrorBoundary.tsx states in prose that no telemetry pipeline exists to report to.

#### NFR-PRIV-003 — Every ranking explains itself

Any ranked or derived number shown to the operator must decompose into named factors the interface presents, and where a sum is claimed the parts must sum exactly. A recommendation that cannot show its arithmetic must not ship.

Status: implemented · Evidence: cited by documents only · Provenance: reconstructed, confirmed

> Authored 2026-08-26 as a product decision under ADR 0007, generalizing what FR-CON-006 and FR-RES-007 each state for one surface into the rule every future surface is held to. Enforced today by the factor-chip decompositions across the ask, intros, tailor, and dashboard surfaces.

#### NFR-REL-004 — No mutation fails silently

Every failed mutation must surface to the operator: a global handler guarantees an error report whenever no local handler takes responsibility, and loading, empty, over-filtered, and failed must be four distinct presentations on every surface. A failed load must never render as an empty list.

Status: implemented · Evidence: cited by documents only · Provenance: reconstructed, confirmed

> Authored 2026-08-26 as a product decision under ADR 0007. Enforced by the mutation-cache error net in apps/web/src/main.tsx and by the feedback grammar the end-to-end suite asserts screen by screen — the four-state distinction is its most-tested invariant; the enforcing code does not cite this identifier, so the attribution is recorded here.

#### INT-2 — Vitae is a module that owns its data plane

Vitae owns its storage and exposes it only through its own interfaces. No other workspace reaches into Vitae's internals, and Vitae reaches into no other workspace's internals.

Status: implemented · Evidence: cited by source · Provenance: reconstructed, needs-review

> Recovered from two citations that agree: eslint.config.js:2 states the rule as enforced, and docs/specs/merge-plan.md:3 states it as architectural intent. The statement recorded here is what both assert; neither is extended by the other.

#### INT-3 — One authoritative palette for the whole interface

Every colour, dimension and type decision in the interface resolves to a single declared token set. No screen defines its own palette, so a change to the identity is a change in one file rather than a search across the app.

Status: implemented · Evidence: cited by source · Provenance: reconstructed, needs-review

> Recovered from packages/ui/src/styles/tokens.css:2, which names the identifier and calls the file the single authoritative palette. The same header records the 2026-08 Quiet identity and its standing bans, which scripts/check-brand-bans.mjs enforces.

#### INT-6 — No statement recovered

_No statement is recorded for this identifier._

Status: unknown · Evidence: cited by documents only · Provenance: unrecoverable, needs-review

> docs/specs/merge-plan.md:3 is the only citation, and it names INT-6 jointly with INT-2 in a single sentence about owning a data plane. INT-2 is independently pinned by eslint.config.js, but elimination does not apply to a two-member group whose members may state different halves of one sentence: splitting it would invent the division rather than recover it.

### Identifiers this register could not model

These are recorded so the gaps stay discoverable. A gap that nobody wrote down
is indistinguishable from a gap that does not exist.

#### Unallocated or uncited numbers

| Range | Observation |
| --- | --- |
| `FR-024` | No citation anywhere in the repository. A single gap inside an otherwise contiguous FR-001 to FR-027 block. |
| `FR-028 to FR-101` | No citations. The FR-1xx identifiers form a separate later block, so the intervening numbers were most likely never allocated. |
| `FR-101, FR-103` | No citations. FR-102, FR-104 and FR-105 are all performance or scale constraints, which suggests a contiguous FR-1xx performance block whose other members are unallocated or uncited. |
| `FR-CAP-006, FR-CAP-007` | No citations. FR-CAP-008 is cited, so the family extends past the gap. |
| `FR-EXP-001 to FR-EXP-009, FR-EXP-011` | No citations. The lowest cited member of the family is FR-EXP-010. |
| `FR-ORG-003, FR-ORG-004, FR-ORG-006` | No citations. FR-ORG-005, FR-ORG-007 and FR-ORG-008 are cited, so the family extends past the gaps. |
| `FR-SET-002, FR-SET-003, FR-SET-005` | No citations. |
| `NFR-REL-001, NFR-REL-002` | No citations. When this register was recovered, only two non-functional identifiers were cited anywhere in the repository, NFR-REL-003 and NFR-MNT-002 — the original set was organized by quality attribute rather than numbered in one sequence, and almost all of it was lost. The non-functional set that exists today was authored forward under ADR 0007 on 2026-08-26; these two numbers stay unallocated because reusing them for new statements would counterfeit recovery. |
| `INT-4` | No citation. INT-1, INT-2, INT-3, INT-5 and INT-6 are all cited, so the interface family was allocated at least six identifiers and exactly one of them left no trace. INT-3 and INT-5 were invisible until the family was declared to the citation reader, which is why the declaration is recorded in this register rather than hard-coded in the generator. |

#### Alternative spellings

docs/ROADMAP.md historically wrote three families without the FR- prefix. VIS and EXP are normalized to FR-VIS and FR-EXP because both families use the prefixed form in source. IMP has no prefixed form anywhere, so FR-IMP is this register inferring the family prefix from its two siblings; the inference is recorded here rather than silently applied. The roadmap was rewritten in canonical spellings on 2026-08-26; the aliases stay registered because earlier revisions and commit messages still use the bare forms.

| Written as | Read as |
| --- | --- |
| `VIS-001` | `FR-VIS-001` |
| `VIS-002` | `FR-VIS-002` |
| `VIS-003` | `FR-VIS-003` |
| `EXP-012` | `FR-EXP-012` |
| `EXP-013` | `FR-EXP-013` |
| `IMP-001` | `FR-IMP-001` |
| `IMP-002` | `FR-IMP-002` |
| `IMP-003` | `FR-IMP-003` |
| `IMP-004` | `FR-IMP-004` |
| `IMP-005` | `FR-IMP-005` |
| `IMP-006` | `FR-IMP-006` |

#### Families beyond `FR` and `NFR`

| Family | Title | Numbering |
| --- | --- | --- |
| `INT` | Interface and integration requirements | One to three digits, without zero padding, unlike the FR and NFR families. |

**`T1, T5`** — T1 is cited beside SRS INT-1 and FR-SET-001 in the authentication middleware; T5 beside SRS INT-5 in the storage adapter. Two members of one shape, each attached to a different subsystem boundary, which suggests a threat or trust-boundary numbering. Two citations still cannot establish what the family asserts, and a single letter followed by a digit cannot be harvested without matching unrelated text throughout the repository. As of 2026-08-26 the two boundaries the markers sit on are modelled by NFR-SEC-001 and NFR-SEC-002, cited on the same source lines; the T markers themselves stay unmodelled and are kept for archaeology.

Cited at `apps/api/src/middleware/auth.ts:2`, `apps/api/src/services/storage/adapter.ts:2`.

<!-- generated:requirement-register end -->

## Quality requirements

Since 2026-08 the quality attributes carry numbered requirements in the
register, one family per attribute.

- **Accessibility.** Keyboard focus is always visible and survives forced
  colors (NFR-A11Y-001); every routed screen is scanned by an automated
  accessibility check whose coverage is ratcheted, visual surfaces keep
  keyboard-operable list equivalents, and motion respects the reduced-motion
  preference (NFR-A11Y-002).
- **Portability.** Leaving is a supported feature: full-fidelity export to
  open formats with a checksummed manifest, undegraded by commercial state
  (NFR-COMP-001); compiled documents are reproducible byte-for-byte under a
  pinned source date and stay parseable by applicant tracking systems
  (NFR-COMP-002).
- **Maintainability.** The module boundary is machine-enforced (NFR-MNT-002),
  and an undocumented or untested surface fails continuous integration —
  prose coverage and the source-to-test map are ratchets (NFR-MNT-003).
- **Operability.** Recovery objectives are stated and rehearsed, with
  scheduled encrypted off-box backups (NFR-OPS-001 — partial until the
  retention and recovery numbers are confirmed); a lapsed hosted workspace
  stays readable, exportable, and honest about its lock (NFR-OPS-002).
- **Performance.** The production bundle is budgeted and heavy libraries are
  route-lazy (NFR-PERF-001); the interactive envelope is about fifty thousand
  nodes, inside which the graph is read once per request and capped views say
  they capped (NFR-PERF-002).
- **Reliability.** Multi-document writes are atomic and audited (NFR-REL-003),
  and no mutation fails silently: loading, empty, over-filtered, and failed
  are four distinct presentations everywhere (NFR-REL-004).
- **Toolchain.** Node `22.23.x` and pnpm `9.15.x`; type checking, linting,
  unit tests, accessibility tests, public-data checks, dependency auditing,
  and production builds are required CI gates; API integration tests run
  against an isolated `vitae_test` database; production images are
  digest-pinned and the build service has no direct public access; releases
  follow [RELEASE.md](../../RELEASE.md) and semantic versioning.

## Deterministic algorithms

The algorithms in `packages/core` are pure TypeScript and have focused tests.
They include relationship strength, reconnect ordering, personalized PageRank,
job-description parsing, résumé selection, record deduplication, line
estimation, LaTeX escaping, and the capture and filter grammars. Every ranking
shown to an operator must be traceable to factors the UI can present.

## Historical and superseded identifiers

The register above adopted every identifier the repository cites, including
seventeen whose individual statements could not be recovered and four more that
are evidenced only by prose documents. Until now, most of them stayed alive
through grouped and ranged citations in roadmap rows — a fragile arrangement,
because rewriting one table row could silently orphan a dozen registered
identifiers and fail the citation gate. This section is the durable anchor: each
identifier below is named individually, so no later rewrite of a roadmap row or
product page can leave it uncited.

Statement-less identifiers held by this anchor: FR-CAP-005, FR-CON-005,
FR-IMP-001, FR-IMP-002, FR-IMP-003, FR-IMP-004, FR-IMP-005, FR-IMP-006,
FR-ORG-001, FR-ORG-007, FR-RES-001, FR-RES-002, FR-RES-003, FR-RES-010,
FR-RES-016, FR-RES-017, and INT-6.

Document-evidenced identifiers held by this anchor: FR-CON-008
(warm-introduction paths with per-hop evidence), FR-EXP-012 (scheduled off-box
backups), FR-EXP-013 (periodic restore drill), and FR-ORG-008 (the identity
integrity workflow).

The 2026-08 product-definition regeneration (ADR 0007) treats these identifiers
under one policy. Where a fresh statement is authored for one of them, the
register records it as a new product decision rather than a recovered original,
in its reconstruction note. Where no fresh statement is authored, the identifier
stays statement-less, and any successor requirement is named in its
reconstruction note instead. Identifiers are never renumbered and never deleted.

## Source of truth

This document describes current product requirements. For implementation detail,
read [the architecture guide](../ARCHITECTURE.md), the API reference under
`docs/api`, and the migration history in `apps/api/src/db/migrations`.

The requirement register above is generated from `docs/registry/requirements.json`
by `scripts/docs/gen-srs.mjs`. Edit the register, not this document, and run
`pnpm docs:gen`. `pnpm docs:check` fails if the two disagree, if an identifier is
cited in the repository without being registered, or if a registered identifier is
cited nowhere.
