/**
 * What the compiled corpus is, and every question it can answer on its own.
 *
 * `scripts/docs/build-content.mjs` compiles `docs/observatory/**` into
 * `public/docs-content/`: one manifest naming every page in reading order, and
 * one JSON file per page holding its typed blocks. Nothing here parses
 * Markdown, resolves a link or decides an order — all of that happened at build
 * time, where a mistake fails a gate instead of a reader's screen.
 *
 * The types below are hand-written against that output rather than generated
 * from it. A generated type would agree with the builder by construction and
 * so could never disagree with it, which is the entire value: when the two
 * drift, `pnpm --filter @vitae/web typecheck` is the thing that notices.
 *
 * This module holds no I/O. Fetching lives next door in `docsContent.ts`, and
 * the split is what lets two very different renderers share one set of rules:
 * the React reader in the browser, and the build plugin that prerenders every
 * page into static HTML from Node, where `fetch`, `import.meta.env` and a
 * query client are all either absent or beside the point. A breadcrumb, a
 * reading order and a status label are decided in exactly one place, so the
 * document a reader gets with JavaScript disabled cannot disagree with the
 * one they get with it enabled.
 */

/** Who a page is written for. Keys of `manifest.audiences`. */
export type DocsAudience = 'user' | 'designer' | 'developer' | 'maintainer' | 'operator' | 'security';

/** What kind of page it is. Keys of `manifest.types`. */
export type DocsType = 'index' | 'explanation' | 'tutorial' | 'task' | 'reference' | 'decision';

/** What the page claims about the thing it describes. Keys of `manifest.statuses`. */
export type DocsStatus =
  | 'verified'
  | 'partial'
  | 'planned'
  | 'gated'
  | 'deprecated'
  | 'historical'
  | 'generated'
  | 'needs-review';

/** How a status reads at a glance. Drives the badge, never on its own. */
export type DocsTone = 'positive' | 'caution' | 'neutral';

/**
 * One entry in a closed vocabulary.
 *
 * Audiences, types and statuses all carry a name a surface may print and a
 * sentence saying what the term means. Before they shared a shape, two of the
 * three were bare strings and the page header printed a whole definition where
 * a name belonged, because nothing in the type said which of the two it held.
 */
export interface DocsTermMeta {
  label: string;
  note: string;
}

export interface DocsStatusMeta extends DocsTermMeta {
  tone: DocsTone;
}

/** A page as the manifest lists it: enough to navigate, not enough to read. */
export interface DocsPageSummary {
  id: string;
  route: string;
  /** Path of the page's content file, relative to the content root. */
  content: string;
  /** Repository path of the Markdown this was compiled from. */
  source: string;
  title: string;
  summary: string;
  audience: readonly DocsAudience[];
  domain: string;
  /** The directory the page sits in, or null for the two at the corpus root. */
  section: string | null;
  type: DocsType;
  status: DocsStatus;
  verified_at?: string;
}

export interface DocsDomain {
  key: string;
  title: string;
  summary: string;
  route: string;
  /** Does the section have an `index.md` of its own to land on? */
  entrance: boolean;
  pages: number;
}

export interface DocsManifest {
  corpus: string;
  audiences: Readonly<Record<string, DocsTermMeta>>;
  domains: readonly DocsDomain[];
  types: Readonly<Record<string, DocsTermMeta>>;
  statuses: Readonly<Record<string, DocsStatusMeta>>;
  /** Every page, in reading order. Neighbours in this array are prev and next. */
  pages: readonly DocsPageSummary[];
}

// ---------------------------------------------------------------------------
// The block model, mirroring scripts/docs/lib/markdown.mjs
// ---------------------------------------------------------------------------

export type DocsInline =
  | { type: 'text'; value: string }
  | { type: 'code'; value: string }
  | { type: 'strong'; children: readonly DocsInline[] }
  | { type: 'em'; children: readonly DocsInline[] }
  | { type: 'link'; href: string; children: readonly DocsInline[] }
  | { type: 'image'; src: string; alt: string };

export type DocsAlign = 'left' | 'center' | 'right' | null;

/** Callout tones are GitHub's alert vocabulary, which the parser accepts. */
export type DocsCalloutTone = 'note' | 'tip' | 'important' | 'warning' | 'caution';

export type DocsBlock =
  | { type: 'heading'; level: number; id: string; text: string; children: readonly DocsInline[] }
  | { type: 'paragraph'; children: readonly DocsInline[] }
  | { type: 'code'; lang: string | null; code: string }
  | { type: 'rule' }
  | { type: 'callout'; tone: DocsCalloutTone; children: readonly DocsBlock[] }
  | { type: 'quote'; children: readonly DocsBlock[] }
  | { type: 'list'; ordered: boolean; items: readonly (readonly DocsBlock[])[] }
  | {
      type: 'table';
      align: readonly DocsAlign[];
      head: readonly (readonly DocsInline[])[];
      rows: readonly (readonly (readonly DocsInline[])[])[];
    }
  | { type: 'figure'; src: string; caption: string };

export interface DocsHeading {
  level: number;
  id: string;
  text: string;
}

/** A cross-reference the builder resolved from a page id to somewhere to go. */
export interface DocsReference {
  id: string;
  route: string;
  title: string;
  summary: string;
}

/** A page as the reader gets it. */
export interface DocsPageContent {
  id: string;
  route: string;
  source: string;
  title: string;
  summary: string;
  audience: readonly DocsAudience[];
  domain: string;
  type: DocsType;
  status: DocsStatus;
  verified_at?: string;
  /** Repository paths this page's claims were checked against. */
  sources: readonly string[];
  /** Requirement identifiers this page documents. */
  requirements: readonly string[];
  related: readonly DocsReference[];
  supersedes: readonly DocsReference[];
  superseded_by: readonly DocsReference[];
  /** Level 2 and 3 headings, for the contextual table of contents. */
  headings: readonly DocsHeading[];
  /** The body, with the title heading already removed. */
  blocks: readonly DocsBlock[];
}

// ---------------------------------------------------------------------------
// Questions the manifest can answer without fetching anything
// ---------------------------------------------------------------------------

/** Tone words a reader sees. The parser accepts GitHub's alert vocabulary. */
export const CALLOUT_LABEL: Record<DocsCalloutTone, string> = {
  note: 'Note',
  tip: 'Tip',
  important: 'Important',
  warning: 'Warning',
  caution: 'Caution',
};

/**
 * Does this link leave the application?
 *
 * The builder has already turned every intra-corpus reference into an
 * application route, so anything still carrying a scheme is somewhere else.
 * Both renderers ask, and both have to get the same answer: the React reader
 * to decide whether to open a new tab, the prerenderer to decide whether to
 * mark the link `noreferrer`.
 */
export function isExternalDocsLink(href: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(href);
}

/**
 * How a page title reads as a document title.
 *
 * The React reader applies this on navigation; the build plugin bakes it into
 * every prerendered page. Two callers, one rule, so the tab is titled the same
 * whether or not the script ran.
 */
export const DOCS_TITLE_SUFFIX = 'Vitae documentation';

export function docsDocumentTitle(title: string): string {
  // The corpus entrance is itself called "Vitae documentation", so appending
  // unconditionally titled that tab "Vitae documentation · Vitae
  // documentation". A page whose title already ends in the suffix keeps it.
  return title.endsWith(DOCS_TITLE_SUFFIX) ? title : `${title} · ${DOCS_TITLE_SUFFIX}`;
}

/** Trailing slashes are a URL detail; the manifest holds one spelling. */
export function normalizeDocsRoute(pathname: string): string {
  const trimmed = pathname.replace(/\/+$/, '');
  return trimmed === '' ? '/' : trimmed;
}

export function pageAtRoute(manifest: DocsManifest, pathname: string): DocsPageSummary | null {
  const route = normalizeDocsRoute(pathname);
  return manifest.pages.find((page) => page.route === route) ?? null;
}

export function pageById(manifest: DocsManifest, id: string): DocsPageSummary | null {
  return manifest.pages.find((page) => page.id === id) ?? null;
}

/** The pages filed under one section, in reading order, entrance excluded. */
export function sectionPages(manifest: DocsManifest, key: string): DocsPageSummary[] {
  return manifest.pages.filter((page) => page.section === key && page.type !== 'index');
}

export function sectionEntrance(manifest: DocsManifest, key: string): DocsPageSummary | null {
  return manifest.pages.find((page) => page.section === key && page.type === 'index') ?? null;
}

export function domainOf(manifest: DocsManifest, key: string | null): DocsDomain | null {
  if (key === null) return null;
  return manifest.domains.find((domain) => domain.key === key) ?? null;
}

export interface DocsNeighbours {
  previous: DocsPageSummary | null;
  next: DocsPageSummary | null;
}

/**
 * What comes before and after in reading order. The manifest is already in
 * that order, so this is array arithmetic rather than a traversal — which is
 * the point of the builder emitting an ordered list instead of a tree.
 */
export function neighbours(manifest: DocsManifest, page: DocsPageSummary): DocsNeighbours {
  const index = manifest.pages.findIndex((p) => p.id === page.id);
  if (index === -1) return { previous: null, next: null };
  return {
    previous: manifest.pages[index - 1] ?? null,
    next: manifest.pages[index + 1] ?? null,
  };
}

export interface DocsCrumb {
  label: string;
  route: string;
}

/**
 * Documentation → section → page. The section step is dropped when the reader
 * is already on the section's own entrance, so a breadcrumb never links to the
 * page it is drawn on.
 */
export function breadcrumbs(manifest: DocsManifest, page: DocsPageSummary): DocsCrumb[] {
  const trail: DocsCrumb[] = [{ label: 'Documentation', route: '/docs' }];
  if (page.route === '/docs') return trail;
  const domain = domainOf(manifest, page.section);
  if (domain && domain.route !== page.route) {
    trail.push({ label: domain.title, route: domain.route });
  }
  trail.push({ label: page.title, route: page.route });
  return trail;
}

/** The status vocabulary, with a fallback so an unknown value still renders. */
export function statusMeta(manifest: DocsManifest, status: string): DocsStatusMeta {
  return (
    manifest.statuses[status] ?? {
      label: status,
      tone: 'neutral',
      note: 'This status is not one the content model defines.',
    }
  );
}

/**
 * A term from one of the two plain vocabularies, with a readable fallback.
 *
 * A page compiled before a vocabulary entry was added still has to render, so
 * an unknown key becomes its own label rather than an empty span.
 */
function termMeta(vocabulary: Readonly<Record<string, DocsTermMeta>>, key: string): DocsTermMeta {
  return vocabulary[key] ?? { label: key, note: 'This term is not one the content model defines.' };
}

/** What kind of page this is, as a name and as a sentence. */
export function typeMeta(manifest: DocsManifest, type: string): DocsTermMeta {
  return termMeta(manifest.types, type);
}

/** Who a page is written for, as a name and as a sentence. */
export function audienceMeta(manifest: DocsManifest, audience: string): DocsTermMeta {
  return termMeta(manifest.audiences, audience);
}
