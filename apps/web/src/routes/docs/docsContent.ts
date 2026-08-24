/**
 * Reading the corpus over the authenticated API.
 *
 * This is the transport half of the documentation surface, split from
 * `docsModel.ts` so that the model half stays free of `fetch`, of
 * `import.meta.env` and of TanStack Query.
 *
 * The corpus used to be static files beside the application, readable by
 * anyone who knew the URL. It is not public: the curated half describes every
 * trust boundary and known gap in the system, and the generated half
 * enumerates every route, endpoint, table and exported symbol in the
 * repository. It now comes from `GET /docs/*` on the API, behind the same
 * default-deny gate and OWNER_EMAIL allow-list that protect the graph itself,
 * which is why every request here goes through `api.get` rather than a bare
 * `fetch`: that is where the bearer token, the session cookie and the rest of
 * the transport policy live, and a second copy of them would be a second thing
 * to get wrong.
 *
 * The corpus is a build artifact, so within one page load it cannot change.
 * Every query here is therefore `staleTime: Infinity`: navigating back to a
 * page already read is instant and silent, and no documentation page ever
 * shows a refresh trace for content that could not have moved.
 */
import type { QueryClient } from '@tanstack/react-query';
import { ApiError, api } from '../../lib/api.js';
import type { DocsManifest, DocsPageContent, DocsPageSummary } from './docsModel.js';
import { buildDocsIndex, type DocsIndexInput, type DocsSearchIndex } from './docsSearch.js';
import type { CatalogSpec, Row } from './docsReference.js';

/** The API mount the corpus is served from, relative to the API base URL. */
export const DOCS_CONTENT_BASE = '/docs';

/**
 * Read one compiled file.
 *
 * `what` is a noun phrase that reads inside "Couldn't load ___", because a
 * failure here reaches the screen through `QueryBoundary`, which shows the
 * error's own message.
 *
 * The three cases worth separating are the three a reader can act on. Not
 * signed in as the owner is the common one now that the corpus is private, and
 * saying "not available" for it would send someone to debug a build that is
 * fine. A deployment with no corpus in it is an operator's problem, not a
 * reader's. Everything else is a network or a genuinely missing file.
 */
async function readContent<T>(path: string, what: string): Promise<T> {
  try {
    return await api.get<T>(`${DOCS_CONTENT_BASE}/${path}`);
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status === 401 || error.status === 403) {
        throw new Error(
          'The documentation is private. Sign in at /signin with the account that owns this '
            + 'instance, then open this page again.',
        );
      }
      if (error.code === 'DOCS_UNAVAILABLE') {
        throw new Error(
          'No documentation was built into this deployment, so there is nothing to read here yet.',
        );
      }
      throw new Error(`${what} is not available (${error.status}).`);
    }
    throw new Error(`Couldn’t reach ${what}. Check your connection and try again.`);
  }
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

/**
 * One generated catalog, fetched when a reader opens it.
 *
 * The artifacts are copied out of `docs/generated/` unchanged, so what is shown
 * is what the generator wrote. A catalog missing from the build is an absent
 * file rather than an empty array: the surface reports it unavailable instead
 * of claiming the codebase has no routes.
 */
export function catalogQueryOptions(spec: CatalogSpec) {
  return {
    queryKey: ['docs', 'catalog', spec.artifact, spec.collection],
    queryFn: async (): Promise<readonly Row[]> => {
      const data = await readContent<Record<string, unknown>>(
        `reference/${spec.artifact}`,
        `the ${spec.title.toLowerCase()} catalog`,
      );
      const rows = data[spec.collection];
      if (!Array.isArray(rows)) {
        // The artifact loaded but does not hold what the spec expects, which
        // means a generator renamed a field. Saying so names the real problem;
        // rendering an empty table would report it as "nothing exists".
        throw new Error(
          `The ${spec.title.toLowerCase()} catalog has no "${spec.collection}" list. `
            + 'A generator changed shape, so this table cannot be trusted until it is regenerated.',
        );
      }
      return rows as readonly Row[];
    },
    ...FOREVER,
  };
}
