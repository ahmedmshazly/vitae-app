# Vitae product status

Vitae 1.0.0 is the first stable, self-hosted release. The executable routes,
API contracts, and automated tests are the source of truth for shipped scope;
this page records that state without treating an older milestone plan as a
feature flag.

## Available in 1.0.0

| Area                 | What works                                                                                                                                                                                     | SRS                |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| Foundation           | Monorepo, specs, emulators, CI, env schema                                                                                                                                                     | M0                 |
| Auth                 | Google-ready + dev-login, default-deny gate, owner allow-list                                                                                                                                  | INT-1, FR-SET-001  |
| Data core            | Nodes/edges/revisions, per-type Zod validation, soft-delete, transactions                                                                                                                      | §4.2-4.7           |
| Capture              | ⌘K grammar + live preview + commit + undo-able writes                                                                                                                                          | FR-CAP-001/003/005 |
| Organize             | Trash + restore + history/revisions                                                                                                                                                            | FR-ORG-001/002/007 |
| Search               | FlexSearch FTS + filter-grammar AST + ⌘P quick-switcher                                                                                                                                        | FR-SRCH-001..004   |
| CRM                  | KNOWS editor, interaction logger, Hawkes strength, reconnect lane, who-to-call w/ reason chips                                                                                                 | FR-CON-001..009    |
| Network intelligence | Explainable contact ranking and warm-introduction paths with per-factor and per-hop evidence                                                                                                   | FR-CON-006..009    |
| Explore              | Interactive Life map, Chronograph, and Atlas with keyboard/list equivalents and URL-backed state                                                                                               | VIS-001/002/003    |
| Imports              | Staged LinkedIn, GitHub, contacts, résumé, bookmarks, calendar, and Aperture flows with review, commit, rollback, and history                                                                  | IMP-001..006       |
| Identity integrity   | Duplicate candidate queue, evidence-led merge, learned aliases, history, and undo                                                                                                              | FR-ORG-008         |
| Résumé engine        | Atoms/variants, BM25F JD parse, scored selection w/ breakdown popover, line meter, Onyx+Argon+Cobalt LaTeX, escape layer, compile+coverage, fit-loop, outputs w/ artifact re-export, mark-sent | FR-RES-001..018    |
| Career tracking      | Application graph records, pipeline overview, linked posting/target/résumé/company/referrer/interview context, and application dossiers                                                        | §4.3 application   |
| Export               | JSONL + Markdown vault + checksummed manifest ZIP                                                                                                                                              | FR-EXP-010         |
| Ops                  | /status health page; Cloudinary storage adapter; Tectonic build service w/ graceful fallback                                                                                                   | FR-SET-006         |

## The algorithms (the "science"): all unit-tested

Hawkes tie strength · spaced-repetition reconnect · Personalized PageRank ·
BM25F JD parsing (Aho-Corasick) · budgeted-submodular résumé selection ·
Fellegi-Sunter dedup · line model · LaTeX escaping (property-fuzzed) · capture &
filter grammars. See [`ARCHITECTURE.md`](ARCHITECTURE.md) §5.

## Remaining product work

| Area                                                              | State                                                                                                                                              | SRS         |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| Long-tail entities (media, highlight, asset, health_log, account) | storable, searchable, exportable, and editable through generic record surfaces; bespoke workflows remain optional                                  | §4.3.22-28  |
| Backups (nightly `pg_dump`→R2, quarterly restore drill)           | export ships; scheduled encrypted backups are a prod concern                                                                                       | EXP-012/013 |
| Cover letters                                                     | **model + generation UI shipped** (`/career/resume/letters`, with `/resume/letters` retained as a compatibility route); LaTeX/PDF compile deferred | FR-RES-020  |

## Deliberately out of scope

Multi-user/social · native mobile · AI text generation/embeddings · multi-page or
non-US résumés · email/calendar sync · public web publishing.
