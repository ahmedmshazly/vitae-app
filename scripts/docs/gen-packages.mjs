#!/usr/bin/env node
/**
 * Build docs/generated/packages.json: the eight workspaces, what each one is
 * for, what it depends on, and which of them the repository-wide commands
 * actually reach.
 *
 * A list of package names is not worth generating — `ls packages/` gives that.
 * Two things here cannot be seen by looking:
 *
 * The dependency direction. `@vitae/core` must not import from `@vitae/api`;
 * `@vitae/ui` must not import from `@vitae/web`. Those rules are architecture,
 * and nothing in the build enforces them, so the only way to know they still
 * hold is to derive the edges from the manifests and the imports and compare.
 * Recording both is the point: a manifest edge that no source file uses is a
 * dependency that could be dropped, and an import with no manifest edge behind
 * it is a package relying on hoisting.
 *
 * Which packages the fleet commands skip. `pnpm -r typecheck` runs the
 * `typecheck` script in every workspace that HAS one and silently passes over
 * every workspace that does not. A package with no scripts is not type-checked
 * by CI and nothing anywhere says so.
 */
import { join } from 'node:path';
import { parse, importsOf, exportsOf } from './lib/ts-index.mjs';
import { root, packages, sourceFiles, isTest, importGraph } from './lib/workspace.mjs';
import { emit } from './lib/emit.mjs';

/** Scripts `pnpm -r <name>` relies on. A workspace missing one is skipped, not failed. */
const FLEET_SCRIPTS = ['typecheck', 'test', 'build', 'lint'];

const list = packages();
const byName = new Map(list.map((p) => [p.json.name, p]));

const rows = list.map((pkg) => {
  const { dir, json } = pkg;
  const files = sourceFiles(dir);
  const src = files.filter((f) => !isTest(f));
  const tests = files.filter((f) => isTest(f));

  const deps = Object.entries(json.dependencies ?? {});
  const devDeps = Object.entries(json.devDependencies ?? {});
  const internal = (entries) => entries.filter(([n]) => byName.has(n)).map(([n]) => n).sort();

  let exportCount = 0;
  let lines = 0;
  for (const rel of src) {
    try {
      const sf = parse(join(root, rel));
      exportCount += exportsOf(sf).length;
      lines += sf.getLineStarts().length;
    } catch { /* a file the parser rejects is counted as present, not as zero */ }
  }

  return {
    name: json.name,
    dir,
    description: json.description ?? null,
    version: json.version ?? null,
    private: json.private === true,
    type: json.type ?? 'commonjs',
    entry: json.main ?? json.exports ?? null,
    scripts: Object.keys(json.scripts ?? {}).sort(),
    missing_fleet_scripts: FLEET_SCRIPTS.filter((s) => !(json.scripts ?? {})[s]),
    depends_on: internal(deps),
    dev_depends_on: internal(devDeps),
    external_dependencies: deps.filter(([n]) => !byName.has(n)).map(([n, v]) => ({ name: n, range: v })),
    source_files: src.length,
    test_files: tests.length,
    source_lines: lines,
    exports: exportCount,
    dependents: [],
    imported_by: [],
    unused_manifest_deps: [],
    undeclared_imports: [],
  };
});

const index = new Map(rows.map((r) => [r.name, r]));
for (const row of rows) {
  for (const dep of [...row.depends_on, ...row.dev_depends_on]) index.get(dep)?.dependents.push(row.name);
}

/**
 * The edges the source actually walks, as opposed to the ones the manifests
 * declare. `@vitae/core` resolves to a bare specifier in an import statement,
 * so matching the package name against the specifier prefix is exact — these
 * are workspace packages, not paths.
 */
const graph = importGraph(list.map((p) => p.dir));
const observed = new Map(rows.map((r) => [r.name, new Set()]));
for (const [specifier, importers] of graph.bySpecifier) {
  const target = [...index.keys()].find((n) => specifier === n || specifier.startsWith(`${n}/`));
  if (!target) continue;
  for (const imp of importers) {
    const owner = list.find((p) => imp.file.startsWith(`${p.dir}/`));
    if (owner && owner.json.name !== target) observed.get(owner.json.name)?.add(target);
  }
}
for (const row of rows) {
  const seen = observed.get(row.name) ?? new Set();
  const declared = new Set([...row.depends_on, ...row.dev_depends_on]);
  row.imported_by = rows.filter((r) => observed.get(r.name)?.has(row.name)).map((r) => r.name).sort();
  row.unused_manifest_deps = [...declared].filter((d) => !seen.has(d)).sort();
  row.undeclared_imports = [...seen].filter((d) => !declared.has(d)).sort();
}

/**
 * Whether `pnpm -r typecheck` actually covers a package, which is not the same
 * question as whether it has the script.
 *
 * `@vitae/config` has no scripts at all, yet it is type-checked every time the
 * API is: its `exports` field points at `./src/env.ts`, raw TypeScript, so the
 * compiler follows the import into the source and checks it as part of the
 * importing project. A package that ships built `.js` with `.d.ts` alongside
 * gets no such coverage — the compiler reads the declarations and never sees
 * the implementation.
 *
 * So the distinction is real and worth carrying: `direct` means the workspace
 * runs its own compiler, `transitive` means another workspace's run reaches its
 * source, and `none` means no workspace compiler sees it. `none` is a statement
 * about `pnpm -r typecheck` and nothing else — `@vitae/buildsvc` compiles under
 * `tsc` inside its own container build, which CI does run, and a field derived
 * from package manifests cannot see that.
 */
const shipsSource = (json) => {
  const targets = JSON.stringify(json.exports ?? json.main ?? '');
  return /\.tsx?"/.test(targets) || /\.tsx?$/.test(json.main ?? '');
};
for (const row of rows) {
  const pkg = byName.get(row.name);
  if (!row.missing_fleet_scripts.includes('typecheck')) {
    row.workspace_typecheck = 'direct';
    continue;
  }
  const checkedImporter = row.imported_by.some(
    (n) => !index.get(n)?.missing_fleet_scripts.includes('typecheck'),
  );
  row.workspace_typecheck =
    checkedImporter && shipsSource(pkg.json) ? 'transitive' : 'none';
}

/**
 * Layering, derived rather than asserted. A package's depth is how far it sits
 * from a leaf: `@vitae/config` and `@vitae/core` depend on nothing internal and
 * are depth 0; anything importing them is deeper. A cycle would leave a package
 * with no resolvable depth, which is exactly the state worth reporting.
 */
const depth = new Map();
for (let pass = 0; pass < rows.length && depth.size < rows.length; pass += 1) {
  for (const row of rows) {
    if (depth.has(row.name)) continue;
    const inputs = row.depends_on.map((d) => depth.get(d));
    if (inputs.every((d) => d !== undefined)) depth.set(row.name, inputs.length ? Math.max(...inputs) + 1 : 0);
  }
}
for (const row of rows) row.layer = depth.get(row.name) ?? null;

/** Every module that runs at import time, since those decide boot order. */
const sideEffects = [];
for (const pkg of list) {
  for (const rel of sourceFiles(pkg.dir, { tests: false })) {
    let sf;
    try { sf = parse(join(root, rel)); } catch { continue; }
    const bare = importsOf(sf).filter((i) => !i.names.length && !i.defaultName && !i.namespace && !i.typeOnly);
    if (bare.length) sideEffects.push({ file: rel, imports: bare.map((i) => i.module) });
  }
}

emit({
  packages: rows,
  side_effect_imports: sideEffects,
  summary: {
    packages: rows.length,
    source_files: rows.reduce((n, r) => n + r.source_files, 0),
    test_files: rows.reduce((n, r) => n + r.test_files, 0),
    source_lines: rows.reduce((n, r) => n + r.source_lines, 0),
    layers: Math.max(...rows.map((r) => r.layer ?? 0)) + 1,
    cyclic: rows.filter((r) => r.layer === null).map((r) => r.name),
    workspace_typecheck: Object.fromEntries(
      ['direct', 'transitive', 'none'].map((k) => [
        k,
        rows.filter((r) => r.workspace_typecheck === k).map((r) => r.name),
      ]),
    ),
    untested: rows.filter((r) => r.test_files === 0).map((r) => r.name),
    skipped_by: Object.fromEntries(
      FLEET_SCRIPTS.map((s) => [s, rows.filter((r) => r.missing_fleet_scripts.includes(s)).map((r) => r.name)]),
    ),
    unused_manifest_deps: rows.flatMap((r) => r.unused_manifest_deps.map((d) => `${r.name} → ${d}`)),
    undeclared_imports: rows.flatMap((r) => r.undeclared_imports.map((d) => `${r.name} → ${d}`)),
  },
}, 'docs/generated/packages.json', root, (d) =>
  `packages: ${d.summary.packages} in ${d.summary.layers} layers, ` +
  `${d.summary.source_files} source files (${d.summary.source_lines.toLocaleString('en-US')} lines); ` +
  `typecheck reaches ${d.summary.workspace_typecheck.direct.length} directly, ` +
  `${d.summary.workspace_typecheck.transitive.length} transitively, ` +
  `${d.summary.workspace_typecheck.none.length} not at all`);
