# Runbook: Postgres recovery

Three independent recovery tiers, deliberately. Each covers a failure the others
do not, and they are listed here in the order you would actually reach for them.

| Tier | Mechanism | Window | Covers | Restores into |
| --- | --- | --- | --- | --- |
| 1. PITR | RDS automated backups | **1 day** (free-plan cap; see below) | fat-finger `DELETE`, a bad migration | RDS only |
| 2. Manual snapshot | `aws rds create-db-snapshot` | until you delete it | a change you know is risky | RDS only |
| 3. Export bundle | `scripts/backup-to-s3.sh`, nightly 08:20 UTC | 365 days in S3 | account loss, vendor exit, **format independence** | anything |

> **The PITR window is 1 day, not the 7 the design assumed.** This AWS account
> is on a Free Tier plan, and `create-db-instance` rejects any
> `--backup-retention-period` above 1 with `FreeTierRestrictionError`. Tier 3 is
> therefore the real durability story, not a nice-to-have: it is the only tier
> that reaches back further than yesterday. Raising retention needs an account
> plan upgrade, then:
>
> ```sh
> aws rds modify-db-instance --db-instance-identifier vitae-db \
>   --backup-retention-period 7 --apply-immediately
> ```

## Tier 1: point-in-time recovery

Restores to a **new** instance; RDS never overwrites the source. Check the
window first, or you will pick a timestamp that is not covered.

```sh
aws rds describe-db-instances --db-instance-identifier vitae-db \
  --query 'DBInstances[0].[LatestRestorableTime,EarliestRestorableTime]' --output text

aws rds restore-db-instance-to-point-in-time \
  --source-db-instance-identifier vitae-db \
  --target-db-instance-identifier vitae-db-pitr \
  --restore-time 2026-08-01T09:15:00Z \
  --db-subnet-group-name vitae-db-subnets \
  --vpc-security-group-ids "$(cat deploy/.db-sg-id 2>/dev/null || echo sg-0db013bbf4bb0025e)" \
  --no-publicly-accessible --db-instance-class db.t4g.micro
```

Then point `DATABASE_URL` at the new endpoint and redeploy. Verify **before**
switching traffic:

```sh
pnpm --filter @vitae/api migrate -- --status   # schema is at the expected version
pnpm audit:graph                               # 0 errors / 0 warnings
```

Keep the old instance until the new one has served a full day.

## Tier 2: manual snapshot before anything risky

Take one before a migration you are unsure of. It costs nothing to keep briefly
and is the fastest way back.

```sh
aws rds create-db-snapshot --db-instance-identifier vitae-db \
  --db-snapshot-identifier vitae-db-pre-migration-$(date -u +%Y%m%d)
aws rds wait db-snapshot-available --db-snapshot-identifier vitae-db-pre-migration-$(date -u +%Y%m%d)
```

Restoring is `restore-db-instance-from-db-snapshot`, same shape as above.

## Tier 3: the export bundle

This is the tier that survives losing the AWS account, and the only one that can
be restored into something that is not RDS. It is the same G4 bundle described
in [`restore-drill.md`](restore-drill.md); the storage engine underneath it
changed, the format did not.

```sh
BACKUP_S3_URI=s3://vitae-backups/prod CONFIRM=YES ./scripts/restore-from-s3.sh
```

Into a scratch database rather than production:

```sh
docker compose up -d postgres
DATABASE_URL=postgresql://vitae:vitae@127.0.0.1:5433/vitae_drill \
  pnpm --filter @vitae/api migrate
DATABASE_URL=postgresql://vitae:vitae@127.0.0.1:5433/vitae_drill \
  BACKUP_S3_URI=s3://vitae-backups/prod DRY_RUN=0 CONFIRM=YES ./scripts/restore-from-s3.sh
```

### Why the bundle is trustworthy

`restore.ts` verifies every JSONL checksum against `manifest.json` before it
writes anything, preserves original document ids so edges and revisions stay
valid, and refuses a non-empty target unless forced. `backup-to-s3.sh` refuses
to *publish* an export holding fewer than `BACKUP_MIN_NODES` nodes, because a
checksum proves the ZIP is intact, not that it contains anything, and this
backup once ran green for twelve nights with three documents in it.

## Connecting by hand

The instance is not publicly accessible; reach it from the API host.

```sh
ssh ubuntu@<api-host>
docker compose -f deploy/compose.prod.yml exec api sh -lc \
  'node -e "const{Client}=require(\"pg\");const c=new Client({connectionString:process.env.DATABASE_URL,ssl:{ca:process.env.DATABASE_CA_CERT}});c.connect().then(()=>c.query(\"select count(*) from nodes\")).then(r=>console.log(r.rows)).finally(()=>c.end())"'
```

`rds.force_ssl=1` is set, so a connection without TLS is refused outright. The
API supplies the CA from `DATABASE_CA_CERT` and verifies it. It will not fall
back to `rejectUnauthorized: false`, so a missing bundle is a startup error
rather than a silently interceptable connection.

Refresh the bundle when AWS rotates its CAs:

```sh
curl -O https://truststore.pki.rds.amazonaws.com/eu-central-1/eu-central-1-bundle.pem
```

## Resources

| Thing | Identifier |
| --- | --- |
| Instance | `vitae-db` (db.t4g.micro, Postgres 17.10, eu-central-1b) |
| Subnet group | `vitae-db-subnets` |
| Security group | `vitae-db-sg` (ingress 5432 from the API instance SG only) |
| Parameter group | `vitae-pg17` (`rds.force_ssl=1`) |
| Master credential | `~/.secrets/vitae/rds-master.env` (0600, never in git) |

Deletion protection is on. To decommission deliberately:

```sh
aws rds modify-db-instance --db-instance-identifier vitae-db --no-deletion-protection --apply-immediately
aws rds delete-db-instance --db-instance-identifier vitae-db --final-db-snapshot-identifier vitae-db-final
```
