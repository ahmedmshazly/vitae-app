# Personal local Vitae

Production-mode Vitae on one PC: local Postgres, local object storage, local
backups, no Vitae Cloud, no Vercel, no Firebase Google, no S3, no Cloudinary.

Open `http://127.0.0.1:8080`. Sign in with **Continue as owner**. After reboot,
Docker starts the stack (`restart: unless-stopped`).

This is not [`deploy/compose.prod.yml`](../../deploy/compose.prod.yml). That file
is the hosted VM path.

## Trust boundary

Caddy is published on `127.0.0.1:8080` only. Anyone who can already run
processes as you can press Continue as owner. Publishing Caddy on `0.0.0.0` is
unsupported and would make that button a LAN backdoor.

The graph lives in the Docker volume `vitae_personal_pgdata`, not the
development `vitae_pgdata` used by [`compose.yaml`](../../compose.yaml). Do not
run `pnpm seed` or `pnpm seed:demo` against this install.

## First bring-up

From the repository root, with Docker installed:

```bash
./scripts/personal-up.sh
```

The script:

1. Writes `deploy/.env.personal` (git-ignored) with fresh secrets if missing.
2. Builds the web app with productivity on, Cloud off, and demo Firebase values
   so Google sign-in is unavailable.
3. Optionally compiles the private docs corpus.
4. Starts `deploy/compose.personal.yml`.
5. Applies migrations.
6. Installs a user systemd backup timer.
7. Installs a desktop launcher.
8. Runs one backup with `BACKUP_MIN_NODES=0` so an empty graph still produces a
   ZIP. Nightly backups use the floor of 1 node.

Enable Docker at boot if it is not already:

```bash
sudo systemctl enable --now docker
```

## Daily use

- Open `http://127.0.0.1:8080` or the Vitae desktop entry.
- Productivity routes (`/today/tasks` and siblings) are on. Rules and recurrence
  records store; they do not auto-run (FR-PROD-005).
- `/today`, Planner, and Ledger are unchanged.

## Update

```bash
git pull
./scripts/personal-up.sh
```

`personal-up.sh` rebuilds images, rebuilds the web bundle, and re-runs
migrations. It does not reseed.

## Backup and restore

Nightly at 08:20 UTC, `vitae-personal-backup.timer` writes:

```
~/vitae-backups/YYYY-MM-DD/vitae-export.zip
~/vitae-backups/YYYY-MM-DD/backup-manifest.json
```

Folders older than 14 days are deleted. Manual run:

```bash
pnpm backup:local
```

Restore an export into a **new empty** database, never onto a graph you still
need, using the existing restore drill: [`restore-drill.md`](restore-drill.md).
Point `DATABASE_URL` at the personal Postgres (through the compose network) or
restore into a disposable database first.

To raise the empty-graph floor after you have real records, leave
`BACKUP_MIN_NODES=1` (the timer default). A backup of zero nodes is refused.

## Stop / start

```bash
docker compose -f deploy/compose.personal.yml --env-file deploy/.env.personal stop
docker compose -f deploy/compose.personal.yml --env-file deploy/.env.personal up -d
```

## Kill switch (hide productivity)

In `deploy/.env.personal` and the compose `environment:` block, set
`VITAE_PRODUCTIVITY_ENABLED=false`. Rebuild the web app with
`VITE_PUBLIC_PRODUCTIVITY_ENABLED=false`. Restart the API. See
[`productivity-flag.md`](productivity-flag.md).

Do not set `VITAE_LOCAL_INSTALL` on `deploy/compose.prod.yml`.
