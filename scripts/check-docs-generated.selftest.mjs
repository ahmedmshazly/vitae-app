#!/usr/bin/env node
/**
 * Prove the stale-artifact gate rejects what it claims to reject.
 *
 * The failure this guards against is specific and has happened here before: a
 * gate whose only outcome is success. `check-test-coverage-map.mjs` compared
 * every module against itself and passed unconditionally for the whole of
 * release 1.0.0, and nothing distinguished that from a healthy repository.
 *
 * So the fixtures below stand in for the real generators. Each is a two-line
 * script whose `--check` exit code is fixed, which lets the cases assert the
 * three properties that matter and cannot be observed from a passing run of
 * the real thing: a drifted artifact fails, *every* drifted artifact is named
 * rather than only the first, and an empty generator directory is an error
 * instead of a clean bill of health.
 */
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
let failures = 0;

/** A generator that reports its artifact current, or stale with a message. */
const generator = (name, current) =>
  current
    ? `console.log('${name}: ok');\n`
    : `console.error('docs/generated/${name}.json is stale. Run \`pnpm docs:gen\` and commit the result.');\nprocess.exit(1);\n`;

function fixture(generators) {
  const dir = mkdtempSync(join(tmpdir(), 'vitae-docs-generated-'));
  mkdirSync(join(dir, 'scripts/docs'), { recursive: true });
  cpSync(join(here, 'check-docs-generated.mjs'), join(dir, 'scripts/check-docs-generated.mjs'));
  for (const [name, current] of Object.entries(generators)) {
    writeFileSync(join(dir, `scripts/docs/gen-${name}.mjs`), generator(name, current));
  }
  return dir;
}

function check(label, generators, { exit, expect = [], reject = [] }) {
  const dir = fixture(generators);
  try {
    const run = spawnSync(process.execPath, [join(dir, 'scripts/check-docs-generated.mjs')], {
      cwd: dir,
      encoding: 'utf8',
      env: { ...process.env, VITAE_DOCS_ROOT: dir },
    });
    const output = `${run.stdout ?? ''}${run.stderr ?? ''}`;
    const wrong = [];
    if (run.status !== exit) wrong.push(`exited ${run.status}, expected ${exit}`);
    for (const text of expect) if (!output.includes(text)) wrong.push(`missing ${JSON.stringify(text)}`);
    for (const text of reject) if (output.includes(text)) wrong.push(`unexpectedly mentions ${JSON.stringify(text)}`);
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

check('every artifact current passes', { alpha: true, beta: true }, {
  exit: 0,
  expect: ['docs-generated: ok', '2 artifacts current'],
});

check('one stale artifact fails and is named', { alpha: true, beta: false }, {
  exit: 1,
  expect: ['gen-beta.mjs', 'is stale', 'pnpm docs:gen'],
  reject: ['gen-alpha.mjs'],
});

// A gate that stops at the first failure makes a contributor regenerate and
// re-run for every stale artifact, discovering them one build at a time.
check('every stale artifact is reported, not just the first', { alpha: false, beta: true, gamma: false }, {
  exit: 1,
  expect: ['2 of 3', 'gen-alpha.mjs', 'gen-gamma.mjs'],
  reject: ['gen-beta.mjs'],
});

// Discovering nothing is how a gate silently stops guarding anything.
check('an empty generator directory is an error, not a pass', {}, {
  exit: 1,
  expect: ['No generators found'],
  reject: ['ok'],
});

if (failures) {
  console.error(`\ncheck-docs-generated selftest: ${failures} case(s) failed`);
  process.exit(1);
}
console.log('check-docs-generated selftest: ok');
