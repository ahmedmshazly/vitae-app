# Runbook: export round-trip / restore drill

Vitae's no-lock-in guarantee (SRS G4/§1.4): the system must be reconstructable
from its own export. This drill proves it.

> **Full backups must be exported with sensitive records included**
> (`POST /api/v1/export` with `{"includeSensitive": true}`, or
> `pnpm export:bundle` / `scripts/backup-to-s3.sh`). The default HTTP export
> transitively excludes sensitive nodes and everything referencing them, so it
> is a safe share artifact, **not** a complete backup. `manifest.json` records
> which kind you have via `includes_sensitive`. Share export ≠ backup.

## Procedure

1. **Export.** Settings → *Export everything* (or `POST /api/v1/export` with
   `{"includeSensitive": true}` for a backup). You get a ZIP with one JSONL per
   durable collection (`nodes`, `edges`, `revisions`, `atoms`, `atom_variants`,
   `atom_skills`, `targets`, `resumes`, `templates`, `reminders`, `tags`,
   `taggings`, `attachments`, `merges`, `imports`, `saved_views`, `meta`,
   `habit_checks`, `dedup_dismissals`), `manifest.json`, and a `vault/`
   Markdown tree. Every JSONL line carries `_doc_id`: the original document
   identity.

   Privileged local CLI (same ZIP shape, always sensitive-inclusive unless
   `--share-safe`):

   ```sh
   pnpm export:bundle -- --out=/tmp/vitae-export.zip
   ```
2. **Verify integrity.** Recompute SHA-256 of each `*.jsonl` and compare to
   `manifest.json.checksums`. Confirm `manifest.counts` matches the line counts.
3. **Human-readable check.** Open `vault/` in Obsidian: every live record is a
   note with YAML frontmatter, and edges render as working `[[wiki-links]]`.
4. **Round-trip (fresh instance).** Point the API env at an empty Postgres
   database, unzip the bundle, and run the privileged restore command. It
   preserves document IDs, so every edge, revision, and atom reference stays
   valid:

   ```sh
   unzip vitae-export-<ts>.zip -d /tmp/vitae-bundle
   pnpm --filter @vitae/api restore /tmp/vitae-bundle
   ```

   The command verifies manifest checksums and edge referential integrity
   before writing, and refuses a non-empty target without `--force`.
5. **Assert.** Compare `/api/v1/export/manifest` counts on the restored
   instance against the bundle's `manifest.json`, and spot-check canonical
   queries (search, a person page, a résumé output).

Never replay `nodes.jsonl` through `POST /nodes` as a restore path: node
creation assigns new IDs and would orphan every edge.

## Automated off-box backups (S3)

Postgres on RDS is the system of record and already lives **off-VM**. Compose
volumes are mostly Caddy/certs, not graph data. Durability is an automated
**full export ZIP** to versioned S3 (same G4 shape the restore drill already
uses), not a second dump format and not "put Postgres on the VM."

RDS PITR and manual snapshots cover short operational mistakes; the export
bundle is the portable tier. See [`postgres-restore.md`](postgres-restore.md).

### S3 layout

`BACKUP_S3_URI` example: `s3://vitae-backups/prod`

```
.../exports/YYYY-MM-DD/vitae-export.zip
.../exports/YYYY-MM-DD/backup-manifest.json   # day, project_id, zip_sha256, includes_sensitive: true
.../exports/LATEST                            # plaintext day, e.g. 2026-07-16
```

Secrets stay out of S3 objects unencrypted beyond what the export already
contains (your graph). IAM is least-privilege on one prefix (`.../exports/*`).
Cloudinary URLs are a CDN, **not** a backup (optional Phase B: asset inventory).

### Operator commands

```sh
# Dry-run: full export locally under .vitae-backup/<day>/, no S3
DRY_RUN=1 pnpm backup:s3

# Real upload (needs BACKUP_S3_URI + AWS identity + API/Postgres env)
BACKUP_S3_URI=s3://vitae-backups/prod pnpm backup:s3

# Download LATEST, verify zip sha256, do not write the database
DRY_RUN=1 BACKUP_S3_URI=s3://vitae-backups/prod pnpm restore:s3

# Restore into empty local Postgres / scratch (CONFIRM gate)
DATABASE_URL=postgresql://vitae:vitae@127.0.0.1:5433/vitae_drill \
  CONFIRM=YES BACKUP_S3_URI=s3://vitae-backups/prod pnpm restore:s3

# Pin a day; overwrite non-empty target only with eyes open
CONFIRM=YES FORCE=1 BACKUP_DAY=2026-07-15 BACKUP_S3_URI=s3://.../prod pnpm restore:s3
```

`scripts/restore-from-s3.sh` downloads the ZIP, checks the sidecar checksum, then
invokes the existing `pnpm --filter @vitae/api restore` (bundle checksums + FK
checks unchanged).

### Schedule (pick one)

**Preferred: systemd on the API VM** (instance IAM role; host has the only route
to private RDS). Production uses `vitae-backup.timer` at **08:20 UTC** (+ jitter).
See [`docs/DEPLOYMENT.md`](../DEPLOYMENT.md) §8.

```sh
sudo mkdir -p /etc/vitae
sudo cp deploy/systemd/backup.env.example /etc/vitae/backup.env
sudo edit /etc/vitae/backup.env   # BACKUP_S3_URI=s3://vitae-backups/prod
sudo cp deploy/systemd/vitae-backup.service deploy/systemd/vitae-backup.timer \
  /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now vitae-backup.timer
sudo systemctl start vitae-backup.service   # first run
```

The timer runs the exporter via `BACKUP_EXPORT_CMD` (one-off container) because
the production VM has Docker, not a full pnpm install.

**Historical note:** a GitHub Actions OIDC workflow
([`.github/workflows/backup-export.yml`](../../.github/workflows/backup-export.yml))
existed before the Postgres cutover. It was retired because a runner has no
route to private RDS. Prefer the host timer.

### Owner one-time setup (AWS)

1. **S3 bucket** (private, versioned, SSE-S3):

   ```bash
   BUCKET=vitae-backups   # globally unique
   REGION=eu-central-1
   aws s3api create-bucket --bucket "$BUCKET" --region "$REGION" \
     --create-bucket-configuration LocationConstraint="$REGION"
   aws s3api put-public-access-block --bucket "$BUCKET" \
     --public-access-block-configuration \
     BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
   aws s3api put-bucket-versioning --bucket "$BUCKET" \
     --versioning-configuration Status=Enabled
   aws s3api put-bucket-encryption --bucket "$BUCKET" \
     --server-side-encryption-configuration \
     '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}'
   ```

2. **IAM role for the API host** (or GHA OIDC if you revive a runner with
   network access): trust policy
   [`deploy/aws/backup-trust-policy.example.json`](../../deploy/aws/backup-trust-policy.example.json)
   (replace `ACCOUNT_ID`, `OWNER`); attach
   [`deploy/aws/backup-s3-policy.example.json`](../../deploy/aws/backup-s3-policy.example.json)
   (replace `BUCKET_NAME`; prefix `prod/exports/*`).

3. Confirm after the first timer run:

   ```bash
   aws s3 ls "$BACKUP_S3_URI/exports/"
   aws s3 cp "$BACKUP_S3_URI/exports/LATEST" -
   ```

## Cadence

- **Nightly:** automated full export → S3 (`vitae-backup.timer` on the API host).
- **Quarterly:** this restore drill: download `LATEST` (or a pinned day) into a
  scratch Postgres, assert counts + integrity + a handful of
  canonical queries, then post the result.
