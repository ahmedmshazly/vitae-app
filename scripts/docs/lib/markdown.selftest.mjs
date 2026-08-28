#!/usr/bin/env node
/**
 * Prove the authoring dialect parses to what an author would predict.
 *
 * This parser exists so the reading surface never has to render arbitrary
 * HTML, which means it is the only thing standing between a written page and
 * what a reader sees. Two failure modes matter and they pull in opposite
 * directions, so the cases below are split to match.
 *
 * A block that quietly means something other than it looks like (a table with
 * a missing cell, a fence that swallowed the rest of the page) is a
 * documentation defect that no reviewer would catch, so those must throw with
 * a line number. Inline text is the reverse: an unpaired asterisk or a `[sic]`
 * is ordinary prose, and refusing it would make the dialect unusable for
 * writing about code. Those must stay literal.
 */
import { inline, markdown, plain, slug } from './markdown.mjs';

let failures = 0;
const check = (label, actual, expected) => {
  const [a, b] = [JSON.stringify(actual), JSON.stringify(expected)];
  if (a === b) { console.log(`  ok  ${label}`); return; }
  failures += 1;
  console.error(`  FAIL ${label}\n       expected ${b}\n       actual   ${a}`);
};
const rejects = (label, text, fragment) => {
  try {
    markdown(text, { file: 'page.md' });
    failures += 1;
    console.error(`  FAIL ${label}: parsed instead of throwing`);
  } catch (error) {
    if (error.message.includes(fragment)) { console.log(`  ok  ${label}`); return; }
    failures += 1;
    console.error(`  FAIL ${label}\n       expected message containing ${JSON.stringify(fragment)}\n       actual   ${error.message}`);
  }
};

/** Block types in order, which is the shape a renderer walks. */
const shape = (text) => markdown(text).blocks.map((b) => b.type);
const only = (text) => markdown(text).blocks[0];

console.log('anchors');
check('a heading slug matches the GitHub rule',
  slug('How it works: the request lifecycle'), 'how-it-works-the-request-lifecycle');
check('punctuation is dropped, not replaced',
  slug('`normalizeForMatch()` — why?'), 'normalizeformatch--why'); // prose-gate: a heading the slugger must survive
check('non-ASCII letters survive',
  slug('Übersicht der Daten'), 'übersicht-der-daten');
check('a removed symbol leaves both of its spaces, as GitHub does',
  slug('Ledger · Grafik'), 'ledger--grafik');
check('repeated headings get distinct anchors',
  markdown('## Mechanics\n\n## Mechanics\n\n## Mechanics\n').headings.map((h) => h.id),
  ['mechanics', 'mechanics-1', 'mechanics-2']);
check('a heading with no slug-able characters still gets an anchor',
  markdown('## !!!\n').headings[0].id, 'section');

console.log('inline');
check('an unpaired asterisk is prose, not an error',
  plain(inline('a * b')), 'a * b');
check('an unpaired bracket is prose, not a broken link',
  plain(inline('marked [sic] here')), 'marked [sic] here');
check('an empty emphasis span is punctuation',
  inline('**'), [{ type: 'text', value: '**' }]);
check('a code span may hold a backtick',
  inline('`` ` ``'), [{ type: 'code', value: '`' }]);
check('a backslash escapes a delimiter',
  plain(inline('literal \\*asterisks\\* here')), 'literal *asterisks* here');
check('emphasis nests inside strong',
  inline('**bold *and* more**'),
  [{ type: 'strong', children: [
    { type: 'text', value: 'bold ' },
    { type: 'em', children: [{ type: 'text', value: 'and' }] },
    { type: 'text', value: ' more' },
  ] }]);
check('a link may hold markup and parentheses in its target',
  inline('[**see** this](/docs/x(1))'),
  [{ type: 'link', href: '/docs/x(1)', children: [
    { type: 'strong', children: [{ type: 'text', value: 'see' }] },
    { type: 'text', value: ' this' },
  ] }]);
check('adjacent literals collapse into one text node',
  inline('plain sentence').length, 1);

console.log('blocks');
check('hard-wrapped prose is one paragraph',
  markdown('One line\nand its continuation.\n').blocks.length, 1);
check('a blank line separates paragraphs',
  shape('One.\n\nTwo.\n'), ['paragraph', 'paragraph']);
check('a heading interrupts a paragraph without a blank line',
  shape('Prose.\n## Heading\n'), ['paragraph', 'heading']);
check('a list interrupts a paragraph without a blank line',
  shape('Prose.\n- item\n'), ['paragraph', 'list']);
check('--- after prose is a rule, not a heading underline',
  shape('Prose.\n\n---\n\nMore.\n'), ['paragraph', 'rule', 'paragraph']);
check('- item is a list even though --- is a rule',
  only('- item\n').type, 'list');
check('a fence keeps its content verbatim',
  only('```\n  indented\n\n- not a list\n```\n').code, '  indented\n\n- not a list');
check('a longer fence may contain a shorter one',
  only('````\n```\ninner\n```\n````\n').code, '```\ninner\n```');
check('an info string becomes the language',
  only('```ts\nconst a = 1;\n```\n').lang, 'ts');
check('a bare fence has no language',
  only('```\nx\n```\n').lang, null);

console.log('lists');
check('two spaces of indent nests a list',
  markdown('- outer\n  - inner\n').blocks[0].items[0].map((b) => b.type),
  ['paragraph', 'list']);
check('an ordered list is marked ordered',
  only('1. one\n2. two\n').ordered, true);
check('switching marker kind starts a new list',
  shape('- bullet\n1. number\n'), ['list', 'list']);
check('a wrapped list item stays one item',
  only('- an item that wraps\n  onto the next line\n').items.length, 1);
check('a blank line inside an item does not split the list',
  only('- one\n\n  still one\n\n- two\n').items.length, 2);

console.log('callouts');
check('a GitHub alert becomes a toned callout',
  only('> [!WARNING]\n> Careful.\n').tone, 'warning');
check('the marker line is not part of the callout body',
  plain(only('> [!NOTE]\n> Body.\n').children[0].children), 'Body.');
check('a quote with no marker stays a quote',
  only('> Just a quote.\n').type, 'quote');
check('a callout may hold any block',
  only('> [!TIP]\n> - one\n> - two\n').children.map((b) => b.type), ['list']);

console.log('tables');
const table = only('| A | B | C |\n| :- | :-: | -: |\n| 1 | 2 | 3 |\n');
check('alignment comes from the delimiter row', table.align, ['left', 'center', 'right']);
check('a table has its header and its rows', [table.head.length, table.rows.length], [3, 1]);
check('an escaped pipe stays inside its cell',
  plain(only('| A |\n| - |\n| a \\| b |\n').rows[0][0]), 'a | b');
check('pipes in prose are not a table',
  only('This | that, no delimiter row.\n').type, 'paragraph');

console.log('indexes');
const page = markdown('Intro [one](/a).\n\n> [!NOTE]\n> Also [two](/b).\n', { startLine: 10 });
check('links carry the line they were written on',
  page.links, [
    { href: '/a', text: 'one', line: 10 },
    { href: '/b', text: 'two', line: 13 },
  ]);
check('an image is indexed as a link so the checker sees it',
  markdown('![alt](/m.png)\n').links, [{ href: '/m.png', text: 'alt', line: 1, image: true }]);
check('a lone image is a figure, captioned by its alt text',
  only('![A screen, fictional demo data](/m.png)\n'),
  { type: 'figure', src: '/m.png', caption: 'A screen, fictional demo data' });
check('an image beside prose stays inline',
  only('See ![alt](/m.png) there.\n').type, 'paragraph');

console.log('comments');
check('a block comment produces nothing',
  shape('Before.\n\n<!-- generated:x start -->\n\nAfter.\n'), ['paragraph', 'paragraph']);
check('a comment may span lines',
  shape('<!--\n  a note\n-->\nProse.\n'), ['paragraph']);
check('an inline comment disappears rather than being shown',
  plain(only('Text <!-- todo --> more.\n').children), 'Text  more.');

console.log('refusals');
rejects('raw block HTML', '<div class="x">\n', 'raw HTML');
rejects('an unclosed comment', '<!-- open\nand never closed\n', 'never closed');
rejects('an unclosed code fence', '```ts\nconst a = 1;\n', 'never closed');
rejects('an unknown alert name', '> [!DANGER]\n> Body.\n', 'unknown alert');
rejects('a row with too few cells', '| A | B |\n| - | - |\n| 1 |\n', 'page.md:3');
rejects('a header that disagrees with its delimiter row', '| A | B |\n| - |\n| 1 | 2 |\n', 'page.md:1');

if (failures) {
  console.error(`\nmarkdown selftest: ${failures} case(s) failed`);
  process.exit(1);
}
console.log('markdown selftest: ok');
