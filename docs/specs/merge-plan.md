# MERGE.md: folding Vitae toward the main site / remaining stack work

Vitae is built as a **module with its own data plane** (SRS INT-2/INT-6). This
document is the executable checklist for two future moves: (a) merging the
standalone app into `app.vitae.example`, and (b), if ever desired, finishing
the remaining SRS stack items (Postgres FTS, CTE ranking). It is kept current as
the code evolves.

The data plane itself already moved to Postgres (ADR 0005). Section B below is
no longer "adopt Postgres"; it is the leftover work that was deferred at cutover.

## A. Merge into the main site (`app.vitae.example` → `app.vitae.example`)

1. **Copy module code.** `packages/core`, `packages/ui`, `packages/config`, and
   `services/buildsvc` are self-contained. Copy them as-is. They import nothing
   from outside their own boundary (enforced by lint).
2. **Routing.** Mount the API router (`apps/api/src/routes/v1`) under the main
   site's `/api/vitae/v1`, and the web routes under the `/vitae` path segment.
3. **Auth.** The main site already gates by owner identity; drop
   `apps/api/src/middleware/auth.ts` in favour of the site's existing gate,
   keeping the `OWNER_EMAIL` allow-list semantics.
4. **Env vars.** Add every name from `.env.example` to the merged project's
   secret store.
5. **Redirect.** `app.vitae.example` → `app.vitae.example` (301).
6. **Run the e2e suite** (`e2e/`) against the merged deployment before cutover.

## B. Remaining SRS stack items (optional)

The intelligence is storage-agnostic on purpose (ADR 0002). ADR 0005 already
swapped the repository onto Postgres (`data jsonb` + generated columns). Still
open if scale or ops demand it:

1. Replace `db/search-index.ts` (FlexSearch) with Postgres FTS (`tsvector` /
   `pg_trgm`; migration 001 already installs `pg_trgm`).
2. Optionally move `services/crm.ts`'s in-memory PageRank toward recursive CTEs /
   a nightly derive-metrics job (SRS §5.5).
3. The `@vitae/core` algorithms, the routes, and the entire web app stay
   unchanged for those swaps.

## Module boundary invariants (must stay true)

- Nothing in `packages/core` imports from `apps/*` or `services/*`.
- The web app talks to the server only through `apps/web/src/lib/api.ts`.
- All storage access goes through `repository.ts` and the `StorageAdapter`.
- The build service is reached only via `services/buildsvc-client.ts` (HMAC).
