#!/usr/bin/env node
/**
 * Fail when the documentation registries and the repository disagree.
 *
 * The registries in docs/registry/ are curated: a person decided what each
 * requirement, capability and journey means. Curated files rot silently, so
 * this gate re-derives everything that CAN be derived and refuses the mismatch.
 *
 * It checks, in order:
 *   1. each registry against its JSON Schema, and each schema against the
 *      validator's supported keyword set;
 *   2. referential integrity within and between registries, including that
 *      every evidence path named actually exists;
 *   3. the join against docs/generated/traceability.json, which must itself be
 *      current: an identifier cited by the code but absent from the register,
 *      or registered but cited nowhere, is a defect either way.
 *
 * VITAE_DOCS_ROOT points the gate at a fixture tree; the self-test sets it.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertKnownKeywords, validate } from './docs/lib/json-schema.mjs';
import { compareIds } from './docs/lib/citations.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = process.env.VITAE_DOCS_ROOT ? process.env.VITAE_DOCS_ROOT : join(here, '..');
const problems = [];
const fail = (where, message) => problems.push(`${where}: ${message}`);

function readJson(rel) {
  const abs = join(root, rel);
  if (!existsSync(abs)) {
    fail(rel, 'missing');
    return null;
  }
  try {
    return JSON.parse(readFileSync(abs, 'utf8'));
  } catch (error) {
    fail(rel, `is not valid JSON (${error.message})`);
    return null;
  }
}

// 1. Schema conformance ------------------------------------------------------
const registries = {};
for (const name of ['requirements', 'capabilities', 'journeys']) {
  const data = readJson(`docs/registry/${name}.json`);
  const schema = readJson(`docs/registry/schema/${name}.schema.json`);
  registries[name] = data;
  if (!data || !schema) continue;
  // A schema keyword the validator does not implement is a hole in the gate,
  // not a passing document, so it is reported before the data is judged.
  for (const kw of assertKnownKeywords(schema)) {
    fail(`docs/registry/schema/${name}.schema.json`, `unsupported keyword ${kw}`);
  }
  for (const error of validate(schema, data)) fail(`docs/registry/${name}.json`, error);
}

const { requirements: reqDoc, capabilities: capDoc, journeys: jrnDoc } = registries;

// 2. Referential integrity ---------------------------------------------------
if (capDoc && reqDoc && jrnDoc) {
  const capIds = new Set(capDoc.capabilities.map((c) => c.id));
  const reqIds = new Set(reqDoc.requirements.map((r) => r.id));

  const duplicates = (ids) => ids.filter((id, i) => ids.indexOf(id) !== i);
  for (const [where, ids] of [
    ['docs/registry/capabilities.json', capDoc.capabilities.map((c) => c.id)],
    ['docs/registry/requirements.json', reqDoc.requirements.map((r) => r.id)],
    ['docs/registry/journeys.json', jrnDoc.journeys.map((j) => j.id)],
  ]) {
    for (const id of new Set(duplicates(ids))) fail(where, `duplicate identifier ${id}`);
  }

  const order = reqDoc.requirements.map((r) => r.id);
  const sorted = [...order].sort(compareIds);
  if (order.join() !== sorted.join()) {
    const at = order.findIndex((id, i) => id !== sorted[i]);
    fail('docs/registry/requirements.json', `not in canonical order: ${order[at]} should be ${sorted[at]}`);
  }

  for (const req of reqDoc.requirements) {
    if (!capIds.has(req.capability)) fail(req.id, `names unknown capability ${req.capability}`);
    const family = /^([A-Z]{2,4})-\d{1,3}$/.exec(req.id)?.[1];
    if (family && family !== 'FR' && family !== 'NFR' && !(reqDoc.families ?? {})[family]) {
      fail(req.id, `belongs to family ${family}, which docs/registry/requirements.json does not declare`);
    }
  }
  for (const [alias, canonical] of Object.entries(reqDoc.id_aliases ?? {})) {
    if (!reqIds.has(canonical)) fail('id_aliases', `${alias} maps to unregistered ${canonical}`);
  }
  for (const family of Object.keys(reqDoc.families ?? {})) {
    const used = [...reqIds].some((id) => id.startsWith(`${family}-`));
    if (!used) fail('families', `${family} is declared but no registered identifier uses it`);
  }
  for (const marker of reqDoc.unmodelled_markers ?? []) {
    for (const cite of marker.cited_at) {
      const file = cite.slice(0, cite.lastIndexOf(':'));
      if (!existsSync(join(root, file))) fail(`marker ${marker.marker}`, `cites missing file ${file}`);
    }
  }

  for (const cap of capDoc.capabilities) {
    for (const path of cap.evidence) {
      if (!existsSync(join(root, path))) fail(cap.id, `names missing evidence path ${path}`);
    }
  }

  for (const journey of jrnDoc.journeys) {
    for (const capability of journey.capabilities ?? []) {
      if (!capIds.has(capability)) fail(journey.id, `names unknown capability ${capability}`);
    }
    for (const spec of journey.e2e ?? []) {
      const abs = join(root, spec);
      if (!existsSync(abs)) {
        fail(journey.id, `names missing end-to-end spec ${spec}`);
        continue;
      }
      // A journey that claims coverage must be findable in the spec that
      // covers it, or the claim is a path that happens to exist.
      if (!new RegExp(`\\b${journey.id}\\b`).test(readFileSync(abs, 'utf8'))) {
        fail(journey.id, `is not named anywhere in ${spec}, so the coverage claim is unverifiable`);
      }
    }
  }
}

// 3. The join against generated evidence -------------------------------------
// The join runs against FRESHLY derived evidence, not against the committed
// artifact. Judging an edited register with the evidence that existed before
// the edit would let exactly the change under review pass unexamined. The
// committed file is then compared separately, so staleness is its own defect
// rather than a silent substitution of old facts for new ones.
let trace = null;
try {
  const fresh = execFileSync('node', [join(here, 'docs/gen-traceability.mjs'), '--stdout'], {
    cwd: root,
    env: { ...process.env, VITAE_DOCS_ROOT: root },
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 64 * 1024 * 1024,
  }).toString();
  trace = JSON.parse(fresh);
  const committedPath = join(root, 'docs/generated/traceability.json');
  const committed = existsSync(committedPath) ? readFileSync(committedPath, 'utf8') : '';
  if (committed !== fresh) {
    fail('docs/generated/traceability.json', 'is stale. Run `pnpm docs:gen` and commit the result.');
  }
} catch (error) {
  const detail = `${error.stderr ?? ''}`.trim() || error.message;
  fail('docs/generated/traceability.json', `could not be derived: ${detail}`);
}

if (trace && reqDoc) {
  for (const [id, cites] of Object.entries(trace.unregistered ?? {})) {
    fail(id, `is cited at ${cites[0]} but docs/registry/requirements.json does not define it`);
  }
  const byId = new Map(reqDoc.requirements.map((r) => [r.id, r]));
  for (const [id, row] of Object.entries(trace.requirements ?? {})) {
    if (row.evidence === 'uncited') {
      fail(id, 'is registered but cited nowhere in the repository');
      continue;
    }
    // A row asserting shipped behavior whose only trace is a document is not
    // forbidden, because a citation is a comment and comments are optional.
    // It must, however, say on what basis the attribution was made.
    if (row.evidence === 'documents-only' && row.implementation_status === 'implemented'
      && !byId.get(id)?.reconstruction_note) {
      fail(id, 'claims implemented status with no source or test citation and no reconstruction_note');
    }
  }
}

if (problems.length) {
  console.error(`docs traceability: ${problems.length} problem(s)`);
  for (const problem of problems.sort()) console.error(`  - ${problem}`);
  process.exit(1);
}

const t = trace?.totals ?? {};
console.log(
  `docs traceability: ok (${t.registered} requirements, ${t.capabilities} capabilities, `
  + `${t.journeys} journeys, ${t.citations} citations)`,
);
