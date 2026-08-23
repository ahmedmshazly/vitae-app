#!/usr/bin/env node
/**
 * Prove the citation reader finds group and range members, and only those.
 *
 * The naive reading of these identifiers loses eleven of the ninety-two that
 * this repository actually cites, and the loss is invisible: a missing
 * identifier looks exactly like an identifier nobody wrote down.
 */
import { citationsIn, compareIds, isTestPath, stripGenerated } from './citations.mjs';

let failures = 0;
const ALIASES = { 'VIS-001': 'FR-VIS-001', 'IMP-001': 'FR-IMP-001', 'IMP-006': 'FR-IMP-006' };

function check(name, text, expected, aliases = {}, families = []) {
  const got = citationsIn(text, { aliases, families });
  if (JSON.stringify(got) === JSON.stringify(expected)) {
    console.log(`  ok  ${name}`);
    return;
  }
  failures += 1;
  console.error(`  FAIL  ${name}\n        expected ${JSON.stringify(expected)}\n        got      ${JSON.stringify(got)}`);
}

console.log('citation reader');

check('a bare identifier', 'see FR-012 for detail', ['FR-012']);
check('a sub-family identifier', 'SRS FR-RES-009 meter', ['FR-RES-009']);
check('a non-functional identifier', 'atomic (SRS NFR-REL-003).', ['NFR-REL-003']);

check('a slash group expands every member',
  'auto (knapsack) or manual (SRS FR-RES-007/008/009).',
  ['FR-RES-007', 'FR-RES-008', 'FR-RES-009']);

check('a range expands the members between its ends',
  'search index (SRS FR-SRCH-001..004).',
  ['FR-SRCH-001', 'FR-SRCH-002', 'FR-SRCH-003', 'FR-SRCH-004']);

check('a group of bare identifiers keeps the bare family',
  'pre-images and produced revisions (FR-002/003).',
  ['FR-002', 'FR-003']);

check('a repeated identifier is reported once',
  'FR-006 ... FR-006 ... FR-006', ['FR-006']);

check('an alias is promoted to its canonical spelling',
  '| Explore | ... | VIS-001/002/003 |', ['FR-VIS-001'], ALIASES);

check('an alias range promotes only the members that are declared aliases',
  '| Imports | ... | IMP-001..006 |', ['FR-IMP-001', 'FR-IMP-006'], ALIASES);

// Without the alias gate, any THREE-LETTER-NNN token would be read as a
// requirement. The repository is full of them.
check('an unrelated token is not claimed as a requirement',
  'Tectonic 0.15.0 verified by SHA-256, see RFC-822 and ISO-8601', [], ALIASES);

check('a version number is not an identifier', 'Node 22.23.0 and pnpm 9.15.0', []);

check('a declared family is read without zero padding',
  '// Auth (SRS INT-1 / FR-SET-001)', ['FR-SET-001', 'INT-1'], {}, ['INT']);

check('a declared family is read on both sides of a slash pair',
  'a module with its own data plane (SRS INT-2/INT-6).',
  ['INT-2', 'INT-6'], {}, ['INT']);

// Without the opt-in the same text yields nothing, which is what keeps the
// reader from claiming every LETTERS-digits token in the repository.
check('an undeclared family is ignored', 'SRS INT-2/INT-6.', []);

check('a declared family does not match inside a longer word',
  'SPRINT-2 and FOOTPRINT-3', [], {}, ['INT']);

const sorted = ['FR-RES-009', 'NFR-REL-003', 'FR-002', 'FR-CAP-001', 'FR-102'].sort(compareIds);
const wanted = ['FR-002', 'FR-102', 'FR-CAP-001', 'FR-RES-009', 'NFR-REL-003'];
if (JSON.stringify(sorted) === JSON.stringify(wanted)) {
  console.log('  ok  identifiers sort by family then number');
} else {
  failures += 1;
  console.error(`  FAIL  identifiers sort by family then number: got ${JSON.stringify(sorted)}`);
}

for (const [rel, expected] of [
  ['apps/api/src/services/export.ts', false],
  ['apps/api/src/services/export.test.ts', true],
  ['apps/api/src/routes/v1/cloud.integration.test.ts', true],
  ['apps/api/src/__tests__/api.integration.test.ts', true],
  ['e2e/tests/journeys.spec.ts', true],
  ['packages/core/src/algorithms/selection.ts', false],
]) {
  if (isTestPath(rel) === expected) continue;
  failures += 1;
  console.error(`  FAIL  isTestPath(${rel}) should be ${expected}`);
}
if (!failures) console.log('  ok  test paths are told apart from production paths');

const GENERATED = [
  'Prose citing FR-001.',
  '<!-- generated:requirement-register start -->',
  'FR-002 is listed here only because the register lists it.',
  '<!-- generated:requirement-register end -->',
  'More prose citing FR-003.',
].join('\n');
const stripped = stripGenerated(GENERATED);
if (JSON.stringify(citationsIn(stripped)) === JSON.stringify(['FR-001', 'FR-003'])) {
  console.log('  ok  identifiers inside a generated block are not evidence');
} else {
  failures += 1;
  console.error(`  FAIL  identifiers inside a generated block are not evidence: got ${JSON.stringify(citationsIn(stripped))}`);
}
if (stripped.split('\n').length === GENERATED.split('\n').length) {
  console.log('  ok  stripping a generated block preserves line numbers');
} else {
  failures += 1;
  console.error('  FAIL  stripping a generated block changed the line count');
}

if (failures) {
  console.error(`\ncitations selftest: ${failures} case(s) failed`);
  process.exit(1);
}
console.log('citations selftest: ok');
