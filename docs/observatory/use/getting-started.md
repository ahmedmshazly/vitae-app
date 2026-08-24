---
id: USE-START
title: Your first hour in Vitae
summary: Sign in, meet Today, capture your first record with the keyboard grammar, and finish with a graph that is small but already useful.
audience: [user]
domain: use
type: tutorial
status: verified
verified_at: 2026-08-24
sources:
  - apps/web/src/routes/SignIn.tsx
  - apps/web/src/lib/auth.tsx
  - apps/web/src/features/FirstRun.tsx
  - apps/web/src/features/GettingStarted.tsx
  - apps/web/src/features/QuickAdd.tsx
  - apps/web/src/routes/Dashboard.tsx
  - apps/web/src/app/Shell.tsx
  - packages/core/src/algorithms/capture-grammar.ts
  - apps/api/src/scripts/seed-demo.ts
requirements: [FR-CAP-001, FR-SRCH-004, FR-VIS-004]
covers:
  - route:/signin
  - route:/signup
  - route:/today
  - route:/help
related: [USE-SCREENS, USE-GRAPH]
---

# Your first hour in Vitae

An empty career graph is not useful, and filling one in properly takes weeks.
This page is about the hour in between: enough records that the product starts
answering questions, and enough of a habit that it keeps doing so.

Nothing here needs you to plan a schema first. Vitae is designed to be entered
one fact at a time.

> [!NOTE]
> Every example on this page uses fictional demonstration data. Jordan Kim,
> Aurora Dynamics and NiaDelta are invented; they are the same names the demo
> seed uses, so you can try the examples against the demo space without
> touching your own records.

## Before you start

You need a running instance and an account it will accept. What "accept" means
depends on how the instance was built:

- A **self-hosted** instance is single-owner. It admits the one Google account
  configured as its owner, and denies every other verified account. The
  sign-in screen says so: *"This is a single-owner system. Verified accounts
  that do not match the configured owner email are denied."*
- A **local development** build may also offer a developer shortcut, which
  only answers requests from the same machine.
- A **Cloud** instance prepares one private workspace per verified account and
  offers a trial. Cloud is held closed until several launch conditions are met,
  so most instances are not this one.

If the door offers neither Google sign-in nor the developer shortcut, it says
**"No way in"** and names the environment variables the build was missing. That
is a build problem, not something you can fix from the browser.

## Signing in

Open `/signin`. While the browser is being checked for an existing session you
see the sign-in screen with its buttons skeletonised rather than a spinner —
resolving the session reveals the door instead of replacing one screen with
another.

`/signup` is the same door with different copy. On a Cloud instance it reads
*"Start your 14-day trial"* and, if you arrived from the pricing page having
picked a billing period, it carries that choice through to the billing screen
after the account exists. The choice is carried, not trusted: price and access
are decided by the server.

If sign-in fails, the reason is shown in words — a closed popup, the wrong
account, an unauthorised domain. If the account signed in but its workspace
could not be prepared, you stay at the door with *"Workspace setup needs
attention"* rather than being dropped into a half-built workspace.

## The welcome, once

The first time you reach the workspace in a given browser, a small dialog names
three moves and then gets out of the way:

| Key | What it does |
| --- | --- |
| `⌘K` | Capture a fact as one line of text |
| `n` | Open the structured new-record menu |
| `⌘P` | Search records, jump to a workspace, or run an action |

Dismissing it sets a flag in this browser's local storage, so it does not come
back. It is not an onboarding wizard and there is nothing to complete in it —
the resumable checklist lives on Today instead.

## Today, and the setup ledger

`/today` is the agenda, not a dashboard. It answers one question — what needs
me now — and it is organised in that order: a single prioritised queue called
**Needs you** that merges reminders, open tasks and near deadlines by how
overdue each is; then the two daily rituals, **Habits** and **Reconnect**; then
everything that is only a number, under **How things stand**.

On a new graph the queue is empty and says so: *"Nothing needs you today."*
That is the correct answer, not a failure.

Above the agenda, while setup is incomplete, sits a checklist driven by real
state rather than by clicks. Its six steps are the shortest path to a graph
that does something:

1. **Set up your profile** — your "self" record anchors everything.
2. **Add someone you know** — people power relationship context and reconnect
   nudges.
3. **Log an interaction** — a chat, coffee or call, which is what updates
   cadence.
4. **Connect GitHub** — repositories become records, and their primary
   languages become skills.
5. **Add résumé evidence** — reusable achievement statements.
6. **Build a résumé** — turn a job description into a tailored one-pager.

The checklist hides itself once complete and can be dismissed before then. Each
step is a link into the screen that satisfies it, so you can leave it half-done
and come back through Today rather than through a wizard you cannot re-enter.

## Look around the demo space first, if you like

The top bar carries a **View demo** control. It switches the whole application
to a separate demo data space holding a sample graph for a fictional engineer,
Jordan Kim: organisations, people, roles, projects, skills, applications,
interviews, atoms and a finalised résumé. A banner stays on screen the whole
time — *"You are exploring Jordan's sample graph. Your records remain
untouched."* — with a control to return.

The space is carried on every request, so switching also clears the cached
query results and returns you to the home route. Nothing you do in the demo
space reaches your own records, and nothing in your records is visible from it.

This is worth ten minutes. Every screen described in
[Every screen, and what it is for](screens.md) has something in it in the demo
space, which is not true of a graph you started this morning.

## Your first capture

Press `⌘K` anywhere. A dialog opens with one text field, and what you type is
parsed as you type it. The parse appears as chips underneath, so you review the
interpretation before anything is written.

The grammar is one leading key, then a title, then optional markers:

```text
p Jordan Kim @@Aurora Dynamics #ml ^fri > met at the speaker dinner
```

That line means: a **person** called Jordan Kim, at the **organisation** Aurora
Dynamics, tagged `ml`, dated this coming Friday, with a note. Press Enter and
Vitae writes the person, an organisation stub, the tag, the date and the note
as connected records in one transaction.

The markers are the same everywhere:

| Marker | Means |
| --- | --- |
| `@name` | a person; the words after it belong to that person until the next marker |
| `@@name` | an organisation, read the same way |
| `#word` | a tag, lowercased |
| `^date` | a date: `^2026-09-12`, `^today`, `^tomorrow`, `^yesterday`, or a weekday such as `^fri` |
| `!p1`–`!p4` | a priority |
| `> text` | everything after the first `>` is a note |
| a bare `https://…` | a URL, and with no leading key it makes the record a link |

> [!WARNING]
> The priority token is `!p2`, with the `p`. The task example shown in the
> capture dialog itself writes `!2`, which the parser does not recognise as a
> priority — it ends up as part of the title instead. This is a defect in the
> example, not in the grammar.

The leading keys cover the record types you capture most often — `p` person,
`o` organisation, `t` task, `i` idea, `j` journal entry, `e` event, `int`
interaction, `m` media, `l` link, `k` skill, `g` goal, `h` habit, and `n` to
append a note to the record you last looked at. Leave the leading key off and
the parse says the type is unknown rather than guessing.

The dialog lists the keys with a worked example beside each one, and clicking an
example fills the field with it. This is the fastest way to learn the grammar:
run the example, look at what it produced, edit it.

Nothing about capture is generative. The parser is deterministic, which is why
the preview can be trusted: what the chips say is what will be written.

## Find what you just captured

Press `⌘P`. The palette holds two lanes in one list: **actions** ("New résumé",
"Sync GitHub repositories", "Open Trash") and **records** matched by a fuzzy
search over everything in the graph. Matching ignores accents, so typing
`resume` finds *Résumé*.

Type the name you just captured, press Enter on it, and you land on the record.
That round trip — capture, find, open — is the loop the rest of the product is
built on.

## Give the fact somewhere to belong

A captured person is a record. A person connected to an organisation, with a
logged interaction and a closeness rating, is context. Opening the person and
doing three small things is what turns one into the other:

- **Log interaction** records what actually happened and when, which is what
  relationship strength is computed from.
- **Closeness** is a one-to-five rating you set yourself. It is the part of the
  strength score the system cannot infer.
- **Add connection** ties the person to a role, an organisation, a school, a
  skill or another person.

Until one of those exists, the person's relationship panel says *"No
relationship signal yet"* and tells you which of the two would fix it. It is
not pretending to know something it does not.

[Capturing people, work and evidence](build-your-graph.md) goes through this
properly.

## Where the rest of the product is

The left rail holds six workspaces, and every screen belongs to exactly one:

| Workspace | What it is for |
| --- | --- |
| Today | Agenda and daily momentum |
| Network | Relationships and reach |
| Career | Applications and documents |
| Explore | Graph, time, and place |
| Data | Imports, integrity, and ownership |
| Settings | Identity and system controls |

Below them sits **Help & shortcuts** at `/help`, which is one screen: the four
keyboard shortcuts, the four-word model the product is built on — records,
connections, traces, lenses — and a link into the entity catalogue that lists
every record and connection type the system knows. The catalogue describes the
schema rather than your data, so it needs no account.

The rail's foot carries a live system indicator that reads *Systems nominal*,
*System attention needed*, *Status unavailable* or *Checking system*, and links
to the system screen. It is worth knowing where that is before you need it.

## What a good first hour ends with

Not a complete record of your career. Something more like:

- your own profile record, with the contact details career documents will use;
- three or four people you actually know, each attached to an organisation;
- one logged interaction, so Reconnect has something to rank;
- one or two achievement atoms written while the details are still specific;
- the demo space visited once, so you know what the screens look like full.

That is enough for Today to have something to say tomorrow, which is the point
at which the habit sticks.

## Where to go next

- To keep adding facts properly: [Capturing people, work and evidence](build-your-graph.md).
- To go straight at a job description: [Producing a résumé](write-a-resume.md).
- To bring in an existing export instead of typing: [Getting data in and out](import-and-export.md).
- To look up a screen you landed on: [Every screen, and what it is for](screens.md).

The same first session, phase by phase, with what has an automated test behind it:

```diagram
DGM-FIRST-RUN
```
