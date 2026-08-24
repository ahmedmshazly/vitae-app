#!/usr/bin/env node
/**
 * Compile the curated corpus into what the reading surface fetches.
 *
 * The output is static JSON under `apps/web/public/`, not a JavaScript module,
 * and that is a deliberate constraint rather than a convenience. The web
 * bundle is held to a size budget that counts `dist/assets/*.js`; a corpus
 * this size compiled into a chunk would breach it on the day it landed. Static
 * JSON also forces the reading surface to have real loading, empty and
 * unavailable states instead of pretending content is always present, and it
 * means the documentation is served by the same static host as the shell, with
 * no dependency on the API being up.
 *
 * Two shapes come out of it:
 *
 *   manifest.json          everything needed to draw navigation, badges,
 *                          breadcrumbs and reading order for the whole corpus,
 *                          fetched once
 *   pages/<path>.json      one page's blocks, headings and relations, fetched
 *                          when a reader opens it
 *   search-text.json       every page's prose as plain text, fetched once when
 *                          a reader searches
 *
 * The generated catalogs are copied out alongside them, unchanged. They are
 * the other half of the documentation: prose explains why something is the way
 * it is, and these answer what exists. Copying rather than transforming is
 * deliberate — the reading surface shows whatever the artifact holds, including
 * fields nobody thought to give a column, so this surface cannot under-report
 * the file it reads.
 *
 * A diagram is a third thing. `docs/registry/diagrams/*.json` declares them,
 * and a page names one in a ```diagram fence. The specification is folded into
 * the page here rather than fetched separately: a diagram is part of the
 * sentence around it, and a reader should never watch one arrive after the
 * prose that refers to it.
 *
 * The one transformation that matters is links. A page links to its neighbour
 * by relative Markdown path so that it reads correctly on the repository host
 * as well as in the application; the renderer receives only a block tree and
 * has no idea where the page it came from lived. So every intra-corpus link is
 * resolved to an application route here, once, at build time.
 *
 * Usage: node scripts/docs/build-content.mjs [--out <dir>] [--quiet]
 */
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, normalize, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { classifyLink, readCorpus } from './lib/corpus.mjs';
import { blockText } from './lib/markdown.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = process.env.VITAE_DOCS_ROOT ? process.env.VITAE_DOCS_ROOT : join(here, '../..');

const args = process.argv.slice(2);
const quiet = args.includes('--quiet');
const outIndex = args.indexOf('--out');
const outDir =
  outIndex === -1 ? join(root, 'apps/web/public/docs-content') : join(root, args[outIndex + 1]);

const model = JSON.parse(readFileSync(join(root, 'docs/registry/content-model.json'), 'utf8'));
const CORPUS = model.corpus;

const pages = readCorpus(root, CORPUS);
const broken = pages.filter((p) => p.error || p.data === null);
if (broken.length) {
  console.error('Cannot compile the corpus:');
  for (const p of broken) console.error(`  - ${p.rel}: ${p.error ?? 'no metadata block'}`);
  console.error('\nRun `node scripts/check-docs-pages.mjs` for the full report.');
  process.exit(1);
}

const byId = new Map(pages.map((p) => [p.data.id, p]));
const byPath = new Map(pages.map((p) => [p.rel, p]));

/**
 * Reading order: the corpus entrance, then each domain in the order the
 * content model gives it, entrance first and its pages after. Within a domain
 * an explicit `order` wins and a title breaks the tie, so a section can be
 * sequenced deliberately without every page having to declare a number.
 */
function readingOrder() {
  const rootPages = pages.filter((p) => p.directory === null);
  const entrance = rootPages.find((p) => p.rel === `${CORPUS}/index.md`);
  const loose = rootPages.filter((p) => p !== entrance).sort(compare);
  const ordered = entrance ? [entrance] : [];
  const domains = Object.entries(model.domains).sort((a, b) => a[1].order - b[1].order);
  for (const [key] of domains) {
    const inDomain = pages.filter((p) => p.directory === key);
    const head = inDomain.find((p) => p.rel.endsWith('/index.md'));
    if (head) ordered.push(head);
    ordered.push(...inDomain.filter((p) => p !== head).sort(compare));
  }
  // A page in a directory the content model does not name cannot reach the
  // navigation, so it would silently vanish from the corpus rather than fail.
  const placed = new Set(ordered);
  const stranded = pages.filter((p) => !placed.has(p) && !loose.includes(p));
  if (stranded.length) {
    console.error(`Pages in a directory the content model does not name: ${stranded.map((p) => p.rel).join(', ')}`);
    process.exit(1);
  }
  return [...ordered, ...loose];
}

function compare(a, b) {
  const oa = a.data.order ?? Number.MAX_SAFE_INTEGER;
  const ob = b.data.order ?? Number.MAX_SAFE_INTEGER;
  if (oa !== ob) return oa - ob;
  return a.data.title.localeCompare(b.data.title, 'en');
}

/**
 * Every declared diagram, by identifier.
 *
 * Read once. A page that names one that does not exist is a build failure
 * rather than an empty box at the bottom of a paragraph explaining it.
 */
const DIAGRAMS = 'docs/registry/diagrams';
const diagrams = new Map();
try {
  for (const file of readdirSync(join(root, DIAGRAMS)).sort()) {
    if (!file.endsWith('.json')) continue;
    const spec = JSON.parse(readFileSync(join(root, DIAGRAMS, file), 'utf8'));
    delete spec.$schema;
    diagrams.set(spec.id, spec);
  }
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}

/** The words a diagram contributes to the search index. */
function diagramText(spec) {
  const out = [spec.title, spec.summary, spec.note ?? ''];
  for (const key of ['actors', 'states', 'zones', 'nodes', 'lanes', 'phases']) {
    for (const item of spec[key] ?? []) out.push(item.label, item.note ?? '');
  }
  for (const key of ['steps', 'transitions', 'links']) {
    for (const item of spec[key] ?? []) out.push(item.label, item.note ?? '');
  }
  return out.filter(Boolean).join(' ');
}

/** Where a page's compiled JSON lives, mirroring its path in the corpus. */
const contentPath = (page) => `pages/${page.rel.slice(CORPUS.length + 1).replace(/\.md$/, '.json')}`;

/** Rewrite one link so the renderer can follow it without knowing its origin. */
function resolveHref(href, page) {
  const { kind, target, anchor } = classifyLink(href);
  if (kind !== 'page') return href;
  const rel = normalize(join(dirname(page.rel), target));
  const destination = byPath.get(rel);
  if (!destination) {
    console.error(`${page.rel}: link to ${target} resolves to ${rel}, which is not a page.`);
    process.exit(1);
  }
  return anchor ? `${destination.route}#${anchor}` : destination.route;
}

/**
 * Walk a block tree, rewriting every link and folding in every diagram.
 *
 * Blocks are small; recursion is fine.
 */
function resolveBlocks(node, page) {
  if (Array.isArray(node)) return node.map((n) => resolveBlocks(n, page));
  if (!node || typeof node !== 'object') return node;
  if (node.type === 'diagram') {
    const spec = diagrams.get(node.id);
    if (!spec) {
      console.error(`${page.rel}: names diagram ${node.id}, which ${DIAGRAMS}/ does not declare.`);
      process.exit(1);
    }
    return { type: 'diagram', id: node.id, spec };
  }
  const out = {};
  for (const [key, value] of Object.entries(node)) {
    if (key === 'href' && typeof value === 'string') out[key] = resolveHref(value, page);
    else out[key] = resolveBlocks(value, page);
  }
  return out;
}

const link = (id) => {
  const p = byId.get(id);
  return p ? { id, route: p.route, title: p.data.title, summary: p.data.summary } : null;
};
const links = (value) =>
  (Array.isArray(value) ? value : value === undefined ? [] : [value]).map(link).filter(Boolean);

const ordered = readingOrder();

const manifestPages = ordered.map((page) => ({
  id: page.data.id,
  route: page.route,
  content: contentPath(page),
  source: page.rel,
  title: page.data.title,
  summary: page.data.summary,
  audience: page.data.audience,
  domain: page.data.domain,
  // The section is the directory, which is what navigation groups by. It
  // agrees with `domain` for every page the gate accepts except the two at the
  // corpus root, which declare a domain but belong to no section.
  section: page.directory,
  type: page.data.type,
  status: page.data.status,
  ...(page.data.verified_at ? { verified_at: page.data.verified_at } : {}),
}));

const manifest = {
  generated_by: 'scripts/docs/build-content.mjs',
  note: 'Compiled from docs/observatory. Do not edit; run `pnpm docs:build`.',
  corpus: CORPUS,
  audiences: model.audiences,
  domains: Object.entries(model.domains)
    .sort((a, b) => a[1].order - b[1].order)
    .map(([key, domain]) => ({
      key,
      title: domain.title,
      summary: domain.summary,
      route: `/docs/${key}`,
      // A domain with no entrance has no page at its own route, so the
      // navigation has to lead somewhere else rather than offer a dead link.
      entrance: pages.some((p) => p.rel === `${CORPUS}/${key}/index.md`),
      pages: manifestPages.filter((p) => p.section === key && p.route !== `/docs/${key}`).length,
    }))
    .filter((domain) => manifestPages.some((p) => p.section === domain.key)),
  types: model.types,
  statuses: model.statuses,
  // In reading order, so previous and next are this array's neighbours and the
  // surface never has to re-derive a sequence the build already decided.
  pages: manifestPages,
};

/**
 * Everything this run wrote, so that stale files can be swept afterwards.
 *
 * The output directory used to be deleted first, which is the obvious way to
 * drop a page that has been renamed. It is also a window in which the directory
 * does not exist, and there are two builders: this script, and the dev server's
 * watcher running this script. Editing a page while the server was up made both
 * run at once, and whichever deleted the tree second removed files the first
 * was still writing into. Writing first and sweeping afterwards removes the
 * window: two concurrent runs now overwrite identical bytes.
 */
const written = new Set();
const emit = (rel, body) => {
  const file = join(outDir, rel);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, body);
  written.add(file);
};

mkdirSync(outDir, { recursive: true });
emit('manifest.json', `${JSON.stringify(manifest, null, 2)}\n`);

for (const page of ordered) {
  // The title is rendered from metadata, so leaving its heading in the blocks
  // would print it twice and give the page two level-one headings.
  const blocks = page.blocks.filter((b, i) => !(i === 0 && b.type === 'heading' && b.level === 1));
  emit(
    contentPath(page),
    `${JSON.stringify(
      {
        id: page.data.id,
        route: page.route,
        source: page.rel,
        title: page.data.title,
        summary: page.data.summary,
        audience: page.data.audience,
        domain: page.data.domain,
        type: page.data.type,
        status: page.data.status,
        ...(page.data.verified_at ? { verified_at: page.data.verified_at } : {}),
        sources: page.data.sources ?? [],
        requirements: page.data.requirements ?? [],
        related: links(page.data.related),
        supersedes: links(page.data.supersedes),
        superseded_by: links(page.data.superseded_by),
        headings: page.headings.filter((h) => h.level > 1 && h.level < 4),
        blocks: resolveBlocks(blocks, page),
      },
      null,
      2,
    )}\n`,
  );
}

/**
 * The prose of every page, for the search surface to index.
 *
 * Text rather than a finished index, which is the opposite of what a build
 * step usually emits. The reason is that the index and the query have to agree
 * on what a word is, and that agreement lives in `@vitae/core`'s tokenizer,
 * which is TypeScript this script cannot load. Emitting text and building the
 * index in the browser means one tokenizer, used by both halves at the same
 * moment, instead of two that agree until one is changed. The corpus is small
 * enough that the difference costs a few milliseconds once per session.
 */
emit(
  'search-text.json',
  `${JSON.stringify({
    version: 1,
    pages: ordered.map((page) => ({
      id: page.data.id,
      headings: page.headings.filter((h) => h.level > 1 && h.level < 4),
      text: [
        blockText(page.blocks.filter((b, i) => !(i === 0 && b.type === 'heading' && b.level === 1))),
        // A diagram carries real words — actor names, transitions, trust
        // zones — and a reader searching for one of them should find the page
        // that shows it, not only the pages that spell it out in prose.
        ...page.blocks
          .filter((b) => b.type === 'diagram')
          .map((b) => (diagrams.has(b.id) ? diagramText(diagrams.get(b.id)) : '')),
      ]
        .filter(Boolean)
        .join(' '),
    })),
  })}\n`,
);

/**
 * The generated catalogs, copied out for the reference surface.
 *
 * Static JSON for the same reason the pages are: it is fetched only when a
 * reader opens that catalog, and it never enters the JavaScript budget. The
 * requirement register comes from the registry rather than from
 * `docs/generated/`, because it is curated — the identifiers were adopted from
 * the code that already cited them, and a generator would have nothing to
 * derive the wording from.
 */
const CATALOG_FILES = [
  'docs/generated/routes.json',
  'docs/generated/api.json',
  'docs/generated/config.json',
  'docs/generated/algorithms.json',
  'docs/generated/database.json',
  'docs/generated/tokens.json',
  'docs/generated/components.json',
  'docs/generated/packages.json',
  'docs/generated/tests.json',
  'docs/generated/traceability.json',
  // Generated at build time and never committed: a rename would rewrite
  // thousands of lines of diff. Absent in a checkout that has not run
  // `pnpm docs:gen`, which the reading surface reports rather than hides.
  'docs/generated/atlas.json',
  'docs/registry/requirements.json',
];

mkdirSync(join(outDir, 'reference'), { recursive: true });
const copied = [];
for (const rel of CATALOG_FILES) {
  const from = join(root, rel);
  if (!existsSync(from)) {
    // A build without `pnpm docs:gen` is a legitimate build; the catalog it is
    // missing reports itself unavailable rather than taking the page down.
    console.warn(`docs-content: ${rel} is absent, so its catalog will be unavailable.`);
    continue;
  }
  const to = join(outDir, 'reference', rel.split('/').pop());
  copyFileSync(from, to);
  written.add(to);
  copied.push(rel);
}

/** Anything left from a previous run that this one did not write. */
function sweep(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      sweep(path);
      if (readdirSync(path).length === 0) rmSync(path, { recursive: true, force: true });
      continue;
    }
    if (!written.has(path)) rmSync(path, { force: true });
  }
}
if (statSync(outDir).isDirectory()) sweep(outDir);

if (!quiet) {
  console.log(
    `docs-content: ${ordered.length} page(s) in ${manifest.domains.length} section(s), `
      + `${diagrams.size} diagram(s), ${copied.length} catalog(s) -> ${relative(root, outDir)}`,
  );
}
