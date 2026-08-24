---
id: USE-PORTABILITY
title: Getting data in and out
summary: Stage an import through a reviewable chain of custody, resolve the identities it collides with, and take a complete, checksummed copy of everything back out.
audience: [user]
domain: use
type: task
status: verified
verified_at: 2026-08-24
sources:
  - apps/web/src/routes/ImportHub.tsx
  - apps/web/src/routes/Duplicates.tsx
  - apps/web/src/routes/Repositories.tsx
  - apps/web/src/routes/ExportPage.tsx
  - apps/web/src/routes/Trash.tsx
  - apps/web/src/routes/workspaces/WorkspaceHomes.tsx
  - apps/api/src/routes/v1/imports.ts
  - apps/api/src/routes/v1/export.ts
  - apps/api/src/routes/v1/retention.ts
  - apps/api/src/services/imports.ts
  - apps/api/src/services/restore.ts
  - apps/api/src/services/retention.ts
  - apps/api/src/services/duplicates.ts
requirements: [FR-001, FR-EXP-010, FR-012, FR-021, FR-SET-007, FR-006, FR-ORG-002, FR-008, FR-003, FR-020, FR-IMP-001, FR-IMP-002, FR-014, FR-105]
covers:
  - route:/data
  - route:/data/imports
  - route:/data/identity
  - route:/data/sources/github
  - route:/data/exports
  - route:/data/trash
  - route:/import
  - route:/import/duplicates
  - route:/export
  - route:/trash
  - route:/repositories
related: [USE-GRAPH, USE-SCREENS, USE-TROUBLE]
---

# Getting data in and out

The Data workspace holds one promise: your graph should be inspectable at every
boundary — before an import writes anything, while identities are being
reconciled, and at the moment you take everything back out.

The two halves of that promise work in opposite directions but follow the same
rule, which is that nothing irreversible happens without you seeing it first.

## Importing

### The sources

Seven, and they fall into two shapes.

| Source | What it reads | What it produces |
| --- | --- | --- |
| LinkedIn export | Positions, Education, Skills and Connections CSVs | People, organisations, roles, education and skills |
| Contacts | vCard (`.vcf`) or a CSV address book | People |
| Calendar | An ICS file | Events, with recurrence rules kept rather than expanded |
| Bookmarks | A browser bookmarks HTML export | Link records |
| Résumé disassembly | Pasted text | Résumé atoms, one per line |
| Aperture bundle | A `vitae.graph.bundle` JSON export | People, posts and companies as linked records |
| GitHub sync | Your GitHub account, through a token | Repository records, and a skill per primary language |

The first six are file or text imports and go through staging. GitHub is
different: it is a connected service, so it syncs directly after connection.
Every committed file batch can still be rolled back as one unit.

### The chain of custody

A file import moves through four visible stages, and the screen shows which one
you are in:

What happens to a file between choosing it and committing anything:

```diagram
DGM-IMPORT-PIPELINE
```

1. **Choose source** — file, text, or a connected service.
2. **Read safely** — parse the content and check each row against your existing
   records for identity collisions. Nothing is written.
3. **Review evidence** — accept, skip, or reassign each staged row.
4. **Commit or undo** — one batch is one recovery unit.

A staged batch is isolated from the graph. It has a status — staged,
committed, discarded or rolled back — and until it is committed, discarding it
leaves the graph exactly as it was.

### Reviewing rows

Each staged row shows what it parsed to, its confidence, and, where one was
found, the existing record it probably duplicates — with the evidence for that
verdict and its weight, not only a percentage. You set each row to **accept**
or **skip**.

Some rows need a destination as well as a decision. A résumé disassembly
produces atoms, and an atom must belong to a role or project, so those rows
carry a picker for their owner. A row you cannot assign yet stays in staging and
remains retryable rather than being silently dropped.

CSV address books whose columns are not recognised open a column mapping step
first: name, email, phone, company and city, each mapped to a column you pick.
Then it stages with that mapping.

### Committing, discarding, rolling back

**Commit** writes the accepted rows into the graph in one transaction.
**Discard** throws the batch away without writing. **Roll back** reverses a
batch that was already committed, as one unit.

The states an import batch moves through:

```diagram
DGM-IMPORT-LIFECYCLE
```

Every one of those operations reports itself at the top of the import screen
rather than inside the review panel, so an operation you started from batch
history has somewhere to succeed or fail. The batch history at the bottom lists
every batch with its kind, date, row counts and status, and offers rollback on
the ones that were committed.

### When a file will not parse

A file the parser cannot read is refused at staging with a message that names
the problem — for an Aperture bundle, *"not valid JSON: expected a
vitae.graph.bundle export"*, or a list of the specific field errors. Nothing is
staged and nothing is written.
[When something does not work](troubleshooting.md) covers the rest.

## Reconciling identity

`/data/identity` is the duplicate queue, and it is the screen to use instead of
deleting one of a pair by hand.

Candidates are scored with evidence you can read — shared emails, matching
names, the same organisation — rather than an opaque similarity number, and a
duplicate candidate requires shared evidence rather than name similarity alone.
Probable pairs default toward caution, which means the screen asks rather than
acts.

Each cluster walks four questions in order:

1. **Are these the same real-world thing?**
2. **Which record survives?** You choose the canonical survivor.
3. **What happens to each field?** Every field is shown with both values so you
   can audit the result rather than accept a merge blind.
4. **What happens to the relationships?** The impact on connected records is
   shown before you commit.

A merge tombstones the dropped record, rewires its relationships onto the
survivor, and keeps the alternate name as a learned alias — which is why the
screen has a **Learned aliases** panel. A merge is reversible for 30 days, and
the undo refuses if the merged record has been edited since, rather than
silently discarding that edit.

**Rescan** re-runs the scan on demand. Imports and new records are checked
automatically, so the queue being empty usually means there is nothing to do
rather than that nothing has looked.

## GitHub

`/data/sources/github` connects a GitHub personal access token with repository
read scope. The token is stored encrypted and is never returned to the browser
after saving.

**Sync now** pulls your non-fork repositories in as repository records and
links each repository's primary language to a skill record. Each repository is
then an ordinary record: open it, add context, connect it to a project, or
delete it.

Two failures are reported specifically rather than as a generic error: no token
configured (*"Add a GitHub token in Settings first."*), and a token GitHub
rejected (*"GitHub rejected the token, it may be revoked or expired."*).

## Exporting

`/data/exports` states the standard it is held to: the system must be
reconstructable from its own export.

### The archive

A full export is a single archive containing:

- one JSONL file per collection, identity-preserving, so document ids survive
  the round trip;
- an Obsidian-compatible Markdown vault;
- a `manifest.json` with SHA-256 checksums and per-collection counts.

The screen lists those parts before you build anything, so the shape of what
you are about to download is visible in advance.

### The one control that matters

**Include sensitive records** is a switch, and the screen states exactly what
each position costs:

- **On** — *"This is a complete backup, the only export you can fully restore
  from. Store it somewhere you would store a password."*
- **Off** — *"Safe to share: sensitive records and everything referencing them
  are left out, which also means this bundle cannot rebuild your database."*

The exclusion is transitive. A share-safe bundle drops sensitive records *and
everything that references them*, which is why it cannot be a restore source.
That is not a limitation to work around; it is what makes the share-safe bundle
safe to share.

The status line above reflects the choice while you are still deciding —
*"Complete-backup scope selected · Includes sensitive records"* or *"Share-safe
scope selected · Not a complete restore source"* — so the scope is never
something you discover afterwards.

### Saved views as CSV

The same screen exports any saved view as a CSV, in one click. Cells that would
be read as a formula by a spreadsheet are neutralised on the way out, so
opening the file cannot execute anything.

Views come from the Library, where a query you have built can be saved with a
name. If you have none, the screen says so and tells you where to make one
rather than showing an empty control.

### While it runs

One export runs at a time per workspace. A second request while one is in
flight is refused with *"Another export is already running."* rather than
producing two half-archives.

Downloads go through the same authenticated transport as everything else,
carrying your session and the current data space — so an export taken while you
are viewing the demo space exports the demo space, not your real graph.

### Backup status

A panel reports when the last export ran and how many records each collection
held, so "when did I last take a copy" is answerable from the screen rather
than from your downloads folder.

## Restoring

Restore is a command-line operation, not a screen: `pnpm --filter @vitae/api
restore`, which the export screen names.

It is deliberately strict, and the strictness is the feature:

- the bundle must contain `manifest.json`;
- every checksum in the manifest must match, or the restore refuses with
  *"checksum mismatch for [file], bundle is corrupt"*;
- every per-collection count must match the file;
- the bundle's schema version must be one this restore understands;
- a **share-safe** export is refused outright — *"share-safe exports are
  intentionally incomplete; restore requires a full sensitive backup"*;
- it refuses to write into a non-empty database unless explicitly forced.

All of that is verified before anything is written. A corrupt or partial bundle
fails at the door rather than halfway through your graph.

## Deleting, and undoing it

Deletion is soft. A deleted record moves to `/data/trash` with its connections
preserved, and stays recoverable for 30 days. **Restore** brings back the record
and the edges that were hidden with it.

After 30 days a nightly job hard-deletes it. When an expired window exists, the
Trash screen offers a control to purge it early, and says how many records that
would remove.

The retention promise is enforced by that purge rather than merely stated, and
the screen shows the preview of what the next purge would remove. Trash is also
where the search screens send you when a query returns nothing, because a
record you cannot find may be one you deleted rather than one that never
existed.

## What leaving actually looks like

Take a full backup with sensitive records included. Keep the manifest with the
files, because it is what proves the archive is intact. Open the Markdown vault
if you want the content readable without any Vitae at all. The JSONL files and
the manifest are what a restore reads.

On a Cloud workspace, the export path stays available in every access state,
including read-only and deletion-pending, and the billing screen puts the export
link on the screen in both.

## Where to go next

- What each of these screens looks like in its other states: [Every screen, and what it is for](screens.md).
- What the failures mean: [When something does not work](troubleshooting.md).
- Running an instance, taking scheduled backups off the box, and rehearsing a
  restore: [the operations section](../operate/index.md).
