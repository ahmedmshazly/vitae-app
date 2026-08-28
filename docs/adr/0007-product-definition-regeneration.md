# ADR 0007: The product definition is authored forward

- **Status:** accepted
- **Date:** 2026-08-26
- **Supersedes:** nothing. Amends the epistemic status of `docs/specs/srs.md`:
  the register stops being purely recovered and starts carrying authored
  statements, each marked as such.
- **Scope:** the product-definition corpus - requirements register, capability
  and journey registers, `PRODUCT.md`, `docs/ROADMAP.md`, and the observatory
  `product/` section. No storage, authentication, public API, or deployment
  behavior changes under this record.

## Context

The requirement register says of itself that its statements are "recovered, not
transcribed": no authored specification survives, seventeen identifiers carry
no statement at all, and only three non-functional requirements exist for a
system whose deepest promises - privacy, determinism, durability of ownership -
are all non-functional. There are no personas, no user stories, no acceptance
criteria, and five of the eight registered journeys are deliberately empty
rows. The product this describes is meanwhile complete enough to sell: a hosted
offering is built, integration-tested, priced in code, and held closed by two
flags, with its open commercial questions recorded in `docs/CLOUD-LAUNCH.md`.

That is an inverted situation. The code is governed by executable gates; the
product's intent is governed by archaeology. Every earlier register decision
was constrained to *recovering* what citations could prove. Nothing so far has
been allowed to *decide* what the product should be.

## Decision

Author the definition forward, under the same traceability gates that guard the
recovered register.

1. **Who it is for.** Four personas, registered P1 through P4 in the corpus:
   the deliberate mover (an experienced professional preparing a career move -
   the paying customer the hosted plan already names), the consultant or
   fractional professional (a portfolio career run on relationships and
   per-engagement evidence), the periodic prover (someone who must periodically
   assemble a verifiable account of their own history - a promotion packet, an
   immigration petition's exhibits, a clearance form's ten-year record), and
   the privacy-first self-hoster (the operator who runs the free system,
   never pays, and keeps the export and no-lock-in commitments honest).

2. **What it is.** The positioning is a career system of record: private,
   evidence-led, deterministic. The episodic career move is what sells; the
   always-on system - capture, relationship cadence, provenance - is what
   retains. Life records remain the evidence substrate of the career story
   rather than a second product: the generic record surfaces that serve the
   long-tail types are a decision, not a gap.

3. **The no-AI boundary becomes a numbered requirement.** ADR 0003 made
   deterministic intelligence a decision; the register will make it a
   non-functional requirement with an identifier, so the boundary is testable
   and citable rather than only narrated.

4. **Planned capabilities are registered before they are built.** The
   regeneration registers capabilities and requirements for correspondence
   intelligence (the relationship analytics the import runbook already
   specifies), evidence dossiers (a derived artifact generalizing the résumé
   pipeline for the periodic prover), provenance surfacing, a change ledger
   over the existing revision history, and a longitudinal update path for
   imports. Each enters as recorded intent, cited from prose, and is flipped to
   implemented only by code that cites it.

5. **Statement-less identifiers are resolved under one policy.** Where the
   regeneration authors a fresh statement for a recovered identifier, the
   register keeps the identifier and marks the statement as a new product
   decision in its reconstruction note. Where it does not, the identifier stays
   statement-less and any successor is named in its note. Nothing is renumbered
   and nothing is deleted; the anchor section of `docs/specs/srs.md` keeps
   every affected identifier cited regardless of what happens to roadmap rows.

6. **Journeys gain a planned status; personas and stories live as corpus
   pages.** The journey register's status vocabulary gains `planned` so the
   five empty rows can carry real statements before their end-to-end specs
   exist. Personas and stories are corpus pages validated by the page gates,
   not new registry files: a registry's value here is the machine join to code
   and test citations, and nothing in the repository cites persona or story
   identifiers yet. If that changes, the registries can be added then.

## Consequences

**Positive**

- "Would a customer pay for this?" becomes answerable per requirement: every
  functional requirement traces to a story, a journey, and a persona.
- The seventeen statement-less identifiers stop being a standing hazard for
  every roadmap edit.
- The hosted offering's product surface is defined before its commercial
  questions are answered, instead of after.

**Negative / accepted**

- The register loses its purity: it becomes a mixture of recovered and
  authored statements. The mitigation is honesty in place - every authored
  statement is marked as authored in its reconstruction note, so a reader can
  always tell which epistemic regime an entry belongs to.
- Planned requirements are promises, and promises rot. The traceability gate
  keeps them cited; it cannot keep them honest. The roadmap remains the place
  where intent is either renewed or withdrawn.
- Four personas is three more than the previous single archetype, and breadth
  costs focus. The mitigation is priority: the deliberate mover remains the
  primary paying persona; the others shape retention and expansion, not the
  core loop.

**Deliberately deferred**

- Persona and story registry files with schema and gate wiring - until
  end-to-end specs cite their identifiers.
- Any commercial fact: pricing, contracting entity, merchant of record, refund
  policy, and support ownership stay recorded as open in
  `docs/CLOUD-LAUNCH.md`. This record defines the product, not the offer.

## Alternatives considered

- **Pivot to generative features.** The market's crowded lane. Rejected: it
  reverses ADR 0003, collapses the manifesto's holdings and the trust
  positioning built on them, and puts the product in feature competition with
  better-funded services on their terms. The defensible position is the one
  already enforced by four thousand lines of pure functions: explainable,
  private, deterministic.
- **A clean-slate SRS with renumbered identifiers.** Rejected out of hand: the
  register's own note explains that renumbering invalidates live citations
  across source, tests, and continuous integration.
- **Persona and story registries now.** Rejected as machinery without a join:
  the gates would validate the files only against their own schemas, which the
  page rules already do for corpus pages, at lower cost.
