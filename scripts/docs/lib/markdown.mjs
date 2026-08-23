/**
 * The authoring dialect for the documentation corpus.
 *
 * Every curated page is Markdown, and something has to turn it into the typed
 * blocks the reader renders. That could have been a dependency. It is not, for
 * two reasons that outrank the convenience.
 *
 * The first is supply chain. This repository pins image digests, verifies
 * binary checksums and runs `pnpm audit --audit-level=high` in CI; a Markdown
 * parser is a large, deeply transitive dependency to accept for a dialect that
 * is closed and known in advance.
 *
 * The second is safety by construction. A general parser emits raw HTML,
 * which a React renderer can only display through `dangerouslySetInnerHTML`
 * plus a sanitiser — another dependency, and a permanent obligation to keep it
 * ahead of bypasses. Owning the subset means the renderer supports exactly
 * what this file emits and nothing else: there is no HTML to sanitise because
 * no HTML is ever produced.
 *
 * The dialect, in full:
 *
 *   ATX headings              # .. ######
 *   paragraphs                blank-line separated, lazily continued
 *   fenced code               ``` or ~~~ with an optional info string
 *   GFM pipe tables           with :--- / :---: / ---: alignment
 *   lists                     - * + and 1. , nested by two spaces
 *   GitHub alerts             > [!NOTE] .. > [!CAUTION]
 *   blockquotes               > without an alert marker
 *   thematic breaks           --- *** ___
 *   inline                    `code` **strong** *em* [text](href) ![alt](src)
 *
 * Everything else is refused with a file and line rather than silently
 * misread. That asymmetry is deliberate: a *block* that means something other
 * than it looks like is a documentation defect, so unsupported block syntax
 * throws. Inline text is the opposite — an unpaired asterisk or bracket is
 * ordinary prose, so unmatched inline delimiters stay literal instead of
 * turning a sentence about `a * b` into an error.
 */

/** Characters a backslash may escape, matching CommonMark's punctuation set. */
const ESCAPABLE = '\\`*_{}[]()#+-.!|>~<';

/**
 * The anchor for a heading.
 *
 * Deep links, the table of contents, the link checker and the search index all
 * have to agree on what `#how-it-works` refers to, so they all call this. The
 * rule is GitHub's, which means an anchor copied from a rendered page on
 * GitHub resolves in the reading surface too.
 */
export function slug(text) {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N} _-]/gu, '')
    .trim()
    .replace(/\s/g, '-');
}

/** Find the index just past a run of `open`..`close`, honouring backslash escapes and nesting. */
function matchDelimiter(text, start, open, close) {
  let depth = 0;
  for (let i = start; i < text.length; i += 1) {
    if (text[i] === '\\') {
      i += 1;
      continue;
    }
    if (text[i] === open) depth += 1;
    else if (text[i] === close) {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/**
 * Parse one line's worth of inline markup into typed nodes.
 *
 * Adjacent literal characters accumulate in `buf` and are flushed as a single
 * text node, so a sentence with no markup costs one node rather than one per
 * character.
 */
export function inline(text) {
  const out = [];
  let buf = '';
  const flush = () => {
    if (buf !== '') {
      out.push({ type: 'text', value: buf });
      buf = '';
    }
  };

  let i = 0;
  while (i < text.length) {
    const ch = text[i];

    if (ch === '\\' && i + 1 < text.length && ESCAPABLE.includes(text[i + 1])) {
      buf += text[i + 1];
      i += 2;
      continue;
    }

    // A code span ends at the next run of backticks of the same length, which
    // is how `` ` `` can contain a backtick.
    // A comment renders as nothing everywhere else, so leaving it as literal
    // text here would be the one case where the reader sees more than the
    // author wrote.
    if (text.startsWith('<!--', i)) {
      const close = text.indexOf('-->', i + 4);
      if (close !== -1) {
        i = close + 3;
        continue;
      }
    }

    if (ch === '`') {
      let run = 0;
      while (text[i + run] === '`') run += 1;
      const fence = '`'.repeat(run);
      const close = text.indexOf(fence, i + run);
      if (close !== -1) {
        flush();
        // A single leading and trailing space is stripping padding, not
        // content: it is what lets `` ` `` hold a bare backtick.
        out.push({ type: 'code', value: text.slice(i + run, close).replace(/^ (.*) $/, '$1') });
        i = close + run;
        continue;
      }
    }

    if (ch === '*') {
      const strong = text.startsWith('**', i);
      const marker = strong ? '**' : '*';
      const close = text.indexOf(marker, i + marker.length);
      // An empty span (`**` immediately closed) is punctuation, not emphasis.
      if (close !== -1 && close > i + marker.length) {
        flush();
        out.push({
          type: strong ? 'strong' : 'em',
          children: inline(text.slice(i + marker.length, close)),
        });
        i = close + marker.length;
        continue;
      }
    }

    if (ch === '!' && text[i + 1] === '[') {
      const alt = matchDelimiter(text, i + 1, '[', ']');
      if (alt !== -1 && text[alt + 1] === '(') {
        const href = matchDelimiter(text, alt + 1, '(', ')');
        if (href !== -1) {
          flush();
          out.push({
            type: 'image',
            alt: text.slice(i + 2, alt),
            src: text.slice(alt + 2, href),
          });
          i = href + 1;
          continue;
        }
      }
    }

    if (ch === '[') {
      const label = matchDelimiter(text, i, '[', ']');
      if (label !== -1 && text[label + 1] === '(') {
        const href = matchDelimiter(text, label + 1, '(', ')');
        if (href !== -1) {
          flush();
          out.push({
            type: 'link',
            href: text.slice(label + 2, href).trim(),
            children: inline(text.slice(i + 1, label)),
          });
          i = href + 1;
          continue;
        }
      }
    }

    buf += ch;
    i += 1;
  }

  flush();
  return out;
}

/** Flatten inline nodes back to plain text, for headings, search and anchors. */
export function plain(nodes) {
  return nodes
    .map((n) => {
      if (n.type === 'text' || n.type === 'code') return n.value;
      if (n.type === 'image') return n.alt;
      return plain(n.children);
    })
    .join('');
}

const ALERTS = new Set(['note', 'tip', 'important', 'warning', 'caution']);
const FENCE = /^(\s*)(`{3,}|~{3,})\s*([^`]*)$/;
const BULLET = /^(\s*)([-*+])\s+(.*)$/;
const ORDERED = /^(\s*)(\d{1,9})[.)]\s+(.*)$/;

/** A pipe-table delimiter row, which is what distinguishes a table from prose containing pipes. */
const DELIMITER_ROW = /^\s*\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)*\|?\s*$/;

/** Split `| a | b |` into cells, honouring `\|` inside a cell. */
function cells(line) {
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  const out = [];
  let buf = '';
  for (let i = 0; i < trimmed.length; i += 1) {
    if (trimmed[i] === '\\' && trimmed[i + 1] === '|') {
      buf += '|';
      i += 1;
      continue;
    }
    if (trimmed[i] === '|') {
      out.push(buf.trim());
      buf = '';
      continue;
    }
    buf += trimmed[i];
  }
  out.push(buf.trim());
  return out;
}

function alignments(row) {
  return cells(row).map((cell) => {
    const left = cell.startsWith(':');
    const right = cell.endsWith(':');
    if (left && right) return 'center';
    if (right) return 'right';
    if (left) return 'left';
    return null;
  });
}

/**
 * Turn a page body into typed blocks.
 *
 * The caller strips frontmatter first (see `frontmatter.mjs`) and passes
 * `startLine` so reported line numbers point at the real file rather than at
 * an offset nobody can act on.
 *
 * Returns the blocks plus two indexes every consumer would otherwise rebuild:
 * `headings` for the table of contents and anchor checking, and `links` with
 * line numbers for the link checker.
 */
export function markdown(body, { file = '<input>', startLine = 1 } = {}) {
  const lines = body.replace(/\r\n/g, '\n').split('\n');
  const blocks = [];
  const headings = [];
  const links = [];
  const seenAnchors = new Map();

  // Where a block ends up depends on how deep in a quote or list it started.
  // A callout or list item re-parses its own content, so `parse` takes the
  // line array as an argument: the nested call gets a copy with the markers
  // stripped, at the same indices, so a reported line still names the line the
  // author wrote.
  const at = (i) => `${file}:${startLine + i}`;

  function record(nodes, lineIndex) {
    for (const node of nodes) {
      if (node.type === 'link') {
        links.push({ href: node.href, text: plain(node.children), line: startLine + lineIndex });
        record(node.children, lineIndex);
      } else if (node.type === 'image') {
        links.push({ href: node.src, text: node.alt, line: startLine + lineIndex, image: true });
      } else if (node.children) {
        record(node.children, lineIndex);
      }
    }
  }

  /** Assign a unique anchor, suffixing duplicates the way GitHub does. */
  function anchor(text) {
    const base = slug(text) || 'section';
    const seen = seenAnchors.get(base) ?? 0;
    seenAnchors.set(base, seen + 1);
    return seen === 0 ? base : `${base}-${seen}`;
  }

  function parse(src, from, to, out, indent = 0) {
    let i = from;
    while (i < to) {
      const line = src[i].replace(/\s+$/, '');

      if (line.trim() === '') {
        i += 1;
        continue;
      }

      // A comment is the one form of HTML that is safe to accept, because it
      // produces no output in any renderer: there is no gap between what the
      // author sees and what the reader sees. `docs/specs/srs.md` marks its
      // generated region this way.
      if (/^\s*<!--/.test(line)) {
        let end = i;
        while (end < to && !src[end].includes('-->')) end += 1;
        if (end >= to) throw new Error(`${at(i)}: HTML comment opened and never closed`);
        i = end + 1;
        continue;
      }

      // A tag is the opposite: the author sees an element, the reader sees the
      // element spelled out as text. There is no sanitiser here by design —
      // that is the point — so refuse it rather than misrepresent it.
      if (/^\s*<[a-zA-Z/!]/.test(line)) {
        throw new Error(`${at(i)}: raw HTML is not part of the documentation dialect`);
      }

      const fence = FENCE.exec(line);
      if (fence && fence[1].length <= indent + 3) {
        const [, , marker, info] = fence;
        const closer = new RegExp(`^\\s*${marker[0] === '`' ? '`' : '~'}{${marker.length},}\\s*$`);
        let end = i + 1;
        while (end < to && !closer.test(src[end])) end += 1;
        if (end >= to) throw new Error(`${at(i)}: code fence opened and never closed`);
        const strip = fence[1].length;
        out.push({
          type: 'code',
          lang: info.trim() || null,
          code: src.slice(i + 1, end).map((l) => l.slice(0, strip).trim() === '' ? l.slice(strip) : l).join('\n'),
        });
        i = end + 1;
        continue;
      }

      if (/^\s{0,3}(-{3,}|\*{3,}|_{3,})\s*$/.test(line) && !BULLET.test(line)) {
        out.push({ type: 'rule' });
        i += 1;
        continue;
      }

      const heading = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
      if (heading) {
        const nodes = inline(heading[2]);
        const text = plain(nodes);
        const id = anchor(text);
        record(nodes, i);
        const block = { type: 'heading', level: heading[1].length, id, text, children: nodes };
        headings.push({ level: block.level, id, text });
        out.push(block);
        i += 1;
        continue;
      }

      if (/^\s*>/.test(line)) {
        let end = i;
        const inner = [];
        while (end < to && /^\s*>/.test(src[end])) {
          inner.push(src[end].replace(/^\s*>\s?/, ''));
          end += 1;
        }
        const alert = /^\[!([A-Za-z]+)\]\s*$/.exec(inner[0] ?? '');
        const tone = alert && ALERTS.has(alert[1].toLowerCase()) ? alert[1].toLowerCase() : null;
        if (alert && !tone) {
          throw new Error(
            `${at(i)}: unknown alert [!${alert[1]}] — use note, tip, important, warning or caution`,
          );
        }
        // The nested parse reads a copy with the `>` markers removed, at the
        // same indices, so a link inside a callout still reports the line the
        // author wrote it on.
        const quoted = src.slice();
        for (let k = 0; k < inner.length; k += 1) quoted[i + k] = inner[k];
        const children = [];
        parse(quoted, tone ? i + 1 : i, end, children, indent);
        out.push(tone ? { type: 'callout', tone, children } : { type: 'quote', children });
        i = end;
        continue;
      }

      const bullet = BULLET.exec(line);
      const ordered = ORDERED.exec(line);
      if ((bullet || ordered) && (bullet ?? ordered)[1].length <= indent + 3) {
        const isOrdered = Boolean(ordered && !bullet);
        const own = (bullet ?? ordered)[1].length;
        const items = [];
        let end = i;
        while (end < to) {
          // A blank line between two items belongs to the list. Testing for
          // the next marker at `end` rather than past the blank would end the
          // list at the first item an author chose to space out.
          let marker = end;
          while (marker < to && src[marker].trim() === '') marker += 1;
          if (marker >= to) break;
          const item = BULLET.exec(src[marker]) ?? ORDERED.exec(src[marker]);
          if (!item || item[1].length !== own) break;
          if (Boolean(ORDERED.exec(src[marker]) && !BULLET.exec(src[marker])) !== isOrdered) break;
          end = marker;

          // The item runs until the next sibling marker at this indent or a
          // line that is neither indented under it nor a lazy continuation.
          let stop = end + 1;
          while (stop < to) {
            const next = src[stop];
            if (next.trim() === '') {
              // A blank line only ends the item if what follows leaves it.
              const after = src[stop + 1] ?? '';
              const deeper = /^\s*$/.test(after) ? false : after.search(/\S/) > own;
              if (!deeper) break;
              stop += 1;
              continue;
            }
            const sibling = BULLET.exec(next) ?? ORDERED.exec(next);
            if (sibling && sibling[1].length <= own) break;
            if (next.search(/\S/) <= own && !sibling) break;
            stop += 1;
          }

          // Replacing the marker with equivalent indentation, rather than
          // removing the line, keeps the item's first line at its own index.
          const unmarked = src.slice();
          unmarked[end] = ' '.repeat(own + 2) + item[3];
          const children = [];
          parse(unmarked, end, stop, children, own + 1);
          items.push(children);
          end = stop;
        }
        out.push({ type: 'list', ordered: isOrdered, items });
        i = end;
        continue;
      }

      if (line.includes('|') && DELIMITER_ROW.test(src[i + 1] ?? '')) {
        const align = alignments(src[i + 1]);
        const head = cells(line);
        if (head.length !== align.length) {
          throw new Error(
            `${at(i)}: table header has ${head.length} cells but the delimiter row has ${align.length}`,
          );
        }
        let end = i + 2;
        const rows = [];
        while (end < to && src[end].trim() !== '' && src[end].includes('|')) {
          const row = cells(src[end]);
          if (row.length !== align.length) {
            throw new Error(
              `${at(end)}: table row has ${row.length} cells but the header has ${align.length}`,
            );
          }
          rows.push(row.map((c) => {
            const nodes = inline(c);
            record(nodes, end);
            return nodes;
          }));
          end += 1;
        }
        out.push({
          type: 'table',
          align,
          head: head.map((c) => {
            const nodes = inline(c);
            record(nodes, i);
            return nodes;
          }),
          rows,
        });
        i = end;
        continue;
      }

      // A paragraph absorbs following lines until a blank line or the start of
      // another block, which is what makes hard-wrapped prose read as one
      // paragraph instead of one per line.
      let end = i;
      const text = [];
      while (end < to) {
        const next = src[end].replace(/\s+$/, '');
        if (next.trim() === '') break;
        if (end > i) {
          if (/^\s*>/.test(next) || /^#{1,6}\s/.test(next)) break;
          if (FENCE.test(next) || /^\s{0,3}(-{3,}|\*{3,}|_{3,})\s*$/.test(next)) break;
          if (BULLET.test(next) || ORDERED.test(next)) break;
          if (next.includes('|') && DELIMITER_ROW.test(src[end + 1] ?? '')) break;
        }
        text.push(next.trim());
        end += 1;
      }
      const nodes = inline(text.join(' '));
      record(nodes, i);
      // A paragraph holding nothing but an image is a figure. The alt text is
      // the caption as well as the alternative, so the two cannot disagree.
      if (nodes.length === 1 && nodes[0].type === 'image') {
        out.push({ type: 'figure', src: nodes[0].src, caption: nodes[0].alt });
      } else {
        out.push({ type: 'paragraph', children: nodes });
      }
      i = end;
    }
  }

  parse(lines, 0, lines.length, blocks);
  return { blocks, headings, links };
}
