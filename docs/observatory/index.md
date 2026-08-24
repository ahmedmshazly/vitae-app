---
id: DOCS-HOME
title: Vitae documentation
summary: How this documentation is organised, what its status badges mean, and where to start reading.
audience: [user, designer, developer, maintainer, operator, security]
domain: meta
type: index
status: verified
verified_at: 2026-08-24
sources:
  - apps/api/src/routes/v1/docs.ts
  - apps/web/src/routes/docs/docsContent.ts
  - apps/web/vite.public-seo.ts
---

# Vitae documentation

Vitae is a private career instrument: a typed, versioned graph of the people,
work and evidence behind a deliberate career move, with deterministic
algorithms over it and a résumé compiler at the end. It runs self-hosted from
this repository. A hosted Cloud offering is designed and partly built, and is
not open.

This documentation is written to be read by six different people with six
different questions, and it says which one each page is for.

## Two halves that are maintained differently

Everything here belongs to one of two halves, and the difference matters more
than any other organising idea in these documents.

**Curated pages** are written by hand. They explain what something is for, why
it works the way it does, and what it feels like to use. A person decides what
goes in one, and a person is wrong sometimes, so every curated page carries a
status badge saying how far its claims have been checked.

**Generated reference** is derived from the source by a script and never edited
by hand. It answers what exists, what depends on it, and what proves it: every
route, endpoint, configuration key, table, migration, token, component, tuned
constant and exported symbol. A check in continuous integration regenerates it
and fails if the committed copy has drifted, so it cannot quietly go stale.

Prose never lists what a generator can index. That separation is what makes it
possible to document every small part of a system this size without the
readable half turning into a code dump nobody maintains.

## Who can read this

This documentation is private. It is served by the API, from behind the same
default-deny gate that protects the graph itself, and on a self-hosted install
the only identity that gate admits is the configured `OWNER_EMAIL`.

The reason is the two halves above, taken together. The curated half describes
every trust boundary in the system and names the gaps that are known rather
than closed. The generated half enumerates every route, endpoint, configuration
key, table, migration and exported symbol in the repository. Published openly,
that is a map of the software for anyone who wants one — and the map is more
useful to someone attacking the system than to anyone else, because the people
it was written for can sign in.

It was open until August 2026, and the properties it had then are gone. There
is no prerendered copy of any page, nothing readable with JavaScript disabled,
nothing readable with the API stopped, and no documentation address in the
sitemap. Nothing under `apps/web/public/` holds the corpus, because everything
there is copied into the web bundle and served to anyone who asks.

What did not change is the address. `/docs` still resolves in the browser
without a session, deliberately: it draws its own frame and a sentence saying
the corpus is private and which account to sign in with, rather than
redirecting a signed-out reader somewhere else with no explanation. The frame
carries no text from the corpus. Every page, the navigation and the search
index arrive from an authenticated request or not at all.

Because the corpus is now a deployment artifact rather than part of the web
build, an instance has to be given one. [Operate](operate/index.md) covers
building it and pointing the API at it, and what a deployment that has not done
so reports instead.

## What the status badges claim

Every curated page states its relationship to the running system. The badge is
not decoration; a gate reads the same field and the reading surface renders
from the same file.

| Badge | What it claims |
| --- | --- |
| Verified | Checked against the code at the date on the page. |
| Partly implemented | Some of what it describes ships. The page says which parts do not. |
| Planned | Intent. Nothing on the page is claimed to run today. |
| Gated | Built, but not reachable in a default build. A flag or a launch step holds it closed. |
| Deprecated | Kept so existing links resolve. Points at what replaced it. |
| Historical | True when written, kept as a record rather than as guidance. |
| Generated | Derived from source. Editing it by hand will be overwritten. |
| Needs review | Reconstructed from evidence rather than from a record, and not yet confirmed by someone who would know. |

A page with no badge does not exist here. If something is unknown, it is
labelled unknown rather than left to read as fact.

## Where to start

Six people read this documentation, and the section that answers a question
depends on which of them is asking.

| If you are | Start at |
| --- | --- |
| Using Vitae to run your own career work | [Use](use/index.md) |
| Deciding whether Vitae is the right instrument | [Product](product/index.md) |
| Changing how a surface looks, reads or behaves | [Design](design/index.md) |
| Changing the code | [Develop](develop/index.md) |
| Working out how the system is put together | [Architecture](architecture/index.md) |
| Running an instance | [Operate](operate/index.md) |
| Reviewing trust boundaries or data handling | [Architecture](architecture/index.md) |
| Asking why something is the way it is | [Decisions](decisions/index.md) |

Each section opens with a page that says what is in it and what it assumes you
already know. Nothing here expects to be read in order, but every page names
the page before and after it, so it can be.

The [Glossary](glossary.md) is the other way in. A word earns a place in it
only where the ordinary meaning would mislead — "verified" means checked
against code on a stated date, "gated" means built but closed, and a "journey"
is a registered identifier rather than a figure of speech.

## What this corpus does not do

It does not list what a script can index. Every route, endpoint, configuration
key, database table, migration, design token, component and exported symbol is
generated from the source into `docs/generated/`, checked in, and regenerated
by a gate in continuous integration that fails when the committed copy has
drifted. The pages here explain the shape, the rules and the exceptions, and
point at the catalog for the enumeration.

It does not describe a hosted service as though it were operating. The Cloud
workspace and billing plane is built and closed; pages that touch it say so and
carry the gated badge. Prices, trial terms, legal entities and support
arrangements are recorded as intent where the repository records them, and as
needing confirmation everywhere else.

It does not invent. Where the older documentation contradicted the running
code, the contradiction was resolved against the code and the resolution
written down. [About these documents](meta/index.md) holds the inventory of
what was wrong, with the file and line that proved it.
