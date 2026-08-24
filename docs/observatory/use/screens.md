---
id: USE-SCREENS
title: Every screen, and what it is for
summary: What each screen in Vitae exists to do, what you do there, and what its empty state is telling you — grouped by the work rather than by the URL.
audience: [user, designer]
domain: use
type: reference
status: verified
verified_at: 2026-08-24
sources:
  - apps/web/src/App.tsx
  - apps/web/src/app/routes.ts
  - apps/web/src/app/Shell.tsx
  - apps/web/src/app/commands.ts
  - apps/web/src/routes/workspaces/WorkspaceHomes.tsx
  - apps/web/src/routes/workspaces/Planner.tsx
  - apps/web/src/routes/Dashboard.tsx
  - apps/web/src/routes/People.tsx
  - apps/web/src/routes/Person.tsx
  - apps/web/src/routes/Orgs.tsx
  - apps/web/src/routes/Org.tsx
  - apps/web/src/routes/Ask.tsx
  - apps/web/src/routes/Intros.tsx
  - apps/web/src/routes/career/CareerOverview.tsx
  - apps/web/src/routes/career/ApplicationDossier.tsx
  - apps/web/src/routes/ResumeHub.tsx
  - apps/web/src/routes/Atoms.tsx
  - apps/web/src/routes/tailor/Tailor.tsx
  - apps/web/src/routes/Outputs.tsx
  - apps/web/src/routes/Letters.tsx
  - apps/web/src/routes/Templates.tsx
  - apps/web/src/routes/Collections.tsx
  - apps/web/src/features/graph/GraphView.tsx
  - apps/web/src/features/timeline/TimelineView.tsx
  - apps/web/src/features/map/AtlasView.tsx
  - apps/web/src/routes/ImportHub.tsx
  - apps/web/src/routes/Duplicates.tsx
  - apps/web/src/routes/Repositories.tsx
  - apps/web/src/routes/ExportPage.tsx
  - apps/web/src/routes/Trash.tsx
  - apps/web/src/routes/Settings.tsx
  - apps/web/src/routes/Billing.tsx
  - apps/web/src/routes/Record.tsx
  - apps/web/src/routes/Browse.tsx
  - apps/web/src/routes/SearchResults.tsx
  - apps/web/src/routes/NotFound.tsx
  - apps/web/src/routes/SignIn.tsx
  - apps/web/src/public/site.ts
  - apps/web/src/routes/marketing/Chrome.tsx
  - apps/web/src/routes/reference/EntityCatalog.tsx
  - docs/generated/routes.json
covers:
  - route:/
  - route:/ask/people
  - route:/browse/:type
  - route:/career
  - route:/career/applications
  - route:/career/applications/:id
  - route:/career/resume
  - route:/career/resume/evidence
  - route:/career/resume/letters
  - route:/career/resume/outputs
  - route:/career/resume/tailor
  - route:/career/resume/templates
  - route:/changelog
  - route:/collections
  - route:/data
  - route:/data/exports
  - route:/data/identity
  - route:/data/imports
  - route:/data/sources/github
  - route:/data/trash
  - route:/explore
  - route:/explore/atlas
  - route:/explore/graph
  - route:/explore/library
  - route:/explore/timeline
  - route:/export
  - route:/graph
  - route:/guides
  - route:/guides/:slug
  - route:/help
  - route:/how-it-works
  - route:/import
  - route:/import/duplicates
  - route:/intros
  - route:/legal/dpa
  - route:/legal/privacy
  - route:/legal/subprocessors
  - route:/legal/terms
  - route:/manifesto
  - route:/map
  - route:/n/:id
  - route:/network
  - route:/network/intelligence
  - route:/network/organizations
  - route:/network/organizations/:id
  - route:/network/people
  - route:/network/people/:id
  - route:/orgs
  - route:/orgs/:id
  - route:/people
  - route:/people/:id
  - route:/pricing
  - route:/product/career-evidence
  - route:/product/warm-paths
  - route:/reference/entities
  - route:/repositories
  - route:/resources
  - route:/resume
  - route:/resume/atoms
  - route:/resume/letters
  - route:/resume/outputs
  - route:/resume/tailor
  - route:/resume/templates
  - route:/search
  - route:/security-and-ownership
  - route:/settings
  - route:/settings/billing
  - route:/settings/preferences
  - route:/settings/profile
  - route:/settings/system
  - route:/signin
  - route:/signup
  - route:/status
  - route:/timeline
  - route:/today
  - route:/today/planner
  - route:/tour
  - route:/trash
  - route:/welcome
related: [USE-START, USE-GRAPH, USE-RESUME, USE-APPLY, USE-PORTABILITY, USE-TROUBLE]
---

# Every screen, and what it is for

This is a reference. Read the group you are standing in rather than the whole
page.

Every entry says three things: what the screen is for, what you do there, and
what its empty state means — because in a system you fill in yourself, an empty
screen is the state you will meet first, and the difference between *"you have
not done this yet"* and *"this could not load"* matters more here than anywhere
else in the interface.

## How the addresses work

Screens are grouped by workspace, and a workspace is the unit of navigation:
Today, Network, Career, Explore, Data, Settings. A screen's canonical address
starts with its workspace, so the Résumé outputs live at
`/career/resume/outputs` and the identity audit at `/data/identity`.

Many screens are also mounted at an older, shorter address — `/people`,
`/resume/tailor`, `/trash`. Those are the same screen; they are kept mounted so
bookmarks and shared links survive. All navigation inside the product points at
the canonical form. Both forms resolve to the same workspace in the rail.

Anything under `/docs` and `/reference/entities` is neither: those are reading
surfaces that describe the system rather than your records, and they need no
account.

## The public site

These pages need no account and never wait on authentication or the API. Their
content comes from a typed registry compiled into the build, so it is identical
for every visitor and cannot drift between the browser, the pre-rendered HTML
and the tests.

The public header carries the mark, which links home, then How it works, Warm
paths, Career evidence, Tour and Pricing, with Security and ownership, Guides,
Resources and Manifesto behind a **More** menu, then Sign in and a primary
action.

| Screen | What it is for |
| --- | --- |
| `/` | The career-move story: capture, connect, decide, move. The entry point for someone who has never seen the product. |
| `/how-it-works` | The workflow rather than a feature list: capture the signal, connect the facts, inspect the evidence, move the opportunity. `/product` redirects here. |
| `/product/warm-paths` | Why a warm introduction starts with the route and not the request, with worked example routes. |
| `/product/career-evidence` | The evidence-led alternative to writing a résumé from memory: source, achievement atom, selection, compiled document. |
| `/tour` | A keyboard-operable walkthrough of the capture-to-career loop, in seven stops: capture, record, connect, decide, evidence, move, keep. |
| `/manifesto` | The four commitments that shape the product, kept exportable in the source so they stay reviewable. |
| `/pricing` | The one hosted plan and its price, projected from the shared plan definition rather than restated. |
| `/security-and-ownership` | Trust claims that name only behaviour that exists, or an explicit launch gate. |
| `/welcome` | The public home page's retired address. It redirects to `/`, preserving any query string and fragment so campaign parameters survive. |

### Documents and guides

| Screen | What it is for |
| --- | --- |
| `/guides` | The guide index: the practical workflows, ordered by the work you are doing rather than by feature. |
| `/guides/:slug` | One guide, as a short series of titled steps. A slug the registry does not know renders the public not-available page rather than an error. |
| `/resources` | The resource index, pointing at the guides. |
| `/changelog` | Release notes. Until Cloud is open this page says the public changelog is not published yet and points at the source release notes. |
| `/status` | Service status. With Cloud closed, it states plainly that there is no public service to report on. |

### Legal

`/legal/terms`, `/legal/privacy`, `/legal/dpa` and `/legal/subprocessors` exist
so the addresses resolve and so the state of each document is visible. In a
build where Cloud is not enabled, each one carries the same notice: Cloud
remains unavailable for new accounts until the service, support contact, legal
identity, terms, privacy notice, data processing addendum, subprocessor list,
backup and restore checks, and billing controls are all live and reviewed.

These are not draft agreements with the text removed. They are a statement that
no agreement has been published, which is a different and more honest thing for
an unopened service to say.

### The door

`/signin` and `/signup` are the same screen with different copy. It is a
floor-to-ceiling split: the product's claim and a three-step ledger on the
left, the ways in on the right.

What it offers depends on the build. Google sign-in appears when Firebase is
configured; a developer shortcut appears in a build that enables it, and the
API only answers it for local requests. If neither is configured the screen
says **"No way in"** and names the missing environment variables, because that
is a build problem and pretending otherwise wastes the reader's time.

`/signup` on a Cloud instance offers a 14-day trial and carries a billing
period chosen on the pricing page through to the billing screen — as a
preference, not as an entitlement.

## Reading surfaces that need no account

| Screen | What it is for |
| --- | --- |
| `/reference/entities` | Every record type, connection type and relation kind the system knows — 34 record types and 28 connection types — generated from the same constants the API validates against. It describes the schema, not your data. Two views: a schema observatory of how the types relate, and an A4 atlas made to be printed. |

The documentation you are reading is the other one. Both are mounted above the
authentication gate on purpose: a reader with no account must be able to reach
them, and neither has any workspace chrome to inherit.

## The workspace frame

Everything below is inside the signed-in application, and everything below
shares one frame.

The **left rail** holds the six workspaces, each with a one-line description,
plus a search button, a capture button and a link to Help. Its foot carries a
live system indicator — *Systems nominal*, *System attention needed*, *Status
unavailable*, or *Checking system* — that links to the system screen. The rail
collapses to icons, by choice or automatically between 701 and 1080 pixels
wide.

The **top bar** holds the breadcrumb, a search field, the demo-space toggle,
the new-record menu, quick capture, a reminders bell with a due count, and sign
out.

The **workspace strip** below it names the workspace you are in and lists its
screens. In Explore it also lists your saved views.

Four keys work everywhere:

| Key | What it does |
| --- | --- |
| `⌘K` | Quick capture |
| `⌘P` | Search records, jump to a workspace, or run an action |
| `n` | The structured new-record menu, outside a text field |
| `Esc` | Close the active palette, drawer or dialog and restore focus |

The `⌘P` palette carries named actions alongside record matches, so
capabilities are findable by name — "New résumé", "Sync GitHub repositories",
"Who should I contact?", "Export & backup" — rather than only by knowing which
screen holds them.

While the demo space is active, a banner sits under the strip for the whole
session and offers the way back.

## Today

| Screen | Path |
| --- | --- |
| Today | `/today` |
| Planner | `/today/planner` |

**Today** is the agenda. It answers what needs you now, and it is ordered by
that question rather than by category: one prioritised queue, **Needs you**,
merging reminders, open tasks and deadlines by how overdue each is; then
**Habits** and **Reconnect**, the two daily rituals; then **How things stand**,
which is where the numbers live — application funnel, goals, momentum with its
factor breakdown, recent captures.

A deadline only enters the queue once it is within seven days. An application
due in five weeks is horizon, not agenda. Anniversaries and trips never enter
it at all, because they are not asks.

Empty states here are answers, not gaps. *"Nothing needs you today"*, *"No
habits tracked"*, *"No one is drifting"*. While setup is incomplete, a
checklist of six concrete steps sits above the agenda and hides itself when
done.

The whole screen is one request. If it fails you get *"Couldn't load today"*
with a retry, not eleven separately broken panels.

**Planner** is the same dated material laid out forward in time: reminders,
open tasks and dated records grouped by day. Its empty state is *"The horizon
is clear."*

The signed-in root, `/`, is not a screen. It redirects to `/today`.

## Network

| Screen | Path |
| --- | --- |
| Network home | `/network` |
| People | `/network/people`, also `/people` |
| A person | `/network/people/:id`, also `/people/:id` |
| Organizations | `/network/organizations`, also `/orgs` |
| An organisation | `/network/organizations/:id`, also `/orgs/:id` |
| Network intelligence | `/network/intelligence`, also `/ask/people` and `/intros` |

**Network home** is an index, not a dashboard. It states what the workspace is
for — *"A relationship is not a contact card. It is a history, a rhythm, and a
next honest action."* — and leads with the decision screen rather than the
directories.

**People** is the directory, with relationship strength, cadence and context on
each row. Its two empty states differ on purpose: *"No one here yet"* invites
the first person and shows the capture line that would create one; a filter that
matches nothing offers the way back out of the filter instead.

**A person** is the relationship dossier, and it is where most relationship
work happens:

- **Relationship strength**, decomposed into the closeness you set and the
  timing and frequency of logged interactions. With neither present it says
  *"No relationship signal yet"* and names both fixes.
- **Log interaction**, the one-tap record of a coffee, call, video, message or
  meeting, optionally spawning a follow-up reminder.
- **Profile**, assembled from connected roles, projects, education and skills.
  Empty, it says the profile has no evidence yet rather than showing a blank
  form.
- **Favor ledger**, tracking what is owed in each direction and letting you
  settle an entry.
- **Interactions** and **Connections**, both dated and both linked to the
  records they came from.

Each of those panels is a separate query, and each fails on its own: a broken
favour ledger shows a banner over a page whose other panels are still true.

**An organisation** is the same idea for a company, university or community:
related organisations, **Inroads** (people you know who work there, ranked),
roles and open positions.

**Network intelligence** is one address with two lenses over the same
relationship decision, chosen by a query parameter.

- The **contact lens**, the default, is *"Who should I call?"* You compose a
  need as a sentence — I need *[a referral]* at *[an organisation]* about
  *[topics]* in *[a city]* — and get a ranked list where every rank is broken
  into the factors that produced it: affiliation, topics, tie strength,
  geography, favours owed, network proximity. The weights are yours, in
  Settings. With nothing asked yet it says so and shows an example. If nobody
  matches, it explains what makes a person rankable rather than implying you
  know no one.
- The **reach lens**, `?lens=reach`, is **Warm paths**. Pick a destination
  organisation and compare introduction routes hop by hop, each with its own
  strength label and score. Every hop dilutes the ask, so a short chain of
  strong ties outranks a long one. With no route it says *"No warm path to
  [organisation] yet"* and tells you which record would create one.

`/ask/people` and `/intros` are the older addresses for the two lenses.

## Career

| Screen | Path |
| --- | --- |
| Career | `/career` |
| Applications | `/career/applications` |
| An application | `/career/applications/:id` |
| Résumé hub | `/career/resume`, also `/resume` |
| Atom library | `/career/resume/evidence`, also `/resume/atoms` |
| Tailor | `/career/resume/tailor`, also `/resume/tailor` |
| Outputs | `/career/resume/outputs`, also `/resume/outputs` |
| Cover letters | `/career/resume/letters`, also `/resume/letters` |
| Templates | `/career/resume/templates`, also `/resume/templates` |

**Career** and **Applications** are the same component: the runway. Applications
are grouped by stage — draft, applied, screening, interview, offer — with
outcomes (accepted, rejected, withdrawn) kept separately so a closed
application does not crowd a live one. Above the runway, **Next moves** lists
what is overdue or due, drawn from each application's next step or deadline.

Its two empty states again differ: *"No applications yet"* explains the record
you would create, while *"No applications match"* points at the filter that is
hiding them.

**An application** is the dossier: the next move, the interview loop with each
round's date, format, interviewers, preparation notes and reflection, working
notes, the application register of dates and channel, the people and company
involved, and the materials — job posting, tailoring target, résumé sent. With
none of those linked it says so in one line rather than showing three empty
panels.

**Résumé hub** is the front door to the résumé workspace: counts of atoms,
targets and outputs, the five workflow shortcuts, and the most recent outputs.

**Atom library** holds the achievement bullets every tailored résumé is built
from. Each atom belongs to a role or project, has a kind, may carry metrics and
evidence, and can hold several wording variants — technical, leadership,
concise, detailed — of which one is the default. Empty, it explains what an
atom is; filtered to nothing, it says so instead.

**Tailor** is the workspace where a job description becomes a document. Four
regions: the target rail on the left, the live document, the content controls,
and the preview with compile and finalise. It autosaves per target and says
when saving has stopped. With no target selected, each region says which one it
needs rather than looking broken.

**Outputs** is every résumé you have produced, with its target snapshot, build
artifacts, coverage and fit decisions, and the actions that operate on a
finished document: download, duplicate, rebuild artifacts, set as the base
résumé, mark sent.

**Cover letters** are structured hook, body and closer blocks attached to a job
target, either free text or pulled from an atom. There is no generative text
anywhere in it. With no targets yet, it says *"Add a job target first"* rather
than offering a form that cannot be saved.

**Templates** picks the default layout for new résumés and shows the build
service's own state. Changing the default changes new drafts only; it never
edits a document you have already produced or sent.

[Producing a résumé](write-a-resume.md) walks the whole chain.

## Explore

| Screen | Path |
| --- | --- |
| Explore home | `/explore` |
| Library | `/explore/library`, also `/collections` |
| Life map | `/explore/graph`, also `/graph` |
| Chronograph | `/explore/timeline`, also `/timeline` |
| Atlas | `/explore/atlas`, also `/map` |

**Explore home** states the workspace's rule: *"Change the lens, not the truth.
A selected record stays traceable as the shape around it changes."* All four
lenses read the same graph.

**Library** is every record as one searchable set, plus saved views. You build a
query from clauses, see how many records match, and keep a useful query as a
named view that then appears in the workspace strip and can be exported as CSV.
Its filter grammar is the same one the search screen uses.

**Life map** draws the graph itself: filters by type, lenses, path mode, a peek
panel showing the selected record's connections, and keyboard movement from a
node to its neighbours. Empty, it says *"Nothing to
explore yet"* and names what would draw it — people, organisations and projects,
and the ties between them. A failure says *"Couldn't draw the map"*, which is a
different sentence.

**Chronograph** is the same records against time, with zoom from decade to
month, a brush that selects a span, and a review surface built from what the
brush selected. Empty, it says *"Nothing dated yet"* and names the fields that
would populate it: start dates on roles, projects, education, events or trips.

**Atlas** is the same records against place: cities, trips, corridors between
them, and a dock listing evidence that has a place written on it but no
coordinates yet. Empty, it says *"No places yet"*.

Filters and selections in all three live in the URL, so a view can be
bookmarked or sent to someone with the same graph.

## Data

| Screen | Path |
| --- | --- |
| Data home | `/data` |
| Imports | `/data/imports`, also `/import` |
| Identity audit | `/data/identity`, also `/import/duplicates` |
| GitHub | `/data/sources/github`, also `/repositories` |
| Exports & backups | `/data/exports`, also `/export` |
| Trash | `/data/trash`, also `/trash` |

**Data home** states the workspace's promise: your graph should be inspectable
at every boundary — before import, during reconciliation, and at export — and
that no import commits until its staged records have been reviewed.

**Imports** is a chain of custody with four visible stages: choose source, read
safely, review evidence, commit or undo. A file is parsed into a staged batch,
checked for duplicates, and written nowhere until you commit. Every batch
operation reports itself in one place at the top of the screen, so a commit
started from batch history has somewhere to fail. Empty, it says *"No imports
yet"* and repeats the rule: everything stages before it commits.

**Identity audit** is the duplicate queue. Candidates are scored with readable
evidence — shared emails, names, organisations — rather than a bare similarity
number, and each cluster walks you through four questions: are these the same
thing, which record survives, what happens to each field, and what happens to
the relationships. Merges are reversible for 30 days. Empty, it says *"No
duplicates detected"* and notes that imports and new records are checked
automatically.

**GitHub** connects a personal access token, syncs your non-fork repositories
in as records, and links each repository's primary language to a skill. The
token is encrypted at rest and never returned to the browser after saving.

**Exports & backups** builds a portable archive — one JSONL per collection, an
Obsidian-compatible Markdown vault, and a manifest with SHA-256 checksums — and
exports saved views as CSV. The sensitive-records switch is the important
control on the screen and it says exactly what each setting costs: including
them makes the only bundle you can fully restore from; excluding them makes a
bundle that is safe to share and cannot rebuild your database.

**Trash** holds soft-deleted records for 30 days with their connections
preserved, then a nightly job purges them. Restoring brings a record and its
hidden edges back. When an expired window exists, a control appears to purge it
early. Empty, it says *"Trash is empty"* and states the retention promise again.

[Getting data in and out](import-and-export.md) covers all of this in order.

## Settings

| Screen | Path |
| --- | --- |
| Settings | `/settings` |
| Profile | `/settings/profile` |
| Preferences | `/settings/preferences` |
| System | `/settings/system` |
| Billing & access | `/settings/billing` |

`/settings` is an index in the same style as the other workspace homes. The
three slices below it are one screen that shows a different section depending
on the address:

- **Profile** — your "self" record and the contact information career documents
  use.
- **Preferences** — résumé defaults (template, accent, wording emphasis), the
  ranking constants that reshape the contact lens, and the skill aliases that
  teach the job-description parser which nicknames mean which skills.
- **System** — live service health check by check, the GitHub connection, and
  the owner identity.

**Billing & access** is the Cloud lifecycle screen: trial or subscription
state, the plan, the provider portal, and the export path. It only exists on a
Cloud-enabled instance; on any other build it redirects to `/settings`. Its
five access states — full trial access, paid access active, payment needs
attention, read-only access, deletion scheduled — each say what you can still
do, and both restricted states put the export link on screen rather than
burying it.

## Records, search and the pages between workspaces

| Screen | Path |
| --- | --- |
| A record | `/n/:id` |
| Browse a type | `/browse/:type` |
| Search | `/search` |
| Help & shortcuts | `/help` |

**A record** is the generic view every record type falls back to: its
properties, its notes, its connections, and its revision history with one tick
per revision. Edit, Pin and Delete live in the header; deletion asks for
confirmation and moves the record to Trash. Its connections panel, when empty,
says the thing worth saying — *"Connections are what make this a graph rather
than a list."*

**Browse a type** is the plain register for one record type, used by the types
that do not have a dedicated screen. People and organisations do have one, so
`/browse/person` and `/browse/organization` redirect to their directories
instead. A type the schema does not know renders *"Unknown type"* rather than
an error page.

**Search** is ranked full-text search over everything, with a composable filter
grammar it parses back at you as chips. The grammar is listed on the screen —
`type:`, `tag:`, `org:`, `city:`, `after:`, `before:`, `has:`, `is:`, `source:`,
`shared_by:` — with an example of each that you can click to try. No matches
suggests relaxing a filter and reminds you that deleted records stay in Trash
for 30 days.

**Help & shortcuts** is one screen: the four keyboard shortcuts, the four-word
model — records, connections, traces, lenses — and the way into the entity
catalogue. It belongs to no workspace, and the frame says so rather than
guessing.

## When there is no screen

A signed-in address that matches nothing renders a real not-found screen
naming every workspace, rather than silently rendering Today. That distinction
matters: a broken link that lands you on the dashboard looks exactly like a
successful navigation home.

A signed-out visitor who follows a deep link into the workspace is redirected
to the public home page, because every public page is matched before the
authentication gate and the remaining addresses are all private.

## Where to go next

- The four tasks these screens exist for: [Capturing people, work and evidence](build-your-graph.md),
  [Producing a résumé](write-a-resume.md), [Tracking applications](track-applications.md),
  and [Getting data in and out](import-and-export.md).
- What a failure on any of these screens means: [When something does not work](troubleshooting.md).
- How these screens are meant to look and behave: [the design section](../design/index.md).
