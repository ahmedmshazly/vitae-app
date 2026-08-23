#!/usr/bin/env node
/**
 * Prove the coverage ratchet rejects what it claims to reject.
 *
 * A ratchet has two failure directions and both are silent. It can fail to
 * notice a new undocumented item, in which case the corpus falls behind the
 * code one route at a time. Or it can keep listing an item that has since been
 * documented or deleted, in which case the list stops describing anything and
 * nobody trusts it enough to shrink it. The cases below break each direction
 * on purpose.
 *
 * The seventh case is the one that matters most in this repository: the
 * inventory comes from generated artifacts, so a generator that renames a
 * field would hand the gate an empty list, and an empty list is
 * indistinguishable from a fully documented codebase.
 */
import { spawnSync, execSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
let failures = 0;

const REGISTRY = {
  note: 'Fixture.',
  catalogs: {
    route: {
      artifact: 'docs/generated/routes.json',
      collection: 'routes',
      id_field: 'path',
      exclude_when: { redirect_to: ['*'] },
    },
    token: { artifact: 'docs/generated/tokens.json', collection: 'tokens', id_field: 'name' },
  },
  filesystem_catalogs: {
    runbook: { glob: 'docs/runbooks/*.md', exclude: ['docs/runbooks/README.md'] },
  },
  requires_prose: {
    route: 'A screen needs an explanation.',
    runbook: 'A procedure needs to be reachable.',
  },
  generated_reference_only: { token: 'Covered by the generated catalog.' },
  undocumented: { route: ['/beta'], runbook: [] },
};

const ROUTES = {
  routes: [
    { path: '/alpha', redirect_to: null },
    { path: '/beta', redirect_to: null },
    { path: '/old', redirect_to: '/alpha' },
  ],
};
const TOKENS = { tokens: [{ name: '--ae-bg' }] };

const PAGE = `---
id: SCR-ALPHA
title: Alpha
covers: [route:/alpha, runbook:docs/runbooks/thing.md]
---

Alpha is the first screen.
`;

function fixture(mutate = () => {}) {
  const dir = mkdtempSync(join(tmpdir(), 'vitae-docs-coverage-'));
  mkdirSync(join(dir, 'scripts/docs/lib'), { recursive: true });
  mkdirSync(join(dir, 'docs/generated'), { recursive: true });
  mkdirSync(join(dir, 'docs/registry'), { recursive: true });
  mkdirSync(join(dir, 'docs/runbooks'), { recursive: true });
  mkdirSync(join(dir, 'docs/observatory/use'), { recursive: true });
  cpSync(join(here, 'check-docs-coverage.mjs'), join(dir, 'scripts/check-docs-coverage.mjs'));
  cpSync(join(here, 'docs/lib/frontmatter.mjs'), join(dir, 'scripts/docs/lib/frontmatter.mjs'));

  const state = {
    registry: structuredClone(REGISTRY),
    routes: structuredClone(ROUTES),
    tokens: structuredClone(TOKENS),
    page: PAGE,
    runbooks: ['docs/runbooks/README.md', 'docs/runbooks/thing.md'],
    untracked: [],
  };
  mutate(state, dir);

  writeFileSync(join(dir, 'docs/registry/coverage.json'), `${JSON.stringify(state.registry, null, 2)}\n`);
  writeFileSync(join(dir, 'docs/generated/routes.json'), `${JSON.stringify(state.routes, null, 2)}\n`);
  if (state.tokens !== undefined) {
    writeFileSync(join(dir, 'docs/generated/tokens.json'), `${JSON.stringify(state.tokens, null, 2)}\n`);
  }
  if (state.page !== null) writeFileSync(join(dir, 'docs/observatory/use/alpha.md'), state.page);
  for (const rel of state.runbooks) writeFileSync(join(dir, rel), '# Runbook\n');
  // Tracked, because the gate reads git rather than the working tree: an
  // untracked draft must not count as a published procedure. Anything in
  // `state.untracked` is written after the commit, so it is genuinely absent
  // from the index rather than merely named that way.
  execSync('git init -q && git add -A && git -c user.email=t@t -c user.name=t commit -qm f', { cwd: dir, stdio: 'pipe' });
  for (const rel of state.untracked ?? []) writeFileSync(join(dir, rel), '# Draft\n');
  return dir;
}

function check(label, { mutate, exit, expect = [], reject = [] }) {
  const dir = fixture(mutate);
  try {
    const run = spawnSync(process.execPath, [join(dir, 'scripts/check-docs-coverage.mjs')], {
      cwd: dir, encoding: 'utf8', env: { ...process.env, VITAE_DOCS_ROOT: dir },
    });
    const output = `${run.stdout ?? ''}${run.stderr ?? ''}`;
    const wrong = [];
    if (run.status !== exit) wrong.push(`exited ${run.status}, expected ${exit}`);
    for (const t of expect) if (!output.includes(t)) wrong.push(`missing ${JSON.stringify(t)}`);
    for (const t of reject) if (output.includes(t)) wrong.push(`unexpectedly mentions ${JSON.stringify(t)}`);
    if (wrong.length === 0) { console.log(`  ok  ${label}`); return; }
    failures += 1;
    console.error(`  FAIL ${label}: ${wrong.join('; ')}`);
    console.error(output.split('\n').map((l) => `       ${l}`).join('\n'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

check('a corpus that matches its ratchet passes', {
  mutate: () => {},
  exit: 0,
  expect: ['docs-coverage: ok', 'route 1/2', 'runbook 1/1', '1 awaiting prose'],
});

check('a redirect is not a screen and is never demanded', {
  mutate: () => {},
  exit: 0,
  reject: ['/old'],
});

check('a new undocumented item fails', {
  mutate: (s) => { s.routes.routes.push({ path: '/gamma', redirect_to: null }); },
  exit: 1,
  expect: ['newly undocumented', '/gamma'],
  reject: ['/beta,'],
});

check('an item documented but still on the ratchet fails', {
  mutate: (s) => { s.page = s.page.replace('route:/alpha', 'route:/beta'); },
  exit: 1,
  expect: ['still lists /beta', '--update'],
});

check('a deleted item still on the ratchet fails', {
  mutate: (s) => { s.routes.routes = s.routes.routes.filter((r) => r.path !== '/beta'); },
  exit: 1,
  expect: ['still lists /beta'],
});

check('a page covering something that does not exist fails', {
  mutate: (s) => { s.page = s.page.replace('route:/alpha', 'route:/nowhere'); },
  exit: 1,
  expect: ['covers route "/nowhere", which does not exist'],
});

check('a page covering an unknown domain fails', {
  mutate: (s) => { s.page = s.page.replace('route:/alpha', 'screen:/alpha'); },
  exit: 1,
  expect: ['covers unknown domain "screen"'],
});

// An inventory that silently becomes empty looks exactly like a codebase with
// nothing left to document.
check('a generator that renames its collection fails instead of reporting nothing', {
  mutate: (s) => { s.routes = { screens: s.routes.routes }; },
  exit: 1,
  expect: ['no array at "routes"', "generator's shape changed"],
});

check('a generator that renames its id field fails', {
  mutate: (s) => { s.routes.routes = s.routes.routes.map(({ path, ...rest }) => ({ url: path, ...rest })); },
  exit: 1,
  expect: ['has no "path"'],
});

check('a missing artifact is named, not ignored', {
  mutate: (s) => { s.tokens = undefined; },
  exit: 1,
  expect: ['docs/generated/tokens.json does not exist'],
});

check('an untracked runbook is a draft, not a published procedure', {
  mutate: (s) => { s.untracked.push('docs/runbooks/draft.md'); },
  exit: 0,
  reject: ['draft.md'],
});

check('unreadable frontmatter is reported with its page and line', {
  mutate: (s) => { s.page = s.page.replace('title: Alpha', '  nested:\n    deeper: 1'); },
  exit: 1,
  expect: ['alpha.md:'],
});

if (failures) {
  console.error(`\ncheck-docs-coverage selftest: ${failures} case(s) failed`);
  process.exit(1);
}
console.log('check-docs-coverage selftest: ok');
