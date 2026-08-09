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

Vitae does not provide multi-tenant hosting, social networking, behavioural
advertising, telemetry-based profiling, or runtime LLM features. It is a tool
an operator runs for their own records.

## Supported architecture

| Concern | Current implementation |
| --- | --- |
| Web application | React 18 and Vite in `apps/web` |
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

- Requests are denied by default. Production access requires a verified identity
  whose email equals `OWNER_EMAIL`.
- Development sign-in is loopback-only and must be disabled in production.
- The API uses security headers and a nonce-based content security policy.
- The compiler accepts only authenticated API requests and runs in an isolated
  container. User content is escaped before it reaches LaTeX.
- Secrets do not belong in application records or Git. Runtime secrets come
  from environment variables or a protected local secret store.
- Postgres connections use certificate verification in production. Backups are
  sensitive exports and require encryption plus tested restore procedures.
- The project collects no behavioural analytics and makes no runtime calls to
  AI providers.

See [SECURITY.md](../../SECURITY.md) for reporting and supported-version policy.

## Functional requirements

| Area | Required behavior |
| --- | --- |
| Capture | Keyboard capture and structured forms create valid, linked records with undoable revisions. |
| Search | Text and filter-grammar searches return the active data space only. |
| Relationships | Tie strength, reconnect ordering, and who-to-call results are explainable through visible factors. |
| Résumés | Evidence is selected deterministically, scoped to the operator, escaped for LaTeX, and compiled through the internal service. |
| Import | External data is staged before commit, deduplicated, and attributable to its source. |
| Export | A documented JSONL and Markdown bundle preserves IDs, checksums, and sensitivity choices. |
| Operations | Health, readiness, migration, backup, and restore commands have documented behavior. |

## Quality requirements

- Node `22.23.x` and pnpm `9.15.x` are the supported toolchain.
- Type checking, linting, unit tests, accessibility tests, public-data checks,
  dependency auditing, and production builds are required CI gates.
- API integration tests run against an isolated `vitae_test` Postgres database.
- The web application must preserve keyboard access, visible focus, reduced
  motion support, and WCAG AA-oriented contrast.
- Production images are digest-pinned and the build service must not have
  direct public access.
- Releases follow [RELEASE.md](../../RELEASE.md) and use semantic versioning.

## Deterministic algorithms

The algorithms in `packages/core` are pure TypeScript and have focused tests.
They include relationship strength, reconnect ordering, personalized PageRank,
job-description parsing, résumé selection, record deduplication, line
estimation, LaTeX escaping, and the capture and filter grammars. Every ranking
shown to an operator must be traceable to factors the UI can present.

## Source of truth

This document describes current product requirements. For implementation detail,
read [the architecture guide](../ARCHITECTURE.md), the API reference under
`docs/api`, and the migration history in `apps/api/src/db/migrations`.
