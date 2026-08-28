---
id: PRD-BP-DATA
title: "Blueprint: Data imports, integrity, and exports"
summary: The chain-of-custody surfaces stay; the import hub gains the longitudinal update path that turns re-import from a hazard into a habit.
audience: [maintainer, designer, developer]
domain: product
type: reference
status: planned
related: [PRD-BP, USE-SCREENS]
sources:
  - apps/web/src/routes/ImportHub.tsx
  - apps/web/src/routes/Duplicates.tsx
  - apps/web/src/routes/ExportPage.tsx
  - docs/registry/requirements.json
---

# Blueprint: Data imports, integrity, and exports

This hub is where trust is won or lost. P4 judges the product here first;
P3's evidence is only as good as the custody chain that brought it in.

## `/data/imports` - Import hub

**Verdict: SHARPEN.** The stage → map → review → commit → rollback chain with
per-row subject assignment is the right shape and stays (FR-020).

The sharpening is the registered sync path:

- **Update proposals** (FR-SYNC-001): a staged row matching an existing
  record by identity key stops returning the old record unchanged and starts
  proposing a per-field diff - accept per field, never auto-applied.
- **Longitudinal batch reports** (FR-SYNC-002): created, updated, unchanged,
  skipped - four counts, separately. Re-importing last year's export becomes
  maintenance instead of archaeology, and the manual reconciliation the
  import runbook exists to manage shrinks to reviewing diffs.

Acceptance: a rejected proposal leaves the record untouched; an accepted one
writes a revision like any edit (NFR-REL-003) and shows in the Ledger
(FR-PROV-002).

## `/data/identity` - Identity audit

**Verdict: KEEP.** The four-question merge walk, evidence-gated candidates
(FR-008), thirty-day undo with conflict refusal (FR-003), learned aliases
(FR-ORG-008). The known weak spot - person matching reading flat payload
keys, so an exact name alone can default to accept - is implementation-wave
work under the same requirements, not a concept change.

## `/data/sources/github` - Repositories

**Verdict: KEEP.** Token presence-not-value (FR-004, NFR-SEC-004), sync
mapping languages to skills. The first source to gain FR-SYNC-002's
longitudinal report when it lands, since it already re-syncs.

## `/data/exports` - Export and backups

**Verdict: KEEP.** The portable archive with labelled sensitive-records
costs (FR-012, FR-SET-007), checksummed manifest (FR-EXP-010), per-view CSV
(FR-021), backup status. This screen is J6 and the sales page's proof point;
its honesty is the brand.

## `/data/trash` - Trash

**Verdict: KEEP.** Thirty days, connections preserved, near-purge flagging,
previewed early purge (FR-006, FR-ORG-002). The Ledger extends this
screen's promise to every write; Trash remains the destructive-half's home.
