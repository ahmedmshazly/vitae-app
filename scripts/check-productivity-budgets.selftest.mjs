#!/usr/bin/env node
/**
 * Prove the productivity budget gate rejects what it claims to reject (NFR-PROD-001).
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const checker = join(here, 'check-productivity-budgets.mjs');
let failures = 0;

const required = {
  matrixInteractionMs: 500,
  analyticsP95Ms: 2500,
  productivityRouteChunkKb: 200,
  memoryMb: 128,
  tasksQueryCount: 16,
  analyticsQueryCount: 24,
};

function fixture({ chunks, budgets }) {
  const dir = mkdtempSync(join(tmpdir(), 'vitae-prod-budgets-'));
  mkdirSync(join(dir, 'docs/testing'), { recursive: true });
  writeFileSync(join(dir, 'docs/testing/productivity-budgets.json'), `${JSON.stringify(budgets, null, 2)}\n`);
  if (chunks) {
    const assets = join(dir, 'apps/web/dist/assets');
    mkdirSync(assets, { recursive: true });
    for (const [name, kb] of Object.entries(chunks)) {
      writeFileSync(join(assets, name), ''.padEnd(kb * 1024, 'x'));
    }
  }
  return dir;
}

function check(label, spec, { exit, env = {}, expect = [], reject = [] }) {
  const dir = fixture(spec);
  try {
    const run = spawnSync(process.execPath, [checker], {
      cwd: dir,
      encoding: 'utf8',
      env: { ...process.env, VITAE_REQUIRE_BUDGETS: '', VITAE_WEB_ROOT: dir, ...env },
    });
    const output = `${run.stdout ?? ''}${run.stderr ?? ''}`;
    const wrong = [];
    if (run.status !== exit) wrong.push(`exited ${run.status}, expected ${exit}`);
    for (const text of expect) {
      if (!output.includes(text)) wrong.push(`missing ${JSON.stringify(text)}`);
    }
    for (const text of reject) {
      if (output.includes(text)) wrong.push(`unexpectedly mentions ${JSON.stringify(text)}`);
    }
    if (wrong.length === 0) {
      console.log(`  ok  ${label}`);
      return;
    }
    failures += 1;
    console.error(`  FAIL ${label}: ${wrong.join('; ')}`);
    console.error(output.split('\n').map((l) => `       ${l}`).join('\n'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

check('a productivity chunk inside its limit passes', {
  chunks: { 'productivity-aaaa.js': 100, 'index-bbbb.js': 300 },
  budgets: { ...required, productivityRouteChunkKb: 200 },
}, {
  exit: 0,
  expect: ['productivity budgets: ok', 'productivity-aaaa.js 100kb'],
});

check('a productivity chunk over the limit fails and is named', {
  chunks: { 'ProductivityScreen-aaaa.js': 300 },
  budgets: { ...required, productivityRouteChunkKb: 200 },
}, {
  exit: 1,
  expect: ['productivity budgets failed', 'ProductivityScreen-aaaa.js 300kb > 200kb'],
  reject: ['productivity budgets: ok'],
});

check('a missing required key fails', {
  chunks: { 'index-aaaa.js': 10 },
  budgets: { productivityRouteChunkKb: 200 },
}, {
  exit: 1,
  expect: ['missing numeric keys'],
});

check('a production bundle without a productivity chunk fails closed', {
  chunks: { 'index-aaaa.js': 10 },
  budgets: required,
}, {
  exit: 1,
  expect: ['no production JS chunk name matches'],
});

check('a missing bundle warns rather than failing', {
  chunks: null,
  budgets: required,
}, {
  exit: 0,
  expect: ['warn:', 'missing (run web build first)'],
});

check('a missing bundle fails when the build is required', {
  chunks: null,
  budgets: required,
}, {
  exit: 1,
  env: { VITAE_REQUIRE_BUDGETS: 'true' },
  expect: ['missing (run web build first)'],
  reject: ['warn:'],
});

if (failures) {
  console.error(`\ncheck-productivity-budgets selftest: ${failures} case(s) failed`);
  process.exit(1);
}
console.log('check-productivity-budgets selftest: ok');
