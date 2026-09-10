/**
 * The token table itself, read as text.
 *
 * jsdom loads no stylesheet and substitutes no custom property, so the only
 * way to assert anything about `tokens.css` is to parse it. That turns out to
 * be the right level anyway: what these tests protect is the *declaration*
 * side of the contract, and a computed-style assertion in a headless DOM would
 * only prove that jsdom echoes back whatever was set on an element.
 *
 * Two things are worth holding here and nowhere else.
 *
 * The `--ae-*` compatibility layer is load-bearing. Hundreds of files in
 * `apps/web` and `packages/ui` still name the previous identity's tokens, and
 * a `var()` with nothing behind it does not error: the property is dropped and
 * the failure shows up as a missing style on a screen nobody opened. So every
 * alias the previous identity shipped has to keep resolving, and this is the
 * list that says which ones.
 *
 * Reduced motion has to reach the aliases too. It does, because they are
 * `var()` references to `--d-*` rather than copies of the numbers, but "it
 * follows automatically" is exactly the kind of claim that stops being true
 * six months later when somebody writes a literal.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const HERE = dirname(fileURLToPath(import.meta.url));
const CSS = readFileSync(join(HERE, 'tokens.css'), 'utf8');

/** The stylesheet with comments blanked, so prose about a token is not read as
 * declaring one. Newlines are kept so a line number still means something. */
const LIVE = CSS.replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ' '));

/**
 * The body of one at-rule or selector block, found by its head.
 *
 * A brace counter rather than a regex, because `@media` blocks nest a `:root`
 * inside them and `[^}]*` stops at the inner block's closing brace.
 */
function blockBody(head: string): string {
  const start = LIVE.indexOf(head);
  if (start < 0) throw new Error(`tokens.css has no ${head} block`);
  const open = LIVE.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < LIVE.length; i += 1) {
    if (LIVE[i] === '{') depth += 1;
    else if (LIVE[i] === '}') {
      depth -= 1;
      if (depth === 0) return LIVE.slice(open + 1, i);
    }
  }
  throw new Error(`tokens.css never closes ${head}`);
}

/** Every custom property declared in a chunk of CSS, last declaration winning. */
function declarations(css: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of css.matchAll(/(--[\w-]+)\s*:\s*([^;{}]+);/g)) {
    out.set(m[1]!, m[2]!.replace(/\s+/g, ' ').trim());
  }
  return out;
}

const ROOT = declarations(blockBody(":root,\n[data-theme='light']"));

/**
 * What a name finally resolves to on `:root`, following single-hop `var()`
 * chains. An alias declared as `var(--bg)` is only useful if `--bg` is itself
 * declared, so following the chain is what actually proves the alias resolves.
 */
function resolve(name: string, scope: Map<string, string> = ROOT): string | null {
  const seen = new Set<string>();
  let current = name;
  for (;;) {
    if (seen.has(current)) return null;
    seen.add(current);
    const value = scope.get(current) ?? ROOT.get(current);
    if (value === undefined) return null;
    const hop = /^var\(\s*(--[\w-]+)\s*\)$/.exec(value);
    if (!hop) return value;
    current = hop[1]!;
  }
}

/**
 * Every `--ae-*` name the Quiet identity declared, which is the set of names
 * files across the repo are still entitled to use. Kept as a literal list
 * rather than derived from a `git show`, because the point is to pin the
 * contract: an alias disappearing should fail here, not silently reduce the
 * set this test checks.
 */
const QUIET_ALIASES = [
  '--ae-accent',
  '--ae-accent-2',
  '--ae-accent-bg',
  '--ae-accent-bg-soft',
  '--ae-accent-ink',
  '--ae-accent-soft',
  '--ae-accent-strong',
  '--ae-bg',
  '--ae-border',
  '--ae-border-control',
  '--ae-border-strong',
  '--ae-control-h',
  '--ae-control-h-lg',
  '--ae-control-h-sm',
  '--ae-danger',
  '--ae-data-event',
  '--ae-data-idea',
  '--ae-data-media',
  '--ae-data-other',
  '--ae-data-person',
  '--ae-data-place',
  '--ae-data-practice',
  '--ae-data-work',
  '--ae-dur',
  '--ae-dur-fast',
  '--ae-dur-slow',
  '--ae-ease',
  '--ae-ember',
  '--ae-faint',
  '--ae-fg',
  '--ae-fg-soft',
  '--ae-fg-strong',
  '--ae-focus-ring',
  '--ae-font-display',
  '--ae-font-mono',
  '--ae-font-sans',
  '--ae-hit-target',
  '--ae-info',
  '--ae-leading-normal',
  '--ae-leading-tight',
  '--ae-motion-rise',
  '--ae-motion-stagger',
  '--ae-muted',
  '--ae-muted-strong',
  '--ae-overlay',
  '--ae-radius',
  '--ae-radius-full',
  '--ae-radius-lg',
  '--ae-radius-sm',
  '--ae-rail',
  '--ae-row-h',
  '--ae-shadow-overlay',
  '--ae-space-1',
  '--ae-space-2',
  '--ae-space-3',
  '--ae-space-4',
  '--ae-space-5',
  '--ae-space-6',
  '--ae-space-8',
  '--ae-success',
  '--ae-surface',
  '--ae-surface-overlay',
  '--ae-surface-raised',
  '--ae-surface-sunken',
  '--ae-text-2xl',
  '--ae-text-3xl',
  '--ae-text-4xl',
  '--ae-text-base',
  '--ae-text-lg',
  '--ae-text-md',
  '--ae-text-sm',
  '--ae-text-xl',
  '--ae-text-xs',
  '--ae-trace-current',
  '--ae-trace-danger',
  '--ae-trace-idle',
  '--ae-trace-live',
  '--ae-trace-success',
  '--ae-trace-warning',
  '--ae-viz-1',
  '--ae-viz-2',
  '--ae-viz-3',
  '--ae-viz-4',
  '--ae-viz-5',
  '--ae-viz-6',
  '--ae-viz-7',
  '--ae-viz-8',
  '--ae-warning',
  '--ae-z-overlay',
  '--ae-z-popover',
  '--ae-z-toast',
] as const;

describe('compatibility aliases', () => {
  it('declares every --ae-* name the previous identity shipped', () => {
    const missing = QUIET_ALIASES.filter((name) => !ROOT.has(name));
    expect(missing).toEqual([]);
  });

  it('resolves every one of them to a real value, not to another dead name', () => {
    const dangling = QUIET_ALIASES.filter((name) => resolve(name) === null);
    expect(dangling).toEqual([]);
  });

  /* A literal would pin the old identity's colour onto the alias, so switching
     to dark or high contrast would move --bg and leave --ae-bg where it was.
     The type scale and the semantic states are the documented exceptions. */
  it('routes the themeable aliases through a new token rather than copying a value', () => {
    const exempt = /^--ae-(text-|leading-|success|warning|danger|ember|info)/;
    const copied = QUIET_ALIASES.filter(
      (name) => !exempt.test(name) && !ROOT.get(name)?.startsWith('var('),
    );
    expect(copied).toEqual([]);
  });

  it('keeps the previous type scale in pixels, so no existing screen is restyled', () => {
    expect(resolve('--ae-text-xs')).toBe('11px');
    expect(resolve('--ae-text-sm')).toBe('12px');
    expect(resolve('--ae-text-base')).toBe('14px');
    expect(resolve('--ae-text-md')).toBe('15px');
    expect(resolve('--ae-text-lg')).toBe('17px');
    expect(resolve('--ae-text-xl')).toBe('21px');
    expect(resolve('--ae-text-2xl')).toBe('30px');
    expect(resolve('--ae-text-3xl')).toBe('44px');
    expect(resolve('--ae-text-4xl')).toBe('64px');
    expect(resolve('--ae-leading-tight')).toBe('1.2');
    expect(resolve('--ae-leading-normal')).toBe('1.55');
  });

  it('points the surface and ink aliases at the tokens they were mapped to', () => {
    expect(resolve('--ae-bg')).toBe(resolve('--bg'));
    expect(resolve('--ae-surface')).toBe(resolve('--card'));
    expect(resolve('--ae-surface-raised')).toBe(resolve('--bg-2'));
    expect(resolve('--ae-border-control')).toBe(resolve('--line'));
    expect(resolve('--ae-fg')).toBe(resolve('--ink'));
    expect(resolve('--ae-muted')).toBe(resolve('--ink-2'));
    expect(resolve('--ae-accent')).toBe(resolve('--deleg'));
    expect(resolve('--ae-accent-2')).toBe(resolve('--sched'));
  });

  it('keeps the semantic states literal, because no quadrant colour means them', () => {
    expect(resolve('--ae-success')).toBe('#7eb795');
    expect(resolve('--ae-warning')).toBe('#c8a344');
    expect(resolve('--ae-danger')).toBe('#e17263');
    expect(resolve('--ae-ember')).toBe('#c98a3d');
    expect(resolve('--ae-info')).toBe('#9a9484');
  });
});

describe('themes', () => {
  it('makes light the default, so a document with no data-theme is still styled', () => {
    expect(ROOT.get('--bg')).toBe('#f2f0ea');
    expect(ROOT.get('--ink')).toBe('#0b0b0d');
  });

  /* Every surface and ink the aliases reach has to be redeclared per theme, or
     switching theme moves half the page and leaves the other half behind. */
  it.each([["[data-theme='dark']"], ["[data-theme='hc']"]])(
    'gives %s its own value for every aliased surface and ink',
    (selector) => {
      const theme = declarations(blockBody(selector));
      for (const token of ['--bg', '--bg-2', '--card', '--ink', '--ink-2', '--line']) {
        expect(theme.has(token), `${selector} does not redeclare ${token}`).toBe(true);
      }
    },
  );

  it('redeclares the quadrant colours per theme, since they carry meaning', () => {
    for (const selector of ["[data-theme='dark']", "[data-theme='hc']"]) {
      const theme = declarations(blockBody(selector));
      for (const token of ['--do', '--sched', '--deleg', '--elim']) {
        expect(theme.has(token), `${selector} does not redeclare ${token}`).toBe(true);
      }
    }
  });

  /* The two system queries are what a first visit gets, before anything is
     stored under `vitae.theme`. They are scoped to :root:not([data-theme]) so
     an explicit choice always wins over the operating system's. */
  it.each([['(prefers-color-scheme: dark)'], ['(prefers-contrast: more)']])(
    'answers %s for a document that has made no choice',
    (query) => {
      const body = blockBody(`@media ${query}`);
      expect(body).toContain(':root:not([data-theme])');
      expect(declarations(body).has('--bg')).toBe(true);
    },
  );
});

describe('reduced motion', () => {
  const REDUCED = declarations(blockBody('@media (prefers-reduced-motion: reduce)'));

  it('zeroes the three duration tokens', () => {
    expect(REDUCED.get('--d-quick')).toBe('0ms');
    expect(REDUCED.get('--d-base')).toBe('0ms');
    expect(REDUCED.get('--d-long')).toBe('0ms');
  });

  /* The aliases are not restated inside the media query, and must not be: they
     are var() references, so they zero with the tokens they name. This is the
     assertion that catches somebody "helpfully" giving --ae-dur a literal. */
  it('reaches the --ae-dur aliases through the tokens they name', () => {
    for (const alias of ['--ae-dur-fast', '--ae-dur', '--ae-dur-slow'] as const) {
      expect(resolve(alias, REDUCED), `${alias} does not zero under reduced motion`).toBe('0ms');
    }
  });

  it('leaves the easing curves alone, since a zero duration never samples them', () => {
    expect(REDUCED.has('--e-out')).toBe(false);
    expect(REDUCED.has('--e-pop')).toBe(false);
    expect(REDUCED.has('--e-settle')).toBe(false);
  });
});

describe('the motion scale', () => {
  it('declares the three durations the brand checker allows', () => {
    expect(ROOT.get('--d-quick')).toBe('140ms');
    expect(ROOT.get('--d-base')).toBe('260ms');
    expect(ROOT.get('--d-long')).toBe('520ms');
  });

  it('declares the three easings and no fourth', () => {
    expect(ROOT.get('--e-out')).toBe('cubic-bezier(0.2, 0.7, 0.2, 1)');
    expect(ROOT.get('--e-pop')).toBe('cubic-bezier(0.34, 1.56, 0.64, 1)');
    expect(ROOT.get('--e-settle')).toBe('cubic-bezier(0.22, 1.2, 0.36, 1)');
    const curves = [...ROOT.keys()].filter((name) => ROOT.get(name)?.includes('cubic-bezier'));
    expect(curves.sort()).toEqual(['--e-out', '--e-pop', '--e-settle']);
  });
});

describe('coarse pointers', () => {
  /* --ae-hit-target aliases --hit-target, so the 44px touch floor applies to
     the old name without the media query having to mention it. */
  it('raises the hit target for touch, and the alias comes with it', () => {
    const coarse = declarations(blockBody('@media (pointer: coarse)'));
    expect(coarse.get('--hit-target')).toBe('44px');
    expect(resolve('--ae-hit-target', coarse)).toBe('44px');
  });
});
