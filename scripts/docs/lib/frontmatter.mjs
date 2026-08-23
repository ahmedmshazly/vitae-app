/**
 * The metadata block at the top of a documentation page.
 *
 * Every page in the corpus declares what it is — audience, domain, status, the
 * source files it describes, the requirements it satisfies — and several gates
 * read that block: the coverage ratchet asks what a page covers, the status
 * badge asks what it claims, the link checker asks what it points at. They all
 * need the same reader, and a page that parses differently in two of them is
 * a page whose metadata means nothing.
 *
 * This reads a deliberately small subset of YAML, closed rather than partial:
 * scalars, inline lists, block lists, and comments. It is not a YAML parser
 * and does not pretend to be one — anchors, nesting, multi-line strings and
 * flow maps are rejected with the line number rather than silently
 * misinterpreted, because a metadata block that quietly means something other
 * than it appears to is worse than one that fails to load.
 */

/** `true`/`false` become booleans; a bare number becomes a number; the rest stay strings. */
function scalar(raw) {
  const text = raw.trim();
  if (text === '') return '';
  if (text === 'true') return true;
  if (text === 'false') return false;
  if (text === 'null' || text === '~') return null;
  const quoted = /^'(.*)'$/.exec(text) ?? /^"(.*)"$/.exec(text);
  if (quoted) return quoted[1];
  // A date is left as written. `2026-08-23` is a date to a person and 2026
  // minus 8 minus 23 to anything that coerces too eagerly.
  if (/^-?\d+(\.\d+)?$/.test(text)) return Number(text);
  return text;
}

/** `[a, b]` — one level, scalars only, which is all a metadata list ever is. */
function inlineList(text) {
  const inner = text.slice(1, -1).trim();
  if (inner === '') return [];
  if (inner.includes('[') || inner.includes('{')) return null;
  return inner.split(',').map(scalar);
}

/**
 * Split a page into its metadata block and its body.
 *
 * Returns `data: null` when there is no block at all, which is a different
 * answer from an empty block and lets a checker say "this page has no
 * frontmatter" rather than "this page declares nothing".
 */
export function frontmatter(text, { file = '<input>' } = {}) {
  const normalized = text.replace(/^\uFEFF/, '');
  if (!/^---\r?\n/.test(normalized)) return { data: null, body: normalized, bodyLine: 1 };

  const lines = normalized.split('\n');
  const end = lines.findIndex((line, i) => i > 0 && /^---\s*$/.test(line.replace(/\r$/, '')));
  if (end === -1) throw new Error(`${file}: frontmatter opened with --- and never closed`);

  const data = {};
  let listKey = null;
  for (let i = 1; i < end; i += 1) {
    const line = lines[i].replace(/\r$/, '');
    const at = `${file}:${i + 1}`;
    if (line.trim() === '' || /^\s*#/.test(line)) continue;

    const item = /^\s*-\s+(.*)$/.exec(line);
    if (item) {
      if (!listKey) throw new Error(`${at}: list item with no key above it`);
      data[listKey].push(scalar(item[1]));
      continue;
    }

    const pair = /^([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(line);
    if (!pair) throw new Error(`${at}: expected "key: value", got ${JSON.stringify(line)}`);
    const [, key, rest] = pair;
    if (key in data) throw new Error(`${at}: duplicate key ${key}`);
    listKey = null;

    if (rest.trim() === '') {
      // Either a block list follows, or the key is genuinely empty. Deciding
      // here rather than looking ahead keeps the loop single-pass; an empty
      // list and an empty value are the same absence to every caller.
      data[key] = [];
      listKey = key;
      continue;
    }
    if (rest.startsWith('[')) {
      if (!rest.trimEnd().endsWith(']')) throw new Error(`${at}: inline list is not closed on one line`);
      const list = inlineList(rest.trim());
      if (list === null) throw new Error(`${at}: nested structures are not supported in frontmatter`);
      data[key] = list;
      continue;
    }
    if (rest.startsWith('{') || rest.startsWith('|') || rest.startsWith('>')) {
      throw new Error(`${at}: ${JSON.stringify(rest[0])} is not supported in frontmatter`);
    }
    data[key] = scalar(rest.replace(/\s+#.*$/, ''));
  }

  // A key that took the block-list branch but got no items is an empty value,
  // not an empty list — `verified_at:` with nothing after it means unknown.
  const rest = lines.slice(end + 1).join('\n');
  const body = rest.replace(/^\n+/, '');
  return {
    data,
    body,
    // Blank lines between the block and the first heading are dropped from the
    // body, so the starting line has to move with them. A `bodyLine` that
    // ignored the strip would put every line the body parser reports one row
    // early, and a checker that names the wrong line is worse than one that
    // names no line at all.
    bodyLine: end + 2 + /^\n*/.exec(rest)[0].length,
  };
}
