---
id: USE-GRAPH
title: Capturing people, work and evidence
summary: The four ways a fact gets into Vitae, how records connect, and how to turn a role you held into evidence a résumé can be built from.
audience: [user]
domain: use
type: task
status: verified
verified_at: 2026-08-24
sources:
  - packages/core/src/types.ts
  - packages/core/src/schema/envelope.ts
  - packages/core/src/schema/node-props.ts
  - packages/core/src/schema/edge-props.ts
  - packages/core/src/schema/resume.ts
  - packages/core/src/algorithms/capture-grammar.ts
  - apps/web/src/features/QuickAdd.tsx
  - apps/web/src/features/forms/NewEntityMenu.tsx
  - apps/web/src/features/forms/AddConnection.tsx
  - apps/web/src/features/InteractionLogger.tsx
  - apps/web/src/routes/Person.tsx
  - apps/web/src/routes/Org.tsx
  - apps/web/src/routes/People.tsx
  - apps/web/src/routes/Orgs.tsx
  - apps/web/src/routes/Record.tsx
  - apps/web/src/routes/Browse.tsx
  - apps/web/src/routes/Atoms.tsx
  - apps/api/src/routes/v1/capture.ts
requirements: [FR-CAP-001, FR-CAP-002, FR-CAP-003, FR-CAP-008, FR-CON-001, FR-CON-002, FR-CON-003, FR-CON-009, FR-RES-004, FR-013]
covers:
  - route:/network/people
  - route:/network/people/:id
  - route:/network/organizations
  - route:/network/organizations/:id
  - route:/people
  - route:/people/:id
  - route:/orgs
  - route:/orgs/:id
  - route:/n/:id
  - route:/browse/:type
  - route:/career/resume/evidence
  - route:/resume/atoms
related: [USE-START, USE-SCREENS, USE-RESUME]
---

# Capturing people, work and evidence

Everything Vitae can tell you comes out of records you put in. This page is
about putting them in well enough that the answers are worth having, and
quickly enough that you keep doing it.

> [!NOTE]
> Every example below uses fictional demonstration data. Jordan Kim, Aurora
> Dynamics and NiaDelta are invented names, the same ones the demo seed uses.

## What a record actually is

Two things, and only two.

A **record** - a node - is a fact of one of 34 types. Person, organisation,
role, project, repository, skill, education, certification, course,
publication, talk, award, reference, job posting, application and interview are
the career types. Event, interaction, task, goal, habit, journal entry, idea,
link, document, subscription and post are the life types. Location, trip, media
item, highlight, asset, health log and account round it out.

Every record, whatever its type, carries the same outer envelope: a title, an
optional subtitle, free-form notes, a start and end date with a precision of
day, month or year, a status, a pinned flag, a sensitivity of normal or
sensitive, a provenance source, and a confidence between 0 and 1. Beneath that
sits a `props` object validated by a schema specific to that type, so a role
has an employment type and a person has emails.

A **connection** - an edge - is also a record. It has one of 28 types, a
direction, its own dates, its own notes, its own provenance and confidence, and
its own type-specific properties. That is why a relationship in Vitae can carry
closeness, a relation kind, and a cadence: the edge is a thing you can write on,
not a line drawn between two things.

Both are validated the same way. The envelope is checked first, then the
type-specific properties, and errors come back per field rather than as one
rejection. An edge is also checked against the types its endpoints are allowed
to be, so you cannot record that a skill studied at a trip.

The full list of types and what each may connect to is at
`/reference/entities`, generated from the same constants the API validates
against. It needs no account.

## Four ways in

### Quick capture, for a fact you are holding right now

`⌘K`, one line, reviewed as chips, committed with Enter. This is the path
designed to be used while you are still in a conversation. It writes several
connected records in one transaction:

```text
p Priya Sharma @@Aurora Dynamics #ml > met at the speaker dinner
```

creates the person, an organisation stub if one does not exist, the tag and the
note, connected.

Capture is deterministic. Nothing about it is generative, which is what makes
the preview trustworthy - the chips are the plan, and the plan is what gets
written.

The `n` leading key is the exception to the pattern: it appends a note to the
record you last looked at rather than creating a new one.

### The structured form, for a fact with detail

Press `n` outside a text field, or use the **New** control in the top bar. You
get a grouped type picker - Career, Content, Job search, Life, Long tail - and
then the form for that type, generated from the same schema the API validates
against. Every creatable type is in that menu; the menu and the canonical type
list are compared by a test, so a new schema cannot arrive with no way to
create one.

Text fields in these forms offer values already in your graph, so a city you
have typed before does not become a second spelling of itself.

### Directly on the screen the record belongs to

People, organisations, atoms, applications, job targets, cover letters and
repositories each have a screen that creates their own kind. That is usually
faster than the generic form because the screen already knows the context.

### Imported from a source you already have

LinkedIn exports, contacts, calendars, bookmarks, browser bookmarks, a pasted
résumé, GitHub, and an Aperture bundle. Nothing an import parses is written
until you have reviewed it.
[Getting data in and out](import-and-export.md) covers this.

## Connecting records

An unconnected record is a note. Connections are what make the rest of the
product work: relationship strength, warm paths, the profile panel, the
chronograph, the atlas, and the evidence a résumé is selected from all read
edges rather than nodes.

**Add connection** on any record walks three steps: pick a connection type
(filtered to the ones legal for the record you are on), pick the other record,
then fill the properties that connection type has. A failure to save is
reported inside the dialog, directly above the button that retries it, rather
than behind it.

Some connections are also created for you, and they are the ones worth knowing
about because they explain where records you did not type came from:

- Quick capture creates the organisation stub, tag links and note that its line
  implied.
- Logging an interaction creates the interaction record and its link to the
  person.
- Marking a résumé sent creates the application record.
- A GitHub sync creates a repository record per repository, and links its
  primary language to a skill.

Every record shows where it came from. Its provenance is one of ten sources -
manual, the six import kinds, a parsed résumé, an Aperture bundle, or the
system itself - and it is on the record rather than in a log.

## Working a person

The person screen is where relationship context is actually built, and it is
worth doing three things there for anyone who matters.

**Set closeness.** A one-to-five rating you assign. It is the part of
relationship strength the system cannot work out on its own, and setting it is
what turns *"No relationship signal yet"* into a real score.

**Log an interaction.** The one-tap logger offers five kinds - coffee, call,
video, message, meeting - takes a required description of what happened, and
optionally queues a follow-up reminder on a date. The schema behind it knows
nine kinds in all, adding email, comment, encounter and outreach, which is what
an import can produce even though the logger does not offer them. Relationship
strength recomputes immediately; you do not wait for a nightly job.

**Record what is owed.** The favour ledger tracks obligations in both
directions and lets you settle an entry when it is discharged. It is one of the
factors the contact ranking reads.

Relationship strength is shown decomposed rather than as a single number: the
closeness you set, and the timing and frequency of what you logged. If you
disagree with the score, the panel tells you which input to change.

The organisation screen is the same shape at a different scale: related
organisations, the people you know who work there ranked as inroads, and the
roles and openings attached to it.

## Turning work into evidence

An **atom** is one achievement bullet, and it is the unit the résumé engine
selects from. Atoms live in the atom library.

Each atom belongs to a **role or project** - that is what `owner_node` means,
and the API refuses an atom whose owner is not a live role or project. So the
prerequisite for writing evidence is that the work itself is a record.

An atom carries:

- a **kind** - achievement, responsibility, summary fragment, or skill line;
- **metrics**, each a value with an optional unit and label;
- **evidence**, each either a link to another record or a URL, with an optional
  label;
- **skills** it demonstrates, which is what connects it to a parsed job
  description;
- optional start and end dates;
- **wording variants**, one per emphasis.

The variants are the part people underuse. An atom may carry up to four
wordings of the same claim - **technical**, **leadership**, **concise** and
**detailed** - with one marked default. Emphasis values must be unique within
an atom, so there is exactly one of each at most. When a résumé is tailored,
the engine may pick a different variant of the same atom for a different job,
and swapping a long variant for the concise one is one of the moves the
one-page fit loop makes. Writing the concise variant now is what gives that
loop something to work with.

A worked example, with fictional data. Jordan Kim held a role called *Data
Platform Lead* at *Aurora Dynamics*. An atom owned by that role might read, in
its technical variant:

> Cut nightly pipeline runtime from 6h to 40m by replacing per-row lookups with
> a partitioned join, holding 99.95% delivery across 240 daily jobs.

with metrics for the runtime and the delivery rate, evidence pointing at the
repository record, skills for ETL and PostgreSQL, and a concise variant that
says the same thing in one line.

The library flags atoms that are **incomplete** - a single variant, or no
skills - because those are the atoms that will score poorly and be dropped
first. That filter is the fastest way to spend a productive twenty minutes.

## Notes, sensitivity and pinning

Every record has a free-form Markdown notes field. It is the right place for
the context that does not fit a schema field, and it is searchable with
`has:note`.

Marking a record **sensitive** has a real consequence: a share-safe export
excludes sensitive records *and everything that references them*, transitively.
That is why the export screen says a share-safe bundle cannot rebuild your
database. Use it for what it means rather than as a private tag.

**Pinning** a record raises it in the places that read the flag, and is
searchable with `is:pinned`.

## Fixing what you got wrong

Records are versioned. Every record's screen carries its revision history -
create, update, append, archive, restore, merge, delete - with one tick per
revision along the header rule, and the panel says when it is showing only the
most recent ticks of a longer history.

Deleting is soft. A deleted record goes to Trash with its connections
preserved, stays recoverable for 30 days, and is purged after that. Restoring
brings back the record and the edges that were hidden with it.

Duplicates are a separate problem with a separate screen. If you have imported
the same person twice, do not delete one - merge them from the identity audit,
which rewires the relationships and keeps the alternate name as an inspectable
prior identity. That merge is reversible for 30 days.

## Finding it again

Three tools, in increasing order of ceremony:

- `⌘P` fuzzy-matches every record by title and jumps straight to it.
- `/search` ranks full-text matches and accepts the filter grammar -
  `type:person tag:ml city:Kigali after:2025-01-01` - parsed back as chips so
  you can see what it understood.
- `/explore/library` is the same grammar with a running count and the ability
  to save a query as a named view, which then appears in the Explore strip and
  can be exported as CSV.

Filter clauses compose, and a query round-trips through the URL, so a useful
view is a link.

## What to do next

- Turn the evidence into a document: [Producing a résumé](write-a-resume.md).
- Keep an active search straight: [Tracking applications](track-applications.md).
- Bring in an existing source instead of typing: [Getting data in and out](import-and-export.md).
- Look up a screen mentioned here: [Every screen, and what it is for](screens.md).
- Understand why the graph is typed at all: [the product section](../product/index.md).
