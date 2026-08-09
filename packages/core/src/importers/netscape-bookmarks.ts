/**
 * Netscape bookmark-file parser (SRS FR-IMP: Bookmarks import). The de-facto
 * export format of every browser: nested <DL> lists of <DT><H3> folders and
 * <DT><A> links. Folder path becomes tags; ADD_DATE (unix seconds) becomes the
 * saved date. Regex-driven, the format is line-oriented and never valid HTML,
 * so a DOM parser buys nothing.
 */

export interface Bookmark {
  url: string;
  title: string;
  /** Folder path, outermost first, e.g. ["Reading", "ML"]. */
  folders: string[];
  /** TAGS attribute if the browser exported one. */
  tags: string[];
  addedAt: string | null; // YYYY-MM-DD
}

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

function attr(tag: string, name: string): string | null {
  const m = tag.match(new RegExp(`${name}="([^"]*)"`, 'i'));
  return m ? m[1]! : null;
}

export function parseNetscapeBookmarks(html: string): Bookmark[] {
  const bookmarks: Bookmark[] = [];
  const stack: string[] = [];

  // Tokens we care about, in document order.
  const re = /<H3[^>]*>(.*?)<\/H3>|<A\s([^>]*)>(.*?)<\/A>|<\/DL>/gis;
  let m: RegExpExecArray | null;
  let pendingFolder: string | null = null;

  while ((m = re.exec(html)) !== null) {
    if (m[0].toUpperCase().startsWith('<H3')) {
      // A folder header, becomes active when its <DL> opens; since <DL>
      // always directly follows <H3> in this format, push eagerly.
      pendingFolder = decodeEntities(m[1]!.trim());
      stack.push(pendingFolder);
    } else if (m[0].toUpperCase().startsWith('</DL')) {
      stack.pop();
    } else if (m[2] !== undefined) {
      const attrs = m[2];
      const url = attr(`<A ${attrs}>`, 'HREF');
      if (!url || !/^https?:/i.test(url)) continue;
      const added = attr(`<A ${attrs}>`, 'ADD_DATE');
      const tagsAttr = attr(`<A ${attrs}>`, 'TAGS');
      bookmarks.push({
        url: decodeEntities(url),
        title: decodeEntities(m[3]!.trim()) || url,
        folders: [...stack],
        tags: tagsAttr ? tagsAttr.split(',').map((t) => t.trim()).filter(Boolean) : [],
        addedAt: added && /^\d+$/.test(added) ? new Date(Number(added) * 1000).toISOString().slice(0, 10) : null,
      });
    }
  }
  return bookmarks;
}
