#!/usr/bin/env node
/**
 * Prove the traceability gate rejects what it claims to reject.
 *
 * This repository has already shipped one quality gate whose only failure mode
 * was reporting success: `check-test-coverage-map.mjs` matched every module
 * against itself and passed unconditionally for the whole of release 1.0.0.
 * Nobody noticed, because a gate that always passes looks exactly like a
 * codebase that is always correct.
 *
 * So each case below builds a small, self-consistent fixture repository, breaks
 * exactly one thing, and asserts that the gate names that thing. The first case
 * asserts the unbroken fixture passes. Without it, every later case could be
 * succeeding for the wrong reason.
 */
import { execFileSync, execSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
let failures = 0;

const REQUIREMENTS = {
  note: 'Fixture register.',
  provenance_vocabulary: { reconstructed: 'Recovered from a citation.' },
  implementation_status_vocabulary: { implemented: 'Enforced by shipped code.' },
  id_aliases: {},
  families: {
    INT: { title: 'Interface requirements', numbering: 'One digit.', note: 'Declared for the fixture.' },
  },
  numbering_gaps: [],
  requirements: [
    {
      id: 'FR-001', capability: 'CAP-DEMO', kind: 'functional',
      title: 'A demonstrated behavior', statement: 'The fixture module does the thing.',
      implementation_status: 'implemented', definition_provenance: 'reconstructed', review: 'needs-review',
    },
    {
      id: 'INT-1', capability: 'CAP-DEMO', kind: 'interface',
      title: 'A demonstrated boundary', statement: 'The fixture module talks through one interface.',
      implementation_status: 'implemented', definition_provenance: 'reconstructed', review: 'needs-review',
    },
  ],
};

const CAPABILITIES = {
  note: 'Fixture capability map.',
  status_vocabulary: { implemented: 'Enforced by shipped code.' },
  capabilities: [{
    id: 'CAP-DEMO', title: 'Demonstration', summary: 'One capability, so the fixture stays legible.',
    status: 'implemented', surfaces: ['/demo'], evidence: ['src/thing.ts'],
  }],
};

const JOURNEYS = {
  note: 'Fixture journey register.',
  status_vocabulary: { verified: 'Covered by an end-to-end specification.' },
  journeys: [{
    id: 'J1', title: 'Do the thing', statement: 'A person does the thing and sees the result.',
    status: 'verified', capabilities: ['CAP-DEMO'], target: null,
    e2e: ['e2e/tests/demo.spec.ts'], note: null,
  }],
};

/** A fixture repository whose registries and sources already agree. */
function makeFixture() {
  const dir = mkdtempSync(join(tmpdir(), 'vitae-docs-gate-'));
  mkdirSync(join(dir, 'docs/registry/schema'), { recursive: true });
  mkdirSync(join(dir, 'src'), { recursive: true });
  mkdirSync(join(dir, 'e2e/tests'), { recursive: true });
  cpSync(join(root, 'docs/registry/schema'), join(dir, 'docs/registry/schema'), { recursive: true });
  writeFileSync(join(dir, 'src/thing.ts'), '// The thing (FR-001, INT-1).\nexport const thing = 1;\n');
  writeFileSync(join(dir, 'e2e/tests/demo.spec.ts'), "// J1: do the thing (FR-001).\ntest('J1', () => {});\n");
  write(dir, REQUIREMENTS, CAPABILITIES, JOURNEYS);
  execSync('git init -q && git add -A', { cwd: dir, stdio: 'pipe' });
  execFileSync('node', [join(here, 'docs/gen-traceability.mjs')], { cwd: dir, env: { ...process.env, VITAE_DOCS_ROOT: dir }, stdio: 'pipe' });
  execSync('git add -A', { cwd: dir, stdio: 'pipe' });
  return dir;
}

function write(dir, requirements, capabilities, journeys) {
  const put = (name, value) => writeFileSync(join(dir, `docs/registry/${name}.json`), `${JSON.stringify(value, null, 2)}\n`);
  put('requirements', requirements);
  put('capabilities', capabilities);
  put('journeys', journeys);
}

/** Run the gate against `dir` and return its exit code and combined output. */
function runGate(dir) {
  try {
    const out = execFileSync('node', [join(here, 'check-docs-traceability.mjs')], {
      cwd: dir, env: { ...process.env, VITAE_DOCS_ROOT: dir }, stdio: 'pipe',
    });
    return { code: 0, output: out.toString() };
  } catch (error) {
    return { code: error.status ?? 1, output: `${error.stdout ?? ''}${error.stderr ?? ''}` };
  }
}

const clone = (value) => JSON.parse(JSON.stringify(value));

/**
 * `break_` receives the three parsed registries and the fixture directory, and
 * mutates one of them. `mentions` is the phrase the gate must produce.
 */
function check(name, break_, mentions) {
  const dir = makeFixture();
  try {
    const registries = [clone(REQUIREMENTS), clone(CAPABILITIES), clone(JOURNEYS)];
    break_(...registries, dir);
    write(dir, ...registries);
    const { code, output } = runGate(dir);
    if (code === 0) {
      failures += 1;
      console.error(`  FAIL  ${name}\n        the gate passed a broken fixture`);
    } else if (!output.includes(mentions)) {
      failures += 1;
      console.error(`  FAIL  ${name}\n        expected output to mention "${mentions}"\n        got: ${output.trim().split('\n').slice(0, 6).join('\n             ')}`);
    } else {
      console.log(`  ok  ${name}`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

console.log('docs traceability gate');

{
  const dir = makeFixture();
  const { code, output } = runGate(dir);
  if (code === 0 && output.includes('ok')) console.log('  ok  an unbroken fixture passes');
  else {
    failures += 1;
    console.error(`  FAIL  an unbroken fixture passes\n        exit ${code}: ${output.trim()}`);
  }
  rmSync(dir, { recursive: true, force: true });
}

check('a requirement naming an unknown capability is reported',
  (reqs) => { reqs.requirements[0].capability = 'CAP-NOPE'; },
  'names unknown capability CAP-NOPE');

check('a duplicate identifier is reported',
  (reqs) => { reqs.requirements.push(clone(reqs.requirements[0])); },
  'duplicate identifier FR-001');

check('requirements out of canonical order are reported',
  (reqs) => { reqs.requirements.reverse(); },
  'not in canonical order');

check('a capability naming a missing evidence path is reported',
  (_reqs, caps) => { caps.capabilities[0].evidence = ['src/gone.ts']; },
  'names missing evidence path src/gone.ts');

check('a journey claiming a spec that never names it is reported',
  (_reqs, _caps, journeys, dir) => {
    writeFileSync(join(dir, 'e2e/tests/demo.spec.ts'), "test('something else', () => {});\n");
    journeys.journeys[0].e2e = ['e2e/tests/demo.spec.ts'];
  },
  'is not named anywhere in');

check('a journey naming a missing spec is reported',
  (_reqs, _caps, journeys) => { journeys.journeys[0].e2e = ['e2e/tests/gone.spec.ts']; },
  'names missing end-to-end spec');

check('an identifier from an undeclared family is reported',
  (reqs) => { delete reqs.families; },
  'which docs/registry/requirements.json does not declare');

check('a value outside the schema vocabulary is reported',
  (reqs) => { reqs.requirements[0].implementation_status = 'shipped'; },
  'is not one of');

// The family stays declared, so the reader still finds INT-1 in src/thing.ts.
// Dropping the declaration instead would make the identifier invisible, which
// looks like a pass and is the failure this case exists to rule out.
check('a requirement cited by code but absent from the register is reported',
  (reqs) => { reqs.requirements = [reqs.requirements[0]]; },
  'but docs/registry/requirements.json does not define it');

check('a registered requirement that nothing cites is reported',
  (reqs) => {
    // Inserted in canonical order so the ordering rule does not fire instead.
    reqs.requirements.splice(1, 0, {
      id: 'FR-999', capability: 'CAP-DEMO', kind: 'functional',
      title: 'Never mentioned', statement: 'Nothing in the repository cites this.',
      implementation_status: 'implemented', definition_provenance: 'reconstructed', review: 'needs-review',
    });
  },
  'is registered but cited nowhere');

check('a stale generated artifact is reported',
  (_reqs, _caps, _journeys, dir) => {
    writeFileSync(join(dir, 'docs/generated/traceability.json'), '{"totals":{}}\n');
  },
  'is stale');

if (failures) {
  console.error(`\ncheck-docs-traceability selftest: ${failures} case(s) failed`);
  process.exit(1);
}
console.log('check-docs-traceability selftest: ok');
