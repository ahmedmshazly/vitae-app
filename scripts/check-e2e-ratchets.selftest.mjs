#!/usr/bin/env node
/**
 * Prove the end-to-end ratchet gate rejects what it claims to reject.
 *
 * The rules this gate holds spent their whole life as a table of shell commands
 * in a Markdown plan, and two of them were wrong in ways nobody could see:
 * the sleep count greps for `waitForTimeout` and never matched the two
 * hand-rolled `setTimeout` waits, and the accessibility number counted files
 * when the thing worth counting was screens. A gate that inherits a wrong rule
 * is worse than no gate, because it reports `ok` while it does.
 *
 * So each case below builds a fixture tree that breaks exactly one rule and
 * asserts the gate names it. The real checker runs against those trees through
 * VITAE_E2E_RATCHET_ROOT, so what is tested is the shipped script.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const checker = join(here, 'check-e2e-ratchets.mjs');
let failures = 0;

const BASELINE = {
  floors: { spec_files: 1, test_blocks: 1, expect_lines: 1 },
  ceilings: { sleeps: 0, weak_truthy: 0 },
  route_normalisation: { '/welcome': '/' },
  a11y_exempt_routes: {},
};

/** A fixture tree: `specs` maps a spec file name to its contents. */
function fixture({ specs, baseline = {}, testsJson }) {
  const dir = mkdtempSync(join(tmpdir(), 'vitae-e2e-ratchets-'));
  mkdirSync(join(dir, 'e2e/tests'), { recursive: true });
  mkdirSync(join(dir, 'docs/testing'), { recursive: true });
  for (const [name, body] of Object.entries(specs)) {
    writeFileSync(join(dir, 'e2e/tests', name), body);
  }
  writeFileSync(
    join(dir, 'docs/testing/e2e-ratchets.json'),
    `${JSON.stringify({ ...BASELINE, ...baseline }, null, 2)}\n`,
  );
  if (testsJson) {
    mkdirSync(join(dir, 'docs/generated'), { recursive: true });
    writeFileSync(join(dir, 'docs/generated/tests.json'), JSON.stringify({ summary: testsJson }));
  }
  return dir;
}

function check(name, tree, { exit, expect = [], reject = [] }) {
  const dir = fixture(tree);
  try {
    const run = spawnSync(process.execPath, [checker], {
      encoding: 'utf8',
      env: { ...process.env, VITAE_E2E_RATCHET_ROOT: dir },
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

const PASSING = `import { test, expect } from '@playwright/test';
import { expectNoA11yViolations } from './helpers/a11y';
test('a screen behaves', async ({ page }) => {
  await page.goto('/thing');
  await expect(page).toHaveURL(/thing/);
  await expectNoA11yViolations(page);
});
`;

check('a suite that meets every rule passes', { specs: { 'a.spec.ts': PASSING } }, {
  exit: 0,
  expect: ['e2e-ratchets: ok', '0 unscanned'],
});

// Deleting a spec is how coverage quietly goes backwards, and the diff that
// does it looks like a tidy-up.
check('a spec count below the floor fails', {
  specs: { 'a.spec.ts': PASSING },
  baseline: { floors: { spec_files: 2, test_blocks: 1, expect_lines: 1 } },
}, {
  exit: 1,
  expect: ['spec_files: 1, below the floor of 2', 'Coverage may only grow'],
  reject: ['e2e-ratchets: ok'],
});

check('a deleted assertion fails', {
  specs: { 'a.spec.ts': PASSING },
  baseline: { floors: { spec_files: 1, test_blocks: 1, expect_lines: 99 } },
}, {
  exit: 1,
  expect: ['expect_lines: 1, below the floor of 99'],
});

// The rule the old grep could not see. A hand-rolled timer is a fixed wait
// wearing a different spelling, and it has to count the same.
check('a hand-rolled setTimeout counts as a sleep', {
  specs: {
    'a.spec.ts': `${PASSING}
test('waits by hand', async () => {
  await new Promise((r) => setTimeout(r, 5000));
  expect(1).toBe(1);
});
`,
  },
}, {
  exit: 1,
  expect: ['sleeps: 1, above the ceiling of 0', 'only comes down'],
});

check('page.waitForTimeout counts as a sleep too', {
  specs: {
    'a.spec.ts': `${PASSING}
test('waits', async ({ page }) => {
  await page.waitForTimeout(500);
  expect(1).toBe(1);
});
`,
  },
}, {
  exit: 1,
  expect: ['sleeps: 1, above the ceiling of 0'],
});

check('a focused test fails and is named', {
  specs: {
    'a.spec.ts': `${PASSING}
test.only('focused', async () => { expect(1).toBe(1); });
`,
  },
}, {
  exit: 1,
  expect: ['quarantined: 1', 'a.spec.ts', 'Must be 0'],
});

check('a skipped test fails', {
  specs: {
    'a.spec.ts': `${PASSING}
test.skip('parked', async () => { expect(1).toBe(1); });
`,
  },
}, {
  exit: 1,
  expect: ['quarantined: 1'],
});

check('a weakened assertion fails', {
  specs: {
    'a.spec.ts': `${PASSING}
test('weak', async () => { expect(true).toBeTruthy(); });
`,
  },
}, {
  exit: 1,
  expect: ['weak_truthy: 1, above the ceiling of 0'],
});

// The rule the old count got backwards. A spec without a scan is fine when the
// screen it visits is scanned elsewhere; a screen nobody scans is not.
check('a screen no spec scans fails, and says who reaches it', {
  specs: {
    'a.spec.ts': PASSING,
    'b.spec.ts': `import { test, expect } from '@playwright/test';
test('elsewhere', async ({ page }) => {
  await page.goto('/unscanned');
  await expect(page).toHaveURL(/unscanned/);
});
`,
  },
}, {
  exit: 1,
  expect: ['a11y: /unscanned is reached by e2e/tests/b.spec.ts and scanned by nothing'],
});

check('a spec with no scan passes when another spec scans that screen', {
  specs: {
    'a.spec.ts': PASSING,
    'b.spec.ts': `import { test, expect } from '@playwright/test';
test('same screen, different claim', async ({ page }) => {
  await page.goto('/thing?filter=x');
  await expect(page).toHaveURL(/thing/);
});
`,
  },
}, {
  exit: 0,
  expect: ['e2e-ratchets: ok'],
});

check('an alias points a legacy address at the screen it redirects to', {
  specs: {
    'a.spec.ts': `import { test, expect } from '@playwright/test';
import { expectNoA11yViolations } from './helpers/a11y';
test('the poster', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/./);
  await expectNoA11yViolations(page);
});
`,
    'b.spec.ts': `import { test, expect } from '@playwright/test';
test('the legacy address', async ({ page }) => {
  await page.goto('/welcome');
  await expect(page).toHaveTitle(/./);
});
`,
  },
}, {
  exit: 0,
  expect: ['e2e-ratchets: ok'],
});

check('an exempt route is allowed to go unscanned', {
  specs: {
    'a.spec.ts': PASSING,
    'b.spec.ts': `import { test, expect } from '@playwright/test';
test('elsewhere', async ({ page }) => {
  await page.goto('/unscanned');
  await expect(page).toHaveURL(/unscanned/);
});
`,
  },
  baseline: { a11y_exempt_routes: { '/unscanned': 'a fixture, not a screen' } },
}, {
  exit: 0,
  expect: ['e2e-ratchets: ok'],
});

// The suite can be clean while the artifact everyone reads says otherwise.
check('a skip recorded in the generated artifact fails', {
  specs: { 'a.spec.ts': PASSING },
  testsJson: { skipped: 2, todo: 1 },
}, {
  exit: 1,
  expect: ['skipped 2, todo 1', 'Both must be 0'],
});

if (failures) {
  console.error(`\ncheck-e2e-ratchets selftest: ${failures} case(s) failed`);
  process.exit(1);
}
console.log('check-e2e-ratchets selftest: ok');
