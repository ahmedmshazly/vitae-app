/**
 * The document a reader gets with no script running.
 *
 * These tests hold the static renderer to the promise the corpus makes: the
 * page is legible with the bundle absent, and it says the same things the
 * React reader says. So they assert on prose and on structure rather than on
 * markup shape, which is the part that is allowed to differ.
 */
import { describe, expect, it } from 'vitest';
import type {
  DocsBlock,
  DocsManifest,
  DocsPageContent,
  DocsPageSummary,
} from '../routes/docs/docsModel.js';
import { docsPageMetadata, docsStaticBody } from './docs-static.js';

const summary = (over: Partial<DocsPageSummary> & Pick<DocsPageSummary, 'id' | 'route'>) =>
  ({
    content: `pages${over.route}.json`,
    source: 'docs/observatory/x.md',
    title: over.id,
    summary: `About ${over.id}.`,
    audience: ['developer'],
    domain: 'meta',
    section: 'meta',
    type: 'explanation',
    status: 'verified',
    ...over,
  }) as DocsPageSummary;

const HOME = summary({ id: 'HOME', route: '/docs', section: null, type: 'index', title: 'Home' });
const INDEX = summary({ id: 'INDEX', route: '/docs/meta', type: 'index', title: 'About' });
const ONE = summary({ id: 'ONE', route: '/docs/meta/one', title: 'First' });
const TWO = summary({ id: 'TWO', route: '/docs/meta/two', title: 'Second' });

const manifest: DocsManifest = {
  corpus: 'docs/observatory',
  audiences: { developer: { label: 'Developer', note: 'Someone changing the code.' } },
  types: {
    index: { label: 'Section index', note: 'Leads a reader into a section.' },
    explanation: { label: 'Explanation', note: 'Builds understanding.' },
  },
  statuses: {
    verified: { label: 'Verified', tone: 'positive', note: 'Checked against the code.' },
    deprecated: { label: 'Deprecated', tone: 'caution', note: 'Kept so links resolve.' },
  },
  domains: [
    { key: 'meta', title: 'About', summary: 'The documents themselves.', route: '/docs/meta', entrance: true, pages: 3 },
  ],
  pages: [HOME, INDEX, ONE, TWO],
};

const content = (over: Partial<DocsPageContent> = {}): DocsPageContent => ({
  id: 'ONE',
  route: '/docs/meta/one',
  source: 'docs/observatory/meta/one.md',
  title: 'First',
  summary: 'About ONE.',
  audience: ['developer'],
  domain: 'meta',
  type: 'explanation',
  status: 'verified',
  sources: [],
  requirements: [],
  related: [],
  supersedes: [],
  superseded_by: [],
  headings: [],
  blocks: [],
  ...over,
});

const text = (value: string): DocsBlock => ({
  type: 'paragraph',
  children: [{ type: 'text', value }],
});

describe('the page a reader gets without JavaScript', () => {
  it('carries the prose itself, not a placeholder', () => {
    const html = docsStaticBody(manifest, ONE, content({ blocks: [text('The corpus is a build artifact.')] }));
    expect(html).toContain('The corpus is a build artifact.');
  });

  it('names the page once as a level one heading', () => {
    const html = docsStaticBody(manifest, ONE, content());
    expect(html.match(/<h1>/g)).toHaveLength(1);
    expect(html).toContain('<h1>First</h1>');
  });

  it('keeps an article heading below the title however the source was written', () => {
    // A page that opens a section with `#` in its body would otherwise emit a
    // second h1 and leave the document with two titles.
    const html = docsStaticBody(
      manifest,
      ONE,
      content({ blocks: [{ type: 'heading', level: 1, id: 'x', text: 'X', children: [{ type: 'text', value: 'X' }] }] }),
    );
    expect(html).toContain('<h2 id="x">X</h2>');
    expect(html.match(/<h1>/g)).toHaveLength(1);
  });

  it('says what the status means rather than showing a colour', () => {
    const html = docsStaticBody(manifest, ONE, content());
    expect(html).toContain('Verified');
    expect(html).toContain('Checked against the code.');
  });

  it('leads with the replacement when a page has been superseded', () => {
    const html = docsStaticBody(
      manifest,
      ONE,
      content({ superseded_by: [{ id: 'TWO', route: '/docs/meta/two', title: 'Second', summary: 'x' }] }),
    );
    expect(html).toContain('This page has been replaced');
    expect(html.indexOf('/docs/meta/two')).toBeLessThan(html.indexOf('Page details'));
  });

  it('offers the way onward, so the corpus is walkable from any page', () => {
    const html = docsStaticBody(manifest, ONE, content());
    expect(html).toContain('/docs/meta');
    expect(html).toContain('Next');
    expect(html).toContain('/docs/meta/two');
  });

  it('lists the section from its entrance', () => {
    const html = docsStaticBody(manifest, INDEX, content({ id: 'INDEX', route: '/docs/meta', type: 'index' }));
    expect(html).toContain('In this section');
    expect(html).toContain('/docs/meta/one');
  });

  it('lists every section from the corpus entrance', () => {
    const html = docsStaticBody(manifest, HOME, content({ id: 'HOME', route: '/docs', type: 'index' }));
    expect(html).toContain('Sections');
    expect(html).toContain('3 pages');
  });

  it('omits a table of contents when there is only one heading to list', () => {
    const one = docsStaticBody(manifest, ONE, content({ headings: [{ level: 2, id: 'a', text: 'A' }] }));
    expect(one).not.toContain('On this page');
    const two = docsStaticBody(
      manifest,
      ONE,
      content({ headings: [{ level: 2, id: 'a', text: 'A' }, { level: 2, id: 'b', text: 'B' }] }),
    );
    expect(two).toContain('On this page');
    expect(two).toContain('href="#b"');
  });

  it('names what the page was checked against', () => {
    const html = docsStaticBody(manifest, ONE, content({ sources: ['apps/api/src/mounts.ts'], requirements: ['FR-001'] }));
    expect(html).toContain('apps/api/src/mounts.ts');
    expect(html).toContain('FR-001');
  });

  it('escapes text that would otherwise close a tag', () => {
    const html = docsStaticBody(manifest, ONE, content({ blocks: [text('<script>alert(1)</script>')] }));
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('marks a link that leaves the application', () => {
    const html = docsStaticBody(
      manifest,
      ONE,
      content({
        blocks: [
          { type: 'paragraph', children: [{ type: 'link', href: 'https://example.com', children: [{ type: 'text', value: 'out' }] }] },
          { type: 'paragraph', children: [{ type: 'link', href: '/docs/meta/two', children: [{ type: 'text', value: 'in' }] }] },
        ],
      }),
    );
    expect(html).toContain('<a href="https://example.com" rel="noreferrer">out</a>');
    expect(html).toContain('<a href="/docs/meta/two">in</a>');
  });

  it('gives a table row its own header cell', () => {
    const html = docsStaticBody(
      manifest,
      ONE,
      content({
        blocks: [
          {
            type: 'table',
            align: [null, null],
            head: [[{ type: 'text', value: 'Key' }], [{ type: 'text', value: 'Value' }]],
            rows: [[[{ type: 'text', value: 'Status' }], [{ type: 'text', value: 'gated' }]]],
          },
        ],
      }),
    );
    expect(html).toContain('<th scope="col">Key</th>');
    expect(html).toContain('<th scope="row">Status</th>');
    expect(html).toContain('<td>gated</td>');
  });

  it('names a callout in words, because tone alone is a colour', () => {
    const html = docsStaticBody(
      manifest,
      ONE,
      content({ blocks: [{ type: 'callout', tone: 'warning', children: [text('Careful.')] }] }),
    );
    expect(html).toContain('<strong>Warning</strong>');
    expect(html).toContain('Careful.');
  });

  it('unwraps a single paragraph inside a list item', () => {
    const html = docsStaticBody(
      manifest,
      ONE,
      content({ blocks: [{ type: 'list', ordered: false, items: [[text('One')], [text('Two')]] }] }),
    );
    expect(html).toContain('<ul><li>One</li><li>Two</li></ul>');
  });
});

describe('how a documentation page describes itself to a crawler', () => {
  it('titles the tab the way the reader does', () => {
    expect(docsPageMetadata(ONE).title).toBe('First · Vitae documentation');
  });

  it('does not repeat the suffix on the corpus entrance', () => {
    const home = summary({ id: 'HOME', route: '/docs', title: 'Vitae documentation' });
    expect(docsPageMetadata(home).title).toBe('Vitae documentation');
  });

  it('carries the page summary as its description', () => {
    expect(docsPageMetadata(ONE).description).toBe('About ONE.');
    expect(docsPageMetadata(ONE).path).toBe('/docs/meta/one');
  });
});
