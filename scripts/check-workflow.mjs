#!/usr/bin/env node
/**
 * Static checks on `.github/workflows/*.yml`, because nothing here runs them.
 *
 * GitHub Actions on this account can be billing-blocked, so the workflow has
 * not executed in a long time. `scripts/ci-local.sh` runs what it runs and
 * `check-ci-mirror.mjs` proves that, but neither notices a workflow that would
 * fail before reaching the first command: a mis-indented block, an action
 * reference that moved, a `run:` step with an unbalanced quote, a script name
 * with a typo in it. Those are exactly the faults a pipeline finds in its first
 * ten seconds and nobody here would find at all.
 *
 * So this checks what can be checked without a runner:
 *
 *   - the file parses as YAML
 *   - every `uses:` is pinned to a commit, which the repository claims (FR-016)
 *     and enforced nowhere
 *   - every `run:` block is valid shell, with `${{ }}` expressions substituted
 *     out first because they are not shell and were never meant to be
 *   - every `pnpm <script>` names a script that exists in package.json
 *   - every `needs:` names a job in the same file
 *   - every job declares `runs-on` and `timeout-minutes`
 *
 * It does not check that the workflow passes. Nothing local can.
 *
 * VITAE_WORKFLOW_ROOT points the gate at a fixture tree; the self-test sets it.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import yaml from 'js-yaml';

const root = process.env.VITAE_WORKFLOW_ROOT
  ? resolve(process.env.VITAE_WORKFLOW_ROOT)
  : resolve(import.meta.dirname, '..');

const workflowDir = join(root, '.github/workflows');
const manifestPath = join(root, 'package.json');

if (!existsSync(workflowDir)) {
  console.error('no .github/workflows directory');
  process.exit(1);
}

const scripts = existsSync(manifestPath)
  ? Object.keys(JSON.parse(readFileSync(manifestPath, 'utf8')).scripts ?? {})
  : [];

const files = readdirSync(workflowDir).filter((n) => n.endsWith('.yml') || n.endsWith('.yaml'));
const findings = [];
let steps = 0;
let pins = 0;

/** A commit sha, which is the only reference that cannot move under you. */
const PINNED = /@[0-9a-f]{40}$/;

/**
 * pnpm's own verbs. Anything else after `pnpm` is claiming to be a script in
 * package.json, and a typo there fails the job rather than the step, which is
 * the kind of thing a pipeline finds instantly and nobody here would.
 */
const PNPM_BUILTINS = new Set([
  'add', 'audit', 'bin', 'config', 'create', 'dedupe', 'deploy', 'dlx', 'env',
  'exec', 'fetch', 'import', 'init', 'install', 'licenses', 'link', 'list',
  'ls', 'outdated', 'pack', 'patch', 'prune', 'publish', 'rebuild', 'remove',
  'root', 'server', 'setup', 'start', 'store', 'unlink', 'update', 'why',
]);

for (const file of files.sort()) {
  const where = `.github/workflows/${file}`;
  const source = readFileSync(join(workflowDir, file), 'utf8');

  let doc;
  try {
    // js-yaml 4's `load` is the safe loader. Version 3 shipped both, and its
    // `safeLoad` was renamed to this one when the unsafe default was dropped,
    // so there is no `safeLoad` to prefer here. The input is a tracked file in
    // this repository either way.
    doc = yaml.load(source);
  } catch (error) {
    findings.push(`${where}: does not parse as YAML. ${(error instanceof Error ? error.message : String(error)).split('\n')[0]}`);
    continue;
  }
  if (!doc || typeof doc !== 'object' || !doc.jobs) {
    findings.push(`${where}: no jobs block`);
    continue;
  }

  const jobNames = Object.keys(doc.jobs);
  for (const [jobName, job] of Object.entries(doc.jobs)) {
    const at = `${where} job ${jobName}`;
    if (!job || typeof job !== 'object') {
      findings.push(`${at}: is not a mapping`);
      continue;
    }
    if (!job['runs-on']) findings.push(`${at}: no runs-on`);
    // A job with no cap can sit for the account maximum on a hung command.
    if (job['timeout-minutes'] === undefined) findings.push(`${at}: no timeout-minutes`);

    for (const need of [job.needs ?? []].flat()) {
      if (!jobNames.includes(need)) findings.push(`${at}: needs ${need}, which is not a job in this file`);
    }

    for (const [index, step] of (job.steps ?? []).entries()) {
      steps += 1;
      const stepAt = `${at} step ${index + 1}${step?.name ? ` (${step.name})` : ''}`;
      if (!step || typeof step !== 'object') {
        findings.push(`${stepAt}: is not a mapping`);
        continue;
      }
      if (step.uses) {
        const uses = String(step.uses);
        if (uses.startsWith('./') || uses.startsWith('docker://')) {
          // Local and image references are pinned by their own means.
        } else if (!PINNED.test(uses)) {
          findings.push(`${stepAt}: uses ${uses}, which is not pinned to a commit sha`);
        } else {
          pins += 1;
        }
      }
      if (typeof step.run !== 'string') continue;
      if (step.shell && step.shell !== 'bash' && step.shell !== 'sh') continue;

      // Expressions are substituted, not evaluated. `${{ github.run_id }}` is
      // not shell and checking it as shell would report every workflow as broken.
      const script = step.run.replace(/\$\{\{[^}]*\}\}/g, 'EXPR');
      const parsed = spawnSync('bash', ['-n'], { input: script, encoding: 'utf8' });
      if (parsed.status !== 0) {
        findings.push(`${stepAt}: run block is not valid shell. ${(parsed.stderr || '').trim().split('\n')[0]}`);
      }

      for (const [, name] of script.matchAll(/\bpnpm (?:run )?([a-z][\w:-]*)/g)) {
        if (PNPM_BUILTINS.has(name)) continue;
        if (scripts.length && !scripts.includes(name)) {
          findings.push(`${stepAt}: runs \`pnpm ${name}\`, which is not a script in package.json`);
        }
      }
    }
  }
}

if (findings.length > 0) {
  console.error(`workflow (${findings.length}):`);
  for (const finding of findings) console.error(`  ${finding}`);
  process.exit(1);
}

console.log(
  `workflow: ok (${files.length} file(s), ${steps} step(s), ${pins} action(s) pinned to a sha)`,
);
