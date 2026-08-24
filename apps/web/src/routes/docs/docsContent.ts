/**
 * Reading the compiled corpus over the network.
 *
 * This is the transport half of the documentation surface, split from
 * `docsModel.ts` so that the model half stays free of `fetch`, of
 * `import.meta.env` and of TanStack Query. That is not tidiness for its own
 * sake: the build plugin that prerenders `/docs/*` into static HTML has to
 * import the same breadcrumb, reading-order and vocabulary rules the React
 * reader uses, and it runs inside Vite's config loader in Node, where
 * `import.meta.env` does not exist and a query client would be meaningless.
 * One module the two can share, one module only the browser needs.
 *
 * The corpus is a build artifact, so within one page load it cannot change.
 * Every query here is therefore `staleTime: Infinity`: navigating back to a
 * page already read is instant and silent, and no documentation page ever
 * shows a refresh trace for content that could not have moved.
 */
import type { QueryClient } from '@tanstack/react-query';
import type { DocsManifest, DocsPageContent, DocsPageSummary } from './docsModel.js';
import { buildDocsIndex, type DocsIndexInput, type DocsSearchIndex } from './docsSearch.js';

/**
 * Where the compiled corpus is served from. Deliberately not `/docs`: the
 * static tree would then collide with the client routes at `/docs/*` and with
 * the prerendered HTML the SEO plugin writes for them.
 */
export const DOCS_CONTENT_BASE = 'docs-content';

/** An absolute URL for a content file, honouring a non-root deployment base. */
export function docsAsset(path: string): string {
  const base = import.meta.env.BASE_URL || '/';
  return `${base.endsWith('/') ? base : `${base}/`}${DOCS_CONTENT_BASE}/${path}`;
}

/**
 * Read one compiled file.
 *
 * `what` is a noun phrase that reads inside "Couldn't load ___", because a
 * failure here reaches the screen through `QueryBoundary`, which shows the
 * error's own message. "Failed to fetch" tells a reader nothing; "the
 * documentation index is not available (404)" tells them the build is
 * incomplete rather than their network is down.
 */
async function readContent<T>(path: string, what: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(docsAsset(path), { credentials: 'omit' });
  } catch {
    throw new Error(`Couldn’t reach ${what}. Check your connection and try again.`);
  }
  if (!response.ok) {
    throw new Error(`${what} is not available (${response.status}).`);
  }
  return (await response.json()) as T;
}

const FOREVER = { staleTime: Number.POSITIVE_INFINITY, gcTime: Number.POSITIVE_INFINITY } as const;

export function manifestQueryOptions() {
  return {
    queryKey: ['docs', 'manifest'] as const,
    queryFn: () => readContent<DocsManifest>('manifest.json', 'the documentation index'),
    ...FOREVER,
  };
}

export function pageQueryOptions(page: DocsPageSummary) {
  return {
    queryKey: ['docs', 'page', page.id] as const,
    queryFn: () => readContent<DocsPageContent>(page.content, `“${page.title}”`),
    ...FOREVER,
  };
}

/**
 * Warm a page before the reader asks for it. Called on pointer-enter and on
 * focus of a link, so following one is usually instant; a hover that goes
 * nowhere costs one cached fetch of a file measured in kilobytes.
 */
export function prefetchDocsPage(client: QueryClient, page: DocsPageSummary): void {
  void client.prefetchQuery(pageQueryOptions(page));
}

/**
 * The search index, built in the browser from the corpus text.
 *
 * The build emits prose rather than a finished index, so the index is assembled
 * here on first use. That is deliberate: the tokenizer that decides what a word
 * is comes from `@vitae/core`, which the Node build script cannot load, and two
 * tokenizers that agree until one is changed is the worst of both. Building
 * here means the words in the index and the words in the query are produced by
 * the same code in the same session.
 *
 * It costs one pass over the corpus, once, on the first search of a session,
 * and the result is cached forever like everything else here.
 */
interface DocsSearchText {
  version: 1;
  pages: readonly {
    id: string;
    headings: readonly { level: number; id: string; text: string }[];
    text: string;
  }[];
}

export function searchIndexQueryOptions(manifest: DocsManifest) {
  return {
    queryKey: ['docs', 'search-index'],
    queryFn: async (): Promise<DocsSearchIndex> => {
      const corpus = await readContent<DocsSearchText>('search-text.json', 'the search index');
      const byId = new Map(corpus.pages.map((page) => [page.id, page]));
      const inputs: DocsIndexInput[] = [];
      for (const summary of manifest.pages) {
        const text = byId.get(summary.id);
        // A page in the manifest with no text is a build that wrote one file
        // and not the other. Indexing its title alone is better than throwing:
        // the reader can still find it, and the gap is not silent because the
        // page will rank oddly rather than vanish.
        inputs.push({ summary, headings: text?.headings ?? [], text: text?.text ?? '' });
      }
      return buildDocsIndex(inputs);
    },
    ...FOREVER,
  };
}
