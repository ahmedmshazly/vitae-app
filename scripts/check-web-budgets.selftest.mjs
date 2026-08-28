#!/usr/bin/env node
/**
 * Prove the web budget gate rejects what it claims to reject.
 *
 * This gate spent release 1.0.0 reporting `ok` on a bundle nobody deploys. It
 * was not broken in the way `check-test-coverage-map.mjs` was. Its arithmetic
 * was right. It was simply pointed at a development build, and a development
 * build is about a megabyte larger than the real one. The gate said 98% of the
 * limit and meant nothing by it.
 *
 * A size gate cannot notice that on its own: every number it has is a number
 * about the files in front of it. So the cases below assert the two properties
 * that separate a measurement from a coincidence: that each limit can
 * actually be exceeded, and that a bundle which should not be measured at all
 * is refused before any size verdict is reached.
 *
 * The fixtures are directories of files with the right names and the right
 * byte counts. The real checker runs against them through VITAE_WEB_ROOT, so
 * what is tested is the shipped script and not a copy of it.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const checker = join(here, 'check-web-budgets.mjs');
let failures = 0;

/**
 * A fixture tree.
 *
 * `chunks` maps a file name to `{ kb, contains }`. The file is padded to
 * exactly `kb` kibibytes so the gate's `Math.ceil` reports that number, and
 * `contains` is a marker placed inside it: either the development JSX
 * runtime's call form, or the fixture's own absolute path standing in for a
 * build machine's. Passing `chunks: null` leaves `dist/assets` absent entirely.
 */
function fixture({ chunks, totalJsKb, largestChunkKb }) {
  const dir = mkdtempSync(join(tmpdir(), 'vitae-web-budgets-'));
  mkdirSync(join(dir, 'docs/testing'), { recursive: true });
  writeFileSync(
    join(dir, 'docs/testing/web-budgets.json'),
    `${JSON.stringify({ totalJsKb, largestChunkKb }, null, 2)}\n`,
  );
  if (chunks) {
    const assets = join(dir, 'apps/web/dist/assets');
    mkdirSync(assets, { recursive: true });
    for (const [name, { kb, contains = '' }] of Object.entries(chunks)) {
      const marker = contains === 'ROOT' ? dir : contains;
      writeFileSync(join(assets, name), marker.padEnd(kb * 1024, 'x'));
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

const production = { 'index-aaaa.js': { kb: 300 }, 'route-bbbb.js': { kb: 100 } };

check('a bundle inside its limits passes', {
  chunks: production, totalJsKb: 500, largestChunkKb: 400,
}, {
  exit: 0,
  expect: ['web budgets: ok', 'total 400kb', 'largest index-aaaa.js 300kb'],
});

check('one chunk over the chunk limit fails and is named', {
  chunks: production, totalJsKb: 500, largestChunkKb: 200,
}, {
  exit: 1,
  expect: ['web budgets failed', 'largest chunk index-aaaa.js 300kb > 200kb'],
  reject: ['web budgets: ok'],
});

check('a total over the total limit fails', {
  chunks: production, totalJsKb: 300, largestChunkKb: 400,
}, {
  exit: 1,
  expect: ['web budgets failed', 'total JS 400kb > 300kb'],
  reject: ['web budgets: ok'],
});

// The bundle here is also over budget, and the size failure is the wrong thing
// to report: a development bundle's size is not a fact about the product. The
// gate has to refuse before it measures, or a contributor spends the afternoon
// splitting chunks that were never that large.
check('a development JSX runtime is refused before any size verdict', {
  chunks: { 'index-aaaa.js': { kb: 300, contains: 'jsxDEV(' }, 'route-bbbb.js': { kb: 100 } },
  totalJsKb: 300,
  largestChunkKb: 200,
}, {
  exit: 1,
  expect: ['development build', '1 of 2 chunks carry the development JSX runtime', 'NODE_ENV in .env'],
  reject: ['web budgets: ok', 'total JS 400kb', 'largest chunk'],
});

// The same build writes every component's location on the machine that made
// it. `check-public-release.mjs` bans that string and cannot see these files,
// so this is the only gate positioned to notice.
check('an absolute source path from the build machine fails', {
  chunks: { 'index-aaaa.js': { kb: 300, contains: 'ROOT' }, 'route-bbbb.js': { kb: 100 } },
  totalJsKb: 500,
  largestChunkKb: 400,
}, {
  exit: 1,
  expect: ["1 of 2 chunks embed this machine's absolute source paths"],
  reject: ['web budgets: ok'],
});

// Mid-development there is usually no build, and failing then would train
// everyone to ignore the gate. CI sets the variable so absence is an error
// exactly where a bundle is the point of the job.
check('a missing bundle warns rather than failing', {
  chunks: null, totalJsKb: 500, largestChunkKb: 400,
}, {
  exit: 0,
  expect: ['warn:', 'missing (run web build first)'],
});

check('a missing bundle fails when the build is required', {
  chunks: null, totalJsKb: 500, largestChunkKb: 400,
}, {
  exit: 1,
  env: { VITAE_REQUIRE_BUDGETS: 'true' },
  expect: ['missing (run web build first)'],
  reject: ['warn:'],
});

if (failures) {
  console.error(`\ncheck-web-budgets selftest: ${failures} case(s) failed`);
  process.exit(1);
}
console.log('check-web-budgets selftest: ok');
