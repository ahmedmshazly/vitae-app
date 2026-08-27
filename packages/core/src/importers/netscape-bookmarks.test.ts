import { describe, expect, it } from 'vitest';
import { parseNetscapeBookmarks } from './netscape-bookmarks.js';

const FILE = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
  <DT><H3 ADD_DATE="1700000000">Reading</H3>
  <DL><p>
    <DT><H3>ML</H3>
    <DL><p>
      <DT><A HREF="https://arxiv.org/abs/1706.03762" ADD_DATE="1704067200" TAGS="transformers,nlp">Attention Is All You Need</A>
    </DL><p>
    <DT><A HREF="https://example.com/a?x=1&amp;y=2" ADD_DATE="1704067200">A &amp; B</A>
  </DL><p>
  <DT><A HREF="https://root.example.com">Root link</A>
  <DT><A HREF="javascript:void(0)">Bookmarklet</A>
</DL><p>`;

describe('parseNetscapeBookmarks', () => {
  it('parses links with folder paths, tags, and dates', () => {
    const [paper, ab, root] = parseNetscapeBookmarks(FILE);
    expect(paper).toEqual({
      url: 'https://arxiv.org/abs/1706.03762',
      title: 'Attention Is All You Need',
      folders: ['Reading', 'ML'],
      tags: ['transformers', 'nlp'],
      addedAt: '2024-01-01',
      identityKeys: ['bookmark:link:https://arxiv.org/abs/1706.03762'],
    });
    expect(ab!.title).toBe('A & B');
    expect(ab!.url).toBe('https://example.com/a?x=1&y=2');
    expect(ab!.folders).toEqual(['Reading']);
    expect(root!.folders).toEqual([]);
  });

  it('skips non-http(s) schemes', () => {
    expect(parseNetscapeBookmarks(FILE)).toHaveLength(3);
  });

  it('keys a link on its URL so a second export of it converges', () => {
    const [, ab, root] = parseNetscapeBookmarks(FILE);
    expect(ab!.identityKeys).toEqual(['bookmark:link:https://example.com/a?x=1&y=2']);
    // The bare trailing slash is not part of which page this is.
    expect(root!.identityKeys).toEqual(['bookmark:link:https://root.example.com']);
  });
});
