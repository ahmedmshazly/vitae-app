---
id: OPS
title: Operate
summary: Running a Vitae instance: what deployment actually consists of, how configuration fails, and how to migrate, back up, rotate and recover.
audience: [operator, maintainer]
domain: operate
type: index
status: verified
verified_at: 2026-08-24
sources:
  - scripts/deploy-api.sh
  - deploy/compose.prod.yml
  - packages/config/src/env.ts
  - scripts/backup-to-s3.sh
---

# Operate

Vitae is a single-operator application. One installation admits one identity,
holds one person's career graph, and is run by the person whose graph it is.
Nothing in this section assumes a team, a rota, or a second pair of hands.

That shapes everything below. There is no continuous deployment: the pipeline
builds and tests, and a human runs the deploy. There is no alerting: the
instance exposes its own health and someone has to look. Recovery is a
procedure a person follows, not a system that heals itself. Each page says
plainly which parts are automated and which are not, because an operational
page that implies a safety net that is not there is worse than no page.

## The hosted service is not operating

A hosted Vitae Cloud offering is designed and partly built. It is closed in
every default build, behind two separate flags, and this documentation makes no
claim about a hosted service being available, supported or run by anyone.
Where a page touches the Cloud plane it says so and labels it. Everything else
here describes a self-hosted instance you run yourself.

## What is here

[Deploying an instance](deploy.md) explains the shape of a deployment: three
deployable parts, two hosts, a database that lives outside both, and the one
guarded command that moves code onto the API host. Read it before any of the
task pages, because they assume its topology.

[Configuration and its failure modes](configuration.md) is the reference for
what happens when a value is missing, malformed or dangerous. Only nineteen of
the seventy-eight configuration keys the generated catalog knows about are
validated at boot; the page explains which failures are caught, where they are
caught, and which are not caught at all.

[Running database migrations](migrations.md) covers the migration runner, the
lock and transaction it takes, the order a deploy applies it in, and what
rolling one back does and does not undo.

[Backup and restore](backup-and-restore.md) is the single truthful account of
what protects the data. Three documents in this repository described three
different backup systems; that page says which one exists, which was designed
and never built, and which durability claims nobody here can verify.

[Secrets and rotation](secrets-and-rotation.md) covers where each credential
lives, what it authenticates, and what breaks at the moment you rotate it.

[Responding to an incident](incident-response.md) is what the repository can
support today when something is wrong: the signals that exist, the ones that do
not, and which page carries the recovery procedure for each symptom.

## Related sections

[Develop](../develop/index.md) covers setting up, testing and shipping a
change. [About these documents](../meta/index.md) records what the older
operational documents got wrong and where those defects were repaired.
