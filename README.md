# Vitae

Vitae is a life and career system. It stores people, roles, projects,
conversations, ideas, and artifacts in a typed, versioned graph. It also builds
tailored, ATS-safe resumes from that data without calling a model at runtime.

The checked-in source project is self-hosted and single-operator. Vitae Cloud
is a separately gated hosted-release track; it is not open for public accounts
until its tenant isolation, billing, support, legal, backup, and deletion
controls have been verified. See the [Cloud launch guide](docs/CLOUD-LAUNCH.md)
for the exact release boundary.

## What it does

- Capture linked records from the command bar or structured forms.
- Explore a personal network with explainable relationship and relevance
  signals.
- Track applications, introductions, reminders, and source material.
- Parse a job description, select achievement atoms, and compile a one-page
  LaTeX resume.
- Export the graph in open formats and restore it through documented recovery
  procedures.

## Architecture

Vitae is a pnpm TypeScript monorepo.

```text
apps/web          React and Vite single-page application
apps/api          Express REST API backed by PostgreSQL
packages/core     Shared Zod schemas and deterministic domain algorithms
packages/ui       Shared design tokens and interface primitives
packages/config   Validated environment configuration
services/buildsvc Isolated LaTeX compilation service
templates/        Resume templates and line models
```

The API keeps a route, service, and repository boundary. Domain algorithms live
in `packages/core` and have no database, HTTP, or browser dependency. See
[the architecture guide](docs/ARCHITECTURE.md) for the data model, ownership
rules, and deployment boundaries.

## Quick start

Requirements: Node 22.23.0, pnpm 9.15.0, Docker, and Java 21 only when you run
the Firebase Auth emulator.

```bash
corepack enable
corepack prepare pnpm@9.15.0 --activate
cp .env.example .env
pnpm install --frozen-lockfile

# In separate terminals:
pnpm dev:db
pnpm dev:emulators
pnpm dev

# Optional. Required when exercising PDF compilation.
docker compose up -d buildsvc

# Load fully fictional demo records.
pnpm seed
```

Open <http://localhost:5173>. The local template enables a development-only
sign-in shortcut. Disable it outside local development.

## Documentation

| Topic | Location |
| --- | --- |
| System design | [Architecture](docs/ARCHITECTURE.md) |
| API surface | [API reference](docs/api/README.md) and [OpenAPI](docs/api/openapi.json) |
| Configuration and deployment | [Deployment guide](docs/DEPLOYMENT.md) |
| Operations | [Runbooks](docs/runbooks/README.md) |
| Testing | [Testing guide](docs/testing/README.md) |
| Data handling | [Privacy and sample data](docs/PRIVACY.md) |
| Hosted Cloud release | [Cloud launch guide](docs/CLOUD-LAUNCH.md) |
| Security reporting | [Security policy](SECURITY.md) |
| Compatibility and releases | [Release policy](RELEASE.md) and [changelog](CHANGELOG.md) |
| Contributing | [Contributor guide](CONTRIBUTING.md) |

## Quality checks

Run the usual local gate before opening a pull request:

```bash
pnpm lint
pnpm typecheck
pnpm test:all
pnpm build
pnpm audit --audit-level=high
```

Database, container, and end-to-end checks are described in
[CONTRIBUTING.md](CONTRIBUTING.md). CI runs the full release matrix from a
clean checkout.

## Security and data

Use `.env.example` as a names-only template. Do not commit credentials, real
exports, or personal records. The repository contains fictional fixtures only.
Report vulnerabilities through the process in [SECURITY.md](SECURITY.md).

## License

Vitae is licensed under the [Apache License 2.0](LICENSE). See [NOTICE](NOTICE)
for attribution.
