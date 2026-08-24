/**
 * The documentation corpus as a plain document, for a reader with no script.
 *
 * `vite.public-seo.ts` calls this at the end of a build and writes the result
 * into `dist/docs/**\/index.html`, one file per page. What lands there is the
 * whole page: breadcrumb, title, status, prose, contents, sources, and the way
 * onward. Open it with JavaScript disabled, with the API stopped, with no
 * session, and it reads.
 *
 * That is the strongest form of the promise the corpus makes. Documentation
 * that needs a running bundle to be legible is documentation that disappears
 * exactly when someone is trying to work out why nothing is running.
 *
 * Two rules govern what comes out.
 *
 * The first is that this file decides nothing. Every question with an answer
 * of its own — what a breadcrumb contains, which page is next, what a status
 * is called, how the tab is titled, whether a link leaves the app — is asked
 * of `docsModel.ts`, the same module the React reader asks. Only presentation
 * lives here, and presentation is the one thing the two are allowed to differ
 * on.
 *
 * The second is that `blockHtml` covers the block model exhaustively through a
 * `never` in its default arm. A new block type therefore fails
 * `pnpm --filter @vitae/web typecheck` rather than quietly vanishing from the
 * no-script document while the React reader keeps showing it. A fallback that
 * silently drops content is worse than no fallback, because nothing reports
 * the loss.
 *
 * There is no CSS here and no class attributes. The documentation stylesheet
 * ships inside the lazy route chunk, so with no script it never loads; markup
 * that named classes would be pretending otherwise. What carries meaning
 * carries it in elements and words: a callout says "Warning", a table row
 * header is a `th`, a heading keeps the id its anchor links point at.
 */
import {
  type DocsBlock,
  type DocsDiagramSpec,
  type DocsInline,
  type DocsManifest,
  type DocsPageContent,
  type DocsPageSummary,
  type DocsReference,
  CALLOUT_LABEL,
  DOCS_STEP_KIND,
  DOCS_TRUST,
  docsStatePosition,
  audienceMeta,
  breadcrumbs,
  docsDocumentTitle,
  isExternalDocsLink,
  neighbours,
  sectionEntrance,
  sectionPages,
  statusMeta,
  typeMeta,
} from '../routes/docs/docsModel.js';
import { escapeHtml } from './seo.js';
import type { PublicMetadata } from './site.js';

// ---------------------------------------------------------------------------
// Inline nodes
// ---------------------------------------------------------------------------

function inlineHtml(node: DocsInline): string {
  switch (node.type) {
    case 'text':
      return escapeHtml(node.value);
    case 'code':
      return `<code>${escapeHtml(node.value)}</code>`;
    case 'strong':
      return `<strong>${inlinesHtml(node.children)}</strong>`;
    case 'em':
      return `<em>${inlinesHtml(node.children)}</em>`;
    case 'link': {
      // The React reader opens an external link in a new tab and says so in
      // visually hidden text. Here there is no stylesheet to hide it with, so
      // the note would print as stray prose mid-sentence. A static document
      // gives up the new tab instead of lying about what the link does.
      const rel = isExternalDocsLink(node.href) ? ' rel="noreferrer"' : '';
      return `<a href="${escapeHtml(node.href)}"${rel}>${inlinesHtml(node.children)}</a>`;
    }
    case 'image':
      return `<img src="${escapeHtml(node.src)}" alt="${escapeHtml(node.alt)}" />`;
    default: {
      const unreachable: never = node;
      return String(unreachable);
    }
  }
}

function inlinesHtml(nodes: readonly DocsInline[]): string {
  return nodes.map(inlineHtml).join('');
}

// ---------------------------------------------------------------------------
// Blocks
// ---------------------------------------------------------------------------

/**
 * A list item holding one paragraph is unwrapped, matching the React reader.
 * Left alone it would nest a block element inside every `li` and double the
 * vertical rhythm of a list against the prose around it.
 */
function listItemHtml(blocks: readonly DocsBlock[]): string {
  const only = blocks.length === 1 ? blocks[0] : undefined;
  if (only && only.type === 'paragraph') return inlinesHtml(only.children);
  return blocksHtml(blocks);
}

function cellsHtml(cells: readonly (readonly DocsInline[])[], tag: 'th' | 'td'): string {
  return cells
    .map((cell, index) => {
      // The first cell of a body row names the row, so it is a header for it.
      // That is what lets a screen reader announce "Status, gated" instead of
      // reading a lone word out of a grid.
      const element = tag === 'td' && index === 0 ? 'th scope="row"' : tag;
      const close = element.startsWith('th') ? 'th' : 'td';
      const open = element === 'th' ? 'th scope="col"' : element;
      return `<${open}>${inlinesHtml(cell)}</${close}>`;
    })
    .join('');
}

/**
 * A diagram as a table, which is the whole of it here.
 *
 * The React reader draws these; a document with no script cannot. That is not
 * a degraded form: the table is the accessible equivalent the design rules
 * require of every diagram, and the reason a diagram is declared as data
 * rather than drawn is so the two cannot say different things. A reader with a
 * screen reader and a reader with no JavaScript get the same document, and it
 * is complete.
 */
function table(caption: string, head: readonly string[], rows: readonly (readonly string[])[]): string {
  if (rows.length === 0) return '';
  const header = head.map((cell) => `<th scope="col">${cell}</th>`).join('');
  const body = rows
    .map((row) => {
      const cells = row.map((cell, index) =>
        index === 0 ? `<th scope="row">${cell}</th>` : `<td>${cell}</td>`,
      );
      return `<tr>${cells.join('')}</tr>`;
    })
    .join('');
  return `<table><caption>${caption}</caption><thead><tr>${header}</tr></thead><tbody>${body}</tbody></table>`;
}

function named(list: readonly { id: string; label: string }[] | undefined, id: string): string {
  return escapeHtml(list?.find((item) => item.id === id)?.label ?? id);
}

function code(value: string | undefined): string {
  return value ? `<code>${escapeHtml(value)}</code>` : '—';
}

function diagramTables(spec: DocsDiagramSpec): string {
  const out: string[] = [];
  if (spec.kind === 'sequence') {
    out.push(
      table(
        'Steps in order',
        ['Step', 'From', 'To', 'What happens', 'Where'],
        (spec.steps ?? []).map((step, index) => [
          String(index + 1),
          named(spec.actors, step.from),
          named(spec.actors, step.to),
          `${DOCS_STEP_KIND[step.kind ?? 'call']}: ${escapeHtml(step.label)}`
            + (step.note ? ` ${escapeHtml(step.note)}` : ''),
          code(step.source),
        ]),
      ),
    );
  }
  if (spec.kind === 'state') {
    out.push(
      table(
        'States',
        ['State', 'Meaning', 'Position'],
        (spec.states ?? []).map((state) => [
          escapeHtml(state.label),
          escapeHtml(state.note ?? '—'),
          docsStatePosition(state),
        ]),
      ),
      table(
        'Transitions',
        ['From', 'To', 'What causes it', 'Where'],
        (spec.transitions ?? []).map((move) => [
          named(spec.states, move.from),
          named(spec.states, move.to),
          escapeHtml(move.label) + (move.note ? ` ${escapeHtml(move.note)}` : ''),
          code(move.source),
        ]),
      ),
    );
  }
  if (spec.kind === 'topology') {
    out.push(
      table(
        'Trust zones',
        ['Zone', 'Trust', 'Note'],
        (spec.zones ?? []).map((zone) => [
          escapeHtml(zone.label),
          DOCS_TRUST[zone.trust],
          escapeHtml(zone.note ?? '—'),
        ]),
      ),
      table(
        'Components',
        ['Component', 'Zone', 'Note', 'Where'],
        (spec.nodes ?? []).map((node) => [
          escapeHtml(node.label),
          named(spec.zones, node.zone),
          escapeHtml(node.note ?? '—'),
          code(node.source),
        ]),
      ),
      table(
        'What crosses between them',
        ['From', 'To', 'What moves', 'Carrying'],
        (spec.links ?? []).map((link) => [
          named(spec.nodes, link.from),
          named(spec.nodes, link.to),
          escapeHtml(link.label),
          escapeHtml(link.carries ?? '—'),
        ]),
      ),
    );
  }
  if (spec.kind === 'lanes') {
    out.push(
      table(
        'Phases in order',
        ['Phase', 'Where it happens', 'What the person does', 'Route', 'Covered by'],
        (spec.phases ?? []).map((phase) => [
          escapeHtml(phase.label),
          named(spec.lanes, phase.lane),
          escapeHtml(phase.note ?? '—'),
          code(phase.route),
          phase.covered_by && phase.covered_by.length > 0
            ? phase.covered_by.map((file) => `<code>${escapeHtml(file)}</code>`).join(', ')
            : 'Nothing runs this phase',
        ]),
      ),
    );
  }
  return out.filter(Boolean).join('');
}

function diagramHtml(spec: DocsDiagramSpec): string {
  const sources = spec.sources
    .map((path) => `<li><code>${escapeHtml(path)}</code></li>`)
    .join('');
  return [
    `<figure data-vitae-diagram="${escapeHtml(spec.id)}">`,
    `<figcaption><strong>${escapeHtml(spec.title)}</strong> ${escapeHtml(spec.summary)}</figcaption>`,
    spec.note ? `<p>${escapeHtml(spec.note)}</p>` : '',
    diagramTables(spec),
    `<p>Read from:</p><ul>${sources}</ul>`,
    '</figure>',
  ]
    .filter(Boolean)
    .join('');
}

function blockHtml(block: DocsBlock): string {
  switch (block.type) {
    case 'heading': {
      // The page title is the document's only h1, so an article heading never
      // competes with it however the Markdown was written.
      const level = Math.min(6, Math.max(2, block.level));
      return `<h${level} id="${escapeHtml(block.id)}">${inlinesHtml(block.children)}</h${level}>`;
    }
    case 'paragraph':
      return `<p>${inlinesHtml(block.children)}</p>`;
    case 'code': {
      const lang = block.lang ? ` data-lang="${escapeHtml(block.lang)}"` : '';
      return `<pre${lang}><code>${escapeHtml(block.code)}</code></pre>`;
    }
    case 'rule':
      return '<hr />';
    case 'callout':
      return `<aside data-tone="${escapeHtml(block.tone)}"><p><strong>${CALLOUT_LABEL[block.tone]}</strong></p>${blocksHtml(block.children)}</aside>`;
    case 'quote':
      return `<blockquote>${blocksHtml(block.children)}</blockquote>`;
    case 'list': {
      const tag = block.ordered ? 'ol' : 'ul';
      const items = block.items.map((item) => `<li>${listItemHtml(item)}</li>`).join('');
      return `<${tag}>${items}</${tag}>`;
    }
    case 'table': {
      const head = `<thead><tr>${cellsHtml(block.head, 'th')}</tr></thead>`;
      const rows = block.rows.map((row) => `<tr>${cellsHtml(row, 'td')}</tr>`).join('');
      return `<table>${head}<tbody>${rows}</tbody></table>`;
    }
    case 'figure':
      return `<figure><img src="${escapeHtml(block.src)}" alt="${escapeHtml(block.caption)}" /><figcaption>${escapeHtml(block.caption)}</figcaption></figure>`;
    case 'diagram':
      return diagramHtml(block.spec);
    case 'explainer':
      // An explainer runs a real function from `@vitae/core` against inputs the
      // reader changes, so there is nothing to render without a script. What
      // there is, is the truth about that: the surrounding prose states the
      // algorithm's inputs, formula, constants and limits in full, and this
      // says so rather than leaving an empty box in the middle of a sentence.
      return `<aside data-vitae-explainer="${escapeHtml(block.id)}"><p><strong>Interactive example</strong> `
        + `The <code>${escapeHtml(block.id)}</code> algorithm can be run here against inputs you choose, `
        + 'which needs JavaScript. The sections around this one state its inputs, its formula, its tuned '
        + 'constants and its limits in full.</p></aside>';
    default: {
      // Exhaustiveness, enforced. A new member of DocsBlock stops compiling
      // here rather than disappearing from every prerendered page.
      const unreachable: never = block;
      return String(unreachable);
    }
  }
}

function blocksHtml(blocks: readonly DocsBlock[]): string {
  return blocks.map(blockHtml).join('\n');
}

// ---------------------------------------------------------------------------
// The page around the prose
// ---------------------------------------------------------------------------

function link(route: string, label: string, current = false): string {
  const aria = current ? ' aria-current="page"' : '';
  return `<a href="${escapeHtml(route)}"${aria}>${escapeHtml(label)}</a>`;
}

function breadcrumbHtml(manifest: DocsManifest, summary: DocsPageSummary): string {
  const trail = breadcrumbs(manifest, summary);
  const crumbs = trail
    .map((crumb) => `<li>${link(crumb.route, crumb.label, crumb.route === summary.route)}</li>`)
    .join('');
  return `<nav aria-label="Breadcrumb"><ol>${crumbs}</ol></nav>`;
}

/**
 * Status, page type and audience as a description list.
 *
 * The React reader shows these as a badge and a row of chips. Here they are
 * terms and definitions, which is what they always were, and each one prints
 * the vocabulary's own sentence beside its name so a reader meeting the word
 * "gated" for the first time is not left to infer it.
 */
function metaHtml(manifest: DocsManifest, summary: DocsPageSummary): string {
  const status = statusMeta(manifest, summary.status);
  const verified = summary.verified_at ? ` Last verified ${escapeHtml(summary.verified_at)}.` : '';
  const type = typeMeta(manifest, summary.type);
  const audience = summary.audience.map((who) => audienceMeta(manifest, who).label);
  const rows = [
    ['Status', `${escapeHtml(status.label)}. ${escapeHtml(status.note)}${verified}`],
    ['Page type', `${escapeHtml(type.label)}. ${escapeHtml(type.note)}`],
    ['Written for', escapeHtml(audience.join(', '))],
  ];
  const items = rows.map(([term, value]) => `<dt>${term}</dt><dd>${value}</dd>`).join('');
  return `<dl>${items}</dl>`;
}

/**
 * A replaced page says so before its first sentence.
 *
 * This is the one piece of chrome a static document cannot do without. The
 * page is kept so old links resolve; a reader who arrives on one and never
 * learns it was superseded acts on retired instructions.
 */
function supersededHtml(page: DocsPageContent): string {
  const replacement = page.superseded_by[0];
  if (!replacement) return '';
  return [
    '<aside aria-label="This page has been replaced">',
    '<p><strong>This page has been replaced.</strong> It is kept so that existing links still resolve.</p>',
    `<p>Read ${link(replacement.route, replacement.title)} instead.</p>`,
    '</aside>',
  ].join('');
}

/** Mirrors the React reader: one heading is not a table of contents. */
function tocHtml(page: DocsPageContent): string {
  if (page.headings.length < 2) return '';
  const items = page.headings
    .map(
      (heading) =>
        `<li data-level="${heading.level}"><a href="#${escapeHtml(heading.id)}">${escapeHtml(heading.text)}</a></li>`,
    )
    .join('');
  return `<nav aria-labelledby="docs-toc"><h2 id="docs-toc">On this page</h2><ul>${items}</ul></nav>`;
}

function contentsListHtml(pages: readonly DocsPageSummary[]): string {
  return pages
    .map((entry) => `<li>${link(entry.route, entry.title)}<p>${escapeHtml(entry.summary)}</p></li>`)
    .join('');
}

/**
 * How a reader without a sidebar gets anywhere.
 *
 * The React shell carries a persistent navigation tree. Repeating it in every
 * prerendered file would put the whole corpus outline into every page, so the
 * static document leans on the structure instead: a section entrance lists its
 * pages, the corpus entrance lists its sections, and every page carries a
 * breadcrumb and a pager. Walking from `/docs` reaches all of it.
 */
function sectionContentsHtml(manifest: DocsManifest, summary: DocsPageSummary): string {
  if (summary.route === '/docs') {
    const sections = manifest.domains
      .map((domain) => {
        const entrance = sectionEntrance(manifest, domain.key);
        const count = `${domain.pages} ${domain.pages === 1 ? 'page' : 'pages'}`;
        return `<li>${link(entrance?.route ?? domain.route, domain.title)}<p>${escapeHtml(domain.summary)} (${count})</p></li>`;
      })
      .join('');
    return `<nav aria-labelledby="docs-sections"><h2 id="docs-sections">Sections</h2><ul>${sections}</ul></nav>`;
  }
  if (summary.type !== 'index' || summary.section === null) return '';
  const pages = sectionPages(manifest, summary.section);
  if (pages.length === 0) return '';
  return `<nav aria-labelledby="docs-contents"><h2 id="docs-contents">In this section</h2><ul>${contentsListHtml(pages)}</ul></nav>`;
}

function referencesHtml(title: string, items: readonly DocsReference[]): string {
  if (items.length === 0) return '';
  const entries = items
    .map((item) => `<li>${link(item.route, item.title)}: ${escapeHtml(item.summary)}</li>`)
    .join('');
  return `<h3>${title}</h3><ul>${entries}</ul>`;
}

function pathListHtml(title: string, paths: readonly string[]): string {
  if (paths.length === 0) return '';
  const entries = paths.map((path) => `<li><code>${escapeHtml(path)}</code></li>`).join('');
  return `<h3>${title}</h3><ul>${entries}</ul>`;
}

/**
 * What the page was checked against, and where it was written.
 *
 * Source paths stay repository paths rather than links to a code host, for the
 * reason the React rail gives: the corpus is read from a self-hosted checkout
 * as often as from anywhere else, and a link to a host a given deployment does
 * not use is worse than a path anyone can paste into their own editor.
 */
function detailsHtml(page: DocsPageContent): string {
  return [
    '<footer>',
    '<h2>Page details</h2>',
    pathListHtml('Checked against', page.sources),
    pathListHtml('Requirements', page.requirements),
    referencesHtml('Related', page.related),
    referencesHtml('Replaces', page.supersedes),
    `<h3>Written in</h3><p><code>${escapeHtml(page.source)}</code></p>`,
    '</footer>',
  ].join('');
}

function pagerHtml(manifest: DocsManifest, summary: DocsPageSummary): string {
  const { previous, next } = neighbours(manifest, summary);
  if (!previous && !next) return '';
  const entries = [
    previous ? `<li>Previous: ${link(previous.route, previous.title)}</li>` : '',
    next ? `<li>Next: ${link(next.route, next.title)}</li>` : '',
  ].join('');
  return `<nav aria-labelledby="docs-pager"><h2 id="docs-pager">Reading order</h2><ul>${entries}</ul></nav>`;
}

// ---------------------------------------------------------------------------
// What the build plugin calls
// ---------------------------------------------------------------------------

/**
 * A documentation page described the way the public SEO helpers expect.
 *
 * Synthesised from the manifest rather than kept in `PUBLIC_METADATA`, so the
 * head of every page comes from the page itself. A hand-maintained list of
 * documentation routes would be one more thing to forget, and forgetting it
 * would mean a page that reads correctly and describes itself as something
 * else.
 */
export function docsPageMetadata(summary: DocsPageSummary): PublicMetadata {
  return {
    path: summary.route,
    title: docsDocumentTitle(summary.title),
    description: summary.summary,
    kind: 'documentation',
    schema: 'article',
  };
}

/** One page, whole, as static HTML. */
export function docsStaticBody(
  manifest: DocsManifest,
  summary: DocsPageSummary,
  page: DocsPageContent,
): string {
  return [
    `<main id="main-content" data-vitae-static-docs-page="${escapeHtml(summary.route)}">`,
    breadcrumbHtml(manifest, summary),
    '<header>',
    `<h1>${escapeHtml(summary.title)}</h1>`,
    `<p>${escapeHtml(summary.summary)}</p>`,
    metaHtml(manifest, summary),
    '</header>',
    supersededHtml(page),
    tocHtml(page),
    `<article>${blocksHtml(page.blocks)}</article>`,
    sectionContentsHtml(manifest, summary),
    detailsHtml(page),
    pagerHtml(manifest, summary),
    '</main>',
  ]
    .filter((part) => part !== '')
    .join('\n');
}
