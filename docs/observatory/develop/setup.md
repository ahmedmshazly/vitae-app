---
id: DEV-SETUP
title: Setting up a working checkout
summary: From a fresh clone to a running application, with the Node and pnpm releases the workspace actually declares and the ports the local stack occupies.
audience: [developer]
domain: develop
type: tutorial
status: verified
verified_at: 2026-08-24
sources:
  - package.json
  - .node-version
  - .npmrc
  - pnpm-workspace.yaml
  - compose.yaml
  - firebase.json
  - .env.example
  - apps/web/vite.config.ts
  - docs/ONBOARDING.md
related: [DEV, DEV-WHERE, DEV-TESTING, DEV-GATES]
---

# Setting up a working checkout

By the end of this page you have the API, the web application, Postgres and the
sign-in emulator running together, a seeded graph to look at, and a way to tell
whether the checkout is healthy before you change anything.

## Which Node and pnpm

Use **Node 22.23.0** and **pnpm 9.15.0**.

The root `package.json` declares `engines.node` as `>=22.23.0 <23` and
`engines.pnpm` as `>=9.15.0 <10`. `.node-version` records the exact release
`22.23.0`, and the continuous integration workflow installs that same release
by pinned version rather than by a floating major. Those three agree, and they
are the authority.

> [!IMPORTANT]
> `docs/ONBOARDING.md` opens with a prerequisites table giving the Node floor as
> "≥ 20 (22 recommended)". That figure is wrong and it is the first thing a new
> contributor reads. Node 20 is below the declared minimum of 22.23.0, so a
> workspace installed on it is outside the range this repository supports. Where
> that guide and the manifest disagree, the manifest wins.

`packageManager` in the root manifest names `pnpm@9.15.0`, so enabling corepack
is enough to land on the right package manager without installing one globally:

```bash
corepack enable
corepack prepare pnpm@9.15.0 --activate
```

You also need, in order of when you first hit them:

| Tool | Why |
| --- | --- |
| Docker | Postgres, and the LaTeX build service when you compile a résumé |
| Java 21 | the Firebase Auth emulator runs on the JVM |
| Firebase CLI | starts that emulator; the repository pins `firebase-tools` as a root dev dependency, so `pnpm exec firebase` works without a global install |

## Installing the workspace

```bash
pnpm install --frozen-lockfile
```

`--frozen-lockfile` is the form to use, and the form continuous integration
uses. It fails rather than silently rewriting `pnpm-lock.yaml` when a manifest
and the lockfile have drifted apart, which is the difference between finding
out now and finding out in review.

`pnpm-workspace.yaml` takes in `apps/*`, `packages/*`, `services/*` and `e2e`,
so one install covers all eight workspaces. `.npmrc` sets
`link-workspace-packages=true` and `prefer-workspace-packages=true`: an
`@vitae/*` dependency resolves to the sibling directory on disk, not to a
published tarball. Editing `packages/core` is immediately visible to
`apps/api`, with no build step in between.

## Configuring the environment

```bash
cp .env.example .env
```

`.env` is git-ignored and stays on your machine. The example file is names and
comments only; it never carries a real value.

Two things about it are worth knowing before you edit it.

**There is deliberately no `NODE_ENV` line.** Vite reads this same root `.env`,
and a `NODE_ENV` found there outranks the `production` that `vite build` sets
for itself. When the line was present, every local `pnpm build` quietly produced
a development bundle: about a megabyte larger, carrying the development JSX
runtime, and embedding the build machine's absolute source paths in the emitted
JavaScript. The comment that replaced the line explains why it must not come
back. Do not add it.

**`BUILDSVC_HMAC_SECRET` has no default anywhere.** The compiler container
refuses to start without it, and `compose.yaml` interpolates it with the
`:?` form, so `docker compose up buildsvc` stops with an explanatory error
rather than starting an unauthenticated compiler. Generate one:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Bringing up Postgres

```bash
pnpm dev:db
```

That is `docker compose up -d postgres && pnpm --filter @vitae/api migrate`:
it starts the container and applies every migration in order, so it is also the
command to run after pulling a branch that adds one.

Postgres is published on **5433**, not 5432, because another Postgres is
already on the default port on most development machines. Both ports in
`compose.yaml` are bound to `127.0.0.1`, so neither service is reachable from
the network. The container image is pinned by digest for the same reason the
production images are: a moving tag can change the server version underneath a
data directory that cannot be downgraded again.

The data volume survives `docker compose down`. Removing it explicitly with
`-v` resets the local graph, which costs only a reseed because the migrations
are re-runnable.

## Starting the application

Three terminals:

```bash
pnpm dev:emulators   # Firebase Auth emulator
pnpm dev             # API and web together
pnpm seed            # once the API is up
```

`pnpm dev` is `pnpm run --parallel --stream -r dev`, which runs the `dev`
script in every workspace that declares one. Only `@vitae/api` and `@vitae/web`
do, so it starts exactly those two. When you want one of them on its own,
`pnpm dev:api` and `pnpm dev:web` filter to a single workspace.

`pnpm seed` loads a fictional graph. `pnpm seed:demo` adds the demo space,
including the parsed job-description targets that the résumé journeys need;
the browser end-to-end suite runs both.

Then open the web application and use the developer sign-in shortcut on the
sign-in page. That shortcut exists only when `AUTH_ENABLE_DEV_LOGIN` is true,
which the example environment sets for local work. It must not be enabled
anywhere else.

Where everything listens:

| Service | Port | Set by |
| --- | --- | --- |
| Web dev server | 5173 | `apps/web/vite.config.ts`, with `strictPort` |
| API | 4000 | `API_PORT` |
| Postgres | 5433 | `compose.yaml`, loopback only |
| Auth emulator | 9099 | `firebase.json` |
| Emulator UI | 4001 | `firebase.json` |
| LaTeX build service | 8787 | `compose.yaml`, loopback only |

The web dev server's port is fixed in the Vite configuration and `strictPort`
makes a collision an error rather than a silent move to another port. The
`WEB_PORT` line in the example environment is not read by anything; the
generated configuration catalog records it as example-only.

## Adding the résumé compiler

This part is optional until you touch anything that produces a PDF.

```bash
pnpm buildsvc:up      # docker compose up -d buildsvc
curl localhost:8787/healthz
```

The first build is slow and does real work: the image installs a
digest-verified Tectonic release, then compiles every template in `templates/`
with representative sample content to warm the TeX package cache, then compiles
them all again with the network disabled to prove the cache is complete. An
image that would need the network at request time fails to build rather than
failing on somebody's résumé. `pnpm buildsvc:down` stops it.

## Proving the checkout works

Run the cheap gates first. They need no database, no container and no emulator,
and they are the ones most likely to catch a bad checkout:

```bash
pnpm typecheck
pnpm lint
pnpm test:map
pnpm test:unit
```

Then the wider local suite:

```bash
pnpm test:all
```

> [!NOTE]
> `docs/ONBOARDING.md` describes `test:all` as "map + prose + unit + web". It is
> not. Read out of the root `package.json`, `test:all` chains **nine** gates in
> this order: `test:map`, `test:prose`, `test:public`, `test:brand`,
> `docs:check`, `test:unit`, `test:web`, `test:a11y`, `test:performance`. Each
> one is described on [the gates a change must pass](quality-gates.md).

`pnpm test:api` needs Postgres, so run `pnpm dev:db` first. It creates and
migrates its own `vitae_test` database rather than using the one you seeded -
the suites truncate between tests, and pointing them at a developer's data
would destroy it.

`./scripts/ci-local.sh` runs a subset of the pipeline in the same order, with
`--quick` and `--full` variants. Treat it as a fast pre-flight rather than a
verdict: it does not run every gate the workflow does, and
[the gates page](quality-gates.md) lists which ones it leaves out.

## When something will not start

**`docker compose up buildsvc` exits with a message about
`BUILDSVC_HMAC_SECRET`.** That is the intended behaviour of the `:?`
interpolation in `compose.yaml`. Put a generated secret in `.env`.

**The API starts but every request comes back 401.** Everything under `/api` is
behind a default-deny gate. Sign in through the web application, or use the
developer sign-in route, and confirm the address you signed in as matches
`OWNER_EMAIL` - a non-matching identity is refused by design.

**Sign-in offers no Google button.** The web build needs its own half of the
emulator configuration, not only the emulator itself: the five `VITE_FIREBASE_*`
values in `.env.example`, including `VITE_FIREBASE_USE_EMULATOR=true`. Without
them the page renders without the button.

**Port 5433 or 8787 is already taken.** Another checkout's containers are still
running. `docker compose down` in that checkout, or stop the named containers.

**A `pnpm build` output looks a megabyte too large.** Check that no `NODE_ENV`
line has been added to `.env`. The bundle-size gate refuses to measure a
development build at all and says which chunks gave it away, so run
`pnpm test:performance` and read the message rather than the sizes.

## Related

[Where a change belongs](where-to-change.md) is the next page: what each of the
eight workspaces owns, and which one your change goes in.
