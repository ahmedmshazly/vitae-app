#!/usr/bin/env node
/**
 * Browser performance budget gate for apps/web/dist.
 *
 * When dist is missing (typical mid-dev), exit 0 with a warning unless
 * VITAE_REQUIRE_BUDGETS=true. After `pnpm --filter @vitae/web build`, this
 * fails the PR if main or any chunk exceeds the declared kb limits.
 *
 * It also refuses to measure a development bundle, because the numbers it
 * would print are not numbers about anything that ships.
 *
 * `.env.example` used to carry `NODE_ENV=development`, and both `README.md`
 * and `docs/ONBOARDING.md` open by copying that file to `.env`. Vite reads
 * `.env` through `loadEnv`, and in `resolveConfig` it captures
 * `isNodeEnvSet = !!process.env.NODE_ENV` before loading the config file, sets
 * `NODE_ENV` to production for a build, then writes `development` back if the
 * capture was false and the env file said so. A value in `.env` therefore
 * outranks the build command, and nothing inside `vite.config.ts` can
 * intervene — the capture that decides it already happened.
 *
 * The result was a local `pnpm build` that emitted the development JSX
 * runtime and the build machine's absolute source paths, ran about a megabyte
 * larger than the real bundle, and passed this gate at 98% of a limit it was
 * not entitled to be measured against. CI and the documented host build run
 * from a bare checkout with no `.env`, so what shipped was always correct; a
 * developer sizing a new lazy route against their own run was reading a
 * number 1,000 kb away from the truth. The line is gone from `.env.example`.
 * This check is here for every `.env` already copied from it.
 *
 * VITAE_WEB_ROOT points the gate at a fixture tree; the self-test sets it.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = process.env.VITAE_WEB_ROOT
  ? resolve(process.env.VITAE_WEB_ROOT)
  : join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'apps/web/dist/assets');
const budgetPath = join(root, 'docs/testing/web-budgets.json');
const requireBudgets = process.env.VITAE_REQUIRE_BUDGETS === 'true';

if (!existsSync(budgetPath)) {
  console.error('missing docs/testing/web-budgets.json');
  process.exit(1);
}

const budgets = JSON.parse(readFileSync(budgetPath, 'utf8'));

if (!existsSync(dist)) {
  const msg = 'web budgets: apps/web/dist/assets missing (run web build first)';
  if (requireBudgets) {
    console.error(msg);
    process.exit(1);
  }
  console.warn(`warn: ${msg}`);
  process.exit(0);
}

const files = readdirSync(dist).filter((f) => f.endsWith('.js'));
const sizes = files.map((f) => ({ name: f, kb: Math.ceil(statSync(join(dist, f)).size / 1024) }));
const totalKb = sizes.reduce((s, f) => s + f.kb, 0);
const largest = [...sizes].sort((a, b) => b.kb - a.kb)[0];

/**
 * What a development build leaves in the emitted JavaScript.
 *
 * `jsxDEV(` is the call form of React's development JSX runtime and appears in
 * no production build. The absolute path is the same runtime's `_jsxFileName`
 * constants: every component's location on the machine that ran the build,
 * readable by anyone the bundle is served to. `check-public-release.mjs` bans
 * exactly that string, and cannot see these — its file list comes from
 * `git ls-files --others --exclude-standard`, and `dist/` is git-ignored.
 */
function developmentSignals(names) {
  const runtime = [];
  const paths = [];
  for (const name of names) {
    const text = readFileSync(join(dist, name), 'utf8');
    if (text.includes('jsxDEV(') || text.includes('react-jsx-dev-runtime')) runtime.push(name);
    if (text.includes(root)) paths.push(name);
  }
  return { runtime, paths };
}

const signals = developmentSignals(files);
if (signals.runtime.length || signals.paths.length) {
  console.error('web budgets: this is a development build, so its size means nothing.');
  if (signals.runtime.length) {
    console.error(
      `  - ${signals.runtime.length} of ${files.length} chunks carry the development JSX runtime`,
    );
  }
  if (signals.paths.length) {
    console.error(
      `  - ${signals.paths.length} of ${files.length} chunks embed this machine's absolute source paths`,
    );
  }
  console.error('  A NODE_ENV in .env outranks the build command. Remove it and build again:');
  console.error('  packages/config/src/env.ts defaults it to development, and every container');
  console.error('  and CI job that needs another value sets it explicitly.');
  process.exit(1);
}

const failures = [];
if (totalKb > budgets.totalJsKb) {
  failures.push(`total JS ${totalKb}kb > ${budgets.totalJsKb}kb`);
}
if (largest && largest.kb > budgets.largestChunkKb) {
  failures.push(`largest chunk ${largest.name} ${largest.kb}kb > ${budgets.largestChunkKb}kb`);
}

if (failures.length) {
  console.error('web budgets failed:');
  for (const f of failures) console.error(`  - ${f}`);
  for (const s of sizes.sort((a, b) => b.kb - a.kb).slice(0, 8)) {
    console.error(`    ${s.kb.toString().padStart(5)}kb  ${s.name}`);
  }
  process.exit(1);
}

console.log(`web budgets: ok (total ${totalKb}kb, largest ${largest?.name} ${largest?.kb}kb)`);
