---
id: OPS-SECRETS
title: Secrets and rotation
summary: Where each credential lives, what it actually authenticates, what breaks the moment you rotate it, and which rotations no runbook covers yet.
audience: [operator, security]
domain: operate
type: task
status: verified
verified_at: 2026-08-24
sources:
  - docs/runbooks/rotate-secrets.md
  - apps/api/src/services/secrets.ts
  - apps/api/src/middleware/auth.ts
  - apps/api/src/services/buildsvc-client.ts
  - services/buildsvc/src/server.ts
  - packages/config/src/env.ts
  - apps/api/src/db/pg.ts
  - deploy/compose.prod.yml
  - deploy/.env.example
  - deploy/aws/backup-s3-policy.example.json
  - deploy/aws/backup-trust-policy.example.json
  - docs/DEPLOYMENT.md
  - SECURITY.md
requirements: [FR-004, FR-027, FR-015]
covers: [runbook:docs/runbooks/rotate-secrets.md]
related: [OPS-CONFIG, OPS-DEPLOY, OPS-BACKUP, OPS-INCIDENT]
---

# Secrets and rotation

`docs/runbooks/rotate-secrets.md` is the procedure. This page says where each
credential lives, what it protects, what happens at the moment it changes, and
which credentials the runbook does not yet cover.

## Where do secrets live?

Three places, and which one a credential lives in determines how it is rotated.

**The deployment's environment.** Everything the API needs at boot. Locally
that is a git-ignored `.env`; on a host it is the platform's secret manager
where one exists, and `deploy/.env` where one does not. Names are published in
`.env.example` and `deploy/.env.example`; values never are.

**A file-backed store.** One credential — the GitHub token used for repository
sync — can be written by the application itself, into a git-ignored `.secrets/`
directory with the directory at `0700` and the file at `0600`, written to a
temporary file and renamed with an fsync so a crash cannot leave a half-written
credential. This exists so a self-hosted instance can connect an integration
from its own settings screen without an operator editing a file.

**Nowhere else, deliberately.** No third-party credential is stored as
application data. The database keeps only non-secret synchronisation metadata —
when a sync last ran, an entity tag — plus a note of *where* the secret lives.
That rule is the reason an export bundle, a database dump, or a leaked backup
does not hand someone a working credential to another service. A surface that
reports whether a credential is configured reports presence, never the value.

The two backends have a precedence, and it is not symmetrical. If the
environment supplies the value, it wins, and the application refuses to write a
file copy — rotation belongs in the secret manager, and a competing copy on
disk would defeat the point. The file store is writable only when the
environment is silent.

## What each credential actually protects

Rotating something is easier to reason about once you know what stops working.

| Credential | What it authenticates | What a rotation costs |
| --- | --- | --- |
| Build-service signing key | Every compile request from the API to the LaTeX service | Every compile fails until both sides agree |
| Session secret | Developer sign-in tokens, and nothing else | Nothing, in a production instance |
| Storage credential | Uploading and serving attachments | Nothing; stored objects are content-addressed |
| Database URL and credential | The connection to Postgres | A restart, and a window with no database |
| Database CA bundle | Verification of the database's certificate | A file copy and a restart |
| Firebase service account | Verifying users' sign-in tokens | Sign-in fails until the new value is in place |
| Repository sync token | Reading a third-party account | That integration only |
| Backup identity | Writing to and reading from the backup bucket | Backups fail silently until fixed |

## The build-service signing key

This is the one to be careful with, because the failure is total and immediate.

The signing key *is* the build service's authentication. The API signs each
compile request with it and the build service verifies the signature; there is
no other check between them. The two sides read the same value from the same
deployment environment file, which is why they cannot drift as long as you edit
that file and recreate both containers.

```bash
openssl rand -hex 32
```

> [!WARNING]
> Change it in one place only and every compile returns 401 until the other
> side catches up. Set the new value once in the deployment environment, then
> recreate both containers in the same action. Do not restart one, verify, and
> then do the other.

```bash
docker compose -f deploy/compose.prod.yml up -d --force-recreate api buildsvc
```

> [!IMPORTANT]
> Recreate rather than restart. A container's environment is fixed when the
> container is created, so `docker compose restart` reuses the old values and
> the rotation appears to have had no effect.

Both sides refuse published defaults rather than warning about them. The build
service exits at start-up if the key is missing, shorter than eight characters,
or one of the known published development values while running in production;
outside production it warns and continues. The API applies the same
known-value check at boot. Neither will run in production carrying a key that
anyone could read out of this repository.

## The session secret

The runbook says rotating it invalidates existing developer-login sessions. It
is worth being exact, because the sentence is easy to read as more than it is.

This secret signs the developer sign-in token and verifies it. Nothing else
uses it. Ordinary sign-in is a Google identity token verified against Firebase,
which this secret does not touch. Developer sign-in is refused outside
localhost and the process refuses to boot with it enabled in production. So in
a production instance, rotating this secret invalidates nothing, because there
is nothing signed with it.

It still needs to be a real random value on first deployment.

> [!WARNING]
> The boot check does not catch the value published in `.env.example`. It
> rejects a secret beginning `dev-` or equal to exactly `change-me`, and the
> published example is neither, so a production process carrying it starts
> normally. Generate a fresh value and confirm it by eye. The reproduction is
> in [Configuration and its failure modes](configuration.md).

## The storage credential

Regenerate the API secret in the storage provider's console, update the
credential in the deployment environment, recreate the API container.

Existing stored objects are unaffected. They are content-addressed, so the
credential authenticates the account rather than naming the objects, and
nothing in the graph has to be rewritten. This is the least disruptive
rotation in the system.

The runbook records that the development credential for this service was
shared in a chat during setup and should be rotated at least once before any
real use. Treat that as still true unless you know it was done.

## Database credentials and the certificate bundle

Neither is covered by the rotation runbook. Both are named in the deployment
guide's operations list, so the gap is in the procedure, not in the intent.

Rotating the database credential means changing the password at the provider
and updating the connection URL in the deployment environment, then recreating
the API container. There is a window in which the running API holds a pool of
connections authenticated with the old credential; plan for the restart rather
than being surprised by it.

The certificate bundle is not a secret and is rotated for a different reason:
the provider rotates its certificate authorities on its own schedule. The
production compose file mounts the bundle into the API container read-only from
the host, so refreshing it is a file copy and a container recreation rather
than an image rebuild. Download the current bundle for your database's region
and replace the file in place.

This matters more than it sounds. The API will not fall back to accepting an
unverified certificate — a missing or wrong bundle is a start-up failure rather
than a silently interceptable connection. An expired bundle therefore takes the
API down rather than degrading it.

## The Firebase service account

Also not covered by the runbook. The service-account JSON is supplied to the
API as a single-line value in the deployment environment, and it is what lets
the API verify users' sign-in tokens. Rotating it means issuing a new key in
the identity provider's console, replacing the value, recreating the API
container, and then revoking the old key — in that order, because revoking
first means nobody can sign in during the gap.

## The repository sync token

This is the credential with the file-backed store. If the deployment injects it
through the environment, rotate it in the secret manager and recreate the API;
the write endpoint will refuse to store a competing copy and will tell you so.
If it came from the settings screen, replace it there, which rewrites the file
atomically at `0600`.

Revoking the token at the provider is the part that actually ends the old
credential's usefulness, and it is the step that has nothing to do with this
system.

## The backup identity

The backup script writes to object storage. Prefer an instance role or a
federated identity over a long-lived key pair — the example policies in
`deploy/aws/` are shaped for exactly that, with a trust policy for a federated
continuous-integration identity and a bucket policy scoped to the single export
prefix rather than the whole bucket.

If a long-lived key is unavoidable, it lives in the host-only environment file
the backup timer reads, at `0640`, and not in the deployment environment the
containers read.

> [!WARNING]
> A broken backup identity fails quietly from the operator's point of view: the
> nightly job fails, nobody is told, and the last good archive gets older. The
> only reliable check is to look. List the export prefix and read the `LATEST`
> marker on a schedule you actually keep. See
> [Backup and restore](backup-and-restore.md).

## Hosted billing credentials

The payment provider's server credentials and webhook secret belong to the
hosted Cloud plane, which is closed in every default build and which this
documentation makes no claim about operating. They are read only when the
endpoint that needs them is invoked. The browser-side checkout token is public
by design and safe in a client bundle; a provider API key never is, and must
never be placed in a value that the web build reads.

## Verifying a rotation

In order, because each step tests a different secret:

1. `GET /ready` answers 200 — the API reached the database and the build
   service.
2. `GET /api/v1/status` reports the database, storage and build service all
   healthy. That is the only check that exercises the storage credential.
3. Sign in as the owner. That exercises the identity provider credential.
4. Compile a résumé. That exercises the build-service signing key end to end; a
   mismatch shows as a 401 from the build service, and a compile falling back
   to a `.tex` download means the service is unreachable rather than
   misauthenticated.
5. Run a dry-run backup. That exercises the backup identity without writing.

## What to do if a secret has leaked

Rotate first, investigate second. The order is not negotiable: an investigation
takes hours and a rotation takes minutes.

Then work out what the credential could reach, which is what the table at the
top of this page is for, and treat the exposure as reaching everything that
credential can. [Responding to an incident](incident-response.md) covers the
rest, including what this repository does and does not record about who did
what.

`SECURITY.md` carries the disclosure path for a vulnerability in Vitae itself.
It asks for private reporting through the repository's security advisory flow
and states that a complete report will be acknowledged; it commits to no
timeframe, and neither does this page.
