#!/usr/bin/env node
/**
 * Fail when the documentation stops accounting for something the code has.
 *
 * The inventories are not written here. Every one is read from an artifact
 * under docs/generated/, which is derived from the source and kept current by
 * `check-docs-generated.mjs`. So this gate cannot be fooled by a stale list:
 * add a route, an algorithm, a package, a runbook or a resume template, and it
 * appears in the inventory on the next generation whether or not anyone
 * documented it.
 *
 * Two kinds of coverage count, and the registry says which applies where.
 * Most reference material is covered by a generated catalog — 135 endpoints
 * and 178 design tokens do not each need an essay, and a hand-maintained list
 * of them would be wrong within a week. What a generator cannot produce is
 * meaning: what a screen is for, what an algorithm optimises, what a package
 * owns, how a procedure is run. Those domains are marked `requires_prose` and
 * must be claimed by a curated page's `covers:` field.
 *
 * `undocumented` in the registry is a ratchet, not an exemption list. It
 * records exactly what is uncovered today; the gate fails when something new
 * joins it, and equally when an entry has been covered or deleted without the
 * ratchet being tightened. It can only shrink. `--update` rewrites it, which
 * is how a slice of authored pages is recorded.
 */
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { frontmatter } from './docs/lib/frontmatter.mjs';

const root = process.env.VITAE_DOCS_ROOT
  ? resolve(process.env.VITAE_DOCS_ROOT)
  : join(dirname(fileURLToPath(import.meta.url)), '..');
const REGISTRY = 'docs/registry/coverage.json';
const CORPUS = 'docs/observatory';
const update = process.argv.includes('--update');

const registry = JSON.parse(readFileSync(join(root, REGISTRY), 'utf8'));
const problems = [];
const inventory = new Map();

/** Files git knows about, so an untracked draft is never treated as published. */
function tracked(prefix) {
  try {
    const out = execFileSync('git', ['-C', root, 'ls-files', '-z', '--', prefix], { maxBuffer: 32 * 1024 * 1024 });
    return out.toString('utf8').split('\0').filter(Boolean);
  } catch {
    return [];
  }
}

// -- inventories from the generated artifacts ------------------------------
for (const [domain, spec] of Object.entries(registry.catalogs)) {
  const abs = join(root, spec.artifact);
  if (!existsSync(abs)) {
    problems.push(`${domain}: ${spec.artifact} does not exist. Run \`pnpm docs:gen\`.`);
    continue;
  }
  let artifact;
  try {
    artifact = JSON.parse(readFileSync(abs, 'utf8'));
  } catch (error) {
    problems.push(`${domain}: ${spec.artifact} is not readable JSON — ${error.message}`);
    continue;
  }
  // A gate that throws on a damaged input tells a contributor less than one
  // that names the file, and stops before checking the domains that are fine.
  const rows = artifact && typeof artifact === 'object' ? artifact[spec.collection] : undefined;
  if (!Array.isArray(rows)) {
    problems.push(`${domain}: ${spec.artifact} has no array at "${spec.collection}". The generator's shape changed.`);
    continue;
  }
  const excluded = Object.entries(spec.exclude_when ?? {});
  const ids = [];
  for (const row of rows) {
    const id = row[spec.id_field];
    if (id === undefined) {
      problems.push(`${domain}: a row in ${spec.artifact} has no "${spec.id_field}". The generator's shape changed.`);
      break;
    }
    // `"*"` in an exclusion list means "any value at all", which is how a
    // redirect is excluded without naming every target it might point at.
    const skip = excluded.some(([field, values]) =>
      row[field] !== undefined && row[field] !== null
      && (values.includes('*') || values.includes(row[field])));
    if (!skip) ids.push(String(id));
  }
  inventory.set(domain, new Set(ids));
}

// -- inventories from the filesystem ---------------------------------------
for (const [domain, spec] of Object.entries(registry.filesystem_catalogs ?? {})) {
  const [prefix] = spec.glob.split('*');
  const exclude = new Set(spec.exclude ?? []);
  const ids = new Set();
  if (spec.directories) {
    const abs = join(root, prefix);
    if (existsSync(abs)) {
      for (const name of readdirSync(abs)) {
        const rel = `${prefix}${name}`;
        if (statSync(join(abs, name)).isDirectory() && !exclude.has(rel)) ids.add(rel);
      }
    }
  } else {
    const suffix = spec.glob.slice(spec.glob.indexOf('*') + 1);
    for (const rel of tracked(prefix)) {
      if (rel.endsWith(suffix) && !exclude.has(rel) && !relative(prefix, rel).includes('/')) ids.add(rel);
    }
  }
  if (ids.size === 0) problems.push(`${domain}: ${spec.glob} matched nothing. Check the glob.`);
  inventory.set(domain, ids);
}

// -- what the curated corpus claims to cover -------------------------------
const covered = new Map([...inventory.keys()].map((d) => [d, new Map()]));
const pages = [];
(function collect(dir) {
  const abs = join(root, dir);
  if (!existsSync(abs)) return;
  for (const name of readdirSync(abs)) {
    const rel = `${dir}/${name}`;
    if (statSync(join(root, rel)).isDirectory()) collect(rel);
    else if (name.endsWith('.md')) pages.push(rel);
  }
})(CORPUS);

for (const rel of pages.sort()) {
  let data;
  try {
    ({ data } = frontmatter(readFileSync(join(root, rel), 'utf8'), { file: rel }));
  } catch (error) {
    problems.push(`${rel}: ${error.message}`);
    continue;
  }
  for (const claim of data?.covers ?? []) {
    const at = String(claim).indexOf(':');
    if (at < 1) {
      problems.push(`${rel}: covers entry ${JSON.stringify(claim)} is not "domain:id".`);
      continue;
    }
    const domain = String(claim).slice(0, at);
    const id = String(claim).slice(at + 1);
    if (!inventory.has(domain)) {
      problems.push(`${rel}: covers unknown domain "${domain}". Known: ${[...inventory.keys()].sort().join(', ')}.`);
      continue;
    }
    if (!inventory.get(domain).has(id)) {
      problems.push(`${rel}: covers ${domain} "${id}", which does not exist.`);
      continue;
    }
    if (!covered.get(domain).has(id)) covered.get(domain).set(id, []);
    covered.get(domain).get(id).push(rel);
  }
}

// -- the ratchet -----------------------------------------------------------
const baseline = registry.undocumented ?? {};
const uncovered = {};
for (const domain of Object.keys(registry.requires_prose)) {
  if (!inventory.has(domain)) {
    problems.push(`requires_prose names "${domain}", which no catalog produces.`);
    continue;
  }
  const missing = [...inventory.get(domain)].filter((id) => !covered.get(domain).has(id)).sort();
  if (missing.length) uncovered[domain] = missing;
}

if (update) {
  registry.undocumented = uncovered;
  writeFileSync(join(root, REGISTRY), `${JSON.stringify(registry, null, 2)}\n`);
  const total = Object.values(uncovered).reduce((n, v) => n + v.length, 0);
  console.log(`docs-coverage: ratchet updated — ${total} item(s) still undocumented`);
  process.exit(problems.length ? 1 : 0);
}

for (const [domain, ids] of Object.entries(uncovered)) {
  const known = new Set(baseline[domain] ?? []);
  const regressed = ids.filter((id) => !known.has(id));
  if (regressed.length) {
    problems.push(`${domain}: newly undocumented — ${regressed.join(', ')}. `
      + `Add a page under ${CORPUS}/ whose covers: lists ${domain}:<id>.`);
  }
}
for (const [domain, ids] of Object.entries(baseline)) {
  if (!inventory.has(domain)) {
    problems.push(`the ratchet lists domain "${domain}", which no catalog produces. Run --update.`);
    continue;
  }
  const still = new Set(uncovered[domain] ?? []);
  const settled = ids.filter((id) => !still.has(id));
  if (settled.length) {
    problems.push(`${domain}: the ratchet still lists ${settled.join(', ')}, now documented or gone. `
      + 'Run `node scripts/check-docs-coverage.mjs --update` and commit the result.');
  }
}

if (problems.length) {
  console.error(`Documentation coverage (${problems.length} problem(s)):`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}

const counts = [...inventory].map(([d, s]) => `${d} ${covered.get(d).size}/${s.size}`).sort();
const remaining = Object.values(uncovered).reduce((n, v) => n + v.length, 0);
console.log(`docs-coverage: ok (${counts.join(', ')}; ${remaining} awaiting prose)`);
