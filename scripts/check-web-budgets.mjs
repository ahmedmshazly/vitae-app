#!/usr/bin/env node
/**
 * Browser performance budget gate for apps/web/dist.
 *
 * When dist is missing (typical mid-dev), exit 0 with a warning unless
 * VITAE_REQUIRE_BUDGETS=true. After `pnpm --filter @vitae/web build`, this
 * fails the PR if main or any chunk exceeds the declared kb limits.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
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
