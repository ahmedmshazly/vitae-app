#!/usr/bin/env node
/**
 * Machine-checks the standing bans in docs/design/IDENTITY.md and the motion
 * law in brand-book.html ch.08, which until now were enforced by one unit
 * test and by whoever happened to read the docs.
 *
 * Every rule here corresponds to a ban that was written down, tried in a
 * previous identity, and removed on purpose. Anything genuinely intentional
 * goes in docs/design/brand-ban-allowlist.json with a reason, so an exception
 * costs a sentence rather than a silent drift.
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const allowPath = join(root, 'docs/design/brand-ban-allowlist.json');
const allow = existsSync(allowPath) ? JSON.parse(readFileSync(allowPath, 'utf8')) : { rules: {} };

const CSS_ROOTS = ['packages/ui/src/styles', 'apps/web/src/styles'];
const CODE_ROOTS = ['packages/ui/src', 'apps/web/src'];

/** The one easing. tokens.css: "Everything. There is one easing." */
const EASE = 'cubic-bezier(0.32, 0.72, 0, 1)';
/** 90 / 130 / 220 are the tokens; 25..125 are the stagger steps ch.08 caps at 5. */
const ALLOWED_MS = new Set([0, 25, 50, 75, 90, 100, 125, 130, 220]);

const RULES = {
  gradient: {
    why: 'gradients on chrome (IDENTITY.md standing bans)',
    test: (line) => /\b(linear|radial|conic)-gradient\s*\(/.test(line),
  },
  'backdrop-filter': {
    why: 'glassmorphism / backdrop-filter (IDENTITY.md non-negotiable 2)',
    test: (line) => /backdrop-filter\s*:/.test(line) || /backdropFilter\s*:/.test(line),
  },
  shadow: {
    why: 'glow or halo shadows; only dialogs and popovers carry elevation (tokens.css)',
    // A zero-blur box-shadow is a ring, which is a border drawn outside the
    // box, not elevation. Only a blurred shadow that does not name a token is
    // the banned thing.
    test: (line) => {
      const m = line.match(/box-shadow\s*:\s*([^;]+)/);
      if (!m) return false;
      const value = m[1];
      if (value.includes('var(--ae-shadow-overlay)') || value.includes('var(--ae-focus-ring)')) {
        return false;
      }
      if (/\bnone\b|\binherit\b|\bunset\b/.test(value)) return false;
      // One declaration may hold several comma-separated shadows, and any one
      // of them blurring is enough. Commas inside rgba()/color-mix() are not
      // separators, so blank the parenthesised runs before splitting.
      const masked = value.replace(/\([^()]*\)/g, (run) => run.replace(/,/g, ';'));
      return masked.split(',').some((shadow) => {
        // A length may be written unitless when it is zero, which is the usual
        // spelling of a glow: `0 0 10px`. Matching only `\d+px` saw one length
        // there, decided the shadow had no blur slot, and let every halo
        // through. Accept a bare number as a length too.
        const lengths = shadow.match(/(?<![\w.#-])-?\d*\.?\d+(?:px|rem|em)?(?![\w.%])/g) ?? [];
        // offset-x offset-y blur [spread]: index 2 is the blur radius, and a
        // zero-blur shadow is a ring (a border drawn outside the box), which
        // is permitted. Only a blurred shadow not naming a token is the ban.
        return lengths.length >= 3 && parseFloat(lengths[2]) !== 0;
      });
    },
  },
  easing: {
    why: 'a second easing curve (ch.08: there is one easing)',
    test: (line) => {
      const m = line.match(/cubic-bezier\s*\([^)]*\)/);
      if (!m) return false;
      return m[0].replace(/\s+/g, ' ').toLowerCase() !== EASE;
    },
  },
  duration: {
    why: 'a duration off the 90 / 130 / 220ms token scale (ch.08)',
    test: (line) => {
      if (!/(transition|animation|animation-duration|animation-delay|transition-duration|transition-delay)\s*:/.test(line)) {
        return false;
      }
      const ms = line.match(/(-?\d*\.?\d+)ms\b/g) ?? [];
      if (ms.some((v) => !ALLOWED_MS.has(parseFloat(v)))) return true;
      // A bare seconds value is always off the scale; the two documented
      // loops (spinner, skeleton) are allowlisted by file and line.
      return /(?<![\d.])(-?\d*\.?\d+)s\b/.test(line);
    },
  },
  'hover-transform': {
    why: 'travel on hover; hover is not a state change, so it gets tone only (ch.08)',
    test: (line, ctx) => ctx.selector.includes(':hover') && /^\s*transform\s*:/.test(line),
  },
  'raw-hex': {
    why: 'a raw hex outside the token system (IDENTITY.md "Utility naming")',
    // tokens.css is the one file where a hex is the point: it is the
    // definition site every other file is supposed to reference.
    test: (line, ctx) => !ctx.inPrint && !ctx.isTokens && /#[0-9a-fA-F]{3,8}\b/.test(line),
  },
};

const CODE_RULES = {
  'tailwind-animate': {
    why: "Tailwind's stock animations (bounce, ping, pulse) are banned motion",
    test: (line) => /\banimate-(bounce|ping|pulse)\b/.test(line),
  },
  gradient: RULES.gradient,
  'backdrop-filter': RULES['backdrop-filter'],
};

function walk(dir, exts, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist') continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      walk(full, exts, out);
      continue;
    }
    if (exts.some((e) => name.endsWith(e))) out.push(full);
  }
  return out;
}

function allowed(rule, rel, lineNo, line) {
  const entries = allow.rules?.[rule] ?? [];
  return entries.some((e) => {
    if (e.file !== rel) return false;
    if (e.line != null) return e.line === lineNo;
    if (e.match != null) return line.includes(e.match);
    return true;
  });
}

const findings = [];

for (const base of CSS_ROOTS) {
  for (const file of walk(join(root, base), ['.css'])) {
    const rel = relative(root, file);
    const isTokens = rel.endsWith('tokens.css');
    // Strip comments before scanning, keeping line numbers intact, so prose
    // about a colour a previous identity used is not read as shipping it.
    const stripped = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, (m) =>
      m.replace(/[^\n]/g, ' '),
    );
    const lines = stripped.split(/\r?\n/);
    const rawLines = readFileSync(file, 'utf8').split(/\r?\n/);
    let selector = '';
    let printDepth = -1;
    let depth = 0;
    for (let i = 0; i < lines.length; i += 1) {
      const line = rawLines[i];
      const bare = lines[i];
      if (/@media[^{]*\bprint\b/.test(bare) && printDepth < 0) printDepth = depth;
      if (bare.includes('{')) {
        const head = bare.slice(0, bare.indexOf('{')).trim();
        if (head && !head.startsWith('@')) selector = head;
        depth += (bare.match(/\{/g) ?? []).length;
      }
      if (bare.includes('}')) {
        depth -= (bare.match(/\}/g) ?? []).length;
        if (printDepth >= 0 && depth <= printDepth) printDepth = -1;
      }
      const ctx = { selector, inPrint: printDepth >= 0, isTokens };
      for (const [name, rule] of Object.entries(RULES)) {
        if (!rule.test(bare, ctx)) continue;
        if (allowed(name, rel, i + 1, line)) continue;
        findings.push(`${rel}:${i + 1}: ${name} (${rule.why})\n      ${line.trim().slice(0, 100)}`);
      }
    }
  }
}

for (const base of CODE_ROOTS) {
  for (const file of walk(join(root, base), ['.ts', '.tsx'])) {
    const rel = relative(root, file);
    if (/\.(test|spec)\.tsx?$/.test(rel)) continue;
    const lines = readFileSync(file, 'utf8').split(/\r?\n/);
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      if (/^\s*(\/\/|\*|\/\*)/.test(line)) continue;
      for (const [name, rule] of Object.entries(CODE_RULES)) {
        if (!rule.test(line, { selector: '', inPrint: false })) continue;
        if (allowed(name, rel, i + 1, line)) continue;
        findings.push(`${rel}:${i + 1}: ${name} (${rule.why})\n      ${line.trim().slice(0, 100)}`);
      }
    }
  }
}

if (findings.length) {
  console.error(`brand-bans findings (${findings.length}):`);
  for (const f of findings) console.error(`  ${f}`);
  console.error('\nIf one of these is deliberate, add it to docs/design/brand-ban-allowlist.json with a reason.');
  process.exit(1);
}

console.log('brand-bans: ok');
