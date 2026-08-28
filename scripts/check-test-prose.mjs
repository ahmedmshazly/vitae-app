#!/usr/bin/env node
/**
 * Lightweight AST-ish prose gate for test titles and line comments.
 * Flags em/en dashes and a short list of filler phrases.
 * Allow-lists intentional product/fixture strings via docs/testing/prose-allowlist.json.
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const allowPath = join(root, 'docs/testing/prose-allowlist.json');
const allow = existsSync(allowPath)
  ? JSON.parse(readFileSync(allowPath, 'utf8'))
  : { substrings: [], files: [] };

const ROOTS = [
  'packages/core/src',
  'packages/testkit/src',
  'packages/ui/src',
  'apps/api/src',
  'apps/web/src',
  'e2e/tests',
  'e2e/cloud',
];

const BAD_PHRASES = [
  /comprehensive (test|suite|coverage)/i,
  /in today's (world|landscape)/i,
  /it is (important|worth) (to )?note/i,
  /leverages? /i,
  /seamless(ly)? /i,
  /robust (and|solution)/i,
  /furthermore,? /i,
  /in conclusion/i,
];

const DASH = /[—–]/;

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (name === 'node_modules' || name === 'dist') continue;
      walk(full, out);
      continue;
    }
    if (/\.(test|spec)\.(ts|tsx|mjs|js)$/.test(name) || /\/helpers\//.test(full)) {
      out.push(full);
    }
  }
  return out;
}

function isAllowed(rel, text) {
  if ((allow.files ?? []).includes(rel)) return true;
  return (allow.substrings ?? []).some((s) => text.includes(s));
}

const findings = [];

for (const base of ROOTS) {
  for (const file of walk(join(root, base))) {
    const rel = relative(root, file);
    const src = readFileSync(file, 'utf8');
    const lines = src.split(/\r?\n/);
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      // describe/it/test titles
      const title = line.match(/\b(?:describe|it|test)\s*(?:\.\w+)?\s*\(\s*(['"`])([\s\S]*?)\1/);
      const comment = line.match(/^\s*\/\/\s*(.*)$/);
      const targets = [];
      if (title) targets.push({ kind: 'title', text: title[2] });
      if (comment) targets.push({ kind: 'comment', text: comment[1] });
      for (const t of targets) {
        if (isAllowed(rel, t.text)) continue;
        if (DASH.test(t.text)) {
          findings.push(`${rel}:${i + 1}: ${t.kind} contains em/en dash: ${t.text.slice(0, 80)}`);
        }
        for (const re of BAD_PHRASES) {
          if (re.test(t.text)) {
            findings.push(`${rel}:${i + 1}: ${t.kind} matches ${re}: ${t.text.slice(0, 80)}`);
          }
        }
      }
    }
  }
}

if (findings.length) {
  console.error(`test-prose findings (${findings.length}):`);
  for (const f of findings.slice(0, 80)) console.error(`  ${f}`);
  if (findings.length > 80) console.error(`  ... ${findings.length - 80} more`);
  process.exit(1);
}

console.log('test-prose: ok');
