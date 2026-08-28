---
id: DEV
title: Develop
summary: A working checkout, where a change belongs, how the repository tests itself, the gates a change must pass, and three worked procedures.
audience: [developer, maintainer]
domain: develop
type: index
status: verified
verified_at: 2026-08-24
related: [DEV-SETUP, DEV-WHERE, DEV-TESTING, DEV-GATES, DEV-ENDPOINT, DEV-NODETYPE, DEV-TEMPLATE]
---

# Develop

This section is for someone about to change the code. It answers four questions
in the order they come up - can I run it, where does my change go, what proves
it, and what will refuse it - and then walks three changes end to end.

Nothing here is aspirational. Every command on these pages was run or read out
of the root `package.json` before it was written down, and every gate was read
in its own source file rather than inferred from the guide that mentions it.
Where an older document in this repository says something different, the page
says so and says which one is right.

## Start here

[Setting up a working checkout](setup.md) takes a fresh clone to a running
application: the exact Node and pnpm releases the workspace declares, the two
containers and one emulator the local stack needs, and the ports they occupy.
Read it first if you have never run this repository, and read its first section
even if you have - the Node floor printed in the older onboarding guide is not
the one the workspace enforces.

## Then

[Where a change belongs](where-to-change.md) is the map: eight workspaces in
two layers, five edges between them, and the rule that decides which one owns
a given piece of work. It also states what actually holds the boundary in
place, which is not what the lint configuration's header claims.

[How this repository tests itself](testing.md) explains the layers, the
source-to-test map that decides whether a module is allowed to exist untested,
and which suites run in continuous integration.

[The gates a change must pass](quality-gates.md) is the reference: for each
gate, what it enforces, what it scans, how it fails, and how to record a
deliberate exception. It also records the gates that exist but run nowhere, and
the packages a recursive command silently skips.

## Worked procedures

Each of these is a complete procedure, including what to add to the
source-to-test map and which gate catches which mistake.

[Adding an API endpoint](add-an-endpoint.md) - a route on an existing mount,
and the extra steps a new mount prefix demands.

[Adding a node or edge type](add-a-node-type.md) - the typed career graph is
one string union with several registries hanging off it; the compiler catches
some of the omissions and named tests catch the rest.

[Adding a résumé template](add-a-resume-template.md) - what the three shipped
template families are, what constrains them, how the compiler image warms and
calibrates them, and what a fourth would need.

## What this section does not cover

Deploying, migrating, backing up and recovering an instance belong to
[Operate](../operate/index.md). The shape of the system itself - the request
lifecycle, the typed graph, the trust boundaries - belongs to
[Architecture](../architecture/index.md). The visual and interaction rules a
change to a screen has to obey belong to [Design](../design/index.md). The
rules these documents are themselves held to, and the audited inventory of what
the previous documentation got wrong, are in [About these
documents](../meta/index.md).
