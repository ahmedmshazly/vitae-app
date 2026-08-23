# Product

## Platform

web

## Users

Vitae is for a single, privacy-conscious professional who wants to understand and act on a long career history without handing that history to a hosted AI service. The primary user captures people, organizations, work, education, projects, applications, and evidence; maintains relationships; explores patterns; and turns verified evidence into tailored career documents.

## Product Purpose

Vitae turns a person's scattered career and life records into a private, connected system of record. It should make the next useful action obvious: whom to reconnect with, which evidence supports a role, what changed, and what to compile or export. Success means the graph remains trustworthy, useful in everyday planning, and portable outside Vitae.

## Positioning

Vitae is an evidence-led living career graph: structured records and explicit relationships feed deterministic discovery, relationship intelligence, and ATS-safe LaTeX resume generation without runtime AI-provider calls. Every recommendation remains traceable to the user's own evidence. The checked-in source product is self-hosted today; a hosted Cloud release must satisfy the explicit release boundary below before it accepts customer data.

## Operating Context

The product is used as a long-lived personal workspace on desktop and mobile web. Core rituals include daily follow-up review, quick capture, browsing a people-and-organization network, inspecting graph and timeline views, importing external records, resolving identity collisions, managing job applications, tailoring resume variants, compiling PDFs, and exporting or deleting data.

## Capabilities and Constraints

- A React and TypeScript web application communicates with an Express API and PostgreSQL-backed graph model.
- Records use a typed node and edge vocabulary shared by the API, web app, and deterministic algorithms.
- Search, graph, timeline, map, relationship intelligence, introductions, imports, duplicate resolution, exports, trash, resume evidence, tailoring, compilation, letters, and templates already exist.
- Job applications are represented as graph nodes connected to target organizations, referrers, interviews, and resume variants.
- The product is single-operator and self-hosted; privacy, local ownership, deterministic behavior, and data portability are durable constraints.
- A future Cloud release is one private workspace per verified person at launch, not a team CRM, recruiter tool, or general social network. It remains disabled until server-derived workspace isolation, subscription lifecycle enforcement, legal publication, backup/restore checks, and deletion/export rehearsals are complete.
- Runtime product behavior must not depend on external AI providers.
- Heavy graph and map libraries must remain route-lazy, and generated resumes must remain ATS-safe.

## Brand Commitments

The product name is Vitae. Its established identity is "Quiet": dark, focused, highly legible, and deliberately restrained, with color carrying meaning rather than decoration. The redesign may make the identity more expressive but must preserve its seriousness, privacy, and evidence-first voice. Existing wordmarks, marks, and product captures are source assets; fabricated product screenshots or unverified commercial claims are not permitted.

## Evidence on Hand

- Product requirements and architecture are documented in `README.md` and the repository documentation.
- Existing brand guidance and media briefs live under `docs/design/`.
- Logo and favicon assets plus real product captures live in `apps/web/public/`.
- The running application, typed schema, tests, and route implementations are the authority for supported functionality.
- No customer logos, testimonials, prices, benchmark claims, or third-party endorsements are available and none should be invented.

## Cloud Release Boundary

Vitae Cloud is designed for the experienced professional preparing a deliberate
career move: someone who already has meaningful work and relationships, but
needs those facts connected before an opportunity arrives. The planned launch
offer is one complete personal workspace with a 14-day no-card trial, a
transparent monthly or annual subscription, and a 30-day read-only export
window after non-renewal. This is a launch specification, not a claim that the
service is currently operating.

The browser must not advertise a live trial or checkout unless the server
authorizes provisioning, every durable record is workspace-scoped, billing
webhooks are verified and idempotent, public legal/support information is
reviewed, and backup, restore, export, deletion, and incident procedures have
been rehearsed. See [the Cloud launch guide](docs/CLOUD-LAUNCH.md).

## Product Principles

1. Evidence before inference: every conclusion should reveal the records and relationships behind it.
2. Calm action over passive dashboards: each workspace should help the user decide or do something useful.
3. One living system, many lenses: network, career, time, place, and documents are views of the same graph.
4. Private by construction: self-hosting, deterministic algorithms, and exportability are product features, not implementation trivia.
5. Progressive depth: quick capture and daily review stay simple while expert exploration remains available.

## Accessibility & Inclusion

Vitae targets WCAG 2.2 AA behavior: complete keyboard access, visible focus, semantic landmarks and controls, readable contrast, non-color state cues, reduced-motion support, and touch targets appropriate to mobile use.
