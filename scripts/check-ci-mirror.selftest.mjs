#!/usr/bin/env node
/**
 * Prove the mirror gate notices drift, and does not invent it.
 *
 * The failure this exists to prevent is quiet: someone adds a step to
 * `.github/workflows/ci.yml`, the local script keeps passing without it, and
 * the answer to "would CI accept this" is wrong from then on. A gate that
 * cannot fail is the same failure wearing a green tick, so every case here
 * builds a pair of files that disagree in exactly one way and asserts the gate
 * says so.
 *
 * The last two cases matter as much as the first: a gate that reports drift
 * between two commands that were never meant to match would be turned off
 * within a week.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const checker = join(here, 'check-ci-mirror.mjs');
let failures = 0;

/** The three commands the real gate exempts, so a fixture stays realistic. */
const SUBSUMED = ['test:contract', 'test:security', 'test:resilience'];

function fixture({ workflowRuns, localRuns, scripts }) {
  const dir = mkdtempSync(join(tmpdir(), 'vitae-ci-mirror-'));
  mkdirSync(join(dir, '.github/workflows'), { recursive: true });
  mkdirSync(join(dir, 'scripts'), { recursive: true });
  writeFileSync(
    join(dir, '.github/workflows/ci.yml'),
    `jobs:\n  quality:\n    steps:\n${workflowRuns.map((r) => `      - run: ${r}\n`).join('')}`,
  );
  writeFileSync(join(dir, 'scripts/ci-local.sh'), `#!/usr/bin/env bash\n${localRuns.join('\n')}\n`);
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
      env: { ...process.env, VITAE_CI_MIRROR_ROOT: dir },
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

const ALL = ['typecheck', 'lint', 'test:web', ...SUBSUMED];

check('a local gate that runs everything the workflow runs passes', {
  workflowRuns: ['pnpm typecheck', 'pnpm lint', 'pnpm test:web', ...SUBSUMED.map((s) => `pnpm ${s}`)],
  localRuns: ['pnpm typecheck', 'pnpm lint', 'pnpm test:web'],
  scripts: ALL,
}, {
  exit: 0,
  expect: ['ci-mirror: ok', '3 exempt'],
});

// The drift this gate exists for. A step arrives in the workflow, the local
// script keeps reporting success without it, and nothing says so.
check('a workflow step the local gate never runs fails, and is named', {
  workflowRuns: ['pnpm typecheck', 'pnpm test:brand', ...SUBSUMED.map((s) => `pnpm ${s}`)],
  localRuns: ['pnpm typecheck'],
  scripts: [...ALL, 'test:brand'],
}, {
  exit: 1,
  expect: ['the workflow runs `pnpm test:brand` and the local gate does not'],
  reject: ['ci-mirror: ok'],
});

check('a workspace the workflow tests and the local gate ignores fails', {
  workflowRuns: ['pnpm typecheck', 'pnpm --filter @vitae/ui test', ...SUBSUMED.map((s) => `pnpm ${s}`)],
  localRuns: ['pnpm typecheck'],
  scripts: ALL,
}, {
  exit: 1,
  expect: ['the workflow filters to @vitae/ui; the local gate never mentions it'],
});

// An exemption outlives the thing it excused, and then it is just a hole.
check('an exemption for a step the workflow dropped is reported as stale', {
  workflowRuns: ['pnpm typecheck'],
  localRuns: ['pnpm typecheck'],
  scripts: ALL,
}, {
  exit: 1,
  expect: ['is exempt here but the workflow no longer runs it'],
});

// The two sides invoke these differently on purpose. Reporting that as drift
// is how a gate earns its way into someone's ignore list.
check('a pnpm exec invocation is not compared by name', {
  workflowRuns: [
    'pnpm exec firebase emulators:start --only auth',
    'pnpm typecheck',
    ...SUBSUMED.map((s) => `pnpm ${s}`),
  ],
  localRuns: ['pnpm typecheck', 'npx firebase emulators:start --only auth'],
  scripts: ALL,
}, {
  exit: 0,
  expect: ['ci-mirror: ok'],
});

check('a command that is not a root script is left alone', {
  workflowRuns: ['pnpm typecheck', 'pnpm dlx some-tool@1', ...SUBSUMED.map((s) => `pnpm ${s}`)],
  localRuns: ['pnpm typecheck'],
  scripts: ALL,
}, {
  exit: 0,
  expect: ['ci-mirror: ok'],
});

if (failures) {
  console.error(`\ncheck-ci-mirror selftest: ${failures} case(s) failed`);
  process.exit(1);
}
console.log('check-ci-mirror selftest: ok');
