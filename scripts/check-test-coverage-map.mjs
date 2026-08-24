#!/usr/bin/env node
/**
 * Fail when a production module under core/api/web is neither colocated-tested
 * nor listed in docs/testing/source-test-map.json (with existing test files),
 * and fail when a map entry declares a module untested while its own test file
 * sits in the same directory.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// VITAE_MAP_ROOT lets the self-test point this gate at a fixture tree. Nothing
// else sets it, so a normal run always resolves the real repository root.
const root = process.env.VITAE_MAP_ROOT
  ? resolve(process.env.VITAE_MAP_ROOT)
  : join(dirname(fileURLToPath(import.meta.url)), '..');
const mapPath = join(root, 'docs/testing/source-test-map.json');
const map = JSON.parse(readFileSync(mapPath, 'utf8'));

const ROOTS = ['packages/core/src', 'apps/api/src', 'apps/web/src'];
const EXT = new Set(['.ts', '.tsx']);

function globToRegExp(glob) {
  let i = 0;
  let out = '^';
  while (i < glob.length) {
    if (glob.startsWith('**/', i)) {
      out += '(?:.*/)?';
      i += 3;
      continue;
    }
    if (glob.startsWith('**', i)) {
      out += '.*';
      i += 2;
      continue;
    }
    if (glob[i] === '*') {
      out += '[^/]*';
      i += 1;
      continue;
    }
    if (glob[i] === '?') {
      out += '[^/]';
      i += 1;
      continue;
    }
    const ch = glob[i];
    if ('\\.+$^|()[]{}'.includes(ch)) out += `\\${ch}`;
    else out += ch;
    i += 1;
  }
  return new RegExp(out + '$');
}

const excludeRes = (map.exclude_globs ?? []).map(globToRegExp);

function matchesExclude(relPath) {
  return excludeRes.some((re) => re.test(relPath));
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (name === 'node_modules' || name === 'dist' || name === '__tests__') continue;
      walk(full, out);
      continue;
    }
    const ext = name.includes('.') ? name.slice(name.lastIndexOf('.')) : '';
    if (!EXT.has(ext)) continue;
    out.push(full);
  }
  return out;
}

const TEST_NAME = /\.(test|spec)\.tsx?$/;
const listings = new Map();

function entriesOf(dir) {
  let names = listings.get(dir);
  if (!names) {
    names = existsSync(dir) ? readdirSync(dir) : [];
    listings.set(dir, names);
  }
  return names;
}

/** Does this test file import the module it sits beside? */
function namesModule(testAbs, stem) {
  const quoted = stem.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`from ['"]\\./${quoted}(\\.jsx?)?['"]`).test(readFileSync(testAbs, 'utf8'));
}

/**
 * Test files that sit beside a module and prove that module.
 *
 * Two naming shapes count. `<name>.test.ts`, `<name>.test.tsx` and
 * `<name>.spec.ts` are the plain colocated forms and count on their name
 * alone, because a few of them prove a component through the content module it
 * renders rather than by importing the component itself.
 *
 * The repository's other convention is a facet suffix: `Person.states.test.tsx`,
 * `AtlasCanvas.error.test.tsx`, `Person.log.test.ts`. Eighty-four of those sit
 * beside a module of the same stem in the directories this gate walks, and it
 * could not see one of them, which is how sixteen map entries came to declare a
 * module untested while its suite sat in the same directory. They count only
 * when the file imports the module, so a future `Foo.helpers.test.ts` proving
 * `Foo.helpers.ts` cannot be read as proof of `Foo.ts`. That costs recall on
 * purpose: fifty-two of the eighty-four import their module and count, and the
 * other thirty-two reach it through a route render or a content module and
 * still require a map entry. Demanding an entry for a tested module is a
 * nuisance; accepting the wrong file as proof is the failure this gate exists
 * to prevent.
 *
 * The original bug is worth keeping in mind here: `String.replace` returns the
 * input unchanged when the pattern misses, so building candidate paths that way
 * made every module resolve to itself and the gate could not fail. Listing the
 * directory and matching real names has no such silent identity case.
 */
function siblingTests(abs) {
  const dir = dirname(abs);
  const name = basename(abs);
  const stem = name.replace(/\.tsx?$/, '');
  const plain = new Set([`${stem}.test.ts`, `${stem}.test.tsx`, `${stem}.spec.ts`]);
  const found = [];
  for (const entry of entriesOf(dir)) {
    if (entry === name || !TEST_NAME.test(entry)) continue;
    if (plain.has(entry)) {
      found.push(join(dir, entry));
      continue;
    }
    if (entry.startsWith(`${stem}.`) && namesModule(join(dir, entry), stem)) {
      found.push(join(dir, entry));
    }
  }
  return found;
}

const missing = [];
const broken = [];

for (const base of ROOTS) {
  const absBase = join(root, base);
  if (!existsSync(absBase)) continue;
  for (const file of walk(absBase)) {
    const relPath = relative(root, file);
    if (matchesExclude(relPath)) continue;
    if (siblingTests(file).length > 0) continue;
    const entry = map.modules?.[relPath];
    if (!entry) {
      missing.push(relPath);
      continue;
    }
    const tests = entry.tests ?? [];
    if (tests.length === 0 && entry.exclude_reason) continue;
    if (tests.length === 0) {
      broken.push(`${relPath}: mapped without tests or exclude_reason`);
      continue;
    }
    for (const t of tests) {
      if (!existsSync(join(root, t))) broken.push(`${relPath}: missing test ${t}`);
    }
  }
}

for (const [mod, entry] of Object.entries(map.modules ?? {})) {
  const tests = entry.tests ?? [];
  for (const t of tests) {
    if (!existsSync(join(root, t))) {
      broken.push(`${mod}: missing test ${t}`);
    }
  }
  // A declared gap has to be a real one. An entry with no tests is read by
  // everyone as "nothing proves this yet", and sixteen entries said that while
  // a suite sat beside the module. An entry that names some of its siblings but
  // not all of them is incomplete rather than false, and is left alone.
  if (tests.length > 0) continue;
  const abs = join(root, mod);
  if (!existsSync(abs)) continue;
  const beside = siblingTests(abs).map((p) => relative(root, p));
  if (beside.length > 0) {
    const sits = beside.length === 1 ? 'sits' : 'sit';
    broken.push(`${mod}: declared untested while ${beside.join(', ')} ${sits} beside it`);
  }
}

if (missing.length || broken.length) {
  if (missing.length) {
    console.error(`Unmapped production modules (${missing.length}):`);
    for (const m of missing.sort()) console.error(`  - ${m}`);
  }
  if (broken.length) {
    console.error(`Broken map entries (${broken.length}):`);
    for (const b of [...new Set(broken)].sort()) console.error(`  - ${b}`);
  }
  console.error(
    '\nAdd a colocated *.test.ts, or map the module in docs/testing/source-test-map.json.',
  );
  process.exit(1);
}

console.log('source-test-map: ok');
