---
id: PRD-STORIES
title: The stories behind the journeys
summary: User stories for all eight journeys, told from the four personas, each with acceptance criteria that cite the requirement register — so "would someone pay for this" is answerable line by line.
audience: [maintainer, developer, designer]
domain: product
type: reference
status: verified
verified_at: 2026-08-26
sources:
  - docs/registry/journeys.json
  - docs/registry/requirements.json
  - docs/registry/capabilities.json
  - docs/adr/0007-product-definition-regeneration.md
related: [PRD-JOURNEYS, PRD-CAPABILITIES, PRD-PEOPLE]
---

# The stories behind the journeys

A journey says a person can get all the way through something. A story says
who that person is, what they are trying to get done, and how we would know
the product did it. Every acceptance criterion below cites the requirement
that holds it, so a story cannot quietly promise something the register does
not carry — and a requirement cannot survive without a story that wants it.

The four personas are named P1 through P4: the deliberate mover, the
consultant or fractional professional, the periodic prover, and the
privacy-first self-hoster. `PRODUCT.md` defines them; the personas page
carries their full profiles. A story marked **planned** rides on registered
intent rather than shipped code.

## J1 — Capture a person in under a minute

**As P1**, leaving a conference conversation, I capture the person, where they
work, what we discussed, and when to follow up — before the next conversation
starts.

- One line in the capture bar parses deterministically into linked records,
  previewed as chips before anything commits (FR-CAP-001).
- The commit writes the person, the organization link, the interaction, and
  the follow-up reminder in one transaction (FR-002, FR-CON-002, FR-CON-003).
- The new record is findable through the quick-switcher immediately after
  (FR-SRCH-004) — the step that proves the write reached the index.
- Sixty seconds is the register's stated target for the whole journey.

**As P2**, mid-engagement, I capture a decision my client made in a meeting so
that the outcome has a dated, attributable trace when the engagement wraps.

- Capture in note-append mode lands on the record I was just viewing
  (FR-CAP-008).
- Fields offer existing values as suggestions, so the client organization is
  linked, not retyped (FR-CAP-003).

## J2 — Keep a valued tie warm

**As P2**, my pipeline is relationships, not postings. I want the system to
notice drift before I do.

- The reconnect lane ranks drifting ties by a deterministic spaced-repetition
  score, strongest need first (FR-CON-004), and the ranking explains itself in
  named factors, never color alone (NFR-PRIV-003).
- Logging the catch-up recomputes the tie strength in the same request — the
  lane reflects reality before I leave the page (FR-CON-009).
- The relationship itself is a record I can edit — closeness, topics, cadence
  (FR-CON-001) — and closeness sets the cadence default rather than me
  maintaining a spreadsheet.
- A favor asked or owed lands on the relationship with direction and a settle
  state, visible on the person (FR-CON-010).

**As P1**, six months before I move, I warm the ties that will matter — the
research is blunt that dormant and weaker ties carry the opportunities, and
equally blunt that people reconnect with whoever feels comfortable instead.

- The lane's ordering is the corrective: computed, explained, and indifferent
  to my comfort (FR-CON-004, NFR-PRIV-003).
- The composer drafts outreach from real relationship facts — last contact,
  shared history, open follow-ups — and "send and log" records the outreach as
  an interaction (FR-CON-002).

## J3 — Bring the past in without wrecking the graph

**As P1**, I start by importing fifteen years of exported history, and I do
not trust any importer that writes first and asks later.

- Everything stages; nothing commits without my review. Rows carry per-row
  accept and skip, and per-row subject assignment names the person each row
  will belong to (FR-020).
- An unassigned line creates nothing and stays retryable with a stated reason
  (FR-020); a discarded batch purges its raw upload (FR-006).
- The whole batch is attributable to its origin and rolls back as one unit
  (NFR-REL-003).
- Duplicate candidates appear only on shared evidence — identity, contact,
  URL, geography — never on a whim (FR-008); a merge is recorded, undoable
  for thirty days, and refuses to undo over a later edit (FR-003).
- The queue learns: a dismissed pair stays dismissed, an accepted merge
  teaches an alias (FR-ORG-008).

**As P3**, I import the records that will someday be exhibits, so provenance
must survive the door.

- Every imported record carries its source and batch reference; nothing is
  silently claimed as mine — an unowned record belongs to a placeholder, not
  to me.
- **Planned:** a re-import proposes field-level updates as reviewable diffs
  instead of returning the old record unchanged (FR-SYNC-001), and the batch
  report counts created, updated, unchanged, and skipped separately
  (FR-SYNC-002).

## J4 — Turn a job description into a tailored résumé

**As P1**, a role worth moving for just opened. I have twenty minutes, and my
history is already in the graph.

- The pasted description parses into weighted keywords with no model call
  (FR-RES-005), and the parse is mine to edit — add, remove, reweight
  (FR-RES-006).
- Every atom scores against the target, and the breakdown sums exactly to the
  shown relevance (FR-RES-007); selection fills the one-page budget
  deterministically, honoring pins and a per-role bullet partition
  (FR-RES-008), with the live meter tracking the budget (FR-RES-009).
- Evidence links on atoms are for my review and never print (FR-RES-004);
  wording variants let one achievement speak technical or leadership without
  forking the record.
- Compile is sandboxed and authenticated (NFR-SEC-003); if the compiler is
  unreachable, I still get the source rather than a dead end (FR-RES-013).
- Finalize extracts the compiled text and refuses a document that dropped my
  evidence (FR-RES-015); an overflowing page triggers the bounded fit loop
  (FR-RES-014).
- Marking it sent creates the application record — the pipeline is a
  consequence, not a chore (FR-RES-018) — and only a compiled, finalized
  document can be marked sent (FR-011).
- The archived artifact recompiles byte-identical under its pinned date, so I
  can prove what I sent (NFR-COMP-002, FR-RES-019).
- **Planned:** the cover letter compiles through the same pipeline instead of
  stopping at authored blocks (FR-RES-021, FR-RES-020).

## J5 — Prove it with a dossier *(planned)*

**As P3**, review season lands. Last year the packet took a weekend of
archaeology through inboxes and old decks; this year the evidence is already
in the graph.

- I select the evidence records that carry the claim — or start from a saved
  view — and choose the audience template: promotion review, petition exhibit
  list, clearance history (FR-DOS-002).
- The packet compiles deterministically, single-subject by construction, every
  claim citing the records behind it, closed by a provenance appendix with
  source, confidence, and revision trail per claim (FR-DOS-001, FR-PROV-001).
- The compiled dossier is reproducible byte-for-byte, because an exhibit that
  cannot be regenerated identically is an exhibit under question
  (NFR-COMP-002).
- The memory research is the quiet argument for the whole journey: recall of
  one's own work decays within weeks, and retrospective job histories match
  reality barely two times in three. The graph remembered so I did not have
  to.

## J6 — Leave with everything

**As P4**, I run this system precisely because I can stop running it.

- One export produces every collection as JSON Lines with document identity
  intact, a Markdown vault readable in any editor, and a manifest of SHA-256
  checksums (FR-EXP-010, FR-001).
- Sensitive records stay out unless I opt in, and the exclusion is transitive
  — nothing that exists only to describe an excluded record leaks around it
  (FR-012, FR-SET-007).
- A CSV cell that a spreadsheet would execute is neutralized before it is
  written (FR-021).
- Restore validates the bundle before it writes and round-trips identity
  (FR-001); the export never degrades with commercial state — a locked hosted
  workspace keeps its way out (NFR-COMP-001, NFR-OPS-002).

## J7 — See the correspondence truth

**As P1**, I think I know who I talk to. The record disagrees, and the record
is right.

- The correspondence profile tallies what no one tallies by hand: reciprocity,
  median reply latency in both directions, unanswered inbound, contact days —
  each figure decomposing into the interactions behind it (FR-COMM-001,
  NFR-PRIV-003).
- The rollup ranks dormant-but-once-strong ties for reactivation and names the
  brokers introductions have flowed through (FR-COMM-002) — computed with the
  same constants as every relationship surface, so two screens cannot disagree.
- An introduction is a recordable fact — who introduced whom, when, in what
  context — feeding broker detection and the favor ledger (FR-COMM-003).
- From the rollup, re-engagement is one step: the person, the history, the
  composer (FR-CON-002).

**As P2**, the rollup is my quarterly practice review: which client
relationships are reciprocal, which went quiet the month an engagement ended,
and who has introduced me to everyone I bill.

## J8 — Recover a deleted record from trash

**As P1**, I deleted the wrong person while cleaning up after an import, and
found out a week later.

- The record sits in trash for thirty days with its connections preserved;
  restoring it revives the edges hidden with it — recovery is lossless
  (FR-ORG-002).
- The thirty-day promise is real in both directions: a purge enforces the
  horizon, previewable and dry-runnable (FR-006), and every step of the
  delete-restore arc is audited in the same transaction as the write
  (NFR-REL-003).

## What this page is for

Three uses, in order of frequency:

1. **Prioritizing.** A requirement no story cites is a requirement no persona
   asked for — question it before building on it.
2. **Testing.** When a journey graduates from `partial` or `planned`, its
   acceptance criteria above are the spec the end-to-end test should assert,
   and the journey's identifier belongs in that spec's title.
3. **Selling.** Each story is a paying situation. The move (J4), the proof
   (J5), and the practice (J2, J7) are the three moments someone reaches for
   their card; J3, J6, and J8 are why they trust the product enough to stay.

## Related

[The journeys that must work](journeys.md) is the register these stories
elaborate. [The capability map](capabilities.md) is the spine underneath both.
[Who Vitae is for](who-it-serves.md) holds the personas in full.
