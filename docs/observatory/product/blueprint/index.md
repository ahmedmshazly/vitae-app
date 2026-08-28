---
id: PRD-BP
title: The re-conception blueprint
summary: A verdict and a better-version specification for every screen, grouped by hub — what stays, what sharpens, what gets elevated, and the three surfaces that get added.
audience: [maintainer, designer, developer]
domain: product
type: index
status: planned
related: [USE-SCREENS, PRD-STORIES, PRD-PERSONAS]
sources:
  - apps/web/src/app/routes.ts
  - docs/registry/requirements.json
  - docs/adr/0007-product-definition-regeneration.md
---

# The re-conception blueprint

Every screen the application mounts, judged against the four personas and the
journeys they own, with a specification for its better version. This is the
planning layer between the product definition and the implementation waves:
[the screen reference](../../use/screens.md) says what each screen *is*, and
these pages say what each screen *should become* and why a paying person would
care.

## The verdict vocabulary

| Verdict | Meaning |
| --- | --- |
| **KEEP** | Right concept, right shape. Change nothing structural. |
| **SHARPEN** | Right concept; specific, bounded improvements named per screen. |
| **ELEVATE** | The screen underuses data the system already stores; surface it. |
| **MERGE** | Fold into another surface; the standalone screen retires. |
| **ADD** | A new surface for a registered planned capability. |
| **RETIRE** | Remove. Used sparingly; legacy routes stay mounted by policy. |

Verdicts serve the strategy in one line: **sell the move, keep the system.**
Screens on the move path (tailor, applications, warm paths) get sharpened for
conversion; screens on the system path (network, provenance, the ledger) get
elevated for retention. Nothing is added that a persona's story does not ask
for.

## The headline moves

1. The signed-in root `/` finally redirects to Today - the recorded open
   question is answered in favor of the operator, not the marketing page.
2. A locked workspace disables its write controls at the point of use
   (NFR-OPS-002); the banner stops being the only honest element on the page.
3. Three surfaces are added, each carried by registered requirements:
   **the Ledger** (FR-PROV-002) under Today, **Correspondence** (FR-COMM-001,
   FR-COMM-002) under Network, and **Dossiers** (FR-DOS-001, FR-DOS-002)
   under Career.
4. Provenance - already stored on every record - becomes visible everywhere a
   record is shown (FR-PROV-001).
5. The six-hub information architecture stays. It matched the four-word model
   (records, connections, traces, lenses), it tested well, and every addition
   slots inside it.

## The pages

| Page | Screens covered |
| --- | --- |
| [Today and the planner](today-and-planner.md) | `/today`, `/today/planner`, the Ledger (ADD) |
| [Capture, search, and overlays](capture-and-search.md) | ⌘K capture, ⌘P palette, `/search`, the new-record menu, reminders |
| [Network](network.md) | directories, person and organization profiles, who-to-call, warm paths, Correspondence (ADD) |
| [Career and the résumé engine](career-and-resume.md) | runway, dossier, résumé hub, atoms, tailor, outputs, letters, templates, Dossiers (ADD) |
| [Explore](explore.md) | library and saved views, life map, chronograph, atlas |
| [Data: imports, integrity, exports](data-import-export.md) | import hub, identity audit, GitHub, exports, trash |
| [Records and browsing](record-and-collections.md) | `/n/:id`, `/browse/:type` |
| [Settings and system](settings-and-system.md) | profile, preferences, system, billing, help |
| [The public surface](public-and-marketing.md) | landing, product pages, tour, manifesto, pricing, sign-in, legal |

## How to read a verdict

Each screen entry carries four parts: the verdict, the reasoning against
personas and journeys, the better-version specification, and acceptance
criteria citing the requirement register. When an implementation wave picks a
screen up, the acceptance criteria are the test list, and the cited
requirements flip from `planned` to `implemented` with the code that earns it.
