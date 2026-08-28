---
id: PRD-BP-SETTINGS
title: "Blueprint: settings and system"
summary: Settings stay honest and small; billing becomes reachable from the navigation it belongs to; the locked-workspace state stops being announced-only and starts disabling what it forbids.
audience: [maintainer, designer, developer]
domain: product
type: reference
status: planned
related: [PRD-BP, USE-SCREENS]
sources:
  - apps/web/src/routes/Settings.tsx
  - apps/web/src/routes/Billing.tsx
  - apps/web/src/app/routes.ts
  - docs/registry/requirements.json
---

# Blueprint: settings and system

Settings is where the product's promises become inspectable: the ranking
constants an operator can change (FR-SET-004), the health checks named in
text, the credential that reports presence and never value (NFR-SEC-004).

## `/settings/profile`, `/settings/preferences`

**Verdict: KEEP.** The self record and contact block; résumé defaults; the
Ask weights auto-saving; the skill-alias taxonomy that teaches the parser.
When Correspondence ships, its constants surface here the same way the Ask
weights do - one constants editor pattern (FR-SET-004), no second idiom.

## `/settings/system`

**Verdict: KEEP.** Check-by-check health in words, the GitHub card, the
owner identity (FR-SET-006). The register-rule of health ticks is the house
style at its best.

## `/settings/billing`

**Verdict: SHARPEN.** Two bounded fixes:

- **It joins the navigation.** The screen is in the route table, the
  breadcrumb map, and the Settings tiles, but not `WORKSPACE_NAV.settings` -
  so on a Cloud build it never appears in the workspace strip. An oversight,
  not a decision; it ends.
- **The lifecycle explains itself in place.** The access-state chip and the
  trial register stay; each state names its next honest action (continue,
  update payment, export) beside the chip, not only in the banner.

## The locked-workspace state - cross-cutting

**Verdict: SHARPEN, product-wide.** The recorded gap: the server refuses
writes on a locked workspace and the banner says so, but roughly sixty
routes' write controls stay enabled - every one an invitation to a refusal.

The better version is one shared answer, not sixty local ones: a
`useCanWrite()` gate derived from the same access state the banner reads,
disabling the write entry points - new-record menu, capture commit, form
dialogs, bulk bars, per-screen primary actions - each with the lock explained
at the control (NFR-OPS-002). Reads, export, billing, and sign-out stay
untouched, which is the requirement's other half.

Acceptance: on a `read_only` workspace the cloud suite asserts controls are
disabled with the lock named, not merely that the server refuses; on an
`active` workspace nothing changes; the gate has no per-screen forks.

## `/help` - Help and shortcuts

**Verdict: SHARPEN.** The four shortcuts and the four-word model stay. Two
small honesty fixes: the documentation surface's own palette (opened with
`/`) gets documented here, and the new surfaces' shortcuts join the list as
they ship. Help remains the only screen allowed to belong to no hub.
