#!/usr/bin/env node
/**
 * Build docs/generated/tokens.json: the design tokens, what each one is for,
 * where it is overridden, and who actually uses it.
 *
 * `tokens.css` is unusually well commented: the file explains why 3px is the
 * largest radius and what contrast ratio each ink value was measured at. Prose
 * that restated any of that would be a copy that goes stale. What prose cannot
 * do, and what nothing in the repository currently answers, is the reverse
 * direction: given a token, which components depend on it, and is it used at
 * all. That decides whether a value can be changed safely, and it is the whole
 * reason to generate this rather than write it.
 *
 * Two disagreements are worth recording as data. A token declared and never
 * referenced is dead weight. The file's own "Legacy aliases" section says to
 * remove each alias once its last consumer lands, and this is the measurement
 * that makes that instruction actionable. A token referenced but never declared
 * is worse: `var(--ae-typo)` silently resolves to nothing and the property is
 * dropped, so the failure is a missing style rather than an error.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { root, sourceFiles } from './lib/workspace.mjs';
import { emit } from './lib/emit.mjs';

const TOKENS = 'packages/ui/src/styles/tokens.css';
/** Every tree whose files may declare or reference a token. */
const AREAS = ['packages/ui/src', 'apps/web/src'];

/** Strip a comment down to prose: no box-drawing rules, no leading asterisks. */
const prose = (text) =>
  text
    .replace(/^\s*\*+/gm, ' ')
    .replace(/[─—]{2,}/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Read one CSS file's custom-property declarations, carrying the section
 * heading and the explanation each one was written with.
 *
 * A scanner rather than a CSS parser: the thing that needs judgement is not the
 * grammar but the authoring convention, and no parser knows that a comment
 * alone on its line opens a section while a comment trailing a semicolon
 * annotates the declaration beside it.
 *
 * It does have to be a scanner and not a line reader. `--ae-font-display` is
 * declared over five lines, because its value is a font stack; a reader that
 * matched `--name: value;` within one line would miss it and then report the
 * eleven files using it as referencing an undeclared token. Statements end at
 * a semicolon, not at a newline, so the scan has to as well.
 */
function declarations(rel) {
  const text = readFileSync(join(root, rel), 'utf8');
  const lineAt = (offset) => text.slice(0, offset).split('\n').length;
  const out = [];
  const scopes = [];
  let section = null;
  let lastCommentEnd = -1;
  let lastComment = null;

  // Comments, block delimiters and declarations, in source order. Matching them
  // together is what keeps a `{` inside a comment from opening a scope.
  const scan = /\/\*[\s\S]*?\*\/|\{|\}|(--[a-z0-9-]+)\s*:\s*([^;{}]*);/g;
  let m;
  while ((m = scan.exec(text)) !== null) {
    const token = m[0];
    if (token.startsWith('/*')) {
      const body = prose(token.slice(2, -2));
      // Trailing a declaration on the same line: an annotation, already taken.
      const before = text.slice(text.lastIndexOf('\n', m.index) + 1, m.index);
      if (!before.trim()) {
        section = body || null;
      }
      lastCommentEnd = scan.lastIndex;
      lastComment = body;
      continue;
    }
    if (token === '{') {
      // The selector is whatever follows the previous statement: the last
      // `}`, `;` or comment close, whichever is nearest. Starting from `}`
      // alone swallows the `@import` above `@theme inline` and the scope stops
      // being recognisable as Tailwind's.
      const boundary = Math.max(
        text.lastIndexOf('}', m.index),
        text.lastIndexOf(';', m.index),
        text.lastIndexOf('*/', m.index) + 1,
      );
      const head = text.slice(boundary + 1, m.index);
      scopes.push(head.replace(/\s+/g, ' ').trim() || ':root');
      section = null;
      continue;
    }
    if (token === '}') {
      scopes.pop();
      section = null;
      continue;
    }

    const [, name, value] = m;
    // A comment that ends on this declaration's line, after it, is its note.
    const rest = text.slice(scan.lastIndex, text.indexOf('\n', scan.lastIndex) + 1 || undefined);
    const trailing = /^\s*\/\*([\s\S]*?)\*\//.exec(rest);
    const scope = scopes[scopes.length - 1] ?? ':root';
    out.push({
      name,
      value: value.replace(/\s+/g, ' ').trim(),
      note: trailing ? prose(trailing[1]) : null,
      section,
      scope,
      /**
       * Tailwind v4's `@theme inline` block is a declaration to the framework,
       * not to the cascade: Tailwind reads those names to generate utility
       * classes, so nothing in this repository writes `var(--color-canvas)`
       * and nothing should. Reporting them beside the Quiet tokens as unused
       * would name sixty healthy aliases as dead code, which is how a drift
       * report teaches people to ignore it.
       */
      consumed_by: scope.startsWith('@theme') ? 'tailwind' : 'css',
      // Everything outside the base block is a conditional override (coarse
      // pointers, reduced motion, print), and that is the token's whole
      // responsive and accessibility story.
      conditional: scopes.length > 1 || (scope !== ':root' && !scope.startsWith('@theme')),
      source: `${rel}:${lineAt(m.index)}`,
    });
  }
  void lastCommentEnd;
  void lastComment;
  return out;
}

const declaredIn = new Map();
const files = new Set([TOKENS]);
for (const dir of AREAS) {
  for (const rel of sourceFiles(dir, { tests: false })) files.add(rel);
}
// sourceFiles walks TypeScript; stylesheets are found the same way, by hand.
const cssFiles = [];
const stack = [...AREAS];
const { readdirSync, statSync } = await import('node:fs');
while (stack.length) {
  const dir = stack.pop();
  const abs = join(root, dir);
  if (!existsSync(abs)) continue;
  for (const name of readdirSync(abs)) {
    if (name === 'node_modules' || name === 'dist') continue;
    const rel = `${dir}/${name}`;
    if (statSync(join(root, rel)).isDirectory()) stack.push(rel);
    else if (name.endsWith('.css')) cssFiles.push(rel);
  }
}
cssFiles.sort();

for (const rel of cssFiles) {
  for (const decl of declarations(rel)) {
    const key = decl.name;
    if (!declaredIn.has(key)) declaredIn.set(key, []);
    declaredIn.get(key).push(decl);
  }
}

/**
 * Blank out comments while keeping every line and column where it was, so a
 * `path:line` citation still points at the right place.
 *
 * This is not fastidiousness. `app.css` carries a note explaining that a rule
 * once read `box-shadow: var(--ae-edge-light)`, "a token that does not exist
 * and so drew nothing at all". The comment is the record of the fix. Scanning
 * it as live code reports the one defect the codebase has already repaired, and
 * a drift report whose only finding is fictional is worse than no report.
 */
const stripComments = (text) =>
  text
    .replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/g, (line, lead) => lead + ' '.repeat(line.length - lead.length));

/** Every `var(--x)` reference, in stylesheets and in inline styles alike. */
const references = new Map();
const scanned = [...cssFiles];
for (const dir of AREAS) for (const rel of sourceFiles(dir)) scanned.push(rel);
for (const rel of scanned.sort()) {
  const text = stripComments(readFileSync(join(root, rel), 'utf8'));
  const lines = text.split('\n');
  lines.forEach((line, i) => {
    for (const m of line.matchAll(/var\(\s*(--[a-z0-9-]+)/g)) {
      if (!references.has(m[1])) references.set(m[1], []);
      references.get(m[1]).push({ file: rel, line: i + 1 });
    }
  });
}

const tokens = [...declaredIn.entries()]
  .map(([name, decls]) => {
    const base = decls.find((d) => !d.conditional) ?? decls[0];
    const uses = references.get(name) ?? [];
    return {
      name,
      value: base.value,
      note: base.note,
      section: base.section,
      source: base.source,
      consumed_by: base.consumed_by,
      // A token declared in more than one file is a token with a second opinion.
      declarations: decls.map((d) => ({ scope: d.scope, value: d.value, source: d.source })),
      overrides: decls.filter((d) => d.conditional).map((d) => ({ scope: d.scope, value: d.value, source: d.source })),
      // `var(--a, var(--b))` makes a token depend on another; so does any value
      // written in terms of one. Following that is what makes "what breaks if I
      // change this" answerable one hop out.
      derives_from: [...new Set([...base.value.matchAll(/var\(\s*(--[a-z0-9-]+)/g)].map((m) => m[1]))],
      used_by: [...new Set(uses.map((u) => u.file))].sort(),
      uses: uses.length,
    };
  })
  .sort((a, b) => a.name.localeCompare(b.name));

for (const token of tokens) {
  token.derives_into = tokens.filter((t) => t.derives_from.includes(token.name)).map((t) => t.name);
}

/**
 * A `var()` with no declaration behind it is not automatically a defect, and
 * saying so would make this list unreadable. Three things end up here:
 *
 *   Radix supplies `--radix-*` on its own elements at runtime.
 *   A component sets `--swatch` through a React `style` prop, so the value is
 *     computed per render and cannot appear in a stylesheet at all.
 *   Nothing sets it, and the property it feeds silently does not apply.
 *
 * Only the third is worth anyone's attention, so only the third is called
 * `missing`. `--ae-viz-` is its own category: it is the static half of
 * `var(--ae-viz-${slot})`, a name assembled at runtime, and it never exists.
 */
const declaredNames = new Set(tokens.map((t) => t.name));
const inlineSet = new Set();
for (const dir of AREAS) {
  for (const rel of sourceFiles(dir)) {
    const text = readFileSync(join(root, rel), 'utf8');
    for (const m of text.matchAll(/['"`](--[a-z0-9-]+)['"`]\s*:/g)) inlineSet.add(m[1]);
    for (const m of text.matchAll(/setProperty\(\s*[`'"](--[a-z0-9-]+)/g)) inlineSet.add(m[1]);
  }
}
const classify = (name) => {
  if (name.startsWith('--radix-')) return 'library';
  if (inlineSet.has(name)) return 'inline';
  if (name.endsWith('-')) return 'assembled';
  return 'missing';
};
const undeclared = [...references.keys()]
  .filter((n) => !declaredNames.has(n))
  .sort()
  .map((name) => ({
    name,
    origin: classify(name),
    referenced_at: references.get(name).map((u) => `${u.file}:${u.line}`),
  }));

const groups = {};
for (const t of tokens) {
  const family = /^--ae-([a-z]+)/.exec(t.name)?.[1] ?? /^--([a-z]+)/.exec(t.name)?.[1] ?? 'other';
  groups[family] = (groups[family] ?? 0) + 1;
}

emit({
  tokens,
  undeclared,
  files: cssFiles,
  summary: {
    tokens: tokens.length,
    files: cssFiles.length,
    declared_outside_tokens_css: tokens.filter((t) => !t.source.startsWith(TOKENS)).map((t) => t.name),
    with_conditional_overrides: tokens.filter((t) => t.overrides.length).map((t) => t.name),
    theme_aliases: tokens.filter((t) => t.consumed_by === 'tailwind').length,
    unused: tokens.filter((t) => t.uses === 0 && t.consumed_by === 'css').map((t) => t.name),
    undeclared: Object.fromEntries(
      ['missing', 'inline', 'library', 'assembled'].map((k) => [
        k,
        undeclared.filter((u) => u.origin === k).map((u) => u.name),
      ]),
    ),
    families: Object.fromEntries(Object.entries(groups).sort((a, b) => b[1] - a[1])),
  },
}, 'docs/generated/tokens.json', root, (d) =>
  `tokens: ${d.summary.tokens} across ${d.summary.files} stylesheets ` +
  `(${d.summary.theme_aliases} Tailwind aliases, ${d.summary.unused.length} unused, ` +
  `${d.summary.undeclared.missing.length} referenced with nothing declaring them, ` +
  `${d.summary.with_conditional_overrides.length} with conditional overrides)`);
