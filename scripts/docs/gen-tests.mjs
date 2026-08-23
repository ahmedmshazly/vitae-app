#!/usr/bin/env node
/**
 * Build docs/generated/tests.json: every test file, which command runs it,
 * what it exercises, and which requirements it is evidence for.
 *
 * A count of tests proves nothing. The questions worth answering are which
 * command runs a given file, what a given file protects, and — the one that
 * matters most and that nothing in the repository currently answers — which
 * test files no command runs at all.
 *
 * That last one is not hypothetical here. The test scripts do not say "run
 * everything": they name directories and filename fragments, so
 * `test:property` runs files matching `property`, `metamorphic` or `golden`
 * inside `@vitae/core`, and `test:security` names six specific paths. A file
 * that matches none of the selectors still passes review, still looks like a
 * test, and never executes in CI. The selectors are read from package.json
 * rather than listed here, so a script that changes changes this too.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse, ts, importsOf, walk } from './lib/ts-index.mjs';
import { root, packages, sourceFiles, isTest } from './lib/workspace.mjs';
import { citationsIn, optionsFrom } from './lib/citations.mjs';
import { emit } from './lib/emit.mjs';

const scripts = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).scripts ?? {};
const registry = JSON.parse(readFileSync(join(root, 'docs/registry/requirements.json'), 'utf8'));
const citationOptions = optionsFrom(registry);
const list = packages();

/**
 * Turn a `test:*` script into the workspace it targets and the fragments it
 * selects on, which is all a vitest invocation is: a filter list, where an
 * empty list means every test in that workspace.
 */
function selectors() {
  const out = [];
  for (const [name, command] of Object.entries(scripts)) {
    if (!name.startsWith('test:') || name === 'test:all') continue;
    for (const part of command.split('&&').map((s) => s.trim())) {
      const filter = /--filter\s+(\S+)/.exec(part);
      if (!filter) continue;
      const run = /(?:vitest run|playwright test)\s+(.*)$/.exec(part);
      const args = (run?.[1] ?? '')
        .split(/\s+/)
        .filter((a) => a && !a.startsWith('-'));
      out.push({ script: name, workspace: filter[1], patterns: args });
    }
  }
  // `pnpm -r test` runs every workspace's own `test` script, so anything a
  // workspace would run on its own is reachable through the plain `test`.
  for (const pkg of list) {
    if (pkg.json.scripts?.test) out.push({ script: 'test', workspace: pkg.json.name, patterns: [] });
  }
  return out;
}

const SELECTORS = selectors();
const dirOf = new Map(list.map((p) => [p.json.name, p.dir]));

/**
 * The scripts continuous integration actually invokes.
 *
 * "Which command runs this file" and "does this file run before a merge" are
 * different questions, and only the second one decides whether a test protects
 * anything. `pnpm -r test` reaches every workspace, but no CI job runs it —
 * the workflow names individual scripts and individual filters, so a workspace
 * whose name appears in neither is tested only by whoever remembers to.
 *
 * Read from the workflow rather than listed here, so the answer stays true
 * when a job is added or removed.
 */
function ciScripts() {
  const workflow = readFileSync(join(root, '.github/workflows/ci.yml'), 'utf8');
  const named = new Set();
  const filtered = new Set();
  for (const m of workflow.matchAll(/pnpm\s+(?:--filter\s+(\S+)\s+)?([a-z][a-z0-9:]*)/g)) {
    const [, filter, script] = m;
    if (filter) {
      if (script === 'test' || script === 'exec') filtered.add(filter);
      continue;
    }
    if (script.startsWith('test')) named.add(script);
  }
  return { named, filtered };
}

const CI = ciScripts();
const ciRunsWorkspace = (name) =>
  CI.filtered.has(name) ||
  SELECTORS.some((sel) => sel.workspace === name && CI.named.has(sel.script));

/** Which scripts would run this file. Empty means nothing does. */
function runnersFor(rel) {
  return SELECTORS.filter(({ workspace, patterns }) => {
    const dir = dirOf.get(workspace);
    if (!dir || !rel.startsWith(`${dir}/`)) return false;
    const within = rel.slice(dir.length + 1);
    return patterns.length === 0 || patterns.some((p) => within.includes(p) || rel.includes(p));
  }).map((s) => s.script);
}

const rows = [];
for (const pkg of list) {
  for (const rel of sourceFiles(pkg.dir)) {
    if (!isTest(rel)) continue;
    let sf;
    try { sf = parse(join(root, rel)); } catch { continue; }
    const text = sf.getFullText();

    /**
     * Cases and suites, counted from the call graph rather than by matching
     * the word `it`. `it.each([...])` is one call and many assertions; both
     * numbers would be defensible, and the call count is the one that does not
     * change when someone adds a row to a table.
     */
    let cases = 0;
    let skipped = 0;
    let todo = 0;
    const suites = [];
    walk(sf, (node) => {
      if (!ts.isCallExpression(node)) return;
      const callee = node.expression;
      const base = ts.isPropertyAccessExpression(callee) ? callee.expression.getText(sf) : callee.getText(sf);
      const modifier = ts.isPropertyAccessExpression(callee) ? callee.name.text : null;
      if (base === 'it' || base === 'test') {
        if (modifier === 'skip') skipped += 1;
        else if (modifier === 'todo') todo += 1;
        else cases += 1;
      }
      if (base === 'describe' && node.arguments[0] && ts.isStringLiteralLike(node.arguments[0])) {
        suites.push(node.arguments[0].text);
      }
    });

    /**
     * What the file is testing: its first-party imports, minus the harness.
     * A relative import from a test is nearly always the module under test,
     * and a workspace import is the public contract being exercised.
     */
    const subjects = importsOf(sf)
      .map((i) => i.module)
      .filter((m) => m.startsWith('.') || m.startsWith('@vitae/'))
      .filter((m) => !m.includes('testkit') && !m.includes('/test/'));

    rows.push({
      file: rel,
      package: pkg.json.name,
      cases,
      skipped,
      todo,
      suites,
      subjects: [...new Set(subjects)].sort(),
      requirements: [...new Set(citationsIn(text, citationOptions))].sort(),
      run_by: runnersFor(rel),
      run_in_ci: runnersFor(rel).some((s) => CI.named.has(s)) || CI.filtered.has(pkg.json.name),
      lines: sf.getLineStarts().length,
    });
  }
}
rows.sort((a, b) => a.file.localeCompare(b.file));

const byScript = {};
for (const row of rows) for (const s of row.run_by) byScript[s] = (byScript[s] ?? 0) + 1;
const byPackage = {};
for (const row of rows) byPackage[row.package] = (byPackage[row.package] ?? 0) + row.cases;

/** Which requirement identifiers have a test citing them, and which do not. */
const proven = new Set(rows.flatMap((r) => r.requirements));
// `registry.requirements` is an array of records, so the identifiers live in
// each record's `id`. Read as an object it yields array indices — `"0"`, `"1"`,
// … — which share no vocabulary with the identifiers tests cite, so every
// requirement reported as unproven and the artifact said so in a field an
// operator would reasonably trust.
const registered = (registry.requirements ?? []).map((r) => r.id);
// A shape check, not a content check. A single unregistered citation is a
// content problem and belongs to check-docs-traceability, which names it. A
// total vocabulary mismatch means this file is reading the registry wrongly,
// and the resulting artifact is indistinguishable from a genuine absence of all
// test coverage — so it fails here instead of being published.
if (registered.length > 0 && proven.size > 0 && ![...proven].some((id) => registered.includes(id))) {
  throw new Error(
    'gen-tests: no requirement identifier cited by a test appears in the registry. ' +
      'The registry shape changed and this generator was not updated.',
  );
}

emit({
  tests: rows,
  summary: {
    files: rows.length,
    cases: rows.reduce((n, r) => n + r.cases, 0),
    skipped: rows.reduce((n, r) => n + r.skipped, 0),
    todo: rows.reduce((n, r) => n + r.todo, 0),
    by_package: byPackage,
    by_script: Object.fromEntries(Object.entries(byScript).sort((a, b) => b[1] - a[1])),
    unreachable: rows.filter((r) => r.run_by.length === 0).map((r) => r.file),
    ci_scripts: [...CI.named].sort(),
    ci_filtered_workspaces: [...CI.filtered].sort(),
    workspaces_absent_from_ci: list
      .map((p) => p.json.name)
      .filter((n) => rows.some((r) => r.package === n) && !ciRunsWorkspace(n)),
    cases_absent_from_ci: rows.filter((r) => !r.run_in_ci).reduce((n, r) => n + r.cases, 0),
    files_absent_from_ci: rows.filter((r) => !r.run_in_ci).map((r) => r.file),
    empty: rows.filter((r) => r.cases === 0 && r.skipped === 0).map((r) => r.file),
    with_skips: rows.filter((r) => r.skipped > 0).map((r) => `${r.file} (${r.skipped})`),
    requirements_proven: proven.size,
    requirements_unproven: registered.filter((id) => !proven.has(id)).sort(),
  },
}, 'docs/generated/tests.json', root, (d) =>
  `tests: ${d.summary.files} files, ${d.summary.cases.toLocaleString('en-US')} cases ` +
  `(${d.summary.cases_absent_from_ci} in ${d.summary.workspaces_absent_from_ci.length} workspaces CI never runs); ` +
  `${d.summary.requirements_proven} requirements cited by tests, ` +
  `${d.summary.requirements_unproven.length} with none`);
