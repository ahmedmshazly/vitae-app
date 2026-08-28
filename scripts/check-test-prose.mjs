#!/usr/bin/env node
/**
 * Prose gate for the words a person will read: comments, test titles, the
 * strings the interface renders, and every markdown page.
 *
 * Two kinds of check, with different reach. Typographic characters no keyboard
 * produces are wrong wherever they land, so those run on every line. The phrase
 * list runs only where prose actually lives, because `leverage` is a reasonable
 * variable name and an unreasonable verb.
 *
 * An exemption is a file path in docs/testing/prose-allowlist.json, never a
 * substring. The previous version of this gate allow-listed the em dash itself,
 * which exempted every line that contained one, which is how it stayed green
 * while roughly fifteen hundred of them accumulated behind it.
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const allowPath = join(root, 'docs/testing/prose-allowlist.json');
const allow = existsSync(allowPath) ? JSON.parse(readFileSync(allowPath, 'utf8')) : { files: [] };
const allowFiles = new Set(allow.files ?? []);

const ROOTS = [
  'packages/config/src',
  'packages/core/src',
  'packages/testkit/src',
  'packages/ui/src',
  'apps/api/src',
  'apps/web/src',
  'services/buildsvc/src',
  'e2e/tests',
  'e2e/cloud',
  'scripts',
  'docs',
];

const SOURCE_EXT = /\.(ts|tsx|js|jsx|mjs|cjs|css)$/;
const TEXT_EXT = /\.(ts|tsx|js|jsx|mjs|cjs|css|md)$/;

// Fires on one use.
const BAD_PHRASES = [
  /comprehensive (test|suite|coverage)/i,
  /in today's (world|landscape)/i,
  /it is (important|worth) (to )?note/i,
  // The verb, not the noun. Followed by an article it is jargon; "leverage
  // points" and "high-leverage" are ordinary English.
  /\bleverag(?:e|es|ed|ing) (?:the|a|an|our|its|their|this|these|those) /i,
  /\bseamless(ly)? /i,
  /robust (and|solution)/i,
  /\bmyriad\b/i,
  /furthermore,? /i,
  /\bmoreover,? /i,
  /in conclusion/i,
  /\bnot (just|merely|only) .{0,60}\bbut\b/i,
];

// Individually defensible, collectively inflated. Reported at three or more in
// one file.
const SOFT_WORDS = [/\bcrucial\b/i, /\bpivotal\b/i, /\blandscape\b/i, /\brealm\b/i, /\bvital\b/i];
const SOFT_LIMIT = 3;

const DASH = /[–—]/;
const CURLY = /[‘’“”]/;
const ELLIPSIS = /…/; // prose-gate: a detector has to spell out what it detects
const NBSP = /[   ]/;

// Shapes where one of these characters is doing a job no hyphen can do. Blanked
// out before the character checks run, so they need no entry in the allowlist.
const KEEP = [
  // The empty-value glyph, alone in its literal: '—', `—`, content: '—'
  /(['"`])\s*[–—]\s*\1/g,
  // The same glyph as the whole of an element: <Mono>—</Mono>
  />\s*[–—]\s*</g,
  // An en dash spanning a range: 1–5, 42–44px, $180k–210k, 701–1080px
  /[0-9A-Za-z]–[0-9A-Za-z]/g, // prose-gate: the shape being kept
  // A regular-expression character class that matches the glyph: [—–], [\s─—=*-]
  /\[[^\]\n]{0,40}\]/g,
];

// An escape hatch scoped to one line, in whatever comment syntax the file uses,
// on the line itself or the one above it. It has to carry a reason, so the next
// reader can tell a fixture from an oversight.
//
//   const demo = 'a — b'; // prose-gate: the escaper's input needs the glyph
//
// prose-gate: the line above is the documentation, not a use
const MARKER = /\bprose-gate:[ \t]*\S/;

const MD_KEEP = [
  // Inline code is verbatim: a page may name `'—'` without using it.
  /`[^`\n]*`/g,
  // So is a link target.
  /\]\([^)\n]*\)/g,
];

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist' || name.startsWith('.')) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (TEXT_EXT.test(name)) out.push(full);
  }
  return out;
}

function blank(line, patterns) {
  let out = line;
  for (const re of patterns) out = out.replace(re, (m) => ' '.repeat(m.length));
  return out;
}

/** The spans of a source line a person reads rather than executes. */
function proseSpans(line) {
  const spans = [];
  const comment = line.match(/(?:^|[^:'"`\\])\/\/\s?(.*)$/);
  if (comment) spans.push(comment[1]);
  const block = line.match(/^\s*(?:\/\*+|\*(?!\/))\s?(.*?)(?:\*\/)?\s*$/);
  if (block && block[1]) spans.push(block[1]);
  for (const m of line.matchAll(/(['"`])((?:\\.|(?!\1)[^\\\n])*)\1/g)) spans.push(m[2]);
  return spans;
}

const findings = [];

for (const base of ROOTS) {
  for (const file of walk(join(root, base))) {
    const rel = relative(root, file);
    if (allowFiles.has(rel)) continue;
    const isMarkdown = rel.endsWith('.md');
    const isSource = SOURCE_EXT.test(rel);
    const lines = readFileSync(file, 'utf8').split(/\r?\n/);
    const softHits = [];
    let fenced = false;

    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      const at = `${rel}:${i + 1}`;

      if (isMarkdown && /^\s*(```|~~~)/.test(line)) {
        fenced = !fenced;
        continue;
      }
      if (fenced) continue;
      if (MARKER.test(line) || (i > 0 && MARKER.test(lines[i - 1]))) continue;

      const probe = blank(line, isMarkdown ? [...MD_KEEP, ...KEEP] : KEEP);
      const shown = () => probe.trim().slice(0, 90);
      if (DASH.test(probe)) findings.push(`${at}: em or en dash: ${shown()}`);
      if (CURLY.test(probe)) findings.push(`${at}: curly quote: ${shown()}`);
      if (ELLIPSIS.test(probe)) findings.push(`${at}: ellipsis character: ${shown()}`);
      if (NBSP.test(probe)) findings.push(`${at}: non-breaking space: ${shown()}`);

      const prose = isMarkdown ? [blank(line, MD_KEEP)] : isSource ? proseSpans(line) : [];
      for (const text of prose) {
        for (const re of BAD_PHRASES) {
          if (re.test(text)) findings.push(`${at}: matches ${re}: ${text.trim().slice(0, 90)}`);
        }
        for (const re of SOFT_WORDS) {
          if (re.test(text)) softHits.push(`${at}: ${text.trim().slice(0, 60)}`);
        }
      }
    }

    if (softHits.length >= SOFT_LIMIT) {
      findings.push(`${rel}: ${softHits.length} inflated words, over the limit of ${SOFT_LIMIT}`);
      for (const hit of softHits.slice(0, 5)) findings.push(`  ${hit}`);
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
