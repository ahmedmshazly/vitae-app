---
id: META
title: About these documents
summary: The evidence behind this documentation, the rules that keep it true, and the gates that fail when it drifts.
audience: [maintainer, developer, designer, operator, security]
domain: meta
type: index
status: verified
verified_at: 2026-08-24
sources:
  - scripts/docs/build-content.mjs
  - apps/web/vite.docs-content.ts
  - apps/web/vite.public-seo.ts
  - apps/api/src/routes/v1/docs.ts
---

# About these documents

Documentation drifts because nothing fails when it does. This section holds the
parts of the system that exist to make drift visible: the record of what the
previous documentation got wrong, and the rules the current documentation is
held to.

Nothing in this section is written for someone trying to use Vitae. It is
written for the people responsible for these pages staying true.

## What is here

[Documentation coverage and contradiction inventory](coverage-and-contradictions.md)
is the evidence base. Every entry names a file and a line, and every one was
checked against the source rather than inferred from a neighbouring document.
It records four kinds of defect: a quality gate that could not fail, reference
surfaces that under-reported what shipped, documents that contradicted the
running code, and facts that had simply gone stale. Each entry says whether it
has been repaired, and where.

## How these pages reach a reader

The corpus is Markdown in `docs/observatory/`. A build step compiles it into
JSON — one file per page, plus a manifest and a search text — and copies the
generated catalogs in beside it. The reading surface fetches those files; it
never parses Markdown in the browser.

The compiled output is not committed. An artifact that lives in the repository
is one somebody can forget to regenerate, and the failure mode is the worst
kind: a documentation surface confidently serving a page that no longer says
what the corpus says. During development a plugin recompiles on every save. A
production build of the web application does not compile it at all.

That last sentence is the part that changed. The corpus used to be compiled
into `apps/web/public/`, which meant it shipped inside the web bundle and was
served, as static files, by the public host. It is now compiled into a
directory outside the bundle and served by the API, which refuses it to anyone
who is not the owner of the instance.

The move cost real properties, and they were traded away rather than lost.
Every documentation page used to be prerendered to HTML: readable with
JavaScript disabled, readable with the API stopped, and listed in the sitemap
for a search engine to index. None of that is true now, and none of it can be
while the corpus is private, because each of those properties is a way of
handing a page to someone who has not been asked to identify themselves. What
was bought is stated on the entrance page under
[Who can read this](../index.md#who-can-read-this): this corpus describes every
trust boundary in the system and enumerates every route, endpoint, table and
exported symbol in the repository, and a map of that kind is worth more to
someone attacking the system than to anyone it was written for.

## The rules these pages are held to

Running code, schemas, tests, migrations and real configuration are the
authority for what is implemented. Product specifications and roadmaps are the
authority for what is intended. Where the two disagreed, the disagreement is
resolved on the page and recorded in the inventory rather than reproduced.

Nothing here invents functionality, security guarantees, benchmarks, prices,
operating status or legal commitments. Where a fact needs confirmation from
someone outside this repository — commercial terms, legal entity, operating
status of any hosted service — the page says so and carries the needs-review
badge instead of a number.

Examples use fictional demonstration data. No screenshot is fabricated.
