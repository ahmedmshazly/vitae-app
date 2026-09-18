---
id: USE
title: Use
summary: How to work Vitae day to day: the first hour, every screen, the four tasks the product exists for, and what to do when one of them fails.
audience: [user, designer]
domain: use
type: index
status: verified
verified_at: 2026-08-24
sources:
  - apps/web/src/App.tsx
  - apps/web/src/app/routes.ts
  - docs/generated/routes.json
---

# Use

This section is written for the person whose career is in the graph. It
assumes you have a running instance and an account that can sign in, and it
assumes nothing else - not that you have read the product section, not that you
know what a node is, not that you have any records yet.

Everything here describes behaviour that exists in the code today. Where a
screen only appears under a configuration flag, the page says so rather than
describing it as though everyone has it. The productivity destinations under
Today are the current example: they exist in the repository and stay hidden
until both flags are on.

## The pages

| Page                                                       | The question it answers                                             |
| ---------------------------------------------------------- | ------------------------------------------------------------------- |
| [Your first hour in Vitae](getting-started.md)             | I have just signed in. What do I actually do?                       |
| [Every screen, and what it is for](screens.md)             | What is this screen, and why does it exist?                         |
| [Capturing people, work and evidence](build-your-graph.md) | How do facts get into the graph, and how do they connect?           |
| [Producing a résumé](write-a-resume.md)                    | How does a job description become a compiled one-page PDF?          |
| [Tracking applications](track-applications.md)             | How do I keep an active job search straight?                        |
| [Getting data in and out](import-and-export.md)            | How do I import a source, and how do I leave with everything?       |
| [Reviewing source knowledge](review-knowledge.md)          | What did a source support, and how do I accept or reject it safely? |
| [When something does not work](troubleshooting.md)         | The screen is showing me a failure. What does it mean?              |

Read the first hour first. After that the four task pages are independent and
the screen reference is looked up rather than read through.

## Two surfaces, one address bar

Vitae serves two things from one origin, and they follow different rules.

The **public site** - the home page, the product pages, the tour, the guides,
the legal and status documents, and the sign-in door - is reachable with no
account and never waits on authentication or on the API. Its content is a typed
registry compiled into the build, so it is the same for every visitor.

The **workspace** is everything behind the sign-in gate. It reads and writes
your records, it is single-owner by default, and every screen in it is one of
the six workspaces named in the left rail. A signed-out visitor who follows a
deep link into the workspace is returned to the public home page rather than
shown a login wall over a screen they cannot have.

Two further surfaces sit outside both, and they describe the system rather than
your data. The entity catalogue at `/reference/entities` needs no account: what
it shows is compiled into the build, so it never waits on the API. **This
documentation does need one.** Its route is mounted above the authentication
gate so that a signed-out reader is told what happened rather than silently
redirected, but the corpus itself is fetched from the API and refused to
anyone who is not the owner of the instance - because it describes every trust
boundary in the system and enumerates every route, endpoint, table and exported
symbol in the repository. [Every screen, and what it is for](screens.md)
separates the three.

## What this section deliberately does not do

It does not enumerate endpoints, configuration keys, database tables or design
tokens. Those are generated from source and indexed elsewhere; prose that
repeats them goes stale the first time someone renames one.

It also does not explain _why_ the product is shaped the way it is. That
argument belongs to [the product section](../product/index.md), and the rules
that keep these pages honest belong to
[About these documents](../meta/index.md).
