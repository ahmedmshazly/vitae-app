#!/usr/bin/env node
/**
 * Prove check-test-coverage-map.mjs can still fail.
 *
 * The gate shipped for months in a state where it always passed: colocatedTest()
 * built its candidates with String.replace, which returns the input unchanged
 * when the pattern misses, so every module resolved to its own source path and
 * counted as tested. A gate whose failure mode is "reports ok" cannot be trusted
 * on inspection alone, so each case below builds a fixture tree, runs the real
 * checker against it through VITAE_MAP_ROOT, and asserts the exit code.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const here = dirname(fileURLToPath(import.meta.url));
const checker = join(here, 'check-test-coverage-map.mjs');

// The real map excludes test files from the walk. Without them a fixture's own
// test file is treated as an unmapped production module and every case fails
// for the wrong reason, so each fixture starts from the same baseline.
const TEST_GLOBS = ['**/*.test.ts', '**/*.test.tsx', '**/*.spec.ts', '**/test/**'];

/** Materialise a fixture repository: a map file plus source and test files. */
function fixture(map, files) {
  const dir = mkdtempSync(join(tmpdir(), 'vitae-map-selftest-'));
  const write = (rel, body) => {
    const abs = join(dir, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, body);
  };
  write('docs/testing/source-test-map.json', JSON.stringify(map, null, 2));
  for (const rel of files) write(rel, 'export const fixture = 1;\n');
  return dir;
}

function run(dir) {
  const result = spawnSync(process.execPath, [checker], {
    env: { ...process.env, VITAE_MAP_ROOT: dir },
    encoding: 'utf8',
  });
  return { code: result.status, out: `${result.stdout}${result.stderr}` };
}

const failures = [];

function check(name, { map = {}, files = [], expect, mentions }) {
  const dir = fixture(
    { exclude_globs: [...TEST_GLOBS, ...(map.exclude_globs ?? [])], modules: map.modules ?? {} },
    files,
  );
  try {
    const { code, out } = run(dir);
    if (code !== expect) {
      failures.push(`${name}: expected exit ${expect}, got ${code}\n${out}`);
      return;
    }
    if (mentions && !out.includes(mentions)) {
      failures.push(`${name}: output never mentions ${mentions}\n${out}`);
      return;
    }
    console.log(`  ok  ${name}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

console.log('check-test-coverage-map selftest');

// The regression itself. Before the fix, a .ts module matched its own path via
// the two .tsx rules and a .tsx module matched via the .ts rule, so both of
// these passed the gate with no test in existence anywhere.
check('an unmapped .ts module fails', {
  files: ['packages/core/src/lonely.ts'],
  expect: 1,
  mentions: 'packages/core/src/lonely.ts',
});

check('an unmapped .tsx module fails', {
  files: ['apps/web/src/Lonely.tsx'],
  expect: 1,
  mentions: 'apps/web/src/Lonely.tsx',
});

check('a genuinely colocated test satisfies the gate', {
  files: ['packages/core/src/paired.ts', 'packages/core/src/paired.test.ts'],
  expect: 0,
});

check('a colocated .test.ts satisfies a .tsx module', {
  files: ['apps/web/src/Paired.tsx', 'apps/web/src/Paired.test.ts'],
  expect: 0,
});

check('a mapped module with a real test passes', {
  map: {
    modules: {
      'packages/core/src/mapped.ts': {
        risk: 'medium',
        layers: ['integration'],
        status: 'covered',
        tests: ['packages/core/src/__tests__/mapped.integration.test.ts'],
      },
    },
  },
  files: ['packages/core/src/mapped.ts', 'packages/core/src/__tests__/mapped.integration.test.ts'],
  expect: 0,
});

check('a mapped module naming a missing test fails', {
  map: {
    modules: {
      'packages/core/src/mapped.ts': {
        risk: 'medium',
        layers: ['integration'],
        status: 'covered',
        tests: ['packages/core/src/__tests__/vanished.test.ts'],
      },
    },
  },
  files: ['packages/core/src/mapped.ts'],
  expect: 1,
  mentions: 'vanished',
});

check('a mapped module with neither tests nor a reason fails', {
  map: { modules: { 'packages/core/src/mapped.ts': { risk: 'medium', layers: [], status: 'deferred' } } },
  files: ['packages/core/src/mapped.ts'],
  expect: 1,
  mentions: 'exclude_reason',
});

check('an explicit exclude_reason is accepted', {
  map: {
    modules: {
      'packages/core/src/mapped.ts': {
        risk: 'low',
        layers: [],
        status: 'deferred',
        exclude_reason: 'Fixture module with a declared coverage gap.',
      },
    },
  },
  files: ['packages/core/src/mapped.ts'],
  expect: 0,
});

check('exclude_globs skip a module entirely', {
  map: { exclude_globs: ['**/index.ts'] },
  files: ['packages/core/src/index.ts'],
  expect: 0,
});

if (failures.length) {
  console.error(`\nselftest failed (${failures.length}):`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log('check-test-coverage-map selftest: ok');
