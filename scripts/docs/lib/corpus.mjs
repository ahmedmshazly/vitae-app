/**
 * One reader for the curated corpus.
 *
 * The gate that judges a page and the build that renders it have to agree on
 * what a page is: where it lives, what route it answers, which headings it
 * offers as anchors, which links it makes. Two readers would eventually
 * disagree, and the disagreement would show up as a gate passing a page the
 * reader cannot render, the failure this whole effort exists to prevent. So
 * there is one reader, and both callers use it.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { frontmatter } from './frontmatter.mjs';
import { markdown, plain } from './markdown.mjs';

/**
 * Every page file in the corpus, committed or not.
 *
 * Tracked files alone would be wrong here. The authoring loop is write a page,
 * run the gate, fix what it says. A gate that cannot see a file until it
 * has been staged gives no feedback on the new page while reporting a broken
 * link on the page that points at it, which reads as a bug in the wrong file.
 * Ignored files stay invisible, so a scratch directory is still a way out.
 * `check-public-release.mjs` enumerates the same two ways for the same reason.
 */
export function pageFiles(root, corpus) {
  const list = (args) =>
    execFileSync('git', ['-C', root, ...args, '-z', '--', corpus], { maxBuffer: 32 * 1024 * 1024 })
      .toString('utf8')
      .split('\0')
      .filter(Boolean);
  const files = new Set([...list(['ls-files']), ...list(['ls-files', '--others', '--exclude-standard'])]);
  return [...files].filter((rel) => rel.endsWith('.md')).sort();
}

/**
 * The route a page answers.
 *
 *   docs/observatory/index.md                 -> /docs
 *   docs/observatory/glossary.md              -> /docs/glossary
 *   docs/observatory/design/index.md          -> /docs/design
 *   docs/observatory/design/tokens.md         -> /docs/design/tokens
 *
 * An `index.md` is the entrance to its directory rather than a page beside its
 * siblings, which is what lets a section have both a route and an opening
 * explanation instead of a bare list of links.
 */
export function routeFor(rel, corpus) {
  const parts = rel.slice(corpus.length + 1).replace(/\.md$/, '').split('/');
  if (parts.at(-1) === 'index') parts.pop();
  return ['/docs', ...parts].join('/');
}

/** The directory a page sits in, which is the domain it must declare. */
export function domainFor(rel, corpus) {
  const parts = rel.slice(corpus.length + 1).split('/');
  return parts.length > 1 ? parts[0] : null;
}

/**
 * Read one page into everything a caller could want from it.
 *
 * Parse failures are returned rather than thrown: a gate reporting every bad
 * page at once is more useful than one that stops at the first, and a build
 * needs to name the page it could not read.
 */
export function readPage(root, rel, corpus) {
  const page = { rel, route: routeFor(rel, corpus), directory: domainFor(rel, corpus), error: null };
  let raw;
  try {
    raw = readFileSync(join(root, rel), 'utf8');
  } catch (error) {
    page.error = error.message;
    return page;
  }
  try {
    const { data, body, bodyLine } = frontmatter(raw, { file: rel });
    const parsed = markdown(body, { file: rel, startLine: bodyLine });
    page.data = data;
    page.body = body;
    page.bodyLine = bodyLine;
    page.blocks = parsed.blocks;
    page.headings = parsed.headings;
    page.links = parsed.links;
    page.anchors = new Set(parsed.headings.map((h) => h.id));
  } catch (error) {
    page.error = error.message;
  }
  return page;
}

/** Every page in the corpus, read, in path order. */
export function readCorpus(root, corpus) {
  return pageFiles(root, corpus).map((rel) => readPage(root, rel, corpus));
}

/**
 * How a link in the corpus is meant to resolve.
 *
 * Intra-corpus links are relative `.md` paths so that a page reads correctly
 * both in the application and on the repository host, since a link that works
 * in only one of the two is a link that will be written wrong. `/docs/...` is
 * reserved for the routes the application serves that no page produces, and
 * everything else is refused so that a source file is cited through the
 * `sources:` field or inline code rather than through a link that silently
 * points nowhere.
 */
export function classifyLink(href) {
  const [target, anchor = null] = href.split('#');
  if (href.startsWith('#')) return { kind: 'anchor', target: null, anchor: href.slice(1) };
  if (/^mailto:/.test(href)) return { kind: 'mail', target: href, anchor: null };
  if (/^https:\/\//.test(href)) return { kind: 'external', target: href, anchor: null };
  // Plain http is a defect in a published document, except when the document
  // is telling someone to open their own machine.
  if (/^http:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(href)) {
    return { kind: 'external', target: href, anchor: null };
  }
  if (href.startsWith('/docs')) return { kind: 'route', target, anchor };
  if (/\.md$/.test(target)) return { kind: 'page', target, anchor };
  return { kind: 'unsupported', target: href, anchor: null };
}

/** The first heading, which every page must open with and which carries its title. */
export function titleHeading(page) {
  const first = page.blocks?.find((b) => b.type === 'heading');
  return first ? { level: first.level, text: plain(first.children) } : null;
}
