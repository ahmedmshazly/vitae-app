#!/usr/bin/env node
/**
 * Fail when a diagram says something the repository does not.
 *
 * A diagram is the easiest thing in a documentation set to let rot. Nobody
 * reads a picture against the code, and a picture cannot be grepped. These are
 * declared as data instead, which makes them checkable, and this is the check:
 *
 *   shape        every file matches docs/registry/schema/diagram.schema.json,
 *                including the fields its own kind requires
 *
 *   identity     the identifier matches the filename, and no two files claim
 *                the same one, so a page naming a diagram gets the one it meant
 *
 *   references   every step, transition and link names something the same file
 *                declares — an arrow to an actor that does not exist is a
 *                drawing bug that would otherwise render as an arrow to nowhere
 *
 *   evidence     every `sources` path and every `source` line exists in the
 *                repository, and every line number is inside the file it names.
 *                This is the check that actually catches drift: a diagram
 *                citing `middleware/auth.ts:128` stops passing when that file
 *                is refactored, which is the moment someone should look at it
 *
 *   registry     cited requirement identifiers are registered, and routes named
 *                by a journey phase are mounted
 *
 * VITAE_DOCS_ROOT points the gate at a fixture tree; the self-test sets it.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertKnownKeywords, validate } from './docs/lib/json-schema.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = process.env.VITAE_DOCS_ROOT ? process.env.VITAE_DOCS_ROOT : join(here, '..');
const DIR = 'docs/registry/diagrams';
const SCHEMA = 'docs/registry/schema/diagram.schema.json';

const problems = [];
const fail = (where, message) => problems.push(`${where}: ${message}`);

function readJson(rel) {
  try {
    return JSON.parse(readFileSync(join(root, rel), 'utf8'));
  } catch (error) {
    fail(rel, error.code === 'ENOENT' ? 'missing' : `is not valid JSON (${error.message})`);
    return null;
  }
}

const schema = readJson(SCHEMA);
if (schema) {
  for (const keyword of assertKnownKeywords(schema)) fail(SCHEMA, `unsupported keyword ${keyword}`);
}
if (!schema || problems.length) report(0);

const requirementIds = new Set(
  (readJson('docs/registry/requirements.json')?.requirements ?? []).map((entry) => entry.id),
);
const mountedRoutes = new Set(
  (readJson('docs/generated/routes.json')?.routes ?? []).map((entry) => entry.path),
);

let files = [];
try {
  files = readdirSync(join(root, DIR)).filter((name) => name.endsWith('.json')).sort();
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}

/**
 * Does this `path:line` citation still point at a line that exists?
 *
 * The line number is the part that rots first and the part nobody notices. A
 * citation without one is allowed — some things are true of a whole file — but
 * one that names a line past the end of that file is stale by construction.
 */
function checkCitation(where, field, value) {
  const match = /^([^:]+)(?::(\d+))?$/.exec(value);
  if (!match) {
    fail(where, `${field} ${JSON.stringify(value)} is not a repository path or path:line`);
    return;
  }
  const [, path, line] = match;
  const abs = join(root, path);
  if (!existsSync(abs)) {
    fail(where, `${field} names ${path}, which does not exist`);
    return;
  }
  if (line === undefined) return;
  // A file ending in a newline splits into one more piece than it has lines,
  // and counting that phantom made the gate accept a citation exactly one line
  // past the end — the single most likely off-by-one a stale citation has.
  const count = readFileSync(abs, 'utf8').replace(/\n$/, '').split('\n').length;
  if (Number(line) > count) {
    fail(where, `${field} names ${path}:${line}, but that file has ${count} line(s). The code moved; re-read it.`);
  }
}

const seen = new Map();

for (const file of files) {
  const rel = `${DIR}/${file}`;
  const spec = readJson(rel);
  if (!spec) continue;

  for (const error of validate(schema, spec)) fail(rel, error);
  if (typeof spec.id !== 'string' || typeof spec.kind !== 'string') continue;

  const expected = `${spec.id.replace(/^DGM-/, '').toLowerCase()}.json`;
  if (file !== expected) {
    fail(rel, `declares ${spec.id}, so its file should be named ${expected}`);
  }
  if (seen.has(spec.id)) fail(rel, `id ${spec.id} is already used by ${seen.get(spec.id)}`);
  else seen.set(spec.id, rel);

  for (const path of spec.sources ?? []) checkCitation(rel, 'sources', path);
  for (const id of spec.requirements ?? []) {
    if (requirementIds.size > 0 && !requirementIds.has(id)) {
      fail(rel, `requirements names ${id}, which docs/registry/requirements.json does not define`);
    }
  }

  // -- every arrow points at something this file declares --------------------
  const ids = (list) => new Set((list ?? []).map((entry) => entry.id));
  const link = (kind, list, declared, what) => {
    for (const [index, entry] of (list ?? []).entries()) {
      for (const end of ['from', 'to']) {
        if (!declared.has(entry[end])) {
          fail(rel, `${kind}[${index}].${end} is ${JSON.stringify(entry[end])}, which is not a declared ${what}`);
        }
      }
      if (entry.source) checkCitation(rel, `${kind}[${index}].source`, entry.source);
    }
  };

  if (spec.kind === 'sequence') link('steps', spec.steps, ids(spec.actors), 'actor');
  if (spec.kind === 'state') {
    const states = ids(spec.states);
    link('transitions', spec.transitions, states, 'state');
    const initial = (spec.states ?? []).filter((state) => state.initial);
    if (initial.length !== 1) {
      fail(rel, `has ${initial.length} initial state(s); a state machine starts in exactly one`);
    }
    // A state nothing reaches and nothing leaves is either a mistake or a state
    // that does not belong on the diagram. Either way someone should look.
    for (const state of spec.states ?? []) {
      const reached = (spec.transitions ?? []).some((move) => move.to === state.id);
      const leaves = (spec.transitions ?? []).some((move) => move.from === state.id);
      if (!reached && !state.initial && !state.unreachable) {
        fail(rel, `state ${JSON.stringify(state.id)} is unreachable. If the code declares it and `
          + 'nothing reaches it, that is a finding: mark it `"unreachable": true` and say so in its '
          + '`note`, so the diagram reports the dead state instead of hiding it.');
      }
      // The marker has to keep earning itself. Left behind after someone adds
      // the missing transition, it would state a finding that is no longer true.
      if (state.unreachable && reached) {
        fail(rel, `state ${JSON.stringify(state.id)} is marked unreachable, but a transition reaches it`);
      }
      if (state.unreachable && !state.note) {
        fail(rel, `state ${JSON.stringify(state.id)} is marked unreachable without a note saying how that was established`);
      }
      if (!leaves && !state.terminal) {
        fail(rel, `state ${JSON.stringify(state.id)} has no way out and is not marked terminal`);
      }
    }
  }
  if (spec.kind === 'topology') {
    const zones = ids(spec.zones);
    for (const [index, node] of (spec.nodes ?? []).entries()) {
      if (!zones.has(node.zone)) {
        fail(rel, `nodes[${index}].zone is ${JSON.stringify(node.zone)}, which is not a declared zone`);
      }
      if (node.source) checkCitation(rel, `nodes[${index}].source`, node.source);
    }
    link('links', spec.links, ids(spec.nodes), 'node');
  }
  if (spec.kind === 'lanes') {
    const lanes = ids(spec.lanes);
    for (const [index, phase] of (spec.phases ?? []).entries()) {
      if (!lanes.has(phase.lane)) {
        fail(rel, `phases[${index}].lane is ${JSON.stringify(phase.lane)}, which is not a declared lane`);
      }
      if (phase.route && mountedRoutes.size > 0 && !mountedRoutes.has(phase.route)) {
        fail(rel, `phases[${index}].route is ${phase.route}, which docs/generated/routes.json does not mount`);
      }
      for (const test of phase.covered_by ?? []) checkCitation(rel, `phases[${index}].covered_by`, test);
    }
  }
}

report(files.length);

function report(count) {
  if (problems.length) {
    console.error(`Documentation diagrams (${problems.length} problem(s)):`);
    for (const problem of problems) console.error(`  - ${problem}`);
    process.exit(1);
  }
  const kinds = new Map();
  for (const rel of seen.values()) {
    const spec = JSON.parse(readFileSync(join(root, rel), 'utf8'));
    kinds.set(spec.kind, (kinds.get(spec.kind) ?? 0) + 1);
  }
  const summary = [...kinds].sort().map(([kind, n]) => `${kind} ${n}`).join(', ');
  console.log(`docs-diagrams: ok (${count} diagram(s)${summary ? `: ${summary}` : ''})`);
  process.exit(0);
}
