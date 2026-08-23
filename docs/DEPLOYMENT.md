# Deploying Vitae

> This guide documents the self-hosted deployment currently supported by the
> repository. It does not authorize a public multi-tenant Cloud launch. See
> [the Cloud launch guide](CLOUD-LAUNCH.md) for the separate hosted-service
> release gate.

Vitae has three deployable parts: a static React web application, an Express
API, and an internal LaTeX build service. This guide uses Vercel for the web
application and a Docker host for the API and compiler. Those are examples, not
requirements. Any static host, managed Postgres provider, and container host
with equivalent controls will work.

## Before you deploy

- Use Node `22.23.x` and pnpm `9.15.x`.
- Create a Postgres 17 database and retain its point-in-time recovery settings.
- Create a Firebase project for Google sign-in, or configure an equivalent
  supported Firebase Auth setup.
- Choose an object-storage account for Cloudinary, or provide a compatible
  storage adapter.
- Decide the one operator identity for this installation. Vitae is a
  single-operator application. It is not a multi-tenant service.
- Set up a backup destination before accepting production records.

## Deployment topology

| Component | Runtime | Public access | Notes |
| --- | --- | --- | --- |
| `apps/web` | Static files | Yes | Vite SPA, served through a CDN. |
| `apps/api` | Node and Express | Yes | API on an HTTPS origin you control. |
| `services/buildsvc` | Docker | No | Called only by the API with an HMAC signature. |
| Postgres | Managed or self-hosted | No | Source of truth for application data. |
| Firebase Auth | Managed | Indirect | Identity verification only, not the data plane. |

## 1. Deploy the web application

The repository includes [`vercel.json`](../vercel.json), which builds
`apps/web` from the monorepo root. For another static host, use the same build
command and configure an SPA fallback to `index.html`.

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm --filter @vitae/web build
```

Set these build-time values on the web host:

| Variable | Purpose |
| --- | --- |
| `VITE_API_BASE_URL` | Public API URL, including `/api/v1`. |
| `VITE_FIREBASE_API_KEY` | Firebase web application API key. |
| `VITE_FIREBASE_AUTH_DOMAIN` | Firebase Auth domain. |
| `VITE_FIREBASE_PROJECT_ID` | Firebase project ID. |
| `VITE_FIREBASE_USE_EMULATOR` | `false` in production. |

The web host should send the headers in [`vercel.json`](../vercel.json), or
equivalent headers from its own configuration.

## 2. Deploy the API and build service

Copy [`deploy/.env.example`](../deploy/.env.example) to `deploy/.env` on a
dedicated host. Do not copy values from a development `.env`; generate fresh
production secrets and place them in the host's secret manager when possible.

```bash
docker compose -f deploy/compose.prod.yml up -d --build
curl --fail --show-error https://api.example.com/ready
```

`deploy/compose.prod.yml` starts Caddy, the API, and the build service. Caddy
is the only public container. The build service is isolated on an internal
network and runs with a read-only root filesystem, no new Linux privileges, and
a temporary writable directory.

Set at least the following values in `deploy/.env`:

| Variable | Requirement |
| --- | --- |
| `API_DOMAIN` | Public API hostname with DNS pointing to the host. |
| `WEB_ORIGIN` | Exact web origin or origins allowed by CORS. |
| `OWNER_EMAIL` | The one Google identity allowed to use this instance. |
| `SESSION_SECRET` | Fresh random value of at least 32 bytes. |
| `DATABASE_URL` | TLS-enabled Postgres connection string. |
| `DATABASE_CA_CERT` | CA bundle used to validate a managed-database certificate. |
| `FIREBASE_PROJECT_ID` | Firebase Auth project ID. |
| `GOOGLE_APPLICATION_CREDENTIALS` | Firebase Admin service-account JSON. |
| `CLOUDINARY_URL` | Storage adapter credential. |
| `BUILDSVC_HMAC_SECRET` | Fresh random value shared only by API and build service. |

Do not set `AUTH_ENABLE_DEV_LOGIN=true` in production. Do not expose Postgres
or port `8787` to the internet.

## 3. Apply migrations and verify

Run migrations once for each deployment before directing traffic to a new API
version:

```bash
pnpm --filter @vitae/api migrate
```

Then verify the release:

- `GET /health` returns `200`.
- `GET /ready` returns `200` only after Postgres and the build service are ready.
- Sign in as the configured owner. A different identity must receive a neutral
  denial without learning who the owner is.
- Create an export and test it in a separate, empty database.
- Compile a résumé, then stop the build service briefly and confirm the API
  offers its documented `.tex` fallback.

## 4. Backups and recovery

Vitae's portable backup is a sensitive export ZIP. Configure the backup
destination with `BACKUP_S3_URI` and run:

```bash
BACKUP_S3_URI=s3://your-private-bucket/vitae ./scripts/backup-to-s3.sh
```

Use a storage policy with server-side encryption and least-privilege access.
Pair the export with managed Postgres backups for short recovery windows. Test
the restore process before a production incident; see
[the restore drill](runbooks/restore-drill.md).

## 5. Operations

- Deploy through a protected branch and let CI complete before promotion.
- Rotate `SESSION_SECRET`, `BUILDSVC_HMAC_SECRET`, database credentials,
  Firebase credentials, and storage credentials on a documented schedule.
- Keep container base images digest-pinned. CI rejects mutable production image
  references.
- Monitor `/ready`, database capacity, backup freshness, and storage failures.
- Keep the API, web origin, and Firebase authorized domains synchronized when
  changing domains.

For local development, follow [the local testing guide](testing/LOCAL.md).
