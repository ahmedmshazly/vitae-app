#!/usr/bin/env node
/**
 * Fail when a curated page does not obey the content model.
 *
 * The plan for this work named two gates, one for metadata and one for links.
 * They are one gate here, for the reason `frontmatter.mjs` and `corpus.mjs`
 * exist at all: both have to read every page, and two readers of the same page
 * eventually disagree. A page whose metadata block will not parse also
 * produces a cascade of meaningless link failures, so the checks are ordered
 * instead of separated — a page that cannot be read is reported once and its
 * links are not judged.
 *
 * What it enforces:
 *
 *   metadata   every required field present, every value in a closed
 *              vocabulary, `domain` matching the directory the page is in,
 *              every `sources:` path present in the repository, every
 *              `requirements:` identifier registered, `verified_at` present
 *              and not in the future wherever a page claims to be checked
 *
 *   structure  a page opens with one level-one heading carrying its title, so
 *              the title cannot drift from what a reader sees; headings do not
 *              skip a level; a page of type `explanation` carries the four
 *              sections the content model names, in order, so a reader reaches
 *              a plain-language answer before any contract or formula
 *
 *   links      an anchor resolves to a heading that exists on the page it
 *              points at; an intra-corpus link is a relative `.md` path, so it
 *              resolves both in the application and on the repository host; a
 *              `/docs/...` link names a route the application actually mounts;
 *              every page other than a section entrance is linked from
 *              somewhere, so nothing is reachable only by knowing it is there
 *
 * VITAE_DOCS_ROOT points the gate at a fixture tree; the self-test sets it.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertKnownKeywords, validate } from './docs/lib/json-schema.mjs';
import { classifyLink, readCorpus, titleHeading } from './docs/lib/corpus.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = process.env.VITAE_DOCS_ROOT ? process.env.VITAE_DOCS_ROOT : join(here, '..');
const problems = [];
const fail = (where, message) => problems.push(`${where}: ${message}`);

function readJson(rel, { required = true } = {}) {
  const abs = join(root, rel);
  if (!existsSync(abs)) {
    if (required) fail(rel, 'missing');
    return null;
  }
  try {
    return JSON.parse(readFileSync(abs, 'utf8'));
  } catch (error) {
    fail(rel, `is not valid JSON (${error.message})`);
    return null;
  }
}

// 1. The content model itself ------------------------------------------------
const model = readJson('docs/registry/content-model.json');
const modelSchema = readJson('docs/registry/schema/content-model.schema.json');
if (model && modelSchema) {
  for (const kw of assertKnownKeywords(modelSchema)) {
    fail('docs/registry/schema/content-model.schema.json', `unsupported keyword ${kw}`);
  }
  for (const error of validate(modelSchema, model)) fail('docs/registry/content-model.json', error);
}
if (!model || problems.length) {
  report([]);
}

const CORPUS = model.corpus;
const known = {
  audience: new Set(Object.keys(model.audiences)),
  domain: new Set(Object.keys(model.domains)),
  type: new Set(Object.keys(model.types)),
  status: new Set(Object.keys(model.statuses)),
};
const fields = {
  required: model.fields.required,
  all: new Set([...model.fields.required, ...model.fields.optional]),
};

const requirementIds = new Set(
  (readJson('docs/registry/requirements.json')?.requirements ?? []).map((r) => r.id),
);
const mountedRoutes = new Set(
  (readJson('docs/generated/routes.json')?.routes ?? []).map((r) => r.path),
);

// A route promised here but never mounted is a link the reader follows into
// nothing, and the promise is easier to write than the route.
for (const path of model.app_routes) {
  if (!mountedRoutes.has(path)) {
    fail('docs/registry/content-model.json', `app_routes names ${path}, which docs/generated/routes.json does not mount`);
  }
}

// 2. Every page on its own ---------------------------------------------------
const pages = readCorpus(root, CORPUS);
const byId = new Map();
const byRoute = new Map();
const byPath = new Map(pages.map((p) => [p.rel, p]));
const readable = [];

const ID = /^[A-Z][A-Z0-9]*(-[A-Z0-9]+)*$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
// `verified_at` is a date a person wrote off their own calendar, and this gate
// runs in UTC in CI. Comparing against UTC midnight rejects a date that is
// genuinely today for every author east of it. The check is here to catch a
// wrong month or year, not to arbitrate a timezone, so it allows one day.
const horizon = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);

for (const page of pages) {
  const { rel } = page;
  if (page.error) {
    fail(rel, page.error);
    continue;
  }
  if (page.data === null) {
    fail(rel, 'has no metadata block. Every page in the corpus declares what it is.');
    continue;
  }
  readable.push(page);
  const data = page.data;

  for (const key of Object.keys(data)) {
    if (!fields.all.has(key)) {
      fail(rel, `unknown field "${key}". Known: ${[...fields.all].sort().join(', ')}.`);
    }
  }
  for (const key of fields.required) {
    const value = data[key];
    const empty = value === undefined || value === '' || (Array.isArray(value) && value.length === 0);
    if (empty) fail(rel, `${key} is required and is empty`);
  }

  if (typeof data.id === 'string' && !ID.test(data.id)) {
    fail(rel, `id ${JSON.stringify(data.id)} is not an upper-case identifier such as ARC-DATA-MODEL`);
  }
  if (typeof data.id === 'string') {
    if (byId.has(data.id)) fail(rel, `id ${data.id} is already used by ${byId.get(data.id).rel}`);
    else byId.set(data.id, page);
  }
  if (byRoute.has(page.route)) {
    fail(rel, `answers ${page.route}, which ${byRoute.get(page.route).rel} already answers`);
  } else byRoute.set(page.route, page);

  // The directory is the navigation, so a page that declares a different
  // domain would be filed in one place and listed in another.
  if (page.directory === null) {
    if (data.domain !== undefined && !known.domain.has(data.domain)) {
      fail(rel, `domain "${data.domain}" is not one of ${[...known.domain].sort().join(', ')}`);
    }
  } else if (data.domain !== page.directory) {
    fail(rel, `declares domain "${data.domain}" but sits in ${page.directory}/`);
  }

  for (const value of data.audience ?? []) {
    if (!known.audience.has(value)) {
      fail(rel, `audience "${value}" is not one of ${[...known.audience].sort().join(', ')}`);
    }
  }
  if (Array.isArray(data.audience) && new Set(data.audience).size !== data.audience.length) {
    fail(rel, 'audience repeats a value');
  }
  if (data.type !== undefined && !known.type.has(data.type)) {
    fail(rel, `type "${data.type}" is not one of ${[...known.type].sort().join(', ')}`);
  }
  if (data.status !== undefined && !known.status.has(data.status)) {
    fail(rel, `status "${data.status}" is not one of ${[...known.status].sort().join(', ')}`);
  }
  if (typeof data.summary === 'string' && data.summary.length > 200) {
    fail(rel, `summary is ${data.summary.length} characters; it appears on cards and in search results, so keep it under 200`);
  }

  for (const source of data.sources ?? []) {
    if (!existsSync(join(root, String(source)))) {
      fail(rel, `sources names ${source}, which does not exist`);
    }
  }
  for (const id of data.requirements ?? []) {
    if (requirementIds.size > 0 && !requirementIds.has(String(id))) {
      fail(rel, `requirements names ${id}, which docs/registry/requirements.json does not define`);
    }
  }

  const claimsChecked = data.status === 'verified' || data.status === 'partial';
  if (claimsChecked && data.verified_at === undefined) {
    fail(rel, `status "${data.status}" claims the page was checked against the code, so verified_at is required`);
  }
  if (data.verified_at !== undefined) {
    const value = String(data.verified_at);
    if (!DATE.test(value)) fail(rel, `verified_at ${JSON.stringify(value)} is not a YYYY-MM-DD date`);
    else if (value > horizon) fail(rel, `verified_at ${value} is past ${horizon}, so it is in the future`);
  }
  if (data.status === 'deprecated' && data.superseded_by === undefined) {
    fail(rel, 'a deprecated page exists so its links keep resolving, so superseded_by is required');
  }

  // -- structure -------------------------------------------------------------
  const title = titleHeading(page);
  if (!title) {
    fail(rel, 'has no heading. A page opens with `# ` carrying its title.');
  } else if (title.level !== 1) {
    fail(rel, `opens with a level-${title.level} heading; a page opens with \`# \``);
  } else if (title.text !== data.title) {
    fail(rel, `title is ${JSON.stringify(data.title)} but the page opens with ${JSON.stringify(title.text)}`);
  }
  const h1s = page.headings.filter((h) => h.level === 1);
  if (h1s.length > 1) {
    fail(rel, `has ${h1s.length} level-one headings; the title is the only one`);
  }
  let previous = 1;
  for (const heading of page.headings) {
    if (heading.level > previous + 1) {
      fail(rel, `heading "${heading.text}" is level ${heading.level} under a level ${previous}; do not skip a level`);
    }
    previous = heading.level;
  }

  const isEntrance = rel.endsWith('/index.md');
  if (data.type === 'index' && !isEntrance) {
    fail(rel, 'type "index" is for a section entrance; name the file index.md or give it another type');
  }
  if (data.type !== 'index' && isEntrance) {
    fail(rel, `is a section entrance but declares type "${data.type}"; an index.md is type "index"`);
  }

  const required = model.sections[data.type];
  if (required) {
    const actual = page.headings.filter((h) => h.level === 2).map((h) => h.text);
    if (JSON.stringify(actual) !== JSON.stringify(required)) {
      fail(rel, `type "${data.type}" must carry exactly these sections, in order — ${required.join(' / ')} `
        + `— but has ${actual.length ? actual.join(' / ') : '(none)'}`);
    }
  }
}

// 3. Everything that needs the whole corpus ----------------------------------
const referenced = new Set();

for (const page of readable) {
  const { rel, data } = page;

  for (const key of ['supersedes', 'superseded_by', 'related']) {
    const value = data[key];
    for (const id of Array.isArray(value) ? value : value === undefined ? [] : [value]) {
      if (!byId.has(String(id))) fail(rel, `${key} names ${id}, which no page declares`);
      else referenced.add(String(id));
    }
  }

  for (const link of page.links) {
    const where = `${rel}:${link.line}`;
    const { kind, target, anchor } = classifyLink(link.href);

    if (kind === 'unsupported') {
      fail(where, `link to ${JSON.stringify(link.href)} is not a supported destination. `
        + 'Link a corpus page by relative .md path, an application route as /docs/..., '
        + 'or cite a source file through the sources: field or inline code.');
      continue;
    }
    if (kind === 'external' || kind === 'mail') continue;
    if (kind === 'route') {
      if (!model.app_routes.includes(target)) {
        fail(where, `link to ${target}, which is not a page and is not listed in app_routes`);
      }
      continue;
    }
    if (kind === 'anchor') {
      if (!page.anchors.has(anchor)) fail(where, `#${anchor} is not a heading on this page`);
      continue;
    }

    const resolved = normalize(join(dirname(rel), target));
    const destination = byPath.get(resolved);
    if (!destination) {
      fail(where, `link to ${target} resolves to ${resolved}, which is not a tracked page in the corpus`);
      continue;
    }
    if (destination.error) continue; // Already reported against the page itself.
    if (anchor && !destination.anchors.has(anchor)) {
      fail(where, `#${anchor} is not a heading in ${resolved}`);
    }
    if (destination.data?.id) referenced.add(String(destination.data.id));
  }
}

for (const page of readable) {
  // A section entrance is reached from the navigation by construction. Every
  // other page has to be worth linking to from somewhere, or the corpus is a
  // pile of pages that happen to share a directory.
  if (page.rel.endsWith('/index.md') || page.rel === `${CORPUS}/index.md`) continue;
  const id = page.data?.id;
  if (id && !referenced.has(String(id))) {
    fail(page.rel, 'no other page links to it. Link it from a page that would lead a reader here, '
      + 'or name it in that page\'s related: field.');
  }
}

report(pages);

// The page list is a parameter rather than a closed-over binding because the
// first caller runs before `const pages` is initialised, and reading it there
// would throw a reference error in place of the report it was about to print.
function report(read) {
  if (problems.length) {
    console.error(`Documentation pages (${problems.length} problem(s)):`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  const domains = new Map();
  for (const page of read) {
    const key = page.directory ?? '(root)';
    domains.set(key, (domains.get(key) ?? 0) + 1);
  }
  const counts = [...domains].sort().map(([d, n]) => `${d} ${n}`).join(', ');
  console.log(`docs-pages: ok (${read.length} page(s)${counts ? `: ${counts}` : ''})`);
  process.exit(0);
}
