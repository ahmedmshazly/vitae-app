#!/usr/bin/env node
/**
 * Productivity performance budgets (NFR-PROD-001).
 *
 * Fails when a measured route chunk exceeds docs/testing/productivity-budgets.json,
 * or when that file is missing a required numeric key. Matrix interaction,
 * analytics latency, memory, and API query counts are the same numbers, enforced
 * by colocated tests that read this file — a log without a failing check is a
 * defect.
 *
 * Missing apps/web/dist/assets fails (NFR-PROD-001). There is no warn-and-pass
 * hatch: a log without a failing check is a defect. VITAE_WEB_ROOT /
 * VITAE_BUDGETS_PATH point the gate at a fixture tree.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = process.env.VITAE_WEB_ROOT
  ? resolve(process.env.VITAE_WEB_ROOT)
  : join(dirname(fileURLToPath(import.meta.url)), '..');
const budgetPath = process.env.VITAE_BUDGETS_PATH
  ? resolve(process.env.VITAE_BUDGETS_PATH)
  : join(root, 'docs/testing/productivity-budgets.json');

if (!existsSync(budgetPath)) {
  console.error('missing docs/testing/productivity-budgets.json');
  process.exit(1);
}

const budgets = JSON.parse(readFileSync(budgetPath, 'utf8'));
const required = [
  'matrixInteractionMs',
  'analyticsP95Ms',
  'productivityRouteChunkKb',
  'memoryMb',
  'tasksQueryCount',
  'analyticsQueryCount',
];
const missing = required.filter((key) => typeof budgets[key] !== 'number');
if (missing.length) {
  console.error(`productivity budgets: missing numeric keys ${missing.join(', ')}`);
  process.exit(1);
}

const failures = [];
const dist = join(root, 'apps/web/dist/assets');
if (!existsSync(dist)) {
  failures.push('productivity budgets: apps/web/dist/assets missing (run web build first)');
} else {
  const files = readdirSync(dist).filter((f) => f.endsWith('.js'));
  const sizes = files
    .filter((f) => /productivity/i.test(f))
    .map((f) => ({ name: f, kb: Math.ceil(statSync(join(dist, f)).size / 1024) }));
  const largest = [...sizes].sort((a, b) => b.kb - a.kb)[0];
  if (sizes.length === 0) {
    failures.push(
      'productivity budgets: no production JS chunk name matches /productivity/i (lazy route must keep a measurable chunk)',
    );
  } else if (largest.kb > budgets.productivityRouteChunkKb) {
    failures.push(
      `productivity chunk ${largest.name} ${largest.kb}kb > ${budgets.productivityRouteChunkKb}kb`,
    );
  }
  console.log(
    sizes.length
      ? `productivity chunks: ${sizes.map((s) => `${s.name} ${s.kb}kb`).join(', ')}`
      : 'productivity chunks: none named productivity',
  );
}

if (failures.length) {
  console.error('productivity budgets failed:');
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log(
  `productivity budgets: ok (chunk ≤ ${budgets.productivityRouteChunkKb}kb; matrix/analytics/memory/query counts enforced by tests against the same file)`,
);
