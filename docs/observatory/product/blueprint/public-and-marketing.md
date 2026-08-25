---
id: PRD-BP-PUBLIC
title: "Blueprint: the public surface"
summary: The marketing site sells the engine and undersells the system of record. The landing sharpens around the four people; the signed-in root finally goes home.
audience: [maintainer, designer, developer]
domain: product
type: reference
status: planned
related: [PRD-BP, USE-SCREENS]
sources:
  - apps/web/src/routes/marketing/Landing.tsx
  - apps/web/src/routes/marketing/Pricing.tsx
  - apps/web/src/App.tsx
  - docs/registry/requirements.json
---

# Blueprint: the public surface

The public pages are disciplined — no fabricated claims, no dark patterns,
legal stubs that admit no service operates. What they under-tell is the
retention story: everything sells the move, nothing sells the system that
remains when the move is over.

## `/` — Landing, signed out

**Verdict: SHARPEN.**

The three-pressure selector and the computed facts strip stay. The
sharpening is the headline architecture: lead with the system of record —
*it remembers what you did, keeps your relationships warm, and proves both
on demand* — and let the career-archaeology line carry the move story
underneath it. The four personas become the page's worked examples (the
deliberate move, the practice, the proof, the self-host), each landing on
the guide that serves it. No new claims; the boundaries pages already hold
the honest edges.

## `/` — signed in

**Verdict: REDIRECT.** The recorded open product question is answered: a
signed-in visitor to the root goes to `/today`. The marketing page is for
people deciding; Today is for people who decided. The screen reference's
long-standing claim becomes true instead of corrected. (The prior attempt's
failure mode — the redirect that could never run — is why this lands with
its e2e first.)

## `/how-it-works`, `/product/warm-paths`, `/product/career-evidence`

**Verdict: KEEP.** The three product stories map one-to-one onto shipped
surfaces, and warm-paths carries the rare honest limits section ("a route is
evidence, not entitlement"). When Correspondence and Dossiers ship, each
earns a story page in this pattern — not before.

## `/tour` — Product tour

**Verdict: KEEP.** Seven keyboard-operable stops mirroring the four-word
model. It gains stops only when shipped surfaces do.

## `/manifesto`

**Verdict: KEEP.** The four holdings are the brand: the record remains
yours; every conclusion needs a trail; your history is not generated;
attention is not the business model. They are also now numbered requirements
(NFR-COMP-001, NFR-PRIV-003, NFR-PRIV-001, NFR-PRIV-002) — the page and the
register finally say the same thing in two registers.

## `/pricing`

**Verdict: SHARPEN.** The single plan projected from the shared definition
and the "pricing should not hide the exit" answers stay. The sharpening is
the frame: price the two engines honestly — the move you would otherwise
rent monthly elsewhere, and the system that keeps compounding between moves.
The commercial facts stay drafts until the launch boundary clears; the page
keeps saying so.

## `/signin`, `/signup`

**Verdict: KEEP.** The honest door: "No way in" when no provider is
configured, failure states that name the failure, the pricing-period
preference carried as a preference (NFR-SEC-001 behind all of it).

## `/reference/entities` — Schema observatory

**Verdict: KEEP.** The public schema atlas with its three lenses and print
pack. It is the credibility artifact for P4 and costs nothing to keep.

## `/changelog`, `/status`, `/legal/*`

**Verdict: KEEP.** Stubs that refuse to pretend a service operates are the
posture; they fill with real documents only when the launch boundary does.
