---
id: OPS-DEPLOY
title: Deploying an instance
summary: What a Vitae deployment consists of, why the API host and the web host are separate, and what the one guarded deploy command does in order.
audience: [operator]
domain: operate
type: explanation
status: verified
verified_at: 2026-08-24
sources:
  - scripts/deploy-api.sh
  - deploy/compose.prod.yml
  - deploy/Caddyfile
  - deploy/.env.example
  - apps/api/Dockerfile
  - services/buildsvc/Dockerfile
  - vercel.json
  - .github/workflows/ci.yml
  - apps/api/src/middleware/health.ts
  - apps/api/src/index.ts
  - apps/api/src/routes/v1/docs.ts
  - scripts/docs/build-content.mjs
  - packages/config/src/env.ts
  - docs/runbooks/bump-tectonic.md
requirements: [FR-026, FR-016, FR-007, FR-RES-009]
covers: [runbook:docs/runbooks/bump-tectonic.md]
related: [OPS-CONFIG, OPS-MIGRATE, OPS-BACKUP, OPS-SECRETS, OPS-INCIDENT]
---

# Deploying an instance

## In short

A Vitae deployment is three programs in two places, plus a database that is in
neither. A static web application goes to a static host. An API and a LaTeX
build service run as containers on one machine behind a reverse proxy.
Postgres lives outside both, which is why the container host is disposable and
the database is not.

Nothing deploys itself. Continuous integration builds and tests, and stops
there; moving code onto the API host is one command a person runs, and it is
guarded so that it cannot run against a host or a directory it was not told
about.

One thing that used to travel with the web application no longer does: the
documentation corpus is private, so the API serves it rather than the static
host, and it has to be built and put on the API host by hand. Nothing below
does that for you, and an instance that skips the step runs correctly with no
documentation in it.

## How it works

### Three deployable parts

The web application is a Vite single-page build. It is static files: it holds
no secret, talks only to the API, and can be served by any host that supports
an SPA fallback to `index.html`.

The API is an Express server. It is the only part that holds credentials, and
the only part that talks to Postgres.

The build service compiles LaTeX with a pinned Tectonic binary. It is not
reachable from the internet. The API calls it over a private network with a
signed request, and it is deliberately given nothing else: no egress, a
read-only root filesystem, no new privileges, and a writable `/tmp` and nothing
more.

Postgres is the system of record and is not one of the three. It runs
separately — managed, in the documented topology — which is the reason the
container host can be rebuilt without ceremony while the database cannot.

### Why the deploy is manual

The pipeline in `.github/workflows/ci.yml` runs typecheck, lint, unit and
accessibility checks; a production build with image scanning; an API suite
against a real Postgres; a LaTeX calibration build; and the browser journeys.
None of its jobs deploys anything. That is a choice consistent with a
single-operator instance: the pipeline's job is to refuse a bad commit, and the
decision to put a good commit in front of real data stays with the person whose
data it is.

The consequence is that a green pipeline is not a release. Someone has to run
the deploy, and someone has to look at the result.

### What holds the release honest

Three gates run in the pipeline rather than at deploy time, because catching
them at deploy time would be catching them too late.

Container base images must be digest-pinned. The guard greps the two
Dockerfiles and the production compose file for an unpinned `FROM` or `image:`,
and it carries a self-test that feeds it a deliberately unpinned reference and
fails the job if the guard no longer catches it — a gate nobody has watched
fail is a gate nobody should trust.

Both production images are scanned for critical, fixed vulnerabilities, and a
software bill of materials is generated for the tree.

The build service image is rebuilt and its line model recalibrated, so a change
that would silently alter how much content fits on a résumé page fails in the
pipeline instead of in someone's export.

## Mechanics

### The web build

`vercel.json` describes the SPA build from the repository root: install with
`corepack enable && pnpm install --frozen-lockfile`, build with
`pnpm --filter @vitae/web build`, publish `apps/web/dist`, rewrite every path to
`/index.html`, and send `X-Content-Type-Options`, `X-Frame-Options`,
`Referrer-Policy` and a `Permissions-Policy` on every response. Any static host
can reproduce that; the file is a description of the build, not a requirement
to use one host.

What is *not* in this repository is the connection between a push and that
build. That lives in the hosting project's own settings. A page here cannot
tell you whether it is wired up, only what it would run.

The web build's configuration is baked in at build time and cannot be changed
afterwards without rebuilding. That includes the API base URL and the Firebase
web keys, and it is why a mistake there is a rebuild rather than a restart. The
guard that refuses a hosted build carrying local-only values is described in
[Configuration and its failure modes](configuration.md), including the case it
does not cover.

### The API host

The topology is one machine running `deploy/compose.prod.yml`: Caddy on ports
80 and 443, the API and the build service on private networks. Caddy is the
only container with published ports. It provisions and renews its own
certificate for `API_DOMAIN` and reverse-proxies to `api:4000`; there is no
certbot and no cron.

The build service sits on a network declared `internal: true`, so it has no
route out and Caddy has no route in. Its container runs with
`no-new-privileges`, a read-only root filesystem and a tmpfs `/tmp`. The warmed
Tectonic package cache is baked into the image and copied onto tmpfs at
start-up rather than kept in a named volume, because a volume seeds only when
empty and would therefore go stale across an image rebuild without saying so.

The API mounts the database CA bundle read-only from the host rather than
baking it into the image, so refreshing it is a file copy and not a rebuild.

The API image has no compile step at all: it runs its TypeScript source under
`tsx`, which also resolves the workspace packages from source. The build
service does compile, in a separate stage, and its final image runs plain Node
as an unprivileged user. Both images have `npm` removed from the final layer,
because nothing in either one runs it and leaving it in means carrying its
vendored dependencies through every vulnerability scan.

### Getting the documentation corpus onto the API host

The documentation is served by the API, out of whatever directory
`DOCS_CONTENT_DIR` names, because the corpus describes every trust boundary in
the system and enumerates every route, endpoint, table and exported symbol in
the repository. Behind the API it inherits the owner allow-list. On the static
host it inherited nothing.

Nothing in the deploy path produces it. The API image copies the workspace
packages, the API source and the templates; it does not copy `docs/`. The
compiled corpus is git-ignored, so it is not in the host's checkout either. The
deploy script builds images, runs migrations and recreates containers; it
compiles no documentation. This is a gap in the tooling rather than a rule, and
it is stated plainly because the symptom is silent.

The consequence is worth being unsurprised by: an instance deployed exactly as
described above serves no documentation. `GET /api/v1/docs` answers 503 with a
code saying no corpus was built into this deployment, and the reading surface
repeats it. That is the intended answer for that situation — the alternative,
an empty documentation set, would send someone looking for pages that were
never compiled.

To give an instance its documentation:

1. Compile the corpus from a checkout: `pnpm docs:build`, which writes
   `docs/.compiled`. It is a build artifact; rebuild it whenever the corpus
   changes rather than expecting a checkout to carry it.
2. Copy that directory to the API host and make it visible inside the API
   container. The compose file already demonstrates the pattern with the
   database CA bundle: a read-only bind mount, so refreshing it is a file copy
   rather than an image rebuild.
3. Set `DOCS_CONTENT_DIR` to the path **inside the container**. A relative
   value is resolved against the repository root rather than the process's
   working directory, which is what makes `docs/.compiled` mean what it looks
   like it means.

Do not publish the corpus with the web application to save the trouble.
Anything under `apps/web/public/` is copied into the bundle and served by the
static host to anyone who asks, which is exactly the arrangement this move
undid.

### The deploy command

Run migrations before directing traffic at a new API version. On the documented
production host, use the guarded helper rather than the individual Docker
commands, because it does the steps in an order that individual commands make
easy to get wrong:

```bash
VITAE_HOST=ubuntu@api.example.com \
VITAE_SSH_KEY=/path/to/deployment-key.pem \
VITAE_APP_DIR=/absolute/path/to/vitae \
VITAE_HEALTH_URL=https://api.example.com/health \
./scripts/deploy-api.sh
```

`VITAE_APP_DIR` is required and must be absolute. There is no default, on
purpose: a deployment must never guess which directory on a host holds
production code.

Before it changes anything, the script refuses to continue unless the target
host has a pinned key in the known-hosts file. It connects with
`BatchMode=yes` and `StrictHostKeyChecking=yes`, so an unknown host key fails
rather than prompting.

On the host it then, in this order: fetches the branch; refuses to proceed if
the remote working tree is dirty, rather than overwriting someone's changes;
fast-forwards only, so a diverged checkout stops the deploy instead of being
rewritten; builds the API and build-service images; runs the migration script
from the newly built API image; and force-recreates those two services. Caddy
is left alone and resumes proxying once the API answers.

The migration runs from the new image on purpose. The API bakes its source into
the image, so building first means the migration runner and the process that
will serve traffic are the same release. The force-recreate is also deliberate:
a changed tag alone does not make every Compose version replace a running
container.

Afterwards the script polls readiness — not liveness — twenty times at three
second intervals. If readiness never comes, it prints the last forty lines of
the API log and exits non-zero.

For a read-only report of what is currently deployed, which changes nothing:

```bash
./scripts/deploy-api.sh --check
```

### Liveness, readiness and the coupling worth knowing

`GET /health` asks whether the process is up. It never touches the database and
is what a platform uses to decide whether to restart the container.

`GET /ready` asks whether this instance should receive traffic. It answers 503
while starting or draining, when the database is unreachable, and — in
production only — when the build service does not answer its own health check.
The database probe is bounded at two seconds and cached for five, because a
probe that hangs takes the instance down with it.

The consequence is a coupling an operator should know before meeting it at two
in the morning: **in production, a build service that is down makes the API
report itself not ready, and a deploy that waits on readiness will therefore
never finish.** The API can still serve everything except compilation — a
failed compile degrades to a `.tex` download rather than an error — but the
deploy script cannot tell the difference between that and a broken release.
Check the build service before assuming the release is at fault.

Shutdown is the mirror image. On `SIGTERM` the process stops reporting ready
first, then lets in-flight work finish, with a 65-second ceiling before it
forces the exit. A deploy should never drop a compile or an import mid-write.

### Verifying a release

- `GET /health` answers 200.
- `GET /ready` answers 200 — which means Postgres and the build service both
  answered.
- Signing in as the configured owner works, and a different identity is refused
  without being told who the owner is.
- A résumé compiles; stopping the build service briefly produces the documented
  `.tex` fallback rather than a failure.
- If this instance is meant to carry documentation, `GET /api/v1/docs` as the
  signed-in owner reports it available, and the same request with no session is
  refused. Both halves matter: the second is what proves the corpus did not
  come back out from behind the gate.
- An export restores into a separate, empty database. This is the only check
  that proves the data is recoverable, and it belongs to
  [Backup and restore](backup-and-restore.md).

### When the compiler version changes

`docs/runbooks/bump-tectonic.md` applies whenever the pinned LaTeX engine
moves. It is not a routine dependency bump: the engine's output determines how
many rendered lines fit on a page, and the résumé selection algorithm budgets
against that number. A silent change there produces résumés that overflow a
page without anything failing.

The runbook edits `TECTONIC_VERSION` in the build service Dockerfile, rebuilds,
and runs the calibration fixture, which compiles every shipped template and
fails if measured capacity has drifted more than ±3 lines from the template's
configured `lines_per_page`. If it has drifted, the template's line-model
constants are updated and calibration is re-run. A stored résumé that must stay
byte-identical references its template version and `SOURCE_DATE_EPOCH`, so
re-exporting it reproduces the same PDF.

> [!IMPORTANT]
> The runbook's first step is incomplete. The Dockerfile pins both
> `TECTONIC_VERSION` and `TECTONIC_SHA256`, and the release tarball is verified
> against that checksum before it is unpacked. Changing only the version fails
> the image build at `sha256sum -c`. Update both.

## Related

[Configuration and its failure modes](configuration.md) covers the values this
deployment reads and what each kind of mistake does.
[Running database migrations](migrations.md) covers the step this command runs
in the middle. [Backup and restore](backup-and-restore.md) covers the check
that proves a release is recoverable, and
[Responding to an incident](incident-response.md) covers what to do when the
verification above does not pass.
