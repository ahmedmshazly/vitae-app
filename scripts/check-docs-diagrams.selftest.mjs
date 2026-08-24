#!/usr/bin/env node
/**
 * Prove the diagram gate rejects what it claims to reject.
 *
 * The reason this file exists is the reason `check-test-coverage-map.mjs`
 * silently passed everything for months: a gate nobody has watched fail is not
 * a gate, it is a log line. Each case below breaks one guarantee on purpose and
 * asserts the exit code and the sentence a person would need to fix it.
 *
 * The case that matters most is the stale line number. Every other failure here
 * would be caught by a careful reader; a diagram citing a line that has since
 * moved looks completely correct and is the way a diagram actually goes wrong.
 */
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
let failures = 0;

const SEQUENCE = {
  id: 'DGM-EXAMPLE',
  title: 'An example',
  summary: 'What happens when something happens.',
  kind: 'sequence',
  sources: ['src/thing.ts'],
  actors: [
    { id: 'browser', label: 'Browser' },
    { id: 'api', label: 'API' },
  ],
  steps: [{ from: 'browser', to: 'api', label: 'Asks for the thing', source: 'src/thing.ts:2' }],
};

const STATE = {
  id: 'DGM-STATE',
  title: 'A lifecycle',
  summary: 'How the thing moves.',
  kind: 'state',
  sources: ['src/thing.ts'],
  states: [
    { id: 'draft', label: 'Draft', initial: true },
    { id: 'done', label: 'Done', terminal: true },
  ],
  transitions: [{ from: 'draft', to: 'done', label: 'Someone finishes it' }],
};

const LANES = {
  id: 'DGM-LANES',
  title: 'A journey',
  summary: 'What a person does.',
  kind: 'lanes',
  sources: ['src/thing.ts'],
  lanes: [
    { id: 'person', label: 'Person' },
    { id: 'system', label: 'System' },
  ],
  phases: [{ id: 'start', lane: 'person', label: 'Opens it', route: '/alpha', covered_by: [] }],
};

function fixture(mutate = () => {}) {
  const dir = mkdtempSync(join(tmpdir(), 'vitae-docs-diagrams-'));
  mkdirSync(join(dir, 'scripts/docs/lib'), { recursive: true });
  mkdirSync(join(dir, 'docs/registry/diagrams'), { recursive: true });
  mkdirSync(join(dir, 'docs/registry/schema'), { recursive: true });
  mkdirSync(join(dir, 'docs/generated'), { recursive: true });
  mkdirSync(join(dir, 'src'), { recursive: true });
  cpSync(join(here, 'check-docs-diagrams.mjs'), join(dir, 'scripts/check-docs-diagrams.mjs'));
  cpSync(join(here, 'docs/lib/json-schema.mjs'), join(dir, 'scripts/docs/lib/json-schema.mjs'));
  cpSync(
    join(here, '../docs/registry/schema/diagram.schema.json'),
    join(dir, 'docs/registry/schema/diagram.schema.json'),
  );

  const state = {
    files: { 'example.json': structuredClone(SEQUENCE) },
    // Three lines, so `src/thing.ts:2` resolves and `src/thing.ts:9` does not.
    thing: 'export const a = 1;\nexport const b = 2;\nexport const c = 3;\n',
    routes: { routes: [{ path: '/alpha' }] },
    requirements: { requirements: [{ id: 'FR-001' }] },
    raw: {},
  };
  mutate(state);

  for (const [name, spec] of Object.entries(state.files)) {
    writeFileSync(join(dir, 'docs/registry/diagrams', name), `${JSON.stringify(spec, null, 2)}\n`);
  }
  for (const [name, text] of Object.entries(state.raw)) {
    writeFileSync(join(dir, 'docs/registry/diagrams', name), text);
  }
  writeFileSync(join(dir, 'src/thing.ts'), state.thing);
  writeFileSync(join(dir, 'docs/generated/routes.json'), JSON.stringify(state.routes));
  writeFileSync(join(dir, 'docs/registry/requirements.json'), JSON.stringify(state.requirements));
  return dir;
}

function check(label, { mutate, exit, expect = [] }) {
  const dir = fixture(mutate);
  try {
    const run = spawnSync(process.execPath, [join(dir, 'scripts/check-docs-diagrams.mjs')], {
      cwd: dir,
      encoding: 'utf8',
      env: { ...process.env, VITAE_DOCS_ROOT: dir },
    });
    const output = `${run.stdout ?? ''}${run.stderr ?? ''}`;
    const wrong = [];
    if (run.status !== exit) wrong.push(`exited ${run.status}, expected ${exit}`);
    for (const text of expect) if (!output.includes(text)) wrong.push(`missing ${JSON.stringify(text)}`);
    if (wrong.length === 0) {
      console.log(`  ok  ${label}`);
      return;
    }
    failures += 1;
    console.error(`  FAIL ${label}: ${wrong.join('; ')}`);
    console.error(output.split('\n').map((line) => `       ${line}`).join('\n'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

console.log('diagram gate');

check('a diagram that obeys every rule passes', {
  mutate: (state) => {
    state.files['state.json'] = structuredClone(STATE);
    state.files['lanes.json'] = structuredClone(LANES);
  },
  exit: 0,
  expect: ['docs-diagrams: ok (3 diagram(s): lanes 1, sequence 1, state 1)'],
});

check('an empty directory passes rather than failing on nothing', {
  mutate: (state) => {
    state.files = {};
  },
  exit: 0,
  expect: ['docs-diagrams: ok (0 diagram(s))'],
});

check('a citation whose line has moved past the end of the file fails', {
  mutate: (state) => {
    state.files['example.json'].steps[0].source = 'src/thing.ts:9';
  },
  exit: 1,
  expect: ['that file has 3 line(s)', 'The code moved'],
});

check('a citation one line past the end fails, which is the likely off-by-one', {
  // src/thing.ts has three lines and a trailing newline. Counting the empty
  // piece after that newline would make line 4 look real.
  mutate: (state) => {
    state.files['example.json'].steps[0].source = 'src/thing.ts:4';
  },
  exit: 1,
  expect: ['names src/thing.ts:4', 'that file has 3 line(s)'],
});

check('a citation to the last real line passes', {
  mutate: (state) => {
    state.files['example.json'].steps[0].source = 'src/thing.ts:3';
  },
  exit: 0,
  expect: ['docs-diagrams: ok'],
});

check('a citation to a file that no longer exists fails', {
  mutate: (state) => {
    state.files['example.json'].sources = ['src/gone.ts'];
  },
  exit: 1,
  expect: ['names src/gone.ts, which does not exist'],
});

check('an arrow to an actor nobody declared fails', {
  mutate: (state) => {
    state.files['example.json'].steps[0].to = 'database';
  },
  exit: 1,
  expect: ['steps[0].to is "database", which is not a declared actor'],
});

check('a file whose name does not match its identifier fails', {
  mutate: (state) => {
    state.files['wrong-name.json'] = state.files['example.json'];
    delete state.files['example.json'];
  },
  exit: 1,
  expect: ['should be named example.json'],
});

check('two diagrams claiming one identifier fails', {
  mutate: (state) => {
    state.files['example.json'].id = 'DGM-STATE';
    state.files['state.json'] = structuredClone(STATE);
  },
  exit: 1,
  expect: ['is already used by'],
});

check('a sequence with no steps fails its own kind', {
  mutate: (state) => {
    delete state.files['example.json'].steps;
  },
  exit: 1,
  expect: ['steps'],
});

check('a field the schema does not know fails', {
  mutate: (state) => {
    state.files['example.json'].colour = 'blue';
  },
  exit: 1,
  expect: ['colour'],
});

check('a state machine with no starting state fails', {
  mutate: (state) => {
    const spec = structuredClone(STATE);
    delete spec.states[0].initial;
    state.files = { 'state.json': spec };
  },
  exit: 1,
  expect: ['has 0 initial state(s)'],
});

check('a state machine with two starting states fails', {
  mutate: (state) => {
    const spec = structuredClone(STATE);
    spec.states[1].initial = true;
    state.files = { 'state.json': spec };
  },
  exit: 1,
  expect: ['has 2 initial state(s)'],
});

check('a state nothing can reach fails', {
  mutate: (state) => {
    const spec = structuredClone(STATE);
    spec.states.push({ id: 'orphan', label: 'Orphan', terminal: true });
    state.files = { 'state.json': spec };
  },
  exit: 1,
  expect: ['state "orphan" is unreachable', 'that is a finding'],
});

check('a state the code declares but nothing reaches may say so, and passes', {
  // The dead state is the finding. A gate that forced it off the diagram would
  // turn a discovery into an omission.
  mutate: (state) => {
    const spec = structuredClone(STATE);
    spec.states.push({
      id: 'shelved',
      label: 'Shelved',
      terminal: true,
      unreachable: true,
      note: 'Declared in the type and the constraint; no code path sets it.',
    });
    state.files = { 'state.json': spec };
  },
  exit: 0,
  expect: ['docs-diagrams: ok'],
});

check('a state marked unreachable that something reaches fails', {
  // Left behind after the missing transition was found, the marker would state
  // a finding that had stopped being true.
  mutate: (state) => {
    const spec = structuredClone(STATE);
    spec.states.push({ id: 'shelved', label: 'Shelved', terminal: true, unreachable: true, note: 'x' });
    spec.transitions.push({ from: 'sent', to: 'shelved', label: 'Someone shelves it' });
    state.files = { 'state.json': spec };
  },
  exit: 1,
  expect: ['is marked unreachable, but a transition reaches it'],
});

check('a state marked unreachable with no explanation fails', {
  mutate: (state) => {
    const spec = structuredClone(STATE);
    spec.states.push({ id: 'shelved', label: 'Shelved', terminal: true, unreachable: true });
    state.files = { 'state.json': spec };
  },
  exit: 1,
  expect: ['without a note saying how that was established'],
});

check('a state with no way out that does not admit to being the end fails', {
  mutate: (state) => {
    const spec = structuredClone(STATE);
    delete spec.states[1].terminal;
    state.files = { 'state.json': spec };
  },
  exit: 1,
  expect: ['has no way out and is not marked terminal'],
});

check('a journey phase on a route the application does not mount fails', {
  mutate: (state) => {
    const spec = structuredClone(LANES);
    spec.phases[0].route = '/nowhere';
    state.files = { 'lanes.json': spec };
  },
  exit: 1,
  expect: ['which docs/generated/routes.json does not mount'],
});

check('a journey phase in a lane nobody declared fails', {
  mutate: (state) => {
    const spec = structuredClone(LANES);
    spec.phases[0].lane = 'ghost';
    state.files = { 'lanes.json': spec };
  },
  exit: 1,
  expect: ['is not a declared lane'],
});

check('a phase with no coverage is a real answer, not a failure', {
  // The empty list is the point: it is how the corpus says a journey step has
  // nothing running it. A gate that rejected it would push authors to pad it.
  mutate: (state) => {
    state.files = { 'lanes.json': structuredClone(LANES) };
  },
  exit: 0,
  expect: ['docs-diagrams: ok'],
});

check('an unregistered requirement fails', {
  mutate: (state) => {
    state.files['example.json'].requirements = ['FR-999'];
  },
  exit: 1,
  expect: ['which docs/registry/requirements.json does not define'],
});

check('a file that is not valid JSON is reported, not crashed on', {
  mutate: (state) => {
    state.raw = { 'broken.json': '{ this is not json' };
  },
  exit: 1,
  expect: ['is not valid JSON'],
});

console.log(failures === 0 ? 'check-docs-diagrams selftest: ok' : `check-docs-diagrams selftest: ${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
