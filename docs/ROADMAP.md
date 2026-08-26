# Vitae product status

Vitae 1.0.0 is the first stable, self-hosted release. The executable routes,
API contracts, and automated tests are the source of truth for shipped scope;
this page records that state, and the intent registered on top of it under
[ADR 0007](adr/0007-product-definition-regeneration.md), without treating an
older milestone plan as a feature flag. Identifiers are written in their
canonical registered spellings; the register itself is
[`docs/specs/srs.md`](specs/srs.md).

## Available in 1.0.0

| Area                 | What works                                                                                                                                                                                     | SRS                              |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| Foundation           | Monorepo, environment schema, emulators, CI, quality gates                                                                                                                                     | NFR-MNT-002, NFR-MNT-003         |
| Auth                 | Google-ready + dev-login, default-deny gate, owner allow-list                                                                                                                                  | INT-1, FR-SET-001, NFR-SEC-001   |
| Data core            | Nodes/edges/revisions, per-type Zod validation, soft-delete, transactions                                                                                                                      | FR-002, FR-013, NFR-REL-003      |
| Capture              | ⌘K grammar + live preview + commit + undo-able writes                                                                                                                                          | FR-CAP-001/003/005               |
| Organize             | Trash + restore + history/revisions                                                                                                                                                            | FR-ORG-001/002/007               |
| Search               | FlexSearch FTS + filter-grammar AST + ⌘P quick-switcher                                                                                                                                        | FR-SRCH-001..004                 |
| CRM                  | KNOWS editor, interaction logger, Hawkes strength, reconnect lane, who-to-call w/ reason chips                                                                                                 | FR-CON-001..009                  |
| Network intelligence | Explainable contact ranking and warm-introduction paths with per-factor and per-hop evidence                                                                                                   | FR-CON-006..009                  |
| Explore              | Interactive Life map, Chronograph, and Atlas with keyboard/list equivalents and URL-backed state                                                                                               | FR-VIS-001/002/003               |
| Imports              | Staged LinkedIn, GitHub, contacts, résumé, bookmarks, calendar, and Aperture flows with review, commit, rollback, and history                                                                  | FR-IMP-001..006                  |
| Identity integrity   | Duplicate candidate queue, evidence-led merge, learned aliases, history, and undo                                                                                                              | FR-ORG-008                       |
| Résumé engine        | Atoms/variants, BM25F JD parse, scored selection w/ breakdown popover, line meter, Onyx+Argon+Cobalt LaTeX, escape layer, compile+coverage, fit-loop, outputs w/ artifact re-export, mark-sent | FR-RES-001..018                  |
| Career tracking      | Application graph records, pipeline overview, linked posting/target/résumé/company/referrer/interview context, and application dossiers                                                        | FR-CAR-001, FR-CAR-002, FR-CAR-004 |
| Export               | JSONL + Markdown vault + checksummed manifest ZIP                                                                                                                                              | FR-EXP-010, NFR-COMP-001         |
| Ops                  | /status health page; Cloudinary storage adapter; Tectonic build service w/ graceful fallback                                                                                                   | FR-SET-006, NFR-SEC-002/003      |
| Provenance & history | Source+confidence chips across surfaces, the source reference on the record header, the Ledger feed under Today, and field-level diffs in record history                                        | FR-PROV-001, FR-PROV-002, FR-PROV-003 |

## The algorithms (the "science"): all unit-tested

Hawkes tie strength · spaced-repetition reconnect · Personalized PageRank ·
BM25F JD parsing (Aho-Corasick) · budgeted-submodular résumé selection ·
Fellegi-Sunter dedup · line model · LaTeX escaping (property-fuzzed) · capture &
filter grammars. See [`ARCHITECTURE.md`](ARCHITECTURE.md) §5.

## Registered intent (planned, not shipped)

Registered under ADR 0007 so that each is a citable requirement before it is a
line of code. Statuses live in the register; this table is the reader's map.

| Area | What is intended | SRS |
| ---- | ----------------- | --- |
| Correspondence intelligence | Per-person correspondence profile (reciprocity, reply latency, unanswered inbound, contact days); network rollup naming dormant-but-once-strong ties and brokers; introductions as first-class facts | FR-COMM-001, FR-COMM-002, FR-COMM-003 |
| Evidence dossiers | Single-subject evidence packets with a provenance appendix; audience templates for a promotion review, a petition exhibit list, a clearance history | FR-DOS-001, FR-DOS-002 |
| Longitudinal imports | Field-level update proposals on identity-key matches; re-import that counts created/updated/unchanged/skipped | FR-SYNC-001, FR-SYNC-002 |
| Career writes | First-class application endpoints validating the status machine | FR-CAR-003 |
| Letters | LaTeX/PDF compile parity with résumés (authoring UI already ships) | FR-RES-021, FR-RES-020 |
| Locked-workspace honesty | Write controls disabled at the point of use on a read-only workspace, not only refused by the server | NFR-OPS-002 |
| Recovery objectives | Stated RPO/RTO with rehearsed drills; `scripts/backup-to-s3.sh` ships and is wired to `pnpm backup:s3`, the cadence and numbers await operational confirmation | NFR-OPS-001, FR-EXP-012, FR-EXP-013 |

## Deliberately kept as substrate

Long-tail entity types (media, highlight, asset, health_log, account,
subscription, trip, and their kin) are storable, searchable, exportable, and
editable through the generic record surfaces. That is a decision, not a
backlog: life records are the evidence substrate of the career story, and a
bespoke screen for each would dilute the product without strengthening the
proof. `location` and `trip` get first-class treatment in the Atlas.

## Deliberately out of scope

Shared or team workspaces and social networking (the graph holds records
*about* many people; it is operated *by* one) · native mobile · AI text
generation or embeddings, per NFR-PRIV-001 · multi-page or non-US résumés ·
live email/calendar account sync (FR-SYNC-001/002 build the staged update
path such a connector would need; the connector itself is not planned) ·
public web publishing.
