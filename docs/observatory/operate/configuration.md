---
id: OPS-CONFIG
title: Configuration and its failure modes
summary: Which configuration is validated at boot, what a missing, malformed or dangerous value actually does, and which mistakes nothing catches.
audience: [operator, security]
domain: operate
type: reference
status: verified
verified_at: 2026-08-24
sources:
  - packages/config/src/env.ts
  - apps/api/src/db/pg.ts
  - apps/api/src/cloud/config.ts
  - apps/web/src/public/site.ts
  - apps/web/vite.config.ts
  - services/buildsvc/src/server.ts
  - apps/api/src/routes/v1/auth.ts
  - apps/api/src/routes/v1/docs.ts
  - scripts/docs/build-content.mjs
  - docs/generated/config.json
  - .env.example
  - .gitignore
  - deploy/.env.example
  - firebase.json
  - docs/runbooks/run-emulators.md
requirements: [FR-015, FR-027, FR-004]
covers: [runbook:docs/runbooks/run-emulators.md]
related: [OPS-DEPLOY, OPS-SECRETS, OPS-INCIDENT, OPS-MIGRATE]
---

# Configuration and its failure modes

This page is about behaviour, not inventory. The list of every configuration
key - its scope, type, default, constraints, the file that declares it and the
files that read it - is derived from the source and lives in
`docs/generated/config.json`. What a generator cannot tell you is what actually
happens when one of them is wrong, and that is what is written down here.

Every claim below was reproduced against `packages/config/src/env.ts` by
calling `loadServerEnv` with the described environment and recording whether
the process would boot.

## Where configuration comes from

Configuration reaches the system through three separate surfaces, and they fail
in different ways because they are read at different times.

| Surface | Read when | Changed by |
| --- | --- | --- |
| Server environment | Process start-up | Restarting the API |
| Deployment environment | When a script or unit runs | Editing the host's env file |
| Web build environment | At build time, then frozen into the bundle | Rebuilding the web application |

The third is the one that surprises people. The web application is static
files; its API base URL and Firebase keys are substituted into the bundle when
it is built. A mistake there is not a restart, it is a rebuild and a
redeployment.

Names live in `.env.example` and `deploy/.env.example`; values never do. A
production host's values belong in its secret manager where one exists, and in
a file the deployment reads where one does not.

## What validates it, and when

Only the server environment is validated as a schema. `packages/config/src/env.ts`
declares a Zod schema and `loadServerEnv` parses `process.env` against it once,
caching the result. Twenty of the seventy-nine keys the generated catalog
knows about are declared there. Everything else - the Paddle credentials, the
templates directory, the backup destination and the rest - is read straight
from the environment at the point of use, by the module or shell script that
needs it.

That split is the single most useful thing to know about this system's
configuration. A mistake in a declared key stops the process. A mistake in an
undeclared key does not: the feature that reads it behaves as though it were
unset, quietly.

Validation happens in two stages.

**Per-value parsing.** Types, formats, enumerations and minimum lengths. A
failure here throws before anything else runs, with one bullet per failing key
and the reason.

**Unsafe-combination checking.** `assertSafeCombination` runs after parsing and
rejects values that are individually legal but unsafe together. It returns
immediately unless `NODE_ENV` is `production`. That is the correct behaviour -
a development machine must be allowed to run development settings - but it
means every guard described under *dangerous* below is inert on a process whose
`NODE_ENV` is anything other than `production`.

## What happens when a value is missing

A required key with no value fails the parse and the process does not start.
The three that have no default and no optional marker are the owner identity,
the Firebase project that verifies sign-ins, and the session signing secret.
Omitting the owner identity produces:

```text
Invalid environment configuration:
  • OWNER_EMAIL: Required
```

An optional key that is absent disables what depends on it. No GitHub token
means repository sync has no credential. No trusted companion project means
this project is the only accepted token issuer. These are not errors and are
not reported as such.

A key with a default that is absent gets the default, and this is where
absence becomes dangerous rather than merely quiet. The database URL defaults
to the local Compose service. In production that default is rejected outright,
because an API that fell back to it would come up healthy against an empty
database and start accepting writes into it. That specific rescue is described
under *dangerous* below, and it exists precisely because a missing value is
otherwise indistinguishable from a correct one.

## What happens when a value is malformed

Malformed values fail the parse, name themselves, and stop the process. The
message says which key and why:

| Given | Result |
| --- | --- |
| An owner identity that is not an email address | `OWNER_EMAIL: Invalid email` |
| A browser origin without a scheme | `Invalid origin in WEB_ORIGIN: vitae.example.com` |
| A non-numeric port | `API_PORT: Expected number, received nan` |
| `yes` where a boolean is expected | `Invalid enum value. Expected 'true' \| 'false' \| '1' \| '0', received 'yes'` |

Two details are worth carrying:

Booleans are a closed enumeration of exactly `true`, `false`, `1` and `0`. A
plausible-looking `yes` or `on` is a boot failure, not a truthy value. This is
deliberate: the alternative is a flag that silently reads as false and a
security control that is off without anyone being told.

The allowed browser origins are a comma-separated list, and each non-empty
element is validated as a URL independently. One bad element fails the whole
value, so a hostname written without its scheme takes down a boot rather than
quietly narrowing what CORS admits. Empty elements are skipped, so a trailing
comma is tolerated.

There is no `staging` runtime. The runtime enumeration is exactly
`development`, `test` and `production`, and anything else fails the parse.
That matters more than it looks: the whole unsafe-combination layer below keys
off this value, so a staging instance must declare itself `production` to get
those guards, and declaring it anything else turns them off.

## What happens when a value is dangerous

Four combinations are legal individually and refused together, when and only
when `NODE_ENV` is `production`. Each produces a single readable error listing
every problem it found, and the process exits.

| Combination | Why it is refused |
| --- | --- |
| Developer sign-in enabled | The developer sign-in endpoint issues a valid owner token to its caller. It is also restricted to loopback requests, but that is defence in depth, not the control. |
| The published build-service signing key | The signing key *is* the build service's authentication. A published value means any network-adjacent caller can sign a compile request. |
| A session secret beginning `dev-`, or exactly `change-me` | A published signing secret is not a secret. |
| A database URL pointing at localhost or `127.0.0.1` | The process would come up healthy against an empty database and accept writes into it. |

The build service enforces the same rule from its own side and does not rely on
the API having done it: it refuses to start without a signing key of at least
eight characters, refuses to start in production with any of the published
development defaults, and warns rather than refuses outside production.

### The database connection is checked somewhere else

Certificate verification is not in the schema. The certificate bundle key is
declared optional, so an environment without it parses cleanly. The refusal
happens when the connection pool is constructed in `apps/api/src/db/pg.ts`:

- Host `localhost`, `127.0.0.1` or `postgres` - TLS is not used at all. The
  third of those is the Compose service name, which is how a container-to-container
  connection on a private network is exempted.
- Any other host with no certificate bundle - the module throws at import,
  naming the host. Because the API imports it at start-up, this is a boot
  failure in practice, just not one the schema produced.
- Any other host with a bundle - the bundle is accepted either as PEM text or
  as a path to a file, and the certificate is verified. There is no fallback to
  accepting an unverified certificate, because that fallback accepts any
  certificate at all and makes the connection quietly interceptable.

A CA bundle is multi-line and an environment file is not, which is why the path
form is the practical one on a real host and why the production compose file
mounts the bundle into the container read-only.

### The two Cloud gates are separate, and both are closed

Hosted operation is held shut by two independent flags that do different jobs,
both defaulting to false. Neither is on in a default build, and this repository
makes no claim that a hosted service is operating.

The browser-side gate governs what the public site says. Requesting it without
also configuring a canonical site URL, a support address, a legal entity name,
a legal-terms version and a recognisable checkout-scoped payment token does not
produce a half-launched site: it fails the build, naming every missing value.
The site stays in its pre-launch state rather than publishing a promise the
server cannot keep.

The server-side gate governs provisioning and billing and is read separately.
Billing credentials are read only when the endpoint that needs them is invoked,
so a local or test run makes no accidental provider traffic. Turning either on
is a launch decision governed by `docs/CLOUD-LAUNCH.md`, not a configuration
change.

### The documentation corpus has to be pointed at

`DOCS_CONTENT_DIR` is new, it is declared in the schema, and it is optional. It
names the directory holding the compiled documentation corpus, which the API
serves from behind the same gate as everything else. That is why it is an
operational concern at all: the corpus describes every trust boundary in this
system and enumerates every route, endpoint, table and exported symbol in the
repository, so it is served by the API rather than published by the web host,
and something has to tell the API where it is.

Four behaviours are worth carrying.

**Unset is not an error, and it is not an empty corpus either.** A deployment
with no value serves no documentation, and says so: a request for any file
under the documentation mount answers 503 with a code naming that condition,
and the reading surface repeats it as an operator's problem rather than a
reader's. The two are worth distinguishing because a documentation set that
reports itself empty sends somebody to look for missing pages that were never
built. The mount's own index answers separately, with two booleans - whether a
directory is configured at all, and whether it exists - which is how you tell
*not built* from *built somewhere else* without opening the container.

**A relative value is resolved against the repository root, not the working
directory of the process.** `.env` sits at the repository root and is written
by someone thinking in repository paths, so `docs/.compiled` has to mean what
it looks like it means. Resolved against the process's own directory it would
quietly become `apps/api/docs/.compiled`, and the only symptom would be
documentation reporting itself unavailable for no visible reason.

**It is read from the environment on each request rather than from the parsed
object.** The schema still declares and validates it; this only decides when it
is read. The consequence is that a corpus mounted after the process started is
picked up without a restart - which is the opposite of every other key on this
page, and is the same choice the hosted-mode flag makes.

**Do not build the corpus under `apps/web/public/`.** Everything in that
directory is copied into the web bundle and served to anyone who asks, which is
how the corpus was public in the first place. `pnpm docs:build` writes
`docs/.compiled`, which is git-ignored; the old path is kept in `.gitignore` as
a safety net. Note that the net is only against committing it. No gate fails a
build that puts a corpus back under `apps/web/public/`.

## What is not checked

These are gaps, established by reproduction rather than by reading intent. An
operator should treat each as something to verify by hand.

**The published session secret boots in production.** The guard rejects a
session secret beginning `dev-` or equal to exactly `change-me`. The value
published in `.env.example` is `change-me-to-a-long-random-string`, which is
neither, and a production process carrying it starts normally. The equivalent
build-service default *is* caught, because that guard tests membership of a set
of known published values rather than a prefix. Rotate the session secret on
first deployment and do not assume the boot check has your back; see
[Secrets and rotation](secrets-and-rotation.md).

**The hosted web build is only checked on one host.** A build refuses to
proceed when it carries the local-only Firebase demo values, an emulator flag
that is not `false`, or an API base URL pointing at localhost. That check runs
only when the build detects it is running on Vercel. On any other static host -
which the deployment documentation explicitly permits - nothing runs it, and a
bundle built with development values will publish without complaint.

**A `NODE_ENV` in a local `.env` silently downgrades every local build.** Vite
reads the same file, and a `NODE_ENV` found there outranks the `production`
that a build sets for itself. The result is a development build: larger,
carrying the development JSX runtime, and embedding absolute source paths in
the emitted JavaScript. `.env.example` deliberately omits the key for this
reason. Continuous integration and the documented host build both run from a
bare checkout with no `.env`, so what ships is unaffected - but a locally
measured bundle is not the bundle that ships, and the measurement gap is
recorded in [About these documents](../meta/index.md).

**Undeclared keys fail as absence, not as error.** A typo in the backup
destination, the templates directory or a payment price identifier does not
stop anything. The script or endpoint that reads it behaves as though nothing
were configured. For the backup destination specifically, that is why the
backup script carries its own content floor rather than trusting a clean exit;
see [Backup and restore](backup-and-restore.md).

## Configuring the local dependencies

`docs/runbooks/run-emulators.md` applies when you are running Vitae on your own
machine and need its two external dependencies standing up. It is not a
production procedure, and the distinction it draws is the one people get wrong.

Sign-in runs against the Firebase Auth emulator; the data plane does not. There
is no Firestore in this system, so there is nothing to emulate below the
identity layer. The runbook starts Auth on port 9099 with its UI on 4001 - the
ports come from `firebase.json` - and the Admin SDK targets the emulator when
the emulator host variable is set. It tells you explicitly not to configure
database-emulator variables, because they would be configuring a data plane
that no longer exists.

Postgres is separate and real: `pnpm dev:db` starts it in Docker on port 5433
and applies migrations. Port 5433 rather than the default so that it does not
collide with another Postgres already on the machine. Local graph data lives in
that Docker volume, not in an emulator export directory, and should be treated
as durable unless you wipe it deliberately. `pnpm seed` reloads the fictional
demonstration graph; `pnpm load:bundle -- --file=<bundle.json>` loads an export
from your own instance for testing.

Its troubleshooting table is a configuration table in disguise. A red database
check on the status route means Postgres is not running or the database URL is
wrong. Google sign-in behaving oddly locally means the emulator is not up or
its host and port do not match what is configured. The "not currently
authenticated" warning is expected for emulator-only Auth use and means
nothing.

## Where the full list lives

`docs/generated/config.json` is the catalog: every key, its scope, whether it
is validated, its type and constraints, its default, the section it belongs to,
the file and line that declares it, every file and line that reads it, and
whether an example is published. It is regenerated from the source and a
continuous-integration check fails if the committed copy has drifted, so it
cannot go stale the way a hand-written table would.
