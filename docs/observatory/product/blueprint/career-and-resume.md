---
id: PRD-BP-CAREER
title: "Blueprint: Career and the résumé engine"
summary: The move engine — runway, tailor, outputs — keeps its shape; applications get real writes, letters get compile parity, and Dossiers join as the second derived artifact.
audience: [maintainer, designer, developer]
domain: product
type: reference
status: planned
related: [PRD-BP, USE-SCREENS]
sources:
  - apps/web/src/routes/career/CareerOverview.tsx
  - apps/web/src/routes/tailor/Tailor.tsx
  - apps/web/src/routes/Letters.tsx
  - docs/registry/requirements.json
---

# Blueprint: Career and the résumé engine

This hub is what sells: the twenty-minute opportunity answered from an
already-connected history. The active-search competition charges monthly for
worse versions of this loop and churns the moment the search ends; this hub's
job is to win the move while the rest of the product earns the stay.

## `/career` - Career runway and applications

**Verdict: SHARPEN.**

Stage grouping with outcomes kept apart, next-moves first, honest empty
states - all stay (FR-CAR-001, FR-CAR-004).

Two sharpenings:

- **First-class application writes** (FR-CAR-003). Today the API surface is
  read-only and edits travel through the generic node dialog, so a status
  transition is validated as a shape, not as a transition. The better version
  gives the dossier and the runway real endpoints and the dialog becomes a
  purpose-built form: stage transitions offered, not typed.
- **The runway names its source of truth**: marking a résumé sent creates the
  application (FR-RES-018); the runway should say so on the empty state, so
  the pipeline reads as a consequence of work, not another list to feed.

## `/career/applications/:id` - Application dossier

**Verdict: KEEP.** The joined context - posting, target, sent résumé,
company, referrer, interview loop, one-line gaps - is right (FR-CAR-002).
Gains provenance chips with everything else (FR-PROV-001).

## `/career/resume` - Résumé hub

**Verdict: KEEP.** Live KPIs, the numbered five-step workflow, the honest
"how the engine works" popover. When Dossiers ship, the hub grows one step
and stays one screen - the workflow framing absorbs the second artifact.

## `/career/resume/evidence` - Atom library

**Verdict: SHARPEN.**

The atom model - owner record, variants under four emphases, metrics,
private evidence links (FR-RES-004) - is the brag-document practice made
structural. Two sharpenings:

- **Capture feeds atoms.** A journal entry or interaction captured with a
  result in it should offer "make this an atom" - one step from lived moment
  to evidence, which is the whole answer to accomplishment-memory decay.
- **Coverage prompts, not nags**: a role with zero atoms surfaces once in
  the hub's KPI framing (it already counts), never as a badge on the record.

## `/career/resume/tailor` - Tailor

**Verdict: KEEP.** The crown jewel: target rail with editable weighted
keywords (FR-RES-005, FR-RES-006), exact score decomposition (FR-RES-007),
deterministic selection with pins and manual mode (FR-RES-008), the live
draggable document, the meter (FR-RES-009), compile with graceful
degradation (FR-RES-013), the fit loop (FR-RES-014), the coverage gate
(FR-RES-015). Nothing here changes except what rides in globally
(provenance chips, lock-aware controls).

## `/career/resume/outputs` - Outputs

**Verdict: KEEP.** Artifact re-export, fit-loop decisions, mark-sent with
the final invariant (FR-011, FR-RES-019), byte-identical recompile
(NFR-COMP-002). This archive is P1's proof drawer; Dossier outputs join it
rather than growing a parallel archive.

## `/career/resume/letters` - Letters

**Verdict: SHARPEN, decided against MERGE.**

The considered alternative was folding letters into Tailor as a document
mode. Rejected: a letter is authored against a target over days, not
assembled in a tailoring session, and the hook/body/closer blocks sourced
from atoms are a distinct editing rhythm. The screen stays; what ends is the
silent half-parity. A finalized letter compiles through the same sandboxed
pipeline to the same artifact pair (FR-RES-021, closing what FR-RES-020
records as deferred), lands in Outputs, and degrades the same way when the
compiler is unreachable.

## `/career/resume/templates` - Templates

**Verdict: KEEP.** Warm-up state honesty, per-layout actions, default only
affecting new documents. Dossier audience templates (FR-DOS-002) appear here
as their own group when they ship - one template surface, two artifact kinds.

## Dossiers - ADD, under Career

**Verdict: ADD.** Routes under the Career hub beside the résumé workflow.

The second derived artifact: a named, single-subject selection of evidence
compiled deterministically into an audience-shaped packet - promotion
review, petition exhibit list, clearance history - every claim citing its
records, closed by a provenance appendix (FR-DOS-001, FR-DOS-002,
FR-PROV-001). Selection reuses the résumé machinery; reproducibility is
inherited (NFR-COMP-002).

Why it earns its place: it is P3's whole journey (J5), the highest-stakes
willingness-to-pay moment in the persona set, and the purest expression of
the product's thesis - evidence, connected, provable, private.

Acceptance: a dossier compiles only for a single subject; every claim in the
packet resolves to a record; the appendix carries source, confidence, and
revision trail per claim; recompiling under the pinned date is
byte-identical.
