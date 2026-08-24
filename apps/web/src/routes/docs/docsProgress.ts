/**
 * What this reader has already read.
 *
 * A corpus of fifty pages is not read in one sitting, and the thing a returning
 * reader most needs is the one thing a static site cannot normally tell them:
 * where they stopped. This keeps that in `localStorage` and nowhere else. It is
 * not synced, not sent anywhere, and not readable by the API — the documentation
 * surface has no session and makes no requests, and remembering a reading
 * position must not be the thing that changes either of those.
 *
 * Every access is guarded. A private window, a browser configured to refuse
 * site data, or a quota that is already full all throw on `localStorage`, and
 * none of them is a reason for a documentation page to fail to render. The
 * feature simply is not there, which is the correct behaviour for a
 * convenience.
 */
import type { DocsManifest, DocsPageSummary } from './docsModel.js';

const KEY = 'vitae.docs.progress.v1';

/**
 * How many pages are remembered.
 *
 * Bounded because the list is written on every navigation and an unbounded one
 * would grow until a quota refused it — silently, on the reader's machine, long
 * after anyone could connect the failure to this file.
 */
const LIMIT = 200;

export interface DocsProgress {
  /** Page ids that have been opened, most recent last. */
  read: readonly string[];
  /** The page open when the reader last left. */
  last: string | null;
}

const NONE: DocsProgress = { read: [], last: null };

export function readDocsProgress(): DocsProgress {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return NONE;
    const parsed = JSON.parse(raw) as Partial<DocsProgress>;
    // Anything could be under this key: an older shape, another tab's bug, a
    // person editing it by hand. Validate rather than trust, because the
    // alternative is a crash on a page that had nothing to do with it.
    const read = Array.isArray(parsed.read) ? parsed.read.filter((id) => typeof id === 'string') : [];
    const last = typeof parsed.last === 'string' ? parsed.last : null;
    return { read, last };
  } catch {
    return NONE;
  }
}

/** Record that a page was opened, and return the progress after doing so. */
export function recordDocsVisit(id: string): DocsProgress {
  const current = readDocsProgress();
  const read = [...current.read.filter((entry) => entry !== id), id].slice(-LIMIT);
  const next: DocsProgress = { read, last: id };
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Nothing to do and nothing to say: the reader keeps their page, and the
    // next visit starts fresh.
  }
  return next;
}

export function forgetDocsProgress(): DocsProgress {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // Already effectively forgotten.
  }
  return NONE;
}

/**
 * How far through the corpus this reader is.
 *
 * Counted against the manifest rather than against the stored list, so a page
 * that has been retired stops counting instead of leaving someone permanently
 * at 51 of 50.
 */
export function docsProgressCount(
  manifest: DocsManifest,
  progress: DocsProgress,
): { read: number; total: number } {
  const known = new Set(manifest.pages.map((page) => page.id));
  const read = progress.read.filter((id) => known.has(id));
  return { read: read.length, total: manifest.pages.length };
}

/**
 * The page to offer as "continue reading".
 *
 * The first unread page after the last one opened, which is what a reader
 * working through a section actually wants. Falling back to the first unread
 * page anywhere covers the reader who jumped in from a search; falling back to
 * nothing covers the reader who has read everything, and offering them a page
 * they have already read would be worse than offering nothing.
 */
export function continueDocsReading(
  manifest: DocsManifest,
  progress: DocsProgress,
): DocsPageSummary | null {
  const read = new Set(progress.read);
  const pages = manifest.pages;
  const from = progress.last ? pages.findIndex((page) => page.id === progress.last) : -1;
  if (from >= 0) {
    for (let index = from + 1; index < pages.length; index += 1) {
      const page = pages[index]!;
      if (!read.has(page.id)) return page;
    }
  }
  return pages.find((page) => !read.has(page.id)) ?? null;
}

/** The pages this reader opened most recently, newest first. */
export function recentDocsPages(
  manifest: DocsManifest,
  progress: DocsProgress,
  limit = 5,
): readonly DocsPageSummary[] {
  const byId = new Map(manifest.pages.map((page) => [page.id, page]));
  const out: DocsPageSummary[] = [];
  for (let index = progress.read.length - 1; index >= 0 && out.length < limit; index -= 1) {
    const page = byId.get(progress.read[index]!);
    if (page) out.push(page);
  }
  return out;
}
