---
id: OPS-INCIDENT
title: Responding to an incident
summary: The signals a Vitae instance actually emits, the ones it does not, and which procedure to reach for per symptom; assembled from evidence, not from a record.
audience: [operator, security]
domain: operate
type: task
status: needs-review
sources:
  - apps/api/src/middleware/health.ts
  - apps/api/src/middleware/request-context.ts
  - apps/api/src/routes/v1/status.ts
  - apps/api/src/app.ts
  - apps/api/src/index.ts
  - apps/api/src/services/buildsvc-client.ts
  - scripts/deploy-api.sh
  - deploy/compose.prod.yml
  - docs/CLOUD-LAUNCH.md
  - SECURITY.md
requirements: [FR-026, FR-SET-006, FR-006]
related: [OPS-DEPLOY, OPS-CONFIG, OPS-MIGRATE, OPS-BACKUP, OPS-SECRETS]
---

# Responding to an incident

## What this page is, and what it is not

`docs/CLOUD-LAUNCH.md` requires an incident response runbook to be prepared
before any hosted service opens. No such runbook exists in this repository.
This page is not it, and does not stand in for it.

What this page is: an account, assembled by reading the running code, of what a
self-hosted Vitae instance tells you when something is wrong, what it does not
tell you, and which of the other pages in this section carries the procedure
for each symptom. It carries the needs-review badge because it was
reconstructed from evidence rather than written by someone with operational
authority over a running instance. Everything factual in it was checked against
source; the *ordering* is a suggestion, not a policy anybody has agreed to.

Nothing here defines a response time, an escalation path, an availability
target or who is responsible. Those are decisions for whoever runs the
instance, and none of them exists in this repository to be reported.

## What signals exist?

Five, all of them pull rather than push.

**`GET /health`** answers whether the process is alive. It never touches the
database. A platform uses it to decide whether to restart the container.

**`GET /ready`** answers whether the instance should receive traffic, and its
503 responses name the reason:

| Reason | What it means |
| --- | --- |
| `starting or draining` | The process is booting, or has received a termination signal and is finishing in-flight work |
| `database unreachable` | The database probe failed or timed out, with the underlying error in `detail` |
| `build service unreachable` | The LaTeX build service did not answer its health check. Production only |

The database probe is bounded at two seconds and its result cached for five, so
`/ready` cannot be turned into a way to hang the instance.

**`GET /api/v1/status`** is the richer check and tests something `/ready` does
not: it performs a *write*, not a read. That distinction matters during an
incident. A database that is reachable but read-only - a failed-over replica, a
full volume - passes readiness and fails status. It also reports storage and
build-service health and live record counts.

**`GET /api/v1/metrics`** reports in-process counters: active requests, aborted
requests, and per-route request, error and average-duration figures. They are
held in memory in one process and reset when it restarts, so they answer "what
is happening now" and never "what happened last night".

**The access log.** Every response emits one structured JSON line with a
timestamp, a request identifier, the method, the route pattern, the path, the
status and the duration. Server errors go to standard error, client errors to
warning, everything else to standard output - so severity is greppable without
parsing. The same request identifier is echoed in the `x-request-id` response
header and included in error envelopes, which is how a user's report of "it
failed" becomes a specific line in the log.

Route *patterns* are logged rather than raw paths, so identifiers in a URL do
not shard the metric. The path is recorded separately with its query string
stripped.

Two of those five are behind the default-deny gate. `/health` and `/ready` are
mounted before it and answer an unauthenticated caller; the status and metrics
routes sit under `/api` and need a signed-in owner. If sign-in is the thing
that is broken, you have readiness, the logs and the container state, and
nothing else - plan for that case rather than discovering it.

On the documented topology these are container logs:

```bash
docker compose -f deploy/compose.prod.yml logs --tail 200 api
docker compose -f deploy/compose.prod.yml ps
./scripts/deploy-api.sh --check
```

## What signals do not exist?

Say this plainly, because assuming otherwise is how an incident gets long.

**Nothing alerts.** There is no alerting, no paging, no notification and no
external uptime monitor anywhere in this repository. Every signal above must be
looked at by a person. `docs/CLOUD-LAUNCH.md` lists operational alerts among
the things that must be configured before a hosted service opens, which is
another way of saying they are not configured now.

**Nothing records who did what.** There is no audit log. The access log records
what was called and what it returned, not who called it. For a single-operator
instance that is a smaller gap than it sounds (there is one admitted identity),
but it means after-the-fact attribution is limited to correlating a request
identifier with a timestamp.

**Metrics do not survive a restart.** If the instance has already been
restarted, the counters are gone. The log lines are not.

**There is no rollback command.** The deploy script fast-forwards a branch and
refuses a diverged or dirty checkout. It has no inverse. Getting back to an
earlier release means moving the branch and deploying again, deliberately,
knowing that any migration the bad release applied is still applied. Plan the
rollback before you need it, not during.

## The first five minutes

1. `GET /ready`. Its 503 reason narrows the problem faster than anything else
   you can do.
2. `GET /api/v1/status`. This separates "database unreachable" from "database
   reachable but not writable", and tells you about storage and the compiler.
3. `./scripts/deploy-api.sh --check`. Which revision is deployed, what the
   containers are doing, whether liveness answers.
4. The last few hundred log lines, filtered to errors.
5. Only then change something.

Resist the reflex to redeploy first. A redeploy runs migrations, and a
migration applied during a confused incident is the thing that turns a
recoverable hour into a restore.

## Triage by symptom

| Symptom | Most likely | Where the procedure is |
| --- | --- | --- |
| Readiness says `database unreachable` | Database down, credentials changed, certificate bundle expired, network path lost | [Configuration](configuration.md) for the certificate failure mode; [Backup and restore](backup-and-restore.md) if the database itself is gone |
| Status shows the database check failing on a write while readiness passes | Read-only replica, exhausted disk | Provider console; recovery tiers in [Backup and restore](backup-and-restore.md) |
| Readiness says `build service unreachable` | The compiler container is down or unhealthy | [Deploying an instance](deploy.md) - and note this blocks a deploy from completing |
| Résumés download as `.tex` instead of PDF | The compiler is unreachable; the API degraded on purpose | [Deploying an instance](deploy.md) |
| Every compile returns 401 | The two halves of the build-service signing key disagree | [Secrets and rotation](secrets-and-rotation.md) |
| The API will not start at all | A configuration refusal; the error names every failing value | [Configuration](configuration.md) |
| A deploy never becomes ready | Often the compiler, not the release | [Deploying an instance](deploy.md) |
| Records are missing or wrong after a schema change | A migration did something unintended | [Running database migrations](migrations.md), then [Backup and restore](backup-and-restore.md) |
| Records are missing with no schema change | Retention purge, a forced restore, or a deletion | [Backup and restore](backup-and-restore.md) |
| A credential may have been exposed | - | [Secrets and rotation](secrets-and-rotation.md), rotate before investigating |
| The last backup is old or absent | The scheduled job stopped and nothing said so | [Backup and restore](backup-and-restore.md) |
| Productivity routes appeared for an operator who did not opt in | A flag was left on in the API env or the web build | Kill switch in [Configuration](configuration.md) and `docs/runbooks/productivity-flag.md`: unset both flags, restart the API, rebuild the web app |
| Productivity analytics look like product telemetry | They are not. Figures are private compute-on-read | [What Vitae does not do](../product/boundaries.md); ADR 0012. There is no outbound analytics client |

## Data loss

> [!CAUTION]
> Do not restore into the affected database as a first move. A restore with the
> force flag deletes every record the bundle does not contain, and a restore
> into the wrong database destroys a second copy of the data. Restore into a
> scratch database, confirm the contents are what you expect, and only then
> decide what to do with production.

The order that keeps options open:

1. Stop writing to the affected database. Stopping the API container is the
   bluntest and most reliable way.
2. Take a snapshot of the damaged state *before* recovering. A damaged database
   is still evidence, and the recovery may make things worse.
3. Establish what you can recover from and how far back it reaches. The three
   tiers, their reach and their limits are in
   [Backup and restore](backup-and-restore.md).
4. Recover into a new database instance. The recovery runbook restores to a new
   instance rather than overwriting the source, which is the property that lets
   you compare before committing.
5. Verify before switching traffic: the migration status shows everything
   applied, and the graph integrity audit is clean.
6. Keep the old instance until the new one has served a full day.

If the loss is a soft delete rather than a failure, note that a scheduled purge
runs daily inside the API process and permanently removes records past the
retention window. Once it has run, the trash is not the place to look - a
backup is.

## Suspected compromise

Rotate first, investigate second. A rotation takes minutes and an investigation
takes hours, and the credential is doing damage the whole time.

Then reason about reach. Every credential and what it protects is tabulated in
[Secrets and rotation](secrets-and-rotation.md). Treat the exposure as reaching
everything that credential can reach, until you can show otherwise - and note
what you cannot show: with no audit log, this system cannot demonstrate that a
credential was *not* used.

A vulnerability in Vitae itself goes through the private disclosure path in
`SECURITY.md` rather than a public issue. That document asks for the affected
version, an impact statement, reproduction steps and any suggested mitigation,
and states that a complete report will be acknowledged. It commits to no
timeframe.

## Afterwards

Two things are worth doing while the incident is fresh.

Run the restore drill, if the incident touched data at all. It is the only
procedure that proves the export can rebuild the system, and the moment after
you have needed it is the moment you will actually do it.

Write down what the instance did, because this repository will not have. The
metrics are gone, the logs roll, and there is no record of the decisions
anybody made. If that record matters, it has to be kept somewhere else.

## What still needs deciding

These are not gaps this documentation can close. They need someone with
authority over the instance to decide and write down.

- Who responds, and within what time.
- What availability, if any, the instance is expected to hold.
- How much data loss is acceptable, and how long a recovery may take. No
  recovery point or recovery time objective exists anywhere in this repository,
  and none is stated on any page here.
- Whether an alert should exist for backup age, readiness failure and error
  rate - and where it should go.

When those are decided, this page should be replaced by the runbook
`docs/CLOUD-LAUNCH.md` asks for, rather than extended.
