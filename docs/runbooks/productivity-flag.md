# Runbook: productivity flags and kill switch

The Fourfold productivity surface is shipped and **off**. There is one pair of
names. A third flag is a defect.

| Flag | Process | What it gates |
| --- | --- | --- |
| `VITAE_PRODUCTIVITY_ENABLED` | API | `/api/v1/productivity` reads and writes |
| `VITE_PUBLIC_PRODUCTIVITY_ENABLED` | Web **build** | Today strip, command palette, and `/today/tasks` siblings |

Truthy tokens (case-insensitive): `true`, `1`, `yes`. Unset or any other value
is off (FR-PROD-001).

`/today`, `/today/planner`, and `/today/ledger` do not move. Import Hub task
kinds write ordinary `task` nodes through `repository.createNode` and are **not**
gated by these flags.

## Kill switch

Unset both flags, or set them to anything other than the truthy tokens, then
restart the API and **rebuild** the web app.

- API: every `/api/v1/productivity` path returns **404**
  `{ error: { code: 'NOT_FOUND', message: 'Not found.' } }` — the same envelope
  as a missing task. There is no distinct "disabled" code.
- Web: Tasks / Waiting / Review / Analytics / Automation / Task templates leave
  the Today strip and the palette. Bookmarks still resolve behind AuthGate to a
  short "Not available" page and must not fetch `/productivity`.

Committed `.env.example` stays `false`. Do not enable the flags in CI, demo
seed, or any checked-in environment file.

## Enable first for demo data, then the operator workspace

This is a local operator procedure, not a committed default-on.

1. Verify flag-off: API 404 on `/api/v1/productivity/tasks`, web Today strip
   still shows Planner and Ledger only.
2. Confirm the demo space already has inert productivity records (seed-demo
   writes `time_entries`, `automation_rules`, `productivity_receipts`, and the
   new edges). They stay unread until the flags are on.
3. In a **local** `.env` (git-ignored), set both flags to `true`.
4. Restart the API. Rebuild the web app (`pnpm --filter @vitae/web build` or
   restart Vite) so `VITE_PUBLIC_*` is baked in.
5. Sign into the **demo** space. Open `/today/tasks`, `/today/waiting`,
   `/today/review`, `/today/analytics`, `/today/automation`,
   `/today/task-templates`. Confirm `/today`, planner, and ledger still match
   their existing tests.
6. Only after that walk is clean, repeat steps 3–5 for the operator (`real`)
   workspace on the same machine.

To leave: apply the kill switch above. Demo records remain in the graph; they
become inert again.

## Performance seed

`pnpm seed:productivity-perf` writes 10,000 task nodes. It refuses the default
`vitae` / `vitae_test` databases. Point `DATABASE_URL` at a dedicated database
(for example `vitae_perf`) and set `VITAE_PRODUCTIVITY_PERF_CONFIRM=YES`.
See `docs/testing/productivity-budgets.json`.
