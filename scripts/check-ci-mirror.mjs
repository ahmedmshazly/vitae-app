#!/usr/bin/env node
/**
 * Keep the local gate a mirror of the workflow.
 *
 * `scripts/ci-local.sh` opens by calling itself the local equivalent of
 * `.github/workflows/ci.yml`. For a while it was not: it ran eight of the
 * workflow's gates and skipped nine, including the prose gate and the
 * assistant-brand gate, which are the two most likely to reject a documentation
 * change. Nobody noticed, because the sentence claiming otherwise sat in a
 * comment and comments are not executable.
 *
 * GitHub Actions on this account can be billing-blocked, so the local script is
 * the gate rather than a convenience, and a mirror that has drifted is worse
 * than no mirror: it answers the question "would CI accept this" with a
 * confident wrong yes.
 *
 * This compares the two. Every root `package.json` script the workflow runs,
 * and every workspace it filters to, has to appear in the local script, or be
 * listed below with the reason it does not.
 *
 * What it does not check: that the two run those commands in the same order,
 * with the same environment, against the same ports. Those differ on purpose,
 * and the script's own header says how.
 *
 * VITAE_CI_MIRROR_ROOT points the gate at a fixture tree; the self-test sets it.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = process.env.VITAE_CI_MIRROR_ROOT
  ? resolve(process.env.VITAE_CI_MIRROR_ROOT)
  : resolve(import.meta.dirname, '..');

const workflowPath = join(root, '.github/workflows/ci.yml');
const localPath = join(root, 'scripts/ci-local.sh');
const manifestPath = join(root, 'package.json');

for (const [label, path] of [
  ['workflow', workflowPath],
  ['local gate', localPath],
  ['manifest', manifestPath],
]) {
  if (!existsSync(path)) {
    console.error(`missing ${label} at ${path.slice(root.length + 1)}`);
    process.exit(1);
  }
}

const workflow = readFileSync(workflowPath, 'utf8');
const local = readFileSync(localPath, 'utf8');
const scripts = Object.keys(JSON.parse(readFileSync(manifestPath, 'utf8')).scripts ?? {});

/**
 * Commands the workflow runs that the local gate deliberately does not, each
 * with the reason. A new entry here is a decision; a missing one is a bug.
 */
const EXEMPT = new Map([
  ['test:contract', 'runs inside `pnpm --filter @vitae/api test`, which is the whole apps/api vitest project'],
  ['test:security', 'same: a named subset of the apps/api suite the local gate runs whole'],
  ['test:resilience', 'same: a named subset of the apps/api suite the local gate runs whole'],
]);

const findings = [];
const covered = [];

/** Every `pnpm ...` the workflow runs, one per occurrence, flags stripped. */
const invocations = [...workflow.matchAll(/\bpnpm ((?:--filter [@\w/-]+ )?[\w:@/.-]+)/g)].map((m) => m[1].trim());

for (const invocation of new Set(invocations)) {
  const filtered = invocation.match(/^--filter ([@\w/-]+) (.+)$/);
  if (filtered) {
    const workspace = filtered[1];
    if (!local.includes(workspace)) {
      findings.push(`the workflow filters to ${workspace}; the local gate never mentions it`);
    } else {
      covered.push(invocation);
    }
    continue;
  }
  // Only root scripts are checked by name. `pnpm exec ...` and bare binaries are
  // invoked differently on either side by design, and comparing them by string
  // would report drift that is not drift.
  if (!scripts.includes(invocation)) continue;
  if (EXEMPT.has(invocation)) {
    covered.push(`${invocation} (exempt: ${EXEMPT.get(invocation)})`);
    continue;
  }
  if (!local.includes(invocation)) {
    findings.push(
      `the workflow runs \`pnpm ${invocation}\` and the local gate does not. ` +
        `Add it to scripts/ci-local.sh, or record why not in the EXEMPT table in this file.`,
    );
  } else {
    covered.push(invocation);
  }
}

/** An exemption for something the workflow stopped running is stale. */
for (const name of EXEMPT.keys()) {
  if (!invocations.includes(name)) {
    findings.push(`${name} is exempt here but the workflow no longer runs it; drop the exemption`);
  }
}

if (findings.length > 0) {
  console.error(`ci-mirror (${findings.length}):`);
  for (const finding of findings) console.error(`  ${finding}`);
  process.exit(1);
}

console.log(`ci-mirror: ok (${covered.length} workflow invocation(s) accounted for, ${EXEMPT.size} exempt)`);
