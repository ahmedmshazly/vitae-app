# Runbook: run the local emulators

```bash
pnpm dev:emulators   # Auth :9099 · UI :4001 (Auth only; no Firestore)
```

Postgres is separate: `pnpm dev:db` (Docker on :5433 + migrations).

- The Admin SDK targets the Auth emulator when `FIREBASE_AUTH_EMULATOR_HOST`
  is set in `.env`. Do not configure database-emulator variables; the data
  plane is Postgres.
- **Local graph data lives in Postgres**, not emulator export directories. Treat
  the Docker volume as durable unless you wipe it on purpose.
- Re-seed with `pnpm seed` to load the fictional demo graph. Use
  `pnpm load:bundle -- --file=<bundle.json>` when testing an export from your
  own system.

## Troubleshooting

| Symptom | Fix |
|---|---|
| API `database` check red on `/status` | Postgres not running, or `DATABASE_URL` wrong. Run `pnpm dev:db`. |
| Auth / Google sign-in oddities locally | Confirm `pnpm dev:emulators` is up and Auth host/port match `.env`. |
| `You are not currently authenticated` warning | Harmless for emulator-only Auth use. |
