---
id: GLOSSARY
title: Glossary
summary: What this repository's words mean here — the graph vocabulary, the résumé engine, the code, the hosted plane, and the terms this documentation uses about itself.
audience: [user, designer, developer, maintainer, operator, security]
domain: meta
type: reference
status: verified
verified_at: 2026-08-24
---

# Glossary

A word earns an entry here only if its ordinary meaning would mislead someone
reading this repository. Most entries are terms the code has narrowed. Some are
terms it uses for two or three unrelated things, and those are the ones worth
reading before you assume you know what a page is talking about.

Every count and every constant below was taken from the source on the date this
page names, not from another document. Where a term is settled somewhere in
this corpus, the group heading points at the section that settles it.

## Working with the career graph

The records themselves and the screens over them. [Use](use/index.md) covers
the screens, [Architecture](architecture/index.md) covers the model and the
rankings, and [Design](design/index.md) covers the surface vocabulary.

| Term | What it means here |
| --- | --- |
| Archive | Setting `archived_at` so a record drops out of default lists while staying findable and restorable. Archiving is not deleting: deletion sets `deleted_at`, which is what puts a record in Trash. |
| Ask | The screen that ranks people against a stated need. The score is a weighted sum of named factors and every chip it shows is one term of that sum, so nothing in the ranking is unaccounted for on screen. |
| Atlas | The map of places, reached at `/explore/atlas` and `/map`. The word separately names the generated index of every first-party source file and its dependents, which has nothing to do with the map. |
| Capture line | The single line behind ⌘K that turns one typed sentence into records. It is a fixed grammar rather than a language model: a leading letter chooses the type, `@` names a person, `@@` an organisation, `#` a tag, `^` a date, `!p1` to `!p4` a priority, and `>` opens a note. The parse is previewed as chips before it commits. |
| Closeness | A self-reported rating from 1 to 5 held on the `KNOWS` edge. It sets the default reconnect cadence and supplies a fixed share of tie strength; it is your judgement of the relationship, never a measurement. |
| Command palette | The ⌘P overlay that jumps to records and runs named actions. It is not the capture line: ⌘P navigates, ⌘K writes. |
| Confidence | A number from 0 to 1 on every node and edge saying how far the route that produced the record is trusted, shown next to the source on a provenance chip. Manual entry defaults to 1 and the importers write lower values. |
| Duplicates queue | Where record linkage sends every pair it does not score as a clear non-match. Nothing merges automatically, and the per-field weights that produced the score are shown as the reason. |
| Edge | A typed, directed relationship between two nodes. Twenty-eight types are defined, and `KNOWS` is by far the richest, because between two people the edge is the relationship. |
| Evidence | Three different things. On an atom it is the list of node or link references behind the claim. On Ask it is the snippets a ranking chip was drawn from. In the navigation it is the atom library, because `/career/resume/evidence` and `/resume/atoms` render the same screen. |
| Favor ledger | Debts in each direction, recorded on your `KNOWS` edge to a person and spelled `favors` in the code. Writing one changes the reciprocity term in the Ask ranking at once, because both read the same field. |
| Identity key | A stable handle for a record in some external system, written as system, kind and key separated by colons, and lowercased on the way in. The first key on a node derives its document id, so two producers spelling one key differently cannot fork one record into two. |
| Interaction | A recorded contact with someone, of one of nine kinds. Interactions are the only input to the intensity half of tie strength, so a relationship with none of them scores on closeness alone. |
| Lens | A named way of looking at the same records, chosen by a button strip or a query parameter. Four unrelated things carry the name: the graph view's display modes, the entity reference's Orbit, Focus and Matrix, the switch between Ask and warm paths on `/network/intelligence`, and saved views, which the Library screen calls reusable lenses. The word alone tells you nothing about what changes. |
| Node | A typed record. Thirty-four types are defined in three tiers: sixteen career types with bespoke screens, eleven life types, and seven long-tail types that exist in the schema and have no dedicated interface. |
| Provenance | The `source`, `source_ref` and `confidence` fields carried by every record, saying where it came from and how far to trust it. Ten source values exist, one of which is manual entry. |
| Reconnect | The ranking that surfaces ties you value highly and have let decay, as the product of those two terms. A close friend contacted yesterday drops off the lane on its own. |
| Register rule | The hairline under a page header. Its ticks encode something true about the page — revisions of a record, days of the week — and a screen with nothing true to encode gets a plain rule rather than decorative ticks. |
| Runway | The complete list of applications, closed ones included, ordered so that whatever needs attention soonest comes first. It is a view over ordinary `application` nodes, not a separate stored model. |
| Saved view | A named filter query, kept so it can be reopened from the navigation. The screen that manages them is titled Library, answers at both `/collections` and `/explore/library`, and calls them reusable lenses. |
| Self | The one person node marked `is_self`. It anchors every relationship query: warm-path search starts there, and any score described as proximity is proximity to it. |
| Sensitivity | A per-node marking of `normal` or `sensitive`. Sensitive records are held out of an export unless the export asks for them, and can be isolated in search with `is:sensitive`. |
| Tie strength | A number from 0 to 1 combining self-reported closeness with the decaying intensity of recorded interactions, weighted towards the interactions. It decomposes into named factors shown on the person page, so it can be argued with rather than merely trusted. |
| Trash | Records with `deleted_at` set. They stay recoverable for thirty days and are then purged; a purge is the only step in the lifecycle that destroys anything. |
| Warm path | A route from you to a target organisation across acquaintance hops and one affiliation hop, scored as the product of hop strengths so a short strong chain outranks a long weak one. The navigation calls this Warm paths and the breadcrumb calls the same destination Warm intros. |

## Tailoring a résumé

The résumé engine reuses several ordinary words for narrower things.
[Use](use/index.md) walks the workflow and
[Architecture](architecture/index.md) states the formulas.

| Term | What it means here |
| --- | --- |
| Atom | One reusable claim about your work — an achievement, a responsibility, a summary fragment or a skill line — owned by a role or project node. Atoms are what the engine scores and selects; a résumé here is assembled from them rather than written straight through. |
| ATS strict | A trait a template declares about itself. It is shown to you as a chip and read by nothing in the compile path, so it describes an intention of the layout rather than a constraint the build enforces. |
| Blocked | A per-atom flag that keeps an atom out of every selection. Its opposite is pinned, which forces one in whatever it scores. |
| Budget | The number of rendered lines the selection may fill, taken from the chosen template's line model. A `budget_lines` field also exists in the résumé configuration schema with a default of 54, and no code reads it. |
| Coverage | The weighted share of a target's parsed keywords that appear in the text extracted from the compiled PDF. Finalising requires at least 95 per cent. This is unrelated to test coverage and to the documentation coverage ratchet below. |
| Emphasis | Which register a wording is in: technical, leadership, concise or detailed. An atom carries at most one variant per emphasis, at most four in all, and exactly one of them is the default. |
| Fit loop | What runs when the compiled PDF is longer than one page. Each pass prefers swapping a variant for its concise wording over dropping an atom, it stops after three passes, and the remaining overflow is handed back for a manual decision. |
| Letter | A cover letter, built from hook, body and closer blocks that each hold free text, an atom, or both. It is attached to a target and compiled by the same service as a résumé. |
| Line model | Four constants per template — characters per line, lines per page, and the overhead of an entry and of a section — calibrated against a real compile. They let the engine decide what fits before paying for a compile. |
| Target | A saved job description together with the weighted keyword set parsed out of it. Parsing is deterministic and the keywords are editable, so the thing being tailored to is visible and arguable. |
| Template | A LaTeX résumé family under `templates/`, each a directory with a document and a line model. Three ship, and `cobalt` is the default. See [Develop](develop/index.md) for adding one. |
| Variant | One wording of one atom at one emphasis. Because a concise variant costs fewer lines for the same keyword coverage, the engine can shorten a résumé by swapping wordings instead of dropping claims. |

## Reading the code

Terms you meet in the source and in the persistence layer.
[Architecture](architecture/index.md) explains how the parts fit together and
[Develop](develop/index.md) explains where a change belongs.

| Term | What it means here |
| --- | --- |
| Build service | `services/buildsvc`, a small HTTP server that compiles a self-contained LaTeX document with Tectonic and extracts the PDF's text. Every request is signed, Tectonic runs untrusted with no network available, and identical input produces an identical file. |
| Bundle | The `vitae.graph.bundle/1` transfer format for importing a self-contained subgraph from another system. Nodes carry a bundle-local reference and edges point at those references, which the importer rewrites to real ids at commit time. |
| Control plane | Identities, memberships, workspace lifecycle and payment-provider events. It sits outside the graph repository on purpose, because none of it is exportable career data and it must be resolvable before any graph access is granted. |
| Envelope | The fields every node or edge carries whatever its type: title, dates, provenance, sensitivity, revision and the soft-delete timestamps. Type-specific data lives in `props` beside it. |
| Gate | A check wired into continuous integration that fails the build. Several entries in this corpus turn on the difference between a gate that reports green and a gate that is capable of reporting red. |
| Migration | A numbered TypeScript file under the API's `db/migrations/`, applied by Kysely's own migrator through `pnpm migrate`. There is no code generation and no build step, because the API runs TypeScript directly in production. See [Operate](operate/index.md). |
| Mount | The prefix a version-one router is attached under. The list is a single exported constant that the specification builder and the contract tests both import, so a new mount cannot land without a matching entry. |
| Props | The per-type payload on a node or edge, validated by a schema chosen by the record's type. Long-tail node types validate loosely so imported records with sparse or extra keys keep round-tripping. |
| Repository | Three things. The node type `repository` is a code repository. The API's `db/repository.ts` is the persistence layer. "This repository" is the monorepo. |
| Revision | An append-only record of one change to one node or edge, tagged with one of seven operations. The history is what makes a merge or a delete reversible rather than final. |
| Space | The older binary partition, `real` or `demo`, that predates Cloud workspaces. It survives so self-hosted scripts and fixtures keep a stable contract, and it maps onto backfilled workspace identifiers underneath. |
| Tenant | Not an identifier in this codebase. It appears in comments and in one decision title; wherever the boundary is actually enforced it is spelled as a workspace id. |
| Workspace | Three unrelated things. A Cloud workspace is the durable partition every record is scoped to. A workspace package is one member of the pnpm monorepo. A workspace home is a top-level hub screen such as Network or Data. |

## Running an instance

The self-hosted install and the hosted plane that is built but closed.
[Operate](operate/index.md) covers running one; [Product](product/index.md)
states the boundary; [Decisions](decisions/index.md) records why the tenancy
model is what it is.

| Term | What it means here |
| --- | --- |
| Access state | Which of five lifecycle states a Cloud workspace is in: trialing, active, past due, read-only or deletion pending. The server derives it; a browser or a payment return page never does. |
| Cloud | The hosted offering. It is built in this repository and closed: two separate switches hold it shut, and nothing here asserts that a hosted service is operating. |
| Entitlement | Two things that do not read each other. The plan's entitlement list names what the Individual offer is meant to grant. The entitlement gate is the middleware that refuses mutations from a read-only workspace, and it reads the access state, not that list. |
| Grace | Two windows recorded on the plan constant: one after a failed payment before access closes, and one during which a read-only workspace stays exportable. |
| Individual plan | The intended one-person hosted offer, with its prices, billing periods and lifecycle durations held in one constant so the API and the public surface cannot describe different offers. `docs/CLOUD-LAUNCH.md` records the commercial terms as intent and states in its opening that it is not a customer contract and does not mean the service is open. |
| Legacy workspace | The reserved workspace id that existing single-owner data was migrated into when the schema gained a workspace boundary. A self-hosted install keeps using it. |
| Merchant of record | The payment provider that sells to the customer and carries the tax obligation. `docs/CLOUD-LAUNCH.md` records selecting and verifying one as a pre-launch requirement; no arrangement is confirmed in this repository. |
| Provisioning gate | The server-side switch that allows a workspace to be created and billed. It is separate from the public build gate that reveals Cloud on the marketing site, and a hosted service needs both. |
| Read-only | An access state, not a permission level. Reads and exports continue, billing and sign-out continue, and every other mutation is refused with a payment-required error. |
| Retention | The window a deleted record stays in Trash before a purge destroys it, currently thirty days. The purge is idempotent and the same code path serves the scheduler and the manual call. |
| Self-hosted | The supported operating model: one owner, one install, run from this repository. Everything else described as hosted is gated. |

## Reading this documentation

The corpus describes itself in terms that a gate also reads, so these are
enforced definitions rather than conventions. [About these
documents](meta/index.md) holds the rules and the evidence behind them.

| Term | What it means here |
| --- | --- |
| Audience | One of six named readers a page declares it is written for. A page that is for everyone declares all six rather than leaving the field out. |
| Badge | The status a page declares about its own relationship to the running system, one of eight values. It is not decoration: a gate reads the same field the reading surface renders. |
| Capability | A registered area of the product, identified as `CAP-` and something. Sixteen exist, fifteen implemented and one gated, and each names the shipped code that enforces it. |
| Corpus | `docs/observatory`, the curated half of the documentation. Its entrance and this glossary are the only pages at its root. |
| Coverage ratchet | The record of what the documentation does not yet account for. It may shrink and never grow: the gate fails both when something new becomes uncovered and when an entry is covered or deleted without the record being tightened. |
| `covers:` | A page's claim to explain one catalogued thing, such as a screen, an algorithm, a package, a runbook or a résumé template. Claiming it and not explaining it is the failure the ratchet exists to make visible. |
| Curated | Written by hand, and therefore capable of being wrong, which is why every curated page carries a badge. The opposite half of the corpus is generated. |
| Domain | One of eight sections a page belongs to. It must equal the directory the file sits in, with one exception: the two pages at the corpus root are documentation about the documentation and declare `meta`. |
| Gated | Built, and not reachable in a default build. A flag or a launch step holds it closed, so it is neither shipped nor merely planned. |
| Generated reference | The half of the documentation derived from source by a script and never edited by hand. A gate regenerates it and fails when the committed copy has drifted, which is what lets the curated half stop enumerating things. |
| Journey | A registered end-to-end path through the product, identified as J1 through J8. Only three are named anywhere in the repository; the other five are implied by the numbering and are recorded with an unknown status rather than invented. |
| Needs review | Reconstructed from evidence rather than from a record, and not yet confirmed by someone who would know. It is the honest badge for a fact recovered from code when the document that should have stated it does not survive. |
| Requirement | An `FR-` or `NFR-` identifier cited from source, tests and workflows. The register that defines them was recovered from those citations because the specification defined none, so every entry in it is marked as needing review. |
| Traceability | The join from a requirement to every tracked file that cites it, split into production source, tests and documents. The split is the point: source shows a behaviour exists, a test shows it is protected, a document shows only that somebody wrote it down. |
| Type | One of six shapes a page can take. An explanation is held to a fixed four-section order so a reader reaches a plain-language answer before any contract or formula. |
| Verified | Checked against the code on the date the page names. It does not mean reviewed, approved, or correct indefinitely, and the date is there so a reader can judge how much it is worth. |
