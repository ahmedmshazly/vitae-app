# Contributing to Vitae

Thanks for taking the time to improve Vitae. Start with the architecture and
testing guides, then keep each change focused enough to review and verify.

## Before you begin

- Read [the architecture guide](docs/ARCHITECTURE.md), especially the data
  ownership and route, service, repository boundaries.
- Use Node 22.23.0 and pnpm 9.15.0. `.node-version` records the supported Node
  release.
- Copy `.env.example` to `.env`. Never commit a real `.env`, export, backup, or
  customer record.
- Use fictional data in fixtures, screenshots, tests, and documentation.

## Local workflow

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test:all
pnpm build
```

Database work needs `pnpm dev:db`. Run `pnpm test:api`, `pnpm test:security`,
and `pnpm test:resilience` for API changes. UI work also needs `pnpm e2e`; run
`pnpm test:a11y` and `pnpm test:visual` when a change affects interaction or
appearance.

## Changes and pull requests

- Keep routes thin. Put application work in services and persistence work in
  repositories.
- Add or update tests with the behavior. Include an error, authorization, or
  empty-state test when the behavior has one.
- Update the relevant documentation in the same pull request.
- Use concise, imperative commit subjects that describe the resulting state.
  Explain non-obvious tradeoffs in the body.
- Use the pull request template and run the checks it lists.

## Writing style

Write plainly. Prefer specific behavior over announcements about the change.
Avoid placeholder praise, generic conclusions, and decorative punctuation.
Keep formal material such as API names, legal text, URLs, and protocol values
exact.

## Reporting issues

Use the issue forms for defects and proposals. Do not open a public issue for
a security vulnerability. Follow [SECURITY.md](SECURITY.md) instead.

By contributing, you agree that your contribution is available under the
[Apache License 2.0](LICENSE).
