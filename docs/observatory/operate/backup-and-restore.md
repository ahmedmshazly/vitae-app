---
id: OPS-BACKUP
title: Backup and restore
summary: The one backup system that exists, the design that was written down and never built, the three recovery tiers, and the durability claims nobody here can verify.
audience: [operator, maintainer]
domain: operate
type: task
status: partial
verified_at: 2026-08-24
sources:
  - scripts/backup-to-s3.sh
  - scripts/restore-from-s3.sh
  - apps/api/src/scripts/export-bundle.ts
  - apps/api/src/scripts/restore.ts
  - apps/api/src/services/export.ts
  - apps/api/src/services/restore.ts
  - apps/api/src/routes/v1/export.ts
  - deploy/systemd/vitae-backup.service
  - deploy/systemd/vitae-backup.timer
  - deploy/systemd/backup.env.example
  - deploy/aws/backup-s3-policy.example.json
  - package.json
  - docs/ROADMAP.md
  - docs/runbooks/restore-drill.md
  - docs/runbooks/postgres-restore.md
requirements: [FR-EXP-010, FR-105]
covers:
  - runbook:docs/runbooks/postgres-restore.md
  - runbook:docs/runbooks/restore-drill.md
related: [OPS-DEPLOY, OPS-MIGRATE, OPS-SECRETS, OPS-INCIDENT, OPS-CONFIG]
---

# Backup and restore

This page exists because the older documentation described more than one backup
system and an operator could not tell which one to rely on. It states what is
in the repository, what is not, and what cannot be confirmed from here at all.

## Which backup system exists?

One. An application-level full export, uploaded to S3.

`scripts/backup-to-s3.sh` produces a complete export archive with sensitive
records included, checks it, and uploads it to a prefix under `BACKUP_S3_URI`.
`scripts/restore-from-s3.sh` fetches one back and hands it to the API's own
restore command. Both are wired into the workspace as `pnpm backup:s3` and
`pnpm restore:s3`. A systemd service and timer under `deploy/systemd/` run the
first of them on a schedule, and `deploy/aws/backup-s3-policy.example.json`
scopes the bucket permission to the export prefix alone.

Three earlier accounts disagreed with each other. Here is what each was, and
which one won.

| Claim | Where it came from | Status |
| --- | --- | --- |
| A nightly `pg_dump` to R2, with a quarterly restore drill, not yet shipped | `docs/ROADMAP.md`, in the remaining-work table | **Planned and abandoned.** Nothing in the repository runs `pg_dump`, and no code writes to R2. The mechanism, the target and the cadence all differ from what was built. |
| A full export archive uploaded to S3 | `docs/DEPLOYMENT.md` §4, `docs/runbooks/restore-drill.md` | **This is what exists.** Implemented by `scripts/backup-to-s3.sh` and wired to `pnpm backup:s3`. |
| Three recovery tiers, of which the export archive is the durable one | `docs/runbooks/postgres-restore.md` | **Consistent with the above**, and the more complete account. Reproduced below. |

Two notes for anyone who greps and finds a contradiction of their own.
`pg_dump` appears in the architecture notes and in the earliest decision record
as a *property of Postgres* - the reason a relational store was wanted - not as
a backup this system takes. R2 appears in a storage-adapter comment as a
service Cloudinary could be swapped for; that is where attachments live, not
where backups go.

> [!IMPORTANT]
> A share export is not a backup. The default export over HTTP omits sensitive
> records and everything that references them, which makes it a safe artefact
> to hand to someone else and an incomplete one to recover from. Three separate
> places refuse to confuse them: the backup script will not publish an archive
> whose manifest says sensitivity was excluded, the restore service refuses
> such a bundle outright, and the download script checks the same flag before
> it writes anything. Take a backup with `pnpm export:bundle`,
> `scripts/backup-to-s3.sh`, or `POST /api/v1/export` with
> `{"includeSensitive": true}`.

## What are the three recovery tiers?

Each covers a failure the others do not, and they are listed in the order you
would reach for them.

| Tier | Mechanism | Reaches back | Covers | Restores into |
| --- | --- | --- | --- | --- |
| Point-in-time recovery | The managed database's automated backups | The provider's retention window - see below | A mistaken delete, a bad migration | The same provider only |
| Manual snapshot | A snapshot taken deliberately before a risky change | Until you delete it | A change you know is risky | The same provider only |
| Export archive | `scripts/backup-to-s3.sh` on a schedule | Whatever the bucket keeps - see below | Losing the provider account, vendor exit, format independence | Anything that can run this API |

The first two are the fast ones and they are also the narrow ones: they restore
to a new database instance at the same provider and nowhere else. The third is
slower and is the only tier that survives losing the account, because it is a
format the system can read back rather than a vendor's internal representation.

The recovery runbook records that the point-in-time window on the account it
was written against is **one day, not the seven the design assumed**, because
that account's plan caps it there. If that is still true, the export archive is
not a nice-to-have - it is the only tier that reaches back further than
yesterday. See *What cannot be confirmed here* below.

## Taking a backup

Start with a dry run. It produces the archive and its sidecar locally and
touches no bucket:

```bash
DRY_RUN=1 pnpm backup:s3
```

A real upload needs the bucket, an AWS identity and the API's database
environment:

```bash
BACKUP_S3_URI=s3://your-private-bucket/vitae pnpm backup:s3
```

The objects land as `.../exports/YYYY-MM-DD/vitae-export.zip`, a
`backup-manifest.json` beside it recording the day, source, archive checksum
and the sensitivity flag, and a plaintext `.../exports/LATEST` naming the most
recent day. Uploads are server-side encrypted with S3-managed keys by default,
or with a customer-managed key if one is named; the script sets the encryption
on the upload itself rather than relying on the bucket's default.

The script needs `sha256sum`, `python3`, the AWS CLI, and either `pnpm` or an
explicit `BACKUP_EXPORT_CMD` telling it how to run the exporter. That last
escape hatch exists because the documented production host has Docker and no
Node toolchain, so its systemd unit passes a one-off container instead.

### The content floor is the part that matters

A checksum proves the archive is intact. It does not prove the archive contains
anything. An export run against an empty or wrong database uploads cleanly and
reports success, which is the worst failure a backup can have, because it looks
healthy right up to the moment you need it. The recovery runbook records that
this has already happened here: a backup ran green for twelve nights holding
three documents.

So it refuses to publish an archive holding fewer than `BACKUP_MIN_NODES`
nodes. The default is 1, which only catches a completely empty export.

> [!WARNING]
> Set `BACKUP_MIN_NODES` to a figure just under your live graph size, in the
> host's backup environment file. The shipped example environment file does not
> set it, and the workflow whose comment describes pinning it no longer exists,
> so an unattended installation is running with a floor of one node. That floor
> will not notice a backup that lost 99% of the graph.

### The schedule

`deploy/systemd/vitae-backup.timer` runs daily at 08:20 UTC with up to ten
minutes of jitter, and `Persistent=true` so a run missed while the host was off
happens at the next boot. The service unit runs as the checkout's owner rather
than root, so that the export written by a container as an unprivileged user
lands in a directory that stays `0700` instead of being widened to compensate.

The comment justifying 08:20 is stale: it reasons about a free-tier read quota
on a document store this system no longer uses. The time is now arbitrary. It
is not load-bearing and does not need preserving if another hour suits the
instance better.

A GitHub Actions workflow used to do this job before the database moved. It was
retired because a hosted runner has no route to a private database, and the
workflow file is no longer in the repository - the link to it in the restore
drill runbook does not resolve. Do not go looking for it.

## Restoring

Always restore into a scratch database first. Everything below writes.

Verify what is in the bucket without writing anything:

```bash
DRY_RUN=1 BACKUP_S3_URI=s3://your-private-bucket/vitae pnpm restore:s3
```

That downloads the most recent day, checks the archive against the checksum in
its sidecar, confirms the sensitivity flag, and prints the bundle's own
manifest counts. It is the cheapest way to answer "is there a usable backup".

Restore into a scratch database:

```bash
DATABASE_URL=postgresql://vitae:vitae@127.0.0.1:5433/vitae_drill \
  CONFIRM=YES BACKUP_S3_URI=s3://your-private-bucket/vitae pnpm restore:s3
```

Pin a specific day with `BACKUP_DAY=YYYY-MM-DD` instead of taking `LATEST`.

> [!WARNING]
> `CONFIRM=YES` writes to whatever database the environment points at. There is
> no confirmation prompt and no second chance. Check `DATABASE_URL` before you
> run it, not after.

> [!CAUTION]
> `FORCE=1` allows a restore into a database that is not empty, and it is more
> than an override. The restore writes every document from the bundle, then
> deletes every document in the target that the bundle does not contain, and
> deletes the stored attachment for any attachment record it prunes. Anything
> created since that backup is gone. Use it only when replacing a database's
> contents is exactly what you mean.

You can also restore from an archive you already have, without S3 at all:

```bash
unzip vitae-export-<timestamp>.zip -d /tmp/vitae-bundle
pnpm --filter @vitae/api restore /tmp/vitae-bundle
```

The target database must already have the schema applied - see
[Running database migrations](migrations.md).

### Why the bundle is trustworthy

The restore refuses more than it accepts, and each refusal corresponds to a way
a restore can silently produce a subtly wrong database.

It rejects a bundle whose schema version is not the major version it
understands, currently 3, because an older bundle does not guarantee complete
recovery of subcollections and attachments. It rejects a share-safe export. It
recomputes the SHA-256 of every data file and compares it to the manifest, and
compares the manifest's counts to the actual line counts. It checks referential
integrity across the whole bundle before it writes a single row, so an edge
pointing at a missing node fails the restore rather than producing a broken
graph. It verifies the size and checksum of every attachment. And it refuses a
non-empty target unless forced.

Document identities are preserved exactly. That is the property that makes the
whole thing work: every record carries its original identity, so edges,
revisions and atom references stay valid across the round trip. It is also why
you must never replay the exported records through the ordinary creation
endpoints as a restore path - creation assigns new identities and would orphan
every edge.

The forced replacement path writes before it prunes rather than emptying the
target first, so a restore that fails partway can be re-run and never begins by
deleting the only copy.

## The quarterly drill

`docs/runbooks/restore-drill.md` applies on a cadence, not in an emergency. Its
purpose is to prove the export can rebuild the system, which is the promise the
export exists to keep, and the only way to know a backup works is to have used
it recently.

The drill exports, verifies every checksum and count against the manifest,
opens the human-readable vault tree to confirm records are legible without this
software at all, restores into a fresh empty database, and then compares the
restored instance's manifest counts against the bundle's and spot-checks a few
real queries - a search, a person page, a résumé output. A full backup ZIP also
carries `time_entries.jsonl`, `automation_rules.jsonl`, and
`productivity_receipts.jsonl`, plus the `DEPENDS_ON`, `SERVES_GOAL`,
`WAITING_ON`, and `FOR` edges (FR-PROD-003). Share-safe export still empties
receipts and drops anything tied to a sensitive record. Run that half of the
drill on a throwaway database, never the everyday `vitae` URL.

`docs/runbooks/postgres-restore.md` applies in an emergency, and is the one to
reach for when the question is "how do I get the database back". It carries the
provider commands for the first two tiers, the checks to run before switching
traffic to a recovered instance, and the advice to keep the old instance until
the new one has served a full day.

> [!NOTE]
> The restore drill runbook points at section 8 of the deployment guide for its
> schedule. That guide has five sections. The schedule is in the runbook itself
> and is summarised above; there is nothing else to follow that pointer to.

## What cannot be confirmed here

These are facts about the world, not about the code. This repository cannot
establish any of them, and no number should be quoted from this page for them.

**Retention.** The recovery runbook states 365 days of retention in S3. Nothing
in this repository creates that. The documented bucket setup enables versioning
and encryption and blocks public access; it configures no lifecycle or
expiration rule at all. Whatever retention exists was set outside the
repository, or does not exist. Confirm it against the bucket before relying on
a figure.

**Whether the schedule is running.** The timer unit is in the repository. Being
in the repository is not being enabled on a host. Confirm with
`systemctl list-timers` on the host, and confirm the result independently by
listing the export prefix and reading `LATEST`.

**The point-in-time window.** One day, on the account the runbook was written
against, because of that account's plan. Both the plan and the window can
change without anything here changing. Read it from the provider.

**Recovery objectives and service commitments.** No recovery point objective,
recovery time objective, uptime target or support ownership is defined anywhere
in this repository. None is stated here. If an instance needs one, it has to be
decided and written down by whoever operates it.

> [!WARNING]
> The restore script requires `pnpm` on the machine that runs it, with no
> equivalent of the container escape hatch the backup script has. The
> documented production host has Docker and no Node toolchain, which means the
> restore script cannot run there as it stands. Restore from a machine that has
> the toolchain and network access to the database, or invoke
> `pnpm --filter @vitae/api restore` inside a container by hand. Find this out
> now rather than during an incident.

## Related pages

[Responding to an incident](incident-response.md) says when to reach for which
tier. [Running database migrations](migrations.md) covers the snapshot you take
before a risky schema change. [Secrets and rotation](secrets-and-rotation.md)
covers the credentials the backup path uses, and
[Configuration and its failure modes](configuration.md) covers what happens
when the backup destination is misconfigured.
