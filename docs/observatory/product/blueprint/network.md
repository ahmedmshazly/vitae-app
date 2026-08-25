---
id: PRD-BP-NETWORK
title: "Blueprint: Network"
summary: The relationship surfaces are the retention engine. Profiles get elevated with the correspondence and provenance data the system already holds; Correspondence is added as the hub's fourth lens.
audience: [maintainer, designer, developer]
domain: product
type: reference
status: planned
related: [PRD-BP, USE-SCREENS]
sources:
  - apps/web/src/routes/Person.tsx
  - apps/web/src/routes/Ask.tsx
  - apps/web/src/routes/Intros.tsx
  - docs/registry/requirements.json
---

# Blueprint: Network

The evidence behind this hub is the strongest in the product: weak ties
causally move careers, dormant-but-once-strong ties are the highest-yield
reconnections, and people systematically reconnect with whoever feels
comfortable instead of whoever would help. A deterministic network surface
that corrects that bias is the thing no competitor in either adjacent
category ships. This hub is P2's home and P1's six-months-early advantage.

## `/network` — Network home

**Verdict: KEEP.** An index that leads with the decision screen rather than
the directories, stating what the workspace is for. Gains one tile when
Correspondence ships.

## `/network/people` — People directory

**Verdict: SHARPEN.**

Strength, cadence, filter chips, honest counts, bulk operations — all stay.
The better version adds one sortable signal: *drift* (days past cadence
target), so the directory can answer "who am I losing" without a detour
through Today's lane. Same constants as the lane (FR-CON-004); the two must
never disagree.

## `/network/people/:id` — Person profile

**Verdict: ELEVATE.** The single richest screen in the product, and the one
sitting on the most unsurfaced data.

Stays: the strength panel with editable closeness, the interaction logger,
the assembled profile ledger, the connections editor, per-panel failure
isolation.

Elevations, each carried by a registered requirement:

- **The favor ledger moves up.** It is modelled end to end (FR-CON-010) and
  buried. It becomes a first-class panel beside strength — direction, settle
  state, dates — because favors are the currency P2 runs a practice on.
- **A correspondence panel** (FR-COMM-001): reciprocity, median reply latency
  both ways, unanswered inbound, contact-day distribution — each figure
  decomposing into the interactions behind it (NFR-PRIV-003). This is the
  panel that makes the profile say something the operator did not already
  believe.
- **Provenance chips** on every profile fact (FR-PROV-001): which import,
  which capture, what confidence. P3's trust requirement, everyone's
  debugging tool.
- **Introductions become visible** (FR-COMM-003): who introduced this person,
  whom this person has introduced — the met-via data the edge already stores,
  surfaced.

Acceptance: every new panel fails independently like the existing ones; every
number decomposes on inspection; nothing new is colour-only.

## `/network/organizations`, `/network/organizations/:id`

**Verdict: KEEP / SHARPEN.**

The org profile's inroads-ranked-by-strength is exactly right. Sharpening:
the profile gains the same provenance chips (FR-PROV-001), and "open roles"
links tighten into the career hub's runway when an application exists.

## `/network/intelligence?lens=contact` — Who should I call?

**Verdict: KEEP.** The flagship explainable surface: composed need, ranked
people, factor decomposition, why-this-rank panel, composer with send-and-log
(FR-CON-006, FR-CON-007, NFR-PRIV-003). Do not touch its shape. When
Correspondence ships, its factors may cite correspondence facts — through the
same constants file, never a second code path.

## `/network/intelligence?lens=reach` — Warm paths

**Verdict: KEEP.** Per-hop evidence, product-of-strengths ranking
(FR-CON-008), destination in the URL. When introductions become first-class
facts (FR-COMM-003), recorded introduction events join the hop evidence.

## Correspondence — ADD, the hub's fourth lens

**Verdict: ADD.** Route under Network beside Contact and Reach.

The rollup the import runbook already specifies, computed with the constants
`@vitae/core` ships (zero new mathematics): dormant-but-once-strong ties
ranked for reactivation with their evidence, brokers named by introduction
flow, reciprocity and latency outliers, cadence health across the whole
graph (FR-COMM-002). Every list decomposes into factors; every row steps
into the person profile or the composer.

Why it earns its place: it is the J7 journey, the strongest research-backed
claim in the positioning, and the feature that makes the always-on
subscription defensible — the screen that knows your network better than
you do, without a model in sight.

Acceptance: rollup ordering and per-person panels derive from one constants
source (FR-COMM-001, FR-COMM-002); dormant-tie ranking names its evidence;
empty graph, sparse data, and failed load are three distinct states
(NFR-REL-004); axe-scanned (NFR-A11Y-002).
