#!/usr/bin/env node
/**
 * Fail when a committed artifact under docs/generated/ no longer matches the
 * source it was derived from.
 *
 * Every generator supports `--check`, which regenerates in memory and compares
 * against the file on disk instead of writing. This runs all of them, so the
 * reference half of the documentation cannot drift from the code the way prose
 * can: adding an endpoint, a table, a token or a package without regenerating
 * turns into a failed build rather than a quietly wrong page.
 *
 * The generator list is the directory, not a constant. A hardcoded list is one
 * more thing to forget to update, and the failure mode of forgetting is a new
 * generator whose output is never checked — exactly the drift this exists to
 * prevent.
 *
 * Every generator runs even after one fails. A contributor who regenerates
 * once should see every stale artifact, not discover them one build at a time.
 */
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = process.env.VITAE_DOCS_ROOT
  ? process.env.VITAE_DOCS_ROOT
  : join(dirname(fileURLToPath(import.meta.url)), '..');
const genDir = join(root, 'scripts/docs');

const generators = readdirSync(genDir)
  .filter((name) => name.startsWith('gen-') && name.endsWith('.mjs'))
  .sort();

if (generators.length === 0) {
  console.error('No generators found under scripts/docs/. Expected gen-*.mjs.');
  process.exit(1);
}

const stale = [];
for (const name of generators) {
  const run = spawnSync(process.execPath, [join(genDir, name), '--check'], {
    cwd: root,
    encoding: 'utf8',
  });
  if (run.status === 0) continue;
  stale.push({ name, detail: `${run.stderr ?? ''}${run.stdout ?? ''}`.trim() });
}

if (stale.length > 0) {
  console.error(`Stale generated documentation (${stale.length} of ${generators.length}):`);
  for (const { name, detail } of stale) {
    console.error(`  - ${name}`);
    for (const line of detail.split('\n')) if (line.trim()) console.error(`      ${line}`);
  }
  console.error('\nRun `pnpm docs:gen` and commit the result.');
  process.exit(1);
}

console.log(`docs-generated: ok (${generators.length} artifacts current)`);
