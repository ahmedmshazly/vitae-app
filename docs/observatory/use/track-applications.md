---
id: USE-APPLY
title: Tracking applications
summary: How an application gets into Vitae, what its stages mean, how the runway decides what needs you, and how to work the relationships behind a live search.
audience: [user]
domain: use
type: task
status: verified
verified_at: 2026-08-24
sources:
  - apps/web/src/routes/career/CareerOverview.tsx
  - apps/web/src/routes/career/ApplicationDossier.tsx
  - apps/web/src/routes/career/application-view.ts
  - apps/web/src/routes/Ask.tsx
  - apps/web/src/routes/Intros.tsx
  - apps/web/src/routes/Dashboard.tsx
  - apps/web/src/routes/workspaces/Planner.tsx
  - apps/web/src/features/RemindersDrawer.tsx
  - apps/api/src/routes/v1/applications.ts
  - apps/api/src/routes/v1/resumes.ts
  - packages/core/src/schema/application.ts
  - packages/core/src/schema/node-props.ts
requirements: [FR-RES-018, FR-CON-003, FR-CON-006, FR-CON-007, FR-CON-008, FR-VIS-004, FR-025]
covers:
  - route:/career
  - route:/career/applications
  - route:/career/applications/:id
  - route:/network/intelligence
  - route:/ask/people
  - route:/intros
  - route:/today
  - route:/today/planner
related: [USE-RESUME, USE-GRAPH, USE-SCREENS]
---

# Tracking applications

An application in Vitae is an ordinary record in the graph, not a row in a
separate tracker. That is what lets it sit beside the company, the person who
referred you, the interviews, the job posting and the résumé you actually sent,
instead of duplicating them.

This page covers the pipeline itself and the relationship work that goes with a
live search.

> [!NOTE]
> Examples use fictional demonstration data. Aurora Dynamics, NiaDelta and the
> people named are invented.

## Where applications come from

Two ways.

**Marking a résumé sent.** In Outputs, **Mark sent** on a finalised résumé
creates the application from the job target it was built for — role title,
company, today's date, status *applied* — and links the résumé to it. This is
the path that keeps the document and the application attached to each other
without you doing anything.

It refuses a draft. A résumé that did not pass the one-page and coverage gates
cannot become a real application, and the refusal says so: re-run Finalize, it
must fit one page and cover at least 95% of the job description's keywords. It
also refuses a second send, because that would create a duplicate application.

**Adding one directly.** The **Add application** control on the career screen
opens the structured form. Use it for a role you applied to elsewhere, or one
you are tracking before you have written anything.

## The eight stages

| Stage | Where it sits |
| --- | --- |
| Draft | The pipeline |
| Applied | The pipeline |
| Screening | The pipeline |
| Interview | The pipeline |
| Offer | The pipeline |
| Accepted | An outcome |
| Rejected | An outcome |
| Withdrawn | An outcome |

The five pipeline stages are ordered and shown as columns on the runway. The
three outcomes are kept separately, so a closed application does not crowd a
live one — and they sort last, so the list you scroll is the list you are
working.

The API validates the stage. An unrecognised value is refused with *"Unknown
application status."*

## The runway

`/career` and `/career/applications` are the same screen. It opens with four
figures — active, in interviews, offers, and due now — then **Next moves**, then
the runway grouped by stage.

**Next moves** is the part that earns the screen. Each application can carry a
next step with a date, and a deadline. Whichever of those is sooner becomes the
application's *attention*, classified as overdue, due today or upcoming, and
the applications whose attention is overdue or due today are what "due now"
counts.

That classification is made against your local calendar date rather than the
server's. The browser sends its timezone with every request, because "overdue"
is a calendar question and answering it in the wrong zone produces an answer
that is wrong for one day in every cycle.

A search box and a stage filter narrow the runway, and both live in the URL. If
the filter matches nothing, the screen says so — *"No applications match. The
application records are still here; the current search or stage filter is hiding
them."* — rather than showing the empty-library message, which would be a
different and untrue claim.

## The dossier

`/career/applications/:id` is one application in full.

**The next move** sits at the top, because it is the only thing on the screen
that is a demand.

**Interview loop** lists each round in order with its stage number, date,
format, interviewers, preparation notes and reflection, and its outcome when it
has one. Interviews are their own records linked to the application, so the
same interview can also appear on the person who conducted it. With none
linked, the panel explains what to connect rather than showing an empty table.

**Working notes** is the free-form Markdown on the application record.

**Application register** is the dated facts: applied on, deadline, channel,
location mode, salary range, job URL.

**People and company** links the organisation and whoever referred you.

**Materials** links the three artefacts an application accumulates — the job
posting, the tailoring target, and the résumé sent. With none of them linked it
says so in one line rather than showing three empty panels, which is a
different claim: *no posting, target, or résumé linked* is a fact about your
graph, not a failure.

## Keeping the search moving

Three surfaces carry the day-to-day work, and they read the same records from
different angles.

**Today** merges everything with a claim on today into one queue ordered by how
overdue it is: reminders, open tasks, and application deadlines once they are
within seven days. A deadline further out than that is horizon rather than
agenda, which is why an application due in five weeks does not shout at you.

**Planner** is the same dated material laid out forward, grouped by day, so you
can see next week rather than only today.

**The reminders drawer**, on the top bar's bell, lists reminders with a due
count on the bell itself. A reminder can be marked done — with an undo — or
snoozed by seven days. Overdue and due-today are judged against your local
calendar date for the same reason the runway is.

Reminders get created by the things that should create them: a follow-up queued
while logging an interaction, a capture line with a date, a task with a due
date.

## The relationship work

An application is rarely won by the application. `/network/intelligence` is one
address with two lenses over the same question, and both are worth using before
you send anything.

### Who should I contact?

The default lens. Compose the need as a sentence — I need *[a referral]* at
*[Aurora Dynamics]* about *[reinforcement learning]* in *[Nairobi]* — and press
**Ask**.

The result is a ranked list where every rank is decomposed into the factors
that produced it: affiliation with the organisation, topic overlap, tie
strength, geography, favours owed, and network proximity. The bar beside each
person is the shape of the score — one wide segment means one dominant reason;
several segments mean the case rests on several recorded facts.

The weights are yours. They live in Settings under ranking constants, and
changing them changes every future ranking. That is deliberate: the ranking is
a calculation you own, not a judgement handed to you.

Each result opens into the evidence behind it — recent interactions, open
follow-ups, what you share, and talking points — so the ask you write is
grounded in something you can check.

Two empty states matter here. With nothing asked yet it shows an example rather
than a blank screen. When nobody matches, it says *"No one to call"* and
explains what makes a person rankable — a tie to you, topics on that tie, or a
role at the organisation you named — rather than implying you know nobody.

### Warm paths

The reach lens, at `?lens=reach`. Pick a destination organisation and it lists
introduction routes from you to it, hop by hop.

Paths are ranked on the principle that every hop dilutes the ask, so a short
chain of strong ties outranks a long one. Each path shows its position, its
strength label, its numeric score, and the recorded tie behind each hop. Line
weight represents strength, and the label beside it carries the exact meaning,
so the drawing is never the only place the information lives.

Organisations with active applications are listed first, then the destinations
you can already reach, and each destination states how many people and open
roles support that position.

With no route it says *"No warm path to [organisation] yet"* and names the
record that would create one — link someone you know to a role there, or add a
person who works there. It sends you to People rather than leaving you at a
dead end.

`/ask/people` and `/intros` are the older addresses for the two lenses and
still resolve.

## A worked pass

With fictional data, tracking one application from interest to interview.

1. Jordan finds a Machine Learning Engineer posting at Aurora Dynamics and
   captures the company and the posting.
2. Before applying, the reach lens shows one warm path: a former colleague who
   now holds a role there. It is two hops and both ties are strong.
3. The contact lens, asked for a referral at Aurora Dynamics about
   reinforcement learning, ranks that same colleague first, and shows why —
   affiliation and topic overlap, on a tie with three logged interactions.
4. Jordan logs the outreach as an interaction and queues a follow-up reminder
   for a week out.
5. A tailored résumé is finalised and marked sent. The application appears on
   the runway at *applied*.
6. A recruiter screen is scheduled. The interview record is linked to the
   application, and the application's next step is set with a date.
7. That date is inside seven days, so it appears on Today's queue and in Next
   moves. When it passes, the same row reads *overdue* rather than quietly
   disappearing.

## Where to go next

- Produce the document this pipeline is about: [Producing a résumé](write-a-resume.md).
- Improve the ranking by improving what it reads: [Capturing people, work and evidence](build-your-graph.md).
- Look up any screen mentioned here: [Every screen, and what it is for](screens.md).

Every status an application can be in, and what moves it:

```diagram
DGM-APPLICATION-LIFECYCLE
```
