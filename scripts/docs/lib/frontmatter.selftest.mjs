#!/usr/bin/env node
/**
 * Prove the metadata reader reads what a page appears to say.
 *
 * A frontmatter block is read by the coverage ratchet, the status badge and
 * the link checker, and a page that means one thing to a person and another to
 * those three is worse than a page with no metadata at all. So the cases below
 * are split between what must parse and what must be refused: the reader
 * supports a closed subset, and everything outside it fails loudly with a line
 * number rather than being quietly misread.
 */
import { frontmatter } from './frontmatter.mjs';

let failures = 0;
const check = (label, actual, expected) => {
  const [a, b] = [JSON.stringify(actual), JSON.stringify(expected)];
  if (a === b) { console.log(`  ok  ${label}`); return; }
  failures += 1;
  console.error(`  FAIL ${label}\n       expected ${b}\n       actual   ${a}`);
};
const rejects = (label, text, fragment) => {
  try {
    frontmatter(text, { file: 'page.md' });
    failures += 1;
    console.error(`  FAIL ${label}: parsed instead of throwing`);
  } catch (error) {
    if (error.message.includes(fragment)) { console.log(`  ok  ${label}`); return; }
    failures += 1;
    console.error(`  FAIL ${label}\n       expected message containing ${JSON.stringify(fragment)}\n       actual   ${error.message}`);
  }
};

const page = (block, body = '\nBody.\n') => `---\n${block}\n---\n${body}`;

check('no block at all is null, not an empty block',
  frontmatter('# Just a heading\n').data, null);
check('a page with no block keeps its whole body',
  frontmatter('# Just a heading\n').body, '# Just a heading\n');
check('an empty block is an empty object',
  frontmatter(page('')).data, {});

check('scalars keep their types',
  frontmatter(page('title: A page\ndraft: false\nweight: 3\nnote: null')).data,
  { title: 'A page', draft: false, weight: 3, note: null });
check('a date stays a string',
  frontmatter(page('verified_at: 2026-08-23')).data.verified_at, '2026-08-23');
check('quotes are removed and their contents left alone',
  frontmatter(page("title: 'true'\nother: \"2026-08-23\"")).data, { title: 'true', other: '2026-08-23' });
check('a colon inside a value is part of the value',
  frontmatter(page('title: Vitae: a career ledger')).data.title, 'Vitae: a career ledger');
check('an inline list splits on commas',
  frontmatter(page('audience: [developer, maintainer]')).data.audience, ['developer', 'maintainer']);
check('an empty inline list is empty',
  frontmatter(page('audience: []')).data.audience, []);
check('a block list collects its items',
  frontmatter(page('sources:\n  - a/b.ts\n  - c/d.ts')).data.sources, ['a/b.ts', 'c/d.ts']);
check('a block list ends where the next key begins',
  frontmatter(page('sources:\n  - a/b.ts\nstatus: verified')).data,
  { sources: ['a/b.ts'], status: 'verified' });
check('a key with nothing after it is an empty list',
  frontmatter(page('sources:\nstatus: verified')).data.sources, []);
check('comments and blank lines are ignored',
  frontmatter(page('# why this page exists\n\nid: X  # trailing note')).data, { id: 'X' });
check('the body starts after the closing fence',
  frontmatter(page('id: X', '\n# Heading\n\nText.\n')).body, '# Heading\n\nText.\n');
check('the body line number counts the blank lines the body strips',
  frontmatter(page('id: X\ntitle: Y')).bodyLine, 6);
check('a byte-order mark does not hide the opening fence',
  frontmatter(`\uFEFF${page('id: X')}`).data, { id: 'X' });
check('bodyLine points at the first body line when it follows immediately',
  frontmatter('---\nid: X\n---\n# Heading\n').bodyLine, 4);
check('--- inside the body does not end the block early',
  frontmatter(page('id: X', '\nAbove.\n\n---\n\nBelow.\n')).data, { id: 'X' });

rejects('an unclosed block', '---\nid: X\n\nBody.\n', 'never closed');
rejects('a line that is not a key or a list item', page('id: X\nnot a pair'), 'page.md:3');
rejects('a duplicate key', page('id: X\nid: Y'), 'duplicate key id');
rejects('a list item with no key above it', page('- orphan'), 'no key above it');
rejects('nested mapping', page('meta:\n  nested: 1'), 'page.md:3');
rejects('a flow map', page('meta: { a: 1 }'), 'not supported');
rejects('a multi-line string', page('text: |\n  line'), 'not supported');
rejects('an inline list left open', page('audience: [a, b'), 'not closed on one line');
rejects('a nested inline list', page('audience: [[a], b]'), 'nested structures');

if (failures) {
  console.error(`\nfrontmatter selftest: ${failures} case(s) failed`);
  process.exit(1);
}
console.log('frontmatter selftest: ok');
