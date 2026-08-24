#!/usr/bin/env node
/**
 * Prove the page gate rejects what it claims to reject.
 *
 * This gate decides whether the curated corpus is coherent, and every rule in
 * it protects against a defect a reviewer would not catch by reading a diff: a
 * status badge naming a vocabulary nobody else uses, a heading that no longer
 * matches the title the navigation shows, a link that resolves in the
 * application but not on the repository host, a page nothing leads to. A rule
 * that stops working takes its whole class of defect with it, silently, and
 * the corpus goes on reporting `ok`.
 *
 * Each case below breaks exactly one rule and asserts the gate names it. The
 * fixture copies the real content model rather than a miniature of it, so a
 * new required field or a new status is exercised here the day it is added.
 */
import { spawnSync, execSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..');
let failures = 0;

const day = (offset) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
const TODAY = day(0);

// The real content model, so a field or a status added to it is exercised
// here the day it is added rather than the day someone remembers to.
const MODEL = JSON.parse(readFileSync(join(repo, 'docs/registry/content-model.json'), 'utf8'));

const ROUTES = { routes: [{ path: '/docs/search' }, { path: '/docs/glossary' }] };
const REQUIREMENTS = { requirements: [{ id: 'FR-001' }, { id: 'NFR-SEC-002' }] };

const HOME = `---
id: DOCS-HOME
title: Documentation
summary: The entrance.
audience: [developer]
domain: meta
type: index
status: verified
verified_at: ${TODAY}
---

# Documentation

Start with [architecture](architecture/index.md).
`;

const SECTION = `---
id: ARC
title: Architecture
summary: How the system fits together.
audience: [developer]
domain: architecture
type: index
status: verified
verified_at: ${TODAY}
---

# Architecture

The [career graph](graph.md) is the centre of it.
`;

const PAGE = `---
id: ARC-GRAPH
title: The career graph
summary: A typed, versioned record of people, work and evidence.
audience: [developer, maintainer]
domain: architecture
type: explanation
status: verified
sources: [docs/registry/content-model.json]
requirements: [FR-001]
verified_at: ${TODAY}
---

# The career graph

## In short

Everything is a node or an edge.

## How it works

Nodes carry a type and a revision.

### Revisions

Every write appends.

## Mechanics

The primary key is composite. See [the search page](/docs/search) and
[the specification](https://example.invalid/spec).

## Related

Back to [architecture](index.md#architecture).
`;

const LIB = ['json-schema.mjs', 'frontmatter.mjs', 'markdown.mjs', 'corpus.mjs'];

function fixture(mutate = () => {}) {
  const dir = mkdtempSync(join(tmpdir(), 'vitae-docs-pages-'));
  mkdirSync(join(dir, 'scripts/docs/lib'), { recursive: true });
  mkdirSync(join(dir, 'docs/registry/schema'), { recursive: true });
  mkdirSync(join(dir, 'docs/generated'), { recursive: true });
  mkdirSync(join(dir, 'docs/observatory/architecture'), { recursive: true });
  cpSync(join(here, 'check-docs-pages.mjs'), join(dir, 'scripts/check-docs-pages.mjs'));
  for (const name of LIB) cpSync(join(here, 'docs/lib', name), join(dir, 'scripts/docs/lib', name));
  cpSync(join(repo, 'docs/registry/content-model.json'), join(dir, 'docs/registry/content-model.json'));
  cpSync(
    join(repo, 'docs/registry/schema/content-model.schema.json'),
    join(dir, 'docs/registry/schema/content-model.schema.json'),
  );

  const state = {
    model: { ...structuredClone(MODEL), app_routes: ['/docs/search'] },
    routes: structuredClone(ROUTES),
    requirements: structuredClone(REQUIREMENTS),
    pages: {
      'docs/observatory/index.md': HOME,
      'docs/observatory/architecture/index.md': SECTION,
      'docs/observatory/architecture/graph.md': PAGE,
    },
    extra: {},
  };
  mutate(state, dir);

  if (state.model) {
    writeFileSync(join(dir, 'docs/registry/content-model.json'), `${JSON.stringify(state.model, null, 2)}\n`);
  }
  writeFileSync(join(dir, 'docs/generated/routes.json'), `${JSON.stringify(state.routes, null, 2)}\n`);
  writeFileSync(
    join(dir, 'docs/registry/requirements.json'),
    `${JSON.stringify(state.requirements, null, 2)}\n`,
  );
  for (const [rel, body] of Object.entries(state.pages)) {
    if (body === null) continue;
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    writeFileSync(join(dir, rel), body);
  }
  for (const [rel, body] of Object.entries(state.extra)) {
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    writeFileSync(join(dir, rel), body);
  }
  execSync('git init -q && git add -A && git -c user.email=t@t -c user.name=t commit -qm f', {
    cwd: dir,
    stdio: 'pipe',
  });
  return dir;
}

function check(label, { mutate, exit, expect = [], reject = [] }) {
  const dir = fixture(mutate);
  try {
    const run = spawnSync(process.execPath, [join(dir, 'scripts/check-docs-pages.mjs')], {
      cwd: dir,
      encoding: 'utf8',
      env: { ...process.env, VITAE_DOCS_ROOT: dir },
    });
    const output = `${run.stdout ?? ''}${run.stderr ?? ''}`;
    const wrong = [];
    if (run.status !== exit) wrong.push(`exited ${run.status}, expected ${exit}`);
    for (const t of expect) if (!output.includes(t)) wrong.push(`missing ${JSON.stringify(t)}`);
    for (const t of reject) if (output.includes(t)) wrong.push(`unexpectedly mentions ${JSON.stringify(t)}`);
    if (wrong.length === 0) {
      console.log(`  ok  ${label}`);
      return;
    }
    failures += 1;
    console.error(`  FAIL ${label}: ${wrong.join('; ')}`);
    console.error(output.split('\n').map((l) => `       ${l}`).join('\n'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Replace one line of a page's metadata block. */
const edit = (s, rel, from, to) => {
  if (!s.pages[rel].includes(from)) throw new Error(`fixture no longer contains ${JSON.stringify(from)}`);
  s.pages[rel] = s.pages[rel].replace(from, to);
};
const GRAPH = 'docs/observatory/architecture/graph.md';
const SECTION_PATH = 'docs/observatory/architecture/index.md';

console.log('corpus');
check('a coherent corpus passes', {
  mutate: () => {},
  exit: 0,
  expect: ['docs-pages: ok', '3 page(s)', 'architecture 2'],
});

check('a page written but not yet staged is still judged', {
  // The authoring loop is write, run, fix. A gate that reads only the index
  // gives no feedback on the page being written and blames the page that
  // links to it, which sends the author to the wrong file.
  mutate: (s) => {
    s.pages['docs/observatory/architecture/extra.md'] = null;
    s.extra['docs/observatory/architecture/extra.md'] = PAGE.replace('ARC-GRAPH', 'ARC-EXTRA');
  },
  exit: 1,
  expect: ['extra.md', 'no other page links to it'],
});

console.log('metadata');
check('an unknown field fails', {
  mutate: (s) => edit(s, GRAPH, 'summary:', 'sumary:'),
  exit: 1,
  expect: ['unknown field "sumary"', 'summary is required and is empty'],
});

check('a missing required field fails', {
  mutate: (s) => edit(s, GRAPH, 'audience: [developer, maintainer]\n', ''),
  exit: 1,
  expect: ['audience is required and is empty'],
});

check('an identifier that is not upper-case fails', {
  mutate: (s) => edit(s, GRAPH, 'id: ARC-GRAPH', 'id: arcGraph'),
  exit: 1,
  expect: ['is not an upper-case identifier'],
});

check('two pages claiming one identifier fails', {
  mutate: (s) => edit(s, GRAPH, 'id: ARC-GRAPH', 'id: ARC'),
  exit: 1,
  expect: ['id ARC is already used by'],
});

check('a domain that is not the directory fails', {
  mutate: (s) => edit(s, GRAPH, 'domain: architecture', 'domain: design'),
  exit: 1,
  expect: ['declares domain "design" but sits in architecture/'],
});

check('an audience outside the vocabulary fails', {
  mutate: (s) => edit(s, GRAPH, '[developer, maintainer]', '[developer, engineer]'),
  exit: 1,
  expect: ['audience "engineer" is not one of'],
});

check('a repeated audience fails', {
  mutate: (s) => edit(s, GRAPH, '[developer, maintainer]', '[developer, developer]'),
  exit: 1,
  expect: ['audience repeats a value'],
});

check('a status outside the vocabulary fails', {
  mutate: (s) => edit(s, GRAPH, 'status: verified', 'status: done'),
  exit: 1,
  expect: ['status "done" is not one of'],
});

check('a summary too long for a card fails', {
  mutate: (s) => edit(s, GRAPH, 'summary: A typed', `summary: ${'x'.repeat(210)} A typed`),
  exit: 1,
  expect: ['characters; it appears on cards'],
});

check('a source file that does not exist fails', {
  mutate: (s) => edit(s, GRAPH, 'docs/registry/content-model.json]', 'packages/core/src/nowhere.ts]'),
  exit: 1,
  expect: ['sources names packages/core/src/nowhere.ts, which does not exist'],
});

check('a requirement nobody registered fails', {
  mutate: (s) => edit(s, GRAPH, 'requirements: [FR-001]', 'requirements: [FR-999]'),
  exit: 1,
  expect: ['requirements names FR-999'],
});

console.log('claims');
check('claiming verification without a date fails', {
  mutate: (s) => edit(s, GRAPH, `verified_at: ${TODAY}\n`, ''),
  exit: 1,
  expect: ['claims the page was checked against the code, so verified_at is required'],
});

check('a verification date in the future fails', {
  mutate: (s) => edit(s, GRAPH, `verified_at: ${TODAY}`, `verified_at: ${day(3)}`),
  exit: 1,
  expect: ['is in the future'],
});

check("a date written from a calendar ahead of UTC passes", {
  // Continuous integration runs in UTC. Rejecting the date an author east of
  // it sees on their own calendar would be a gate failing on the timezone
  // rather than on the claim.
  mutate: (s) => edit(s, GRAPH, `verified_at: ${TODAY}`, `verified_at: ${day(1)}`),
  exit: 0,
});

check('a malformed date fails', {
  mutate: (s) => edit(s, GRAPH, `verified_at: ${TODAY}`, 'verified_at: August 2026'),
  exit: 1,
  expect: ['is not a YYYY-MM-DD date'],
});

check('deprecating a page without naming its replacement fails', {
  mutate: (s) => edit(s, GRAPH, 'status: verified', 'status: deprecated'),
  exit: 1,
  expect: ['superseded_by is required'],
});

check('a supersession pointing at no page fails', {
  mutate: (s) => edit(s, GRAPH, 'status: verified', 'status: deprecated\nsuperseded_by: ARC-NEW'),
  exit: 1,
  expect: ['superseded_by names ARC-NEW, which no page declares'],
});

console.log('structure');
check('a heading that does not match the title fails', {
  mutate: (s) => edit(s, GRAPH, '# The career graph\n', '# The graph\n'),
  exit: 1,
  expect: ['but the page opens with "The graph"'],
});

check('a second top-level heading fails', {
  mutate: (s) => edit(s, GRAPH, '## Related', '# Related'),
  exit: 1,
  expect: ['level-one headings'],
});

check('a skipped heading level fails', {
  mutate: (s) => edit(s, GRAPH, '## In short', '#### In short'),
  exit: 1,
  expect: ['do not skip a level'],
});

check('an explanation missing a required section fails', {
  mutate: (s) => edit(s, GRAPH, '## Mechanics\n', ''),
  exit: 1,
  expect: ['must carry exactly these sections, in order', 'In short / How it works / Mechanics / Related'],
});

check('an explanation whose sections are out of order fails', {
  // A reader who meets the contract before the plain-language answer has to
  // already understand the system, which is the failure the order prevents.
  mutate: (s) => {
    edit(s, GRAPH, '## In short', '## MECHANICS-PLACEHOLDER');
    edit(s, GRAPH, '## Mechanics', '## In short');
    edit(s, GRAPH, '## MECHANICS-PLACEHOLDER', '## Mechanics');
  },
  exit: 1,
  expect: ['must carry exactly these sections, in order'],
});

check('an entrance that is not filed as one fails', {
  mutate: (s) => edit(s, GRAPH, 'type: explanation', 'type: index'),
  exit: 1,
  expect: ['type "index" is for a section entrance'],
});

check('an index.md that claims to be a page fails', {
  mutate: (s) => edit(s, SECTION_PATH, 'type: index', 'type: reference'),
  exit: 1,
  expect: ['is a section entrance but declares type "reference"'],
});

check('a page with no metadata block fails', {
  mutate: (s) => {
    s.pages[GRAPH] = s.pages[GRAPH].slice(s.pages[GRAPH].lastIndexOf('---\n') + 4);
  },
  exit: 1,
  expect: ['has no metadata block'],
});

check('a page the parser refuses is reported against itself', {
  mutate: (s) => edit(s, GRAPH, '## In short', '<div class="callout">\n\n## In short'),
  exit: 1,
  expect: ['graph.md', 'raw HTML'],
});

console.log('links');
check('a link to a page that does not exist fails', {
  mutate: (s) => edit(s, SECTION_PATH, '[career graph](graph.md)', '[career graph](nodes.md)'),
  exit: 1,
  expect: ['resolves to docs/observatory/architecture/nodes.md, which is not a tracked page'],
});

check('an anchor that is not a heading on this page fails', {
  mutate: (s) => edit(s, GRAPH, '](index.md#architecture)', '](#nowhere)'),
  exit: 1,
  expect: ['#nowhere is not a heading on this page'],
});

check('an anchor that is not a heading on the target page fails', {
  mutate: (s) => edit(s, GRAPH, '](index.md#architecture)', '](index.md#nowhere)'),
  exit: 1,
  expect: ['#nowhere is not a heading in docs/observatory/architecture/index.md'],
});

check('an application route no page produces and no list promises fails', {
  mutate: (s) => edit(s, GRAPH, '](/docs/search)', '](/docs/reference/api)'),
  exit: 1,
  expect: ['/docs/reference/api, which is not a page and is not listed in app_routes'],
});

check('an app_routes entry the router does not mount fails', {
  mutate: (s) => {
    s.model.app_routes.push('/docs/imaginary');
  },
  exit: 1,
  expect: ['app_routes names /docs/imaginary, which docs/generated/routes.json does not mount'],
});

check('a link the dialect does not support fails with a way out', {
  mutate: (s) => edit(s, GRAPH, '](index.md#architecture)', '](../../../packages/core/src/schema/envelope.ts)'),
  exit: 1,
  expect: ['is not a supported destination', 'sources:'],
});

check('an external link is allowed and never fetched', {
  mutate: () => {},
  exit: 0,
  reject: ['example.invalid'],
});

check('a page nothing leads to fails', {
  mutate: (s) => edit(s, SECTION_PATH, 'The [career graph](graph.md) is the centre of it.', 'Nothing here yet.'),
  exit: 1,
  expect: ['no other page links to it'],
});

check('naming a page in related: is enough to lead a reader there', {
  mutate: (s) => {
    edit(s, SECTION_PATH, 'The [career graph](graph.md) is the centre of it.', 'Nothing here yet.');
    edit(s, SECTION_PATH, 'type: index', 'type: index\nrelated: [ARC-GRAPH]');
  },
  exit: 0,
});

console.log('the model itself');
check('a content model that breaks its own schema fails', {
  mutate: (s) => {
    s.model.statuses.verified.tone = 'loud';
  },
  exit: 1,
  expect: ['docs/registry/content-model.json:', 'loud'],
});

// The page header prints `label` and the search facets print `note`. When two
// of the three vocabularies were bare strings, the header had no way to tell a
// name from a definition and printed the definition on every page.
check('a vocabulary entry that is a bare string, not a label and a note, fails', {
  mutate: (s) => {
    s.model.types.explanation = 'Builds understanding of something that already exists.';
  },
  exit: 1,
  expect: ['docs/registry/content-model.json:', 'types'],
});

check('a missing content model is reported, not crashed on', {
  mutate: (s, dir) => {
    rmSync(join(dir, 'docs/registry/content-model.json'));
    s.model = null;
  },
  exit: 1,
  expect: ['docs/registry/content-model.json: missing'],
  reject: ['ReferenceError'],
});

if (failures) {
  console.error(`\ncheck-docs-pages selftest: ${failures} case(s) failed`);
  process.exit(1);
}
console.log('check-docs-pages selftest: ok');
