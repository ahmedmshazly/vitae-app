#!/usr/bin/env node
/**
 * Fail when a production module under core/api/web is neither colocated-tested
 * nor listed in docs/testing/source-test-map.json (with existing test files).
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
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

function colocatedTest(abs) {
  const candidates = [
    abs.replace(/\.tsx$/, '.test.tsx'),
    abs.replace(/\.tsx$/, '.test.ts'),
    abs.replace(/\.ts$/, '.test.ts'),
    abs.replace(/\.tsx?$/, '.spec.ts'),
  ];
  return candidates.find((c) => existsSync(c));
}

const missing = [];
const broken = [];

for (const base of ROOTS) {
  const absBase = join(root, base);
  if (!existsSync(absBase)) continue;
  for (const file of walk(absBase)) {
    const relPath = relative(root, file);
    if (matchesExclude(relPath)) continue;
    if (colocatedTest(file)) continue;
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
  for (const t of entry.tests ?? []) {
    if (!existsSync(join(root, t))) {
      broken.push(`${mod}: missing test ${t}`);
    }
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
