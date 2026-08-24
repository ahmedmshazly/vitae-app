/**
 * Remembering where a reader stopped.
 *
 * Two things matter here and nothing else does. The first is that a browser
 * which refuses site data must not break a documentation page: every function
 * has to survive `localStorage` throwing. The second is that "continue
 * reading" offers a page the reader has not read, because offering one they
 * have is worse than offering nothing.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DocsManifest } from './docsModel.js';
import {
  continueDocsReading,
  docsProgressCount,
  forgetDocsProgress,
  readDocsProgress,
  recentDocsPages,
  recordDocsVisit,
} from './docsProgress.js';

const entry = (id: string, route: string, title: string) => ({
  id,
  route,
  content: `pages${route.replace('/docs', '')}.json`,
  source: `docs/observatory${route.replace('/docs', '')}.md`,
  title,
  summary: `About ${title.toLowerCase()}.`,
  audience: ['developer'] as const,
  domain: 'meta',
  section: 'meta',
  type: 'explanation' as const,
  status: 'verified' as const,
});

const manifest: DocsManifest = {
  corpus: 'docs/observatory',
  audiences: {},
  domains: [],
  types: {},
  statuses: {},
  pages: [
    entry('ONE', '/docs/meta/one', 'First'),
    entry('TWO', '/docs/meta/two', 'Second'),
    entry('THREE', '/docs/meta/three', 'Third'),
  ],
};

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('what the browser remembers', () => {
  it('starts with nothing read', () => {
    expect(readDocsProgress()).toStrictEqual({ read: [], last: null });
  });

  it('records a page and reads it back', () => {
    recordDocsVisit('TWO');
    expect(readDocsProgress()).toStrictEqual({ read: ['TWO'], last: 'TWO' });
  });

  it('moves a page already read to the end rather than repeating it', () => {
    recordDocsVisit('ONE');
    recordDocsVisit('TWO');
    recordDocsVisit('ONE');
    expect(readDocsProgress().read).toStrictEqual(['TWO', 'ONE']);
  });

  it('forgets everything on request', () => {
    recordDocsVisit('ONE');
    expect(forgetDocsProgress()).toStrictEqual({ read: [], last: null });
    expect(readDocsProgress().read).toStrictEqual([]);
  });

  it('ignores a stored value of the wrong shape instead of throwing', () => {
    window.localStorage.setItem('vitae.docs.progress.v1', JSON.stringify({ read: 'all', last: 7 }));
    expect(readDocsProgress()).toStrictEqual({ read: [], last: null });
  });

  it('ignores a stored value that is not JSON', () => {
    window.localStorage.setItem('vitae.docs.progress.v1', 'not json');
    expect(readDocsProgress()).toStrictEqual({ read: [], last: null });
  });

  it('survives a browser that refuses to store anything', () => {
    // A private window, or site data blocked. The reader keeps their page.
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('QuotaExceededError');
    });
    expect(() => recordDocsVisit('ONE')).not.toThrow();
  });

  it('survives a browser that refuses to be read', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('SecurityError');
    });
    expect(readDocsProgress()).toStrictEqual({ read: [], last: null });
  });
});

describe('how far through the corpus a reader is', () => {
  it('counts against the manifest, not against what was stored', () => {
    recordDocsVisit('ONE');
    // A page that has since been retired must stop counting, or the reader is
    // permanently past the end of a corpus that got smaller.
    recordDocsVisit('RETIRED');
    expect(docsProgressCount(manifest, readDocsProgress())).toStrictEqual({ read: 1, total: 3 });
  });
});

describe('what to read next', () => {
  it('offers the first page after the one last opened', () => {
    recordDocsVisit('ONE');
    expect(continueDocsReading(manifest, readDocsProgress())?.id).toBe('TWO');
  });

  it('skips forward over pages already read', () => {
    recordDocsVisit('TWO');
    recordDocsVisit('ONE');
    expect(continueDocsReading(manifest, readDocsProgress())?.id).toBe('THREE');
  });

  it('falls back to the first unread page for a reader who arrived from a search', () => {
    recordDocsVisit('THREE');
    expect(continueDocsReading(manifest, readDocsProgress())?.id).toBe('ONE');
  });

  it('offers nothing rather than a page already read', () => {
    for (const id of ['ONE', 'TWO', 'THREE']) recordDocsVisit(id);
    expect(continueDocsReading(manifest, readDocsProgress())).toBeNull();
  });
});

describe('what was opened recently', () => {
  it('lists the newest first', () => {
    recordDocsVisit('ONE');
    recordDocsVisit('THREE');
    expect(recentDocsPages(manifest, readDocsProgress()).map((p) => p.id)).toStrictEqual([
      'THREE',
      'ONE',
    ]);
  });

  it('leaves out a page the corpus no longer has', () => {
    recordDocsVisit('RETIRED');
    recordDocsVisit('ONE');
    expect(recentDocsPages(manifest, readDocsProgress()).map((p) => p.id)).toStrictEqual(['ONE']);
  });

  it('stops at the limit asked for', () => {
    for (const id of ['ONE', 'TWO', 'THREE']) recordDocsVisit(id);
    expect(recentDocsPages(manifest, readDocsProgress(), 2)).toHaveLength(2);
  });
});
