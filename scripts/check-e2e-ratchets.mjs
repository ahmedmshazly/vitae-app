#!/usr/bin/env node
/**
 * Executable ratchets for the end-to-end suite.
 *
 * These rules used to live as a table of shell commands in
 * the coverage plan, run by hand or not at all, which is the same
 * as not having them. The numbers they guard are in
 * `docs/testing/e2e-ratchets.json`; this compares the tree against that file
 * and fails when a number moves the wrong way.
 *
 * Two of the published numbers were wrong, which is what a gate is for:
 *
 *   - the sleep count greps only for `waitForTimeout` and missed two 5-second
 *     `new Promise((r) => setTimeout(r, …))` waits, so it read 1 where there
 *     were 3. This counts both forms.
 *   - "specs with no accessibility scan" counted *files*, not screens. Every
 *     route those files reach is already scanned by the spec that owns that
 *     screen, so the number measured nothing. This checks the real invariant
 *     instead: every route a spec navigates to must be scanned by some spec.
 *
 * VITAE_E2E_RATCHET_ROOT points the gate at a fixture tree; the self-test sets
 * it. Nothing else does, so a normal run always resolves the repository root.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve, basename } from 'node:path';

const root = process.env.VITAE_E2E_RATCHET_ROOT
  ? resolve(process.env.VITAE_E2E_RATCHET_ROOT)
  : resolve(import.meta.dirname, '..');

const baselinePath = join(root, 'docs/testing/e2e-ratchets.json');
const testsDir = join(root, 'e2e/tests');

if (!existsSync(baselinePath)) {
  console.error(`missing ${basename(baselinePath)}; nothing to ratchet against`);
  process.exit(1);
}
const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'));

const specs = existsSync(testsDir)
  ? readdirSync(testsDir)
      .filter((name) => name.endsWith('.spec.ts'))
      .sort()
  : [];

const sourceOf = new Map(specs.map((name) => [name, readFileSync(join(testsDir, name), 'utf8')]));
const all = [...sourceOf.values()].join('\n');

const countAll = (re) => (all.match(re) ?? []).length;

/** A test is quarantined when it is focused, skipped, deferred or a stub. */
const QUARANTINE = /\.only\(|\btest\.skip\(|\btest\.fixme\(|\btest\.todo\(/g;
/** Both spellings of a fixed wait: the helper, and a hand-rolled timer. */
const SLEEPS = /waitForTimeout\(|setTimeout\(/g;

const measured = {
  spec_files: specs.length,
  test_blocks: countAll(/(?<![.\w])test\(/g),
  expect_lines: countAll(/expect\(/g),
  quarantined: countAll(QUARANTINE),
  sleeps: countAll(SLEEPS),
  weak_truthy: countAll(/toBeTruthy\(\)/g),
};

const findings = [];

/** A number that may only grow, because coverage is not given back. */
for (const key of ['spec_files', 'test_blocks', 'expect_lines']) {
  const floor = baseline.floors?.[key];
  if (typeof floor !== 'number') continue;
  if (measured[key] < floor) {
    findings.push(`${key}: ${measured[key]}, below the floor of ${floor}. Coverage may only grow.`);
  }
}

/** A number that may only shrink, because each one is a compromise. */
for (const key of ['sleeps', 'weak_truthy']) {
  const ceiling = baseline.ceilings?.[key];
  if (typeof ceiling !== 'number') continue;
  if (measured[key] > ceiling) {
    findings.push(`${key}: ${measured[key]}, above the ceiling of ${ceiling}. This number only comes down.`);
  }
}

/** A number with one permitted value. */
if (measured.quarantined !== 0) {
  const where = specs.filter((name) => QUARANTINE.test(sourceOf.get(name) ?? ''));
  QUARANTINE.lastIndex = 0;
  findings.push(`quarantined: ${measured.quarantined} focused or skipped test(s) in ${where.join(', ')}. Must be 0.`);
}

/* Accessibility coverage, by screen rather than by file. --------------------- */

const aliases = baseline.route_normalisation ?? {};

function normalise(route) {
  const bare = route.split(/[?#]/)[0].replace(/\/$/, '') || '/';
  if (aliases[bare]) return aliases[bare];
  for (const [rule, canonical] of Object.entries(aliases)) {
    if (rule.endsWith('/*') && bare.startsWith(rule.slice(0, -1))) return canonical;
  }
  return bare;
}

function routesIn(source) {
  return [...source.matchAll(/goto\(\s*'([^']+)'/g)].map((m) => normalise(m[1]));
}

const scanned = new Set();
const reached = new Map();
for (const [name, source] of sourceOf) {
  const scans = source.includes('expectNoA11yViolations');
  for (const route of routesIn(source)) {
    if (scans) scanned.add(route);
    if (!reached.has(route)) reached.set(route, new Set());
    reached.get(route).add(name);
  }
}

const exempt = new Set(Object.keys(baseline.a11y_exempt_routes ?? {}));
const unscanned = [...reached.keys()]
  .filter((route) => !scanned.has(route) && !exempt.has(route))
  .sort();

for (const route of unscanned) {
  findings.push(
    `a11y: ${route} is reached by ${[...reached.get(route)].join(', ')} and scanned by nothing. ` +
      `Add expectNoA11yViolations to the spec that owns that screen, or record the route in a11y_exempt_routes with a reason.`,
  );
}

/* The generated artifact has to agree that nothing is skipped. --------------- */

const testsJson = join(root, 'docs/generated/tests.json');
if (existsSync(testsJson)) {
  const summary = JSON.parse(readFileSync(testsJson, 'utf8')).summary ?? {};
  if (summary.skipped !== 0 || summary.todo !== 0) {
    findings.push(`docs/generated/tests.json: skipped ${summary.skipped}, todo ${summary.todo}. Both must be 0.`);
  }
}

if (findings.length > 0) {
  console.error(`e2e ratchets (${findings.length}):`);
  for (const finding of findings) console.error(`  ${finding}`);
  console.error(`\nIf a floor moved up on purpose, raise it in docs/testing/e2e-ratchets.json.`);
  process.exit(1);
}

console.log(
  `e2e-ratchets: ok (${measured.spec_files} specs, ${measured.test_blocks} tests, ` +
    `${measured.expect_lines} assertions, ${measured.quarantined} quarantined, ` +
    `${measured.sleeps} sleeps, ${measured.weak_truthy} toBeTruthy, ` +
    `${scanned.size} screens scanned, ${unscanned.length} unscanned)`,
);
