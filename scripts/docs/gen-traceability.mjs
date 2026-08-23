#!/usr/bin/env node
/**
 * Build docs/generated/traceability.json: every requirement in the register,
 * joined to every place in the repository that cites it.
 *
 * This is the generated half of the curated/generated split. The register in
 * docs/registry/requirements.json says what a requirement MEANS, which is a
 * judgement a person has to make. This says where it LIVES, which is a fact a
 * machine can recover and therefore a fact that can be kept honest by a gate.
 *
 * Only tracked files are read, so an untracked working file can never appear in
 * a committed artifact, and two clean checkouts of the same commit produce
 * byte-identical output.
 *
 * Usage: node scripts/docs/gen-traceability.mjs [--check|--stdout]
 *   --check   compare against the committed artifact and exit non-zero on drift
 *   --stdout  print the artifact without writing it, so a caller can join
 *             against current evidence rather than against the committed file
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { citationsIn, compareIds, isTestPath, stripGenerated } from './lib/citations.mjs';

const root = process.env.VITAE_DOCS_ROOT
  ? process.env.VITAE_DOCS_ROOT
  : join(dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = 'docs/generated/traceability.json';

/** Files whose content is an identifier list rather than a use of identifiers. */
const SELF_REFERENTIAL = [/^docs\/registry\//, /^docs\/generated\//];
/** Text formats worth reading. Anything else is data, lockfile, or binary. */
const READABLE = /\.(ts|tsx|js|jsx|mjs|cjs|md|yml|yaml|sql|sh|css|json|tex)$/;
/** Large generated files that cite nothing and cost time to read. */
const NOISE = [/^pnpm-lock\.yaml$/, /package-lock\.json$/, /^docs\/api\/openapi\.json$/];

function trackedFiles() {
  const out = execFileSync('git', ['-C', root, 'ls-files', '-z'], { maxBuffer: 64 * 1024 * 1024 });
  return out.toString('utf8').split('\0').filter(Boolean).sort();
}

const registry = JSON.parse(readFileSync(join(root, 'docs/registry/requirements.json'), 'utf8'));
const capabilities = JSON.parse(readFileSync(join(root, 'docs/registry/capabilities.json'), 'utf8'));
const journeys = JSON.parse(readFileSync(join(root, 'docs/registry/journeys.json'), 'utf8'));
const reader = {
  aliases: registry.id_aliases ?? {},
  families: Object.keys(registry.families ?? {}).sort(),
};

/** id -> {sources, tests, documents}, seeded so a registered-but-uncited id still appears. */
const hits = new Map();
for (const req of registry.requirements) hits.set(req.id, { sources: [], tests: [], documents: [] });
/** Identifiers cited by the repository that the register does not define. */
const unregistered = new Map();
/** Repository-relative path -> the identifiers that file cites. */
const byFile = new Map();

let scanned = 0;
const files = trackedFiles();

for (const rel of files) {
  if (SELF_REFERENTIAL.some((re) => re.test(rel))) continue;
  if (NOISE.some((re) => re.test(rel))) continue;
  if (!READABLE.test(rel)) continue;
  const abs = join(root, rel);
  if (!existsSync(abs)) continue; // A deleted-but-still-indexed path.
  const text = stripGenerated(readFileSync(abs, 'utf8'));
  scanned += 1;
  // A whole-file read answers "does this file cite anything" cheaply; only files
  // that do are re-read line by line to pin the citation to a line number.
  if (!citationsIn(text, reader).length) continue;

  const perFile = new Set();
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    for (const id of citationsIn(lines[i], reader)) {
      perFile.add(id);
      const where = `${rel}:${i + 1}`;
      const entry = hits.get(id);
      if (!entry) {
        if (!unregistered.has(id)) unregistered.set(id, []);
        unregistered.get(id).push(where);
        continue;
      }
      const bucket = isTestPath(rel) ? 'tests' : rel.startsWith('docs/') ? 'documents' : 'sources';
      entry[bucket].push(where);
    }
  }
  if (perFile.size) byFile.set(rel, [...perFile].sort(compareIds));
}

/**
 * The strongest kind of evidence a requirement has.
 *
 * `documents` is deliberately weaker than `tests` and `sources`: a requirement
 * named only by a roadmap row is a plan, not a shipped behavior, and reporting
 * the two the same way is how a register starts overstating a product.
 */
function evidenceLevel(entry) {
  if (entry.tests.length && entry.sources.length) return 'implemented-and-tested';
  if (entry.sources.length) return 'implemented-untested';
  if (entry.tests.length) return 'tested-only';
  if (entry.documents.length) return 'documents-only';
  return 'uncited';
}

const requirements = {};
const byCapability = {};
let citationCount = 0;
for (const req of [...registry.requirements].sort((a, b) => compareIds(a.id, b.id))) {
  const entry = hits.get(req.id);
  citationCount += entry.sources.length + entry.tests.length + entry.documents.length;
  requirements[req.id] = {
    capability: req.capability,
    implementation_status: req.implementation_status,
    definition_provenance: req.definition_provenance,
    evidence: evidenceLevel(entry),
    sources: entry.sources,
    tests: entry.tests,
    documents: entry.documents,
  };
  (byCapability[req.capability] ??= []).push(req.id);
}

const journeyRows = {};
for (const j of journeys.journeys) {
  const specs = j.e2e ?? [];
  journeyRows[j.id] = {
    status: j.status,
    capabilities: j.capabilities ?? [],
    e2e: specs,
    e2e_present: specs.filter((p) => existsSync(join(root, p))),
  };
}

const tally = (level) => Object.values(requirements).filter((r) => r.evidence === level).length;

const artifact = {
  generated_by: 'scripts/docs/gen-traceability.mjs',
  note:
    'Generated. Do not edit by hand; run `pnpm docs:gen`. Each row joins a requirement in '
    + 'docs/registry/requirements.json to every tracked file that cites its identifier. '
    + 'Citations are split three ways because they are not equal evidence: a citation in '
    + 'production source shows the behavior exists, a citation in a test shows it is '
    + 'protected, and a citation in a document shows only that somebody wrote it down.',
  scan: {
    files_scanned: scanned,
    files_citing: byFile.size,
    excluded: {
      self_referential: SELF_REFERENTIAL.map(String),
      machine_written: NOISE.map(String),
    },
  },
  totals: {
    registered: registry.requirements.length,
    citations: citationCount,
    implemented_and_tested: tally('implemented-and-tested'),
    implemented_untested: tally('implemented-untested'),
    tested_only: tally('tested-only'),
    documents_only: tally('documents-only'),
    uncited: tally('uncited'),
    unregistered_identifiers: unregistered.size,
    capabilities: capabilities.capabilities.length,
    journeys: journeys.journeys.length,
  },
  requirements,
  by_capability: Object.fromEntries(
    capabilities.capabilities.map((c) => [c.id, byCapability[c.id] ?? []]),
  ),
  by_file: Object.fromEntries([...byFile.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))),
  journeys: journeyRows,
  unregistered: Object.fromEntries(
    [...unregistered.entries()].sort((a, b) => compareIds(a[0], b[0])),
  ),
};

const serialized = `${JSON.stringify(artifact, null, 2)}\n`;
const outPath = join(root, OUT);

if (process.argv.includes('--stdout')) {
  process.stdout.write(serialized);
} else if (process.argv.includes('--check')) {
  const current = existsSync(outPath) ? readFileSync(outPath, 'utf8') : '';
  if (current !== serialized) {
    console.error(`${OUT} is stale. Run \`pnpm docs:gen\` and commit the result.`);
    process.exit(1);
  }
  console.log('traceability: up to date');
} else {
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, serialized);
  const t = artifact.totals;
  console.log(
    `traceability: ${t.registered} requirements, ${t.citations} citations across `
    + `${artifact.scan.files_citing} files (${t.implemented_and_tested} implemented+tested, `
    + `${t.implemented_untested} implemented untested, ${t.tested_only} tested only, `
    + `${t.documents_only} documents only, ${t.uncited} uncited, `
    + `${t.unregistered_identifiers} unregistered)`,
  );
}
