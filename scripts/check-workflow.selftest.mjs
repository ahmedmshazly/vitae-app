#!/usr/bin/env node
/**
 * Prove the workflow gate rejects what it claims to reject.
 *
 * This gate stands in for a pipeline that has not run in a long time, which
 * makes it the one gate here with no second opinion behind it. If it reports
 * `ok` on a workflow that would die in its first ten seconds, it has actively
 * made things worse: it will be read as evidence.
 *
 * The last two cases are as load-bearing as the rest. A gate that reports a
 * `${{ }}` expression as broken shell, or `pnpm audit` as a missing script,
 * would be switched off within a day, and then the real faults go unread too.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const checker = join(here, 'check-workflow.mjs');
let failures = 0;

const SHA = 'a'.repeat(40);

function fixture({ workflow, scripts = ['typecheck', 'lint'] }) {
  const dir = mkdtempSync(join(tmpdir(), 'vitae-workflow-'));
  mkdirSync(join(dir, '.github/workflows'), { recursive: true });
  writeFileSync(join(dir, '.github/workflows/ci.yml'), workflow);
  writeFileSync(
    join(dir, 'package.json'),
    JSON.stringify({ scripts: Object.fromEntries(scripts.map((s) => [s, 'true'])) }),
  );
  return dir;
}

function check(name, tree, { exit, expect = [], reject = [] }) {
  const dir = fixture(tree);
  try {
    const run = spawnSync(process.execPath, [checker], {
      encoding: 'utf8',
      env: { ...process.env, VITAE_WORKFLOW_ROOT: dir },
    });
    const output = `${run.stdout}${run.stderr}`;
    const problems = [];
    if (run.status !== exit) problems.push(`exit ${run.status}, expected ${exit}`);
    for (const text of expect) if (!output.includes(text)) problems.push(`missing ${JSON.stringify(text)}`);
    for (const text of reject) if (output.includes(text)) problems.push(`unexpected ${JSON.stringify(text)}`);
    if (problems.length) {
      failures += 1;
      console.error(`  fail  ${name}`);
      for (const problem of problems) console.error(`        ${problem}`);
      console.error(output.split('\n').map((l) => `        > ${l}`).join('\n'));
    } else {
      console.log(`  ok  ${name}`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const VALID = `name: CI
on: [push]
jobs:
  quality:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@${SHA}
      - name: Typecheck
        run: pnpm typecheck
`;

check('a well-formed workflow passes', { workflow: VALID }, {
  exit: 0,
  expect: ['workflow: ok', '1 action(s) pinned'],
});

// The commonest way a workflow dies before it starts.
check('a file that is not YAML fails', {
  workflow: `jobs:\n  quality:\n   runs-on: x\n     steps: []\n`,
}, {
  exit: 1,
  expect: ['does not parse as YAML'],
  reject: ['workflow: ok'],
});

// A moving tag is a supply-chain hole and the repository claims to have none.
check('an unpinned action fails and is named', {
  workflow: VALID.replace(`actions/checkout@${SHA}`, 'actions/checkout@v4'),
}, {
  exit: 1,
  expect: ['uses actions/checkout@v4, which is not pinned to a commit sha'],
});

check('a run block with an unbalanced quote fails', {
  workflow: `${VALID}      - name: Broken
        run: echo "unterminated
`,
}, {
  exit: 1,
  expect: ['run block is not valid shell'],
});

// A typo here fails the job, not the step, and only when the job runs.
check('a pnpm script that does not exist fails and is named', {
  workflow: VALID.replace('run: pnpm typecheck', 'run: pnpm test:proze'),
}, {
  exit: 1,
  expect: ['runs `pnpm test:proze`, which is not a script in package.json'],
});

check('a job with no timeout fails', {
  workflow: VALID.replace('    timeout-minutes: 15\n', ''),
}, {
  exit: 1,
  expect: ['no timeout-minutes'],
});

check('a needs pointing at no job fails', {
  workflow: `${VALID}  publish:
    needs: nonexistent
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - run: echo done
`,
}, {
  exit: 1,
  expect: ['needs nonexistent, which is not a job in this file'],
});

// The two false positives that would get this gate switched off.
check('an expression inside a run block is not read as shell', {
  workflow: VALID.replace(
    'run: pnpm typecheck',
    'run: echo "building ${{ github.run_id }}-${{ github.run_attempt }}" && pnpm typecheck',
  ),
}, {
  exit: 0,
  expect: ['workflow: ok'],
});

check('a pnpm builtin is not mistaken for a missing script', {
  workflow: VALID.replace('run: pnpm typecheck', 'run: pnpm audit --audit-level=high && pnpm install --frozen-lockfile'),
}, {
  exit: 0,
  expect: ['workflow: ok'],
});

if (failures) {
  console.error(`\ncheck-workflow selftest: ${failures} case(s) failed`);
  process.exit(1);
}
console.log('check-workflow selftest: ok');
