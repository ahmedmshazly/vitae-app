---
id: PRD-PERSONAS
title: The four people
summary: The personas the product definition is built around: who they are, what a day of theirs looks like, what they pay for today, which journeys they own, and what would lose each of them.
audience: [maintainer, designer, developer]
domain: product
type: reference
status: verified
verified_at: 2026-08-26
sources:
  - PRODUCT.md
  - docs/adr/0007-product-definition-regeneration.md
  - docs/registry/journeys.json
related: [PRD-PEOPLE, PRD-STORIES, PRD-BP]
---

# The four people

`PRODUCT.md` names four personas in priority order; this page is their full
profile. Each was researched against real market evidence in August 2026 -
what these people say their problem is, what artifacts they must produce,
and what they already pay - so a requirement citing a persona is citing a
paying situation, not a sketch. One person is often two of these at
different moments; the register still keeps them apart, because they buy at
different moments for different reasons.

A rule the register holds: **a requirement no persona's story wants is a
requirement to question.** The traceable chain is persona → journey → story
→ requirement, and it is walkable in both directions.

## P1 - The deliberate mover *(primary; the paying customer)*

Twelve to twenty years into a career. Senior enough that the next move is
deliberate: three to twelve months of quiet preparation, not a spray of
applications. Their privacy bar is absolute - the current employer must not
see the search, and after the professional network they already live on
began training generative models on member data by default (opt-out only,
late 2025), "not handing my history to a hosted model" stopped being a
niche preference and became a stated reason to leave.

**The day the product wins:** a twenty-minute window opens - a warm intro
became possible, a role worth having appeared. They paste the description,
watch the evidence select itself with arithmetic they can check, compile,
and spend the remaining minutes on the warm path instead of on archaeology.

**Pains, in their vocabulary.** "Wait, what did I do the last six months?" is
the recurring review-season feeling that is documented as memory, not
modesty. Fifteen years of history scattered across old résumés, inboxes,
and a profile they no longer control. Tools that invent: the AI résumé
class has documented cases of fabricated metrics and qualifications pulled
from the job description the candidate never had - disqualifying for
someone whose references get called.

**What they pay today:** active-search tooling runs $29-40 a month
(weekly-billed anchors are the category's tell) and the loudest complaint
clusters are cancellation friction and paying across months of non-use. A
$24/month system that is *worth keeping* between searches undercuts the
category's price while refusing its churn model.

**Owns:** J4 (the tailored résumé), J2 and J7 with P2, J3 (the first
import), J8. **Would lose them:** a single invented line in a compiled
document; discovering telemetry; an export that turns out to be flat CSVs.

## P2 - The consultant / fractional professional *(the retention engine)*

Runs a practice of two to three concurrent clients at $5,000-8,000 a month
each. New work is referral-shaped - surveyed fractional consultants report
around 93% of clients arriving through the network, and "finding clients"
as the top challenge - so the network *is* the pipeline, and the pipeline
goes cold quietly: the past client who changed jobs, the promised
follow-up that slipped, the outcome numbers that vanished when the
engagement's system access ended.

**The day the product wins:** the quarterly practice review. The
correspondence rollup names the client relationship that went quiet the
month an engagement ended, the reconnect lane already ranked it, the favor
ledger shows who owes whom, and the engagement's outcome atoms - captured
while access still existed - assemble into the case study the next
proposal needs.

**What they pay today:** consultant CRM spend is established at $15-100 a
month, and over half of surveyed consultants say they could not operate
without one. None of those tools connects the relationship to the evidence
of the work - the case-study half and the cadence half live in different
products or nowhere.

**Owns:** J2 (cadence), J7 (correspondence), the engagement-evidence half
of J1. **Would lose them:** cadence advice that cannot explain itself;
losing the favor ledger in an export; any hint of their client graph
leaving their control.

## P3 - The periodic prover *(the expansion wedge)*

Must periodically produce a verifiable account of their own history, with
stakes and a deadline. Three faces of one persona: the staff+ engineer
whose promotion packet needs impact statements with metrics and named
witnesses; the researcher or founder whose O-1 or EB-1 petition is a
100-to-550-page tabbed exhibit binder arguing regulatory criteria, at
$8,000-20,000 in fees largely spent on evidence collation; the cleared
professional whose SF-86 renewal every five years demands ten gapless
years of addresses, employers, and foreign contacts - where an
inconsistency *with their own previous submission* is itself a
disqualifying finding, and the official guidance is "retain a copy for
your records."

**The day the product wins:** review season, or the petition, or the
reinvestigation lands - and the evidence is already there, dated, sourced,
with the revision trail that makes it an exhibit rather than a claim. One
approved self-petition's author reported that most of its claims could be
verified online, with screenshots and preserved URLs; provenance is not a
feature for this persona, it is the whole method.

**What they pay today:** almost nothing for tooling (brag-doc apps run
single-digit dollars; the clearance world has no consumer tool at all) -
and five figures for the professionals who do the collation. The willing
spend is attached to the artifact, not the logging; the dossier is the
product for this persona.

**Owns:** J5 (the dossier), the provenance half of J3 and J6. **Would lose
them:** a compiled packet that cannot be reproduced byte-for-byte; a
provenance chip that turns out to be decorative; cloud-only anything (the
cleared professional will demand the self-hosted install on principle).

## P4 - The privacy-first self-hoster *(the flywheel, not the revenue)*

Runs the free system on their own hardware because that is the point. Will
read the export code before trusting the export button. The reference
class: the only self-hostable personal CRM in the market has held its
price for eight years and still commands loyalty despite missing sync and
mobile - ownership retains where features lag.

**The day the product wins:** the restore drill. The bundle round-trips on
a fresh install, the vault reads in a plain-text editor, the checksums
check, and they write the blog post that sends the next hundred operators.

**What they pay:** nothing, ever, and that is the design. They are the
credibility the paying personas price in: the recent history of this
category - a personal CRM giving roughly a week's notice to export when
its free tier died, another sold into acquisition limbo with coverage
advising users to export while they can - is why "runs without us" is a
sales argument and not a leak.

**Owns:** J6 (leave with everything), the honesty of every boundary page.
**Would lose them:** a feature that only works hosted; a single tracked
byte of telemetry (NFR-PRIV-002 is non-negotiable); documentation that
oversells.

## What no persona asked for

The teardown was equally clear about what not to build, and the personas
agree: job-board discovery and application throughput (the incumbent
network's inventory and the autofill extensions are unbeatable on reach,
and P1 does not apply in volume), instant generative drafting (speed is
the competitors' claim; trustworthiness is this product's), stranger
discovery and enrichment (the product mirrors *your* slice of the world),
and team collaboration (P2 runs a practice, not a sales floor). These
stay in [what Vitae does not do](boundaries.md).

## Evidence shelf

Key sources behind the claims above, recorded as plain references
(researched 2026-08-26): the brag-document practice and its vocabulary
(jvns.ca; staffeng.com promo-packet guide); petition costs and exhibit
scale (tryalma.com; beyondborderglobal.com; a published EB-1A self-petition
repository); SF-86 burden and consistency doctrine (clearedjobs.net;
clearancejobsblog.com; nationalsecuritylawfirm.com); fractional-consultant
referral statistics and CRM spend (consultingsuccess.com; fractionus.com);
category pricing and complaint clusters (official pricing pages;
Trustpilot; Capterra); the professional network's AI-training default and
the backlash (its own help pages; malwarebytes.com; proton.me).
