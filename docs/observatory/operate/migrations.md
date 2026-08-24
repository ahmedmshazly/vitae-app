---
id: OPS-MIGRATE
title: Running database migrations
summary: How to apply, inspect and roll back schema migrations, what the runner guarantees, and why rolling back is not the same as undoing.
audience: [operator]
domain: operate
type: task
status: verified
verified_at: 2026-08-24
sources:
  - apps/api/src/scripts/migrate.ts
  - apps/api/src/db/migrations/001-initial-schema.ts
  - apps/api/src/db/migrations/007-cloud-control-plane.ts
  - apps/api/src/db/migrations/009-workspace-primary-keys.ts
  - scripts/deploy-api.sh
  - package.json
  - apps/api/package.json
  - .github/workflows/ci.yml
  - docs/generated/database.json
related: [OPS-DEPLOY, OPS-BACKUP, OPS-CONFIG, OPS-INCIDENT]
---

# Running database migrations

Migrations change the shape of the database. They run against the same
Postgres the API serves from, they are not reversible in the sense most people
mean by the word, and they happen in the middle of a deploy. This page is what
you need before running one.

## What are the commands?

Every command needs the same database environment the API uses. Point it at the
database you mean to change and check that before you check anything else.

```bash
# Apply everything pending.
pnpm --filter @vitae/api migrate

# List every migration and whether it has been applied. Changes nothing.
pnpm --filter @vitae/api migrate -- --status

# Revert the newest applied migration. One per invocation.
pnpm --filter @vitae/api migrate -- --down
```

`pnpm migrate` at the repository root is an alias for the first of these.
`pnpm dev:db` starts a local Postgres in Docker and applies migrations to it in
one step, which is the normal way to get a working development database.

Applying prints one line per migration with a tick or a cross, or
`nothing to do, schema is up to date` when there is nothing pending. A failure
prints `[migrate] failed:` with the reason and exits non-zero.

## How does it run inside a deploy?

The deploy script builds the new API image first, then runs the migration from
that image, then force-recreates the running services. The ordering matters:
the API bakes its source into the image, so migrating from the newly built
image guarantees the migration runner and the process that will serve traffic
are the same release.

On a host that has Docker but no Node toolchain, that is:

```bash
docker compose -f deploy/compose.prod.yml run --rm --no-deps api \
  ./node_modules/.bin/tsx src/scripts/migrate.ts
```

`--no-deps` because the migration needs the database, not the rest of the
stack. See [Deploying an instance](deploy.md) for the whole sequence; you
should not normally run this by hand, because the script also refuses a dirty
or diverged checkout before it gets this far.

## What does the runner actually guarantee?

The runner is Kysely's own migrator reading the plain TypeScript files in
`apps/api/src/db/migrations` and executing them under `tsx`. There is no
codegen and no build step, for the same reason the API has none: the API runs
TypeScript directly in production, and a migration tool that needed compiling
would be the first thing to break that.

It keeps its bookkeeping in two tables it creates itself, `kysely_migration`
and `kysely_migration_lock`. Neither is application data; both are part of the
schema and will appear in a database inspection.

Three guarantees follow from how it is configured, and they are worth knowing
because each one turns a class of mistake into a clean refusal.

**One transaction.** Postgres supports transactional DDL, so the whole pending
batch runs inside a single transaction on a single connection. A migration that
fails halfway leaves the database as it was. There is no half-applied state to
reason about, and no cleanup step.

**One runner at a time.** The migrator takes a Postgres advisory lock before it
starts. A second invocation — a retried deploy, a second operator — waits
rather than racing.

**One order, permanently.** The runner refuses to proceed if a migration
recorded as executed is no longer on disk, and refuses if a new migration
sorts before one that has already run. You cannot slip a file in between two
applied migrations and you cannot rewrite an applied one. That is why a change
to an already-applied migration is added as a new file instead: rewriting an
applied migration would make the schema on a given machine depend on when that
machine was last reset.

## Which migrations exist?

Ten today, and the list is not reproduced here. `docs/generated/database.json`
carries every migration with what it creates and alters, alongside the tables,
columns and indexes it produces. It is derived from the migration source and a
continuous-integration check fails if the committed copy has drifted.

Every one of the ten declares both an `up` and a `down`, and the generated
catalog reports no irreversible migrations. Read on before taking comfort from
that.

## What does rolling back actually undo?

> [!WARNING]
> `--down` is destructive. "Reversible" here means the schema change can be
> undone, not that your data survives it. Two of the ten migrations drop tables
> with `CASCADE` on the way down: the initial schema migration drops every
> graph table — nodes, edges, revisions, atoms, résumés, attachments and the
> rest — and the Cloud control-plane migration drops the users, workspaces,
> subscription and billing-event tables and removes the workspace column from
> twenty-four document tables. Rolling all the way back empties the database.
> Take a snapshot first.

The runner reverts exactly one migration per invocation, the newest applied
one. Walking back several is several invocations, each one further from the
data you had.

The safe reading of `down` is that it restores the *shape*, and that is all it
promises. Where a migration only added derived structure — a generated column,
an index, a trigger — reverting it costs nothing but the structure. Where a
migration created a table that has since been written to, reverting it takes
the rows with it.

Before a schema change you are unsure of, take a manual database snapshot. It
costs nothing to keep briefly and is the fastest way back — faster than a
restore from an export bundle, and it is the tier designed for exactly this.
[Backup and restore](backup-and-restore.md) has the command and explains where
it sits among the recovery tiers.

## What is tested, and what is not?

Continuous integration applies the full migration set to a real Postgres in two
separate jobs: the API integration suite creates and migrates its own database
before it runs a test, and the browser-journey job migrates and then seeds.
A migration that cannot apply to an empty database fails the pipeline.

Nothing tests a migration against production-shaped data. Both jobs start from
an empty database, so a migration whose `up` is correct on an empty schema and
wrong against existing rows — a backfill, a type narrowing, a uniqueness
constraint that real data violates — passes the pipeline and fails on the
host. Read the migration, not the pipeline result, before applying one of
those.

`docs/CLOUD-LAUNCH.md` names a stronger bar for any hosted operation: current
owner data must have a tested migration and a rollback or restore path before
any production schema change. That is a launch requirement for a service that
is not open, and nothing in this repository enforces it. For a self-hosted
instance the equivalent discipline is the snapshot above, taken by hand.

## Verifying afterwards

Two checks, both of which the recovery runbook uses for the same purpose:

```bash
pnpm --filter @vitae/api migrate -- --status   # every migration shows as applied
pnpm audit:graph                               # the graph is internally consistent
```

Then confirm the API answers `GET /ready` with 200, which means it reached the
database and the build service. If it does not,
[Responding to an incident](incident-response.md) has the triage.
