# Product

## Platform

web

## Users

Vitae is built for four people, named as personas P1 through P4 in the
documentation corpus, in priority order:

- **The deliberate mover (P1, primary).** An experienced professional — ten to
  twenty years of history — preparing a career move over the next three to
  twelve months. Their bar is privacy: neither their current employer nor a
  hosted AI service may see the search. They are the paying customer the
  hosted plan names, and the self-hosted operator the shipped product serves.
- **The consultant or fractional professional (P2).** A portfolio career run
  on relationships and per-engagement evidence. Their pipeline is people, not
  postings; their proof is outcomes per engagement. They are the always-on
  user the product must retain between anyone's job searches.
- **The periodic prover (P3).** Someone who must periodically assemble a
  verifiable account of their own history: a promotion packet, an immigration
  petition's exhibit list, a clearance form's ten-year record, a tenure or
  licensing dossier. High stakes, hard deadlines, and a documented human
  inability to reconstruct one's own past accurately from memory.
- **The privacy-first self-hoster (P4).** The operator who runs the free
  system, never pays, contributes, and keeps the export, no-lock-in, and
  no-telemetry commitments honest. Not a revenue persona; the reason the
  revenue personas trust the product.

One person is often two of these at different moments. The graph they all
share captures people, organizations, work, education, projects, applications,
interactions, and evidence; maintains relationships; explores patterns; and
turns verified evidence into documents that prove things.

## Product Purpose

Vitae is the career system of record: it remembers what you did, keeps your
relationships warm, and proves both on demand — without ever sending your
history to a service you do not control. It turns scattered career and life
records into one private, connected graph and makes the next useful action
obvious: whom to reconnect with, which evidence supports a claim, what changed
since you last looked, what to compile or export. Success means the graph
stays trustworthy, earns a place in everyday planning, and remains portable
outside Vitae.

Life records — journals, trips, habits, events — are the evidence substrate of
the career story, not a second product. Trips explain gaps, journals feed
evidence, habits feed momentum. The long-tail record types are deliberately
served by generic surfaces; that is a decision, not a backlog.

## Positioning

Vitae is an evidence-led living career graph: structured records and explicit
relationships feed deterministic discovery, relationship intelligence, and
ATS-safe LaTeX résumé generation without runtime AI-provider calls. Every
recommendation remains traceable to the user's own evidence.

Two engines share the one graph. **The move** is episodic and is what sells:
job description in, evidence-selected documents and warm paths out — the work
active-search tools charge for monthly, done here without surrendering the
history to anyone. **The system** is always-on and is what retains: capture,
relationship cadence, provenance, and the periodic proofs — the ground
personal-CRM tools stand on, held here by a typed graph rather than a contact
list. The strategic consequence is one line: sell the move, keep the system.
A graph that accrues evidence between searches is the answer to the churn
every search-season tool accepts.

The product's three bets are evidenced, not asserted: weak ties causally move
careers (a 2022 randomized experiment across twenty million professional-
network users), dormant ties are the highest-yield reconnections and people
systematically pick the comfortable over the valuable ones (organizational
research from 2011 through 2023 — a documented bias a deterministic reconnect
ranking corrects), and memory for one's own accomplishments decays within
weeks (diary, wearable-camera, and retrospective-survey studies). The checked-
in source product is self-hosted today; a hosted Cloud release must satisfy
the explicit release boundary below before it accepts customer data.

## Operating Context

The product is used as a long-lived personal workspace on desktop and mobile
web. Core rituals include daily follow-up review, quick capture, browsing a
people-and-organization network, inspecting graph and timeline views,
importing external records, resolving identity collisions, managing job
applications, tailoring résumé variants, compiling PDFs, and exporting or
deleting data. Periodic rituals — a review season, a petition, a
reinvestigation — compile evidence dossiers from the same graph.

## Capabilities and Constraints

- A React and TypeScript web application communicates with an Express API and
  PostgreSQL-backed graph model.
- Records use a typed node and edge vocabulary shared by the API, web app, and
  deterministic algorithms.
- Search, graph, timeline, map, relationship intelligence, introductions,
  imports, duplicate resolution, exports, trash, résumé evidence, tailoring,
  compilation, letters, and templates already exist.
- Job applications are represented as graph nodes connected to target
  organizations, referrers, interviews, and résumé variants.
- Planned under ADR 0007 and registered in the requirement register before
  being built: correspondence intelligence (deterministic analytics over
  logged interactions), evidence dossiers (the résumé pipeline generalized to
  promotion, petition, and clearance audiences), provenance surfacing and a
  change ledger over the existing revision history, longitudinal field-level
  updates through staged imports, first-class application writes, and letter
  compilation parity.
- The product is single-operator and self-hosted; privacy, local ownership,
  deterministic behavior, and data portability are durable constraints.
- A future Cloud release is one private workspace per verified person at
  launch, not a team CRM, recruiter tool, or general social network. It
  remains disabled until server-derived workspace isolation, subscription
  lifecycle enforcement, legal publication, backup/restore checks, and
  deletion/export rehearsals are complete.
- Runtime product behavior must not depend on external AI providers.
- Heavy graph and map libraries must remain route-lazy, and generated résumés
  must remain ATS-safe.

## Brand Commitments

The product name is Vitae. Its established identity is "Quiet": dark, focused,
highly legible, and deliberately restrained, with color carrying meaning
rather than decoration. The redesign may make the identity more expressive but
must preserve its seriousness, privacy, and evidence-first voice. Existing
wordmarks, marks, and product captures are source assets; fabricated product
screenshots or unverified commercial claims are not permitted. No ads, no
usage credits, no contact caps, no export upsells, no telemetry — these are
commitments, not defaults.

## Evidence on Hand

- Product requirements and architecture are documented in `README.md` and the
  repository documentation; personas, journeys, and stories live in the
  documentation corpus under `docs/observatory/product/`.
- Existing brand guidance and media briefs live under `docs/design/`.
- Logo and favicon assets plus real product captures live in `apps/web/public/`.
- The running application, typed schema, tests, and route implementations are
  the authority for supported functionality.
- No customer logos, testimonials, prices, benchmark claims, or third-party
  endorsements are available and none should be invented.

## Cloud Release Boundary

Vitae Cloud is designed first for the deliberate mover: someone who already
has meaningful work and relationships, but needs those facts connected before
an opportunity arrives. The consultant and the periodic prover are retention
and expansion, not the launch pitch. The planned launch offer is one complete
personal workspace with a 14-day no-card trial, a transparent monthly or
annual subscription, and a 30-day read-only export window after non-renewal.
This is a launch specification, not a claim that the service is currently
operating.

The browser must not advertise a live trial or checkout unless the server
authorizes provisioning, every durable record is workspace-scoped, billing
webhooks are verified and idempotent, public legal/support information is
reviewed, and backup, restore, export, deletion, and incident procedures have
been rehearsed. See [the Cloud launch guide](docs/CLOUD-LAUNCH.md).

## Product Principles

1. Evidence before inference: every conclusion should reveal the records and
   relationships behind it.
2. Calm action over passive dashboards: each workspace should help the user
   decide or do something useful.
3. One living system, many lenses: network, career, time, place, and documents
   are views of the same graph.
4. Private by construction: self-hosting, deterministic algorithms, and
   exportability are product features, not implementation trivia.
5. Progressive depth: quick capture and daily review stay simple while expert
   exploration remains available.

## Accessibility & Inclusion

Vitae targets WCAG 2.2 AA behavior: complete keyboard access, visible focus,
semantic landmarks and controls, readable contrast, non-color state cues,
reduced-motion support, and touch targets appropriate to mobile use.
