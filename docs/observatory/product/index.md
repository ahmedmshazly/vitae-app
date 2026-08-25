---
id: PRODUCT
title: Product
summary: What Vitae is for, who it serves, what it can be asked to do, and the boundaries it holds on purpose.
audience: [user, designer, developer, maintainer]
domain: product
type: index
status: verified
verified_at: 2026-08-26
---

# Product

Vitae keeps the people, work and evidence behind a career as one typed,
versioned graph, runs deterministic algorithms over that graph, and compiles a
tailored one-page résumé from evidence that is already in it. It is software a
person runs for their own records.

This section answers the questions that come before any screen, endpoint or
token: what the product is for, who is expected to run it, what it can be asked
to do, which end-to-end paths must keep working, and what it refuses to become.
Nothing here explains how a thing is built. That is the next section along.

## The pages

| Page | The question it answers | Written for |
| --- | --- | --- |
| [What Vitae is for](what-vitae-is.md) | Why a graph, and why deterministic? | Anyone |
| [Who Vitae is for](who-it-serves.md) | Who signs in, and who is only ever a record? | Anyone |
| [The capability map](capabilities.md) | What are the units of product scope, and what proves each one? | Maintainers |
| [The journeys that must work](journeys.md) | Which paths through the product are held by a test? | Maintainers |
| [The stories behind the journeys](stories.md) | Who wants each journey, and how would we know it worked? | Maintainers |
| [What Vitae does not do](boundaries.md) | Where does the product stop, and why there? | Anyone |

Read them in that order the first time. After that they are independent: the
capability map and the journey register are looked up rather than read through,
and the boundaries page is the one to reach for when a claim about Vitae sounds
larger than it should.

## Three different kinds of statement

Product documentation goes wrong when intent and implementation are written in
the same tense. Every page in this section keeps them apart, and says which it
is making at each point:

- **Shipped.** Enforced by code in this repository and reachable by someone
  running a default self-hosted install. Most of this section is this.
- **Gated.** Built, tested, and deliberately closed. The hosted control plane
  is the only thing in this category, and it stays closed behind two
  independent flags that must both be opened.
- **Intent.** Recorded in a specification or a launch guide and not built, or
  built and never operated. Commercial terms for a hosted service are the
  clearest example, and the boundaries page says plainly that they are terms on
  paper rather than a service anyone can buy.

Where an older document in this repository made a claim the code contradicts,
these pages resolve it and say which source won, rather than repeating the
disagreement. The [boundaries](boundaries.md) page carries the largest of those
corrections.

## Where this leads

[Use](../use/index.md) is the same product from the other side: what a person
actually does, screen by screen. [Architecture](../architecture/index.md) is how
any of it is made to work.
