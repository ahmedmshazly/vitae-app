#!/usr/bin/env node
/**
 * Build the engineering atlas: every first-party source file, every symbol it
 * exports, and (the part that cannot be read off any single file) who
 * depends on each of them.
 *
 * This is the artifact that makes "document every small part" survivable. Prose
 * that enumerated 332 files and 1,600 exports would be unreadable on the day it
 * was written and wrong by the end of the week. Prose that explains why the
 * repository is shaped the way it is stays true for years, provided it is not
 * also carrying the inventory. So the inventory is generated and the prose
 * links into it.
 *
 * The questions it exists to answer, all of them relational:
 *
 *   what depends on this module, and would break if I changed it
 *   which package owns this symbol, when everything imports from a barrel
 *   which tests execute this file
 *   what does this file reach for, and does that cross a boundary it should not
 *
 * Two artifacts come out. `atlas.json` carries every symbol and is generated at
 * build time, never committed: a per-symbol index churns on every rename and
 * would bury real changes in a diff nobody reads. `atlas-summary.json` carries
 * the counts, the per-package rollup and the public surface, which are the
 * things whose movement is worth reviewing.
 */
import { writeFileSync, existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { parse, ts, exportsOf, importsOf, reExports, dynamicImports } from './lib/ts-index.mjs';
import { root, packages, sourceFiles, isTest } from './lib/workspace.mjs';
import { emit } from './lib/emit.mjs';

const list = packages();

/**
 * What a file is, from where it sits and what it holds.
 *
 * Path alone is not enough: `apps/api/src/services/export.ts` is a service by
 * its directory, but `packages/core/src/algorithms/text.ts` is an algorithm by
 * its directory and a schema module by its content. Directory first, since this
 * repository organises by role, and content only to break ties.
 */
function classify(rel, sf) {
  if (isTest(rel)) return 'test';
  const rules = [
    [/\/db\/migrations\//, 'migration'],
    [/\/routes\/.*\.tsx$/, 'screen'],
    [/\/routes\//, 'route'],
    [/\/services\//, 'service'],
    [/\/algorithms\//, 'algorithm'],
    [/\/middleware\//, 'middleware'],
    [/\/schema\//, 'schema'],
    [/\/db\//, 'database'],
    [/\/scripts\//, 'script'],
    [/\/hooks\//, 'hook'],
    [/\/openapi\//, 'contract'],
    [/\/styles\//, 'style'],
  ];
  for (const [pattern, kind] of rules) if (pattern.test(rel)) return kind;
  // Before the extension rule: `main.tsx` is the bundler's entry point, and
  // calling it a component puts the one file nothing can import at the top of
  // the list of files nothing imports.
  if (/\/(index|main)\.tsx?$/.test(rel)) return 'entry';
  if (/\.d\.ts$/.test(rel) || /(^|\/)test\//.test(rel)) return 'test-support';
  if (rel.endsWith('.tsx')) return 'component';
  const text = sf.getFullText();
  if (/\bz\.object\(/.test(text)) return 'schema';
  return 'module';
}

/** Resolve an import specifier to a repository-relative file, or null. */
function resolveSpecifier(specifier, fromFile, barrels) {
  if (specifier.startsWith('.')) {
    const base = resolve('/', dirname(fromFile), specifier).slice(1).replace(/\.js$/, '');
    for (const candidate of [`${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`]) {
      if (existsSync(join(root, candidate))) return candidate;
    }
    return null;
  }
  const pkg = list.find((p) => specifier === p.json.name || specifier.startsWith(`${p.json.name}/`));
  if (!pkg) return null;

  // A subpath import resolves through the manifest's `exports` map, not by
  // guessing a path. `@vitae/config` has no barrel at all. It publishes one
  // subpath, `./env`, pointing straight at the TypeScript source, and a
  // resolver that only understood barrels would report the module every server
  // process boots through as imported by nothing.
  const subpath = specifier.slice(pkg.json.name.length);
  const exports = pkg.json.exports;
  if (subpath && exports && typeof exports === 'object') {
    const target = exports[`.${subpath}`] ?? exports[subpath];
    const file = typeof target === 'string' ? target : target?.import ?? target?.default;
    if (typeof file === 'string') {
      const rel = `${pkg.dir}/${file.replace(/^\.\//, '')}`;
      if (existsSync(join(root, rel))) return rel;
    }
  }
  // Otherwise the import lands on the barrel; who owns each symbol is a
  // separate question, answered per-name below.
  return barrels.get(pkg.json.name)?.file ?? null;
}

/**
 * A package's barrel: which module actually defines each name the barrel
 * re-exports.
 *
 * Without this the atlas is close to useless for `@vitae/core` and
 * `@vitae/ui`, because nothing outside those packages imports a module: every
 * consumer imports the package, and a reverse-dependency map would show 46
 * files with no consumers behind one index with fifty.
 */
function resolveStar(target, seen) {
  const out = new Map();
  if (seen.has(target)) return out;
  seen.add(target);
  let sf;
  try { sf = parse(join(root, target)); } catch { return out; }

  const reExported = new Set();
  for (const st of sf.statements) {
    if (!ts.isExportDeclaration(st) || !st.moduleSpecifier) continue;
    const next = resolveSpecifier(st.moduleSpecifier.text, target, new Map());
    if (!next) continue;
    if (st.exportClause && ts.isNamedExports(st.exportClause)) {
      for (const el of st.exportClause.elements) {
        out.set(el.name.text, next);
        reExported.add(el.name.text);
      }
      continue;
    }
    for (const [name, owner] of resolveStar(next, seen)) {
      out.set(name, owner);
      reExported.add(name);
    }
  }
  // Names this module declares itself belong to it, not to anything it
  // forwards; a re-export of the same name is shadowed by the local one.
  for (const ex of exportsOf(sf)) if (!reExported.has(ex.name)) out.set(ex.name, target);
  return out;
}

function barrelOf(pkg) {
  for (const entry of ['src/index.ts', 'src/index.tsx', 'index.ts']) {
    const rel = `${pkg.dir}/${entry}`;
    if (!existsSync(join(root, rel))) continue;
    const sf = parse(join(root, rel));
    const symbols = new Map();
    for (const imp of importsOf(sf)) void imp;
    for (const st of sf.statements) {
      if (!ts.isExportDeclaration(st) || !st.moduleSpecifier) continue;
      const target = resolveSpecifier(st.moduleSpecifier.text, rel, new Map());
      if (!target) continue;
      if (st.exportClause && ts.isNamedExports(st.exportClause)) {
        for (const el of st.exportClause.elements) symbols.set(el.name.text, target);
        continue;
      }
      // `export * from './x.js'` covers every name that module exports,
      // following through if that module is itself a barrel. `@vitae/core`
      // re-exports `./algorithms/index.js`, which re-exports twenty modules;
      // stopping at the first hop attributes every algorithm to the index and
      // reports all twenty as imported by nothing.
      for (const [name, owner] of resolveStar(target, new Set())) symbols.set(name, owner);
    }
    return { file: rel, symbols };
  }
  return null;
}

const barrels = new Map();
for (const pkg of list) {
  const barrel = barrelOf(pkg);
  if (barrel) barrels.set(pkg.json.name, barrel);
}

/** Every first-party file, with its exports and its raw import list. */
const files = new Map();
for (const pkg of list) {
  for (const rel of sourceFiles(pkg.dir)) {
    let sf;
    try { sf = parse(join(root, rel)); } catch { continue; }
    const exported = exportsOf(sf).map((e) => ({
      name: e.name,
      kind: e.kind,
      line: e.line,
      doc: e.doc ? e.doc.replace(/\s+/g, ' ').trim() : null,
    }));
    files.set(rel, {
      file: rel,
      package: pkg.json.name,
      kind: classify(rel, sf),
      lines: sf.getLineStarts().length,
      exports: exported,
      // Static and dynamic edges together, distinguished rather than merged:
      // a dynamic import is still a dependency, but it is also where the
      // bundler is being told to split, and both facts matter here.
      imports: [
        ...importsOf(sf).map((i) => ({
          module: i.module,
          names: i.names.map((n) => n.imported),
          type_only: Boolean(i.typeOnly),
          dynamic: false,
          line: i.line,
        })),
        // A re-export is a dependency. Leaving these out makes every package
        // barrel look like it depends on nothing and hides the module behind
        // each two-line route shim.
        ...reExports(sf).map((i) => ({
          module: i.module,
          names: i.names.map((n) => n.imported),
          type_only: Boolean(i.typeOnly),
          dynamic: false,
          re_export: true,
          line: i.line,
        })),
        ...dynamicImports(sf).map((i) => ({
          module: i.module,
          names: i.names,
          type_only: false,
          dynamic: true,
          loader: i.loader,
          line: i.line,
        })),
      ],
      imported_by: [],
      symbol_consumers: {},
      crosses: [],
    });
  }
}

/**
 * The dependency edges, resolved. Each import is attributed twice: to the file
 * it names, and (when the name reaches through a barrel) to the module that
 * actually defines the symbol, which is the edge a person cares about.
 */
for (const [rel, row] of files) {
  const seen = new Set();
  for (const imp of row.imports) {
    const direct = resolveSpecifier(imp.module, rel, barrels);
    const owningPackage = list.find(
      (p) => imp.module === p.json.name || imp.module.startsWith(`${p.json.name}/`),
    );
    const barrel = owningPackage ? barrels.get(owningPackage.json.name) : null;

    const targets = new Set();
    if (direct) targets.add(direct);
    if (barrel) for (const n of imp.names) {
      const owner = barrel.symbols.get(n);
      if (owner) targets.add(owner);
    }
    for (const target of targets) {
      const dep = files.get(target);
      if (!dep || target === rel) continue;
      if (!seen.has(target)) {
        dep.imported_by.push(rel);
        seen.add(target);
      }
      for (const n of imp.names) {
        if (barrel && barrel.symbols.get(n) !== target && direct !== target) continue;
        if (!dep.symbol_consumers[n]) dep.symbol_consumers[n] = [];
        if (!dep.symbol_consumers[n].includes(rel)) dep.symbol_consumers[n].push(rel);
      }
    }
    // An edge that leaves this file's package, recorded so a boundary that is
    // supposed to hold can be checked rather than assumed.
    if (owningPackage && owningPackage.json.name !== row.package) {
      row.crosses.push(`${row.package} → ${owningPackage.json.name}`);
    }
  }
  row.crosses = [...new Set(row.crosses)];
}

/** Which test files exercise each module, by the same import edges. */
for (const row of files.values()) {
  row.tested_by = row.imported_by.filter((f) => isTest(f));
  row.imported_by = row.imported_by.filter((f) => !isTest(f)).sort();
  row.exports_used = row.exports.filter((e) => (row.symbol_consumers[e.name] ?? []).some((f) => !isTest(f))).length;
}

const rows = [...files.values()].sort((a, b) => a.file.localeCompare(b.file));
const source = rows.filter((r) => r.kind !== 'test');

/** Per-package and per-kind rollups: the parts whose movement is reviewable. */
const rollup = (key) => {
  const out = {};
  for (const r of source) {
    const bucket = (out[r[key]] ??= { files: 0, lines: 0, exports: 0, undocumented: 0 });
    bucket.files += 1;
    bucket.lines += r.lines;
    bucket.exports += r.exports.length;
    bucket.undocumented += r.exports.filter((e) => !e.doc).length;
  }
  return out;
};

/**
 * Files nothing imports.
 *
 * Four kinds are excluded because being unimported is what they are for, not a
 * defect: an entry point is what the bundler starts from, a script is run by
 * name, a migration is discovered from disk by the runner, and a build config
 * is read by a tool rather than imported by a module. Anything left is a file
 * that no code path reaches, which is worth someone's attention.
 */
const RUN_NOT_IMPORTED = new Set(['entry', 'script', 'migration', 'test-support']);

/**
 * Modules something runs rather than imports, taken from where that is
 * declared: package manifest scripts and container start commands.
 *
 * `services/buildsvc/src/server.ts` is the whole reason the LaTeX service
 * exists and nothing in the repository imports it: `package.json` says `node
 * dist/server.js` and the Dockerfile repeats it as `CMD`. Guessing from the
 * filename would work here and fail on the next one, so the manifest is read
 * instead. Compiled paths are mapped back to source, because a script names
 * the build output and the atlas indexes the input.
 */
function runnableEntries() {
  const out = new Set();
  const add = (dir, spec) => {
    // Two shapes coexist here: `node dist/server.js` names build output,
    // `tsx src/openapi/generate.ts` names the source. Strip whichever
    // extension is present rather than assuming the compiled one.
    const rel = `${dir}/${spec.replace(/^\.\//, '').replace(/^dist\//, 'src/').replace(/\.[jt]sx?$/, '')}`;
    for (const ext of ['.ts', '.tsx']) if (files.has(rel + ext)) out.add(rel + ext);
  };
  for (const pkg of list) {
    for (const command of Object.values(pkg.json.scripts ?? {})) {
      for (const m of String(command).matchAll(/(?:^|\s)((?:\.\/)?(?:src|dist)\/[\w./-]+\.[jt]sx?)/g)) {
        add(pkg.dir, m[1]);
      }
    }
    const dockerfile = join(root, pkg.dir, 'Dockerfile');
    if (!existsSync(dockerfile)) continue;
    for (const m of readFileSync(dockerfile, 'utf8').matchAll(/^(?:CMD|ENTRYPOINT)\s+(.+)$/gm)) {
      for (const q of m[1].matchAll(/"([^"]+)"/g)) add(pkg.dir, q[1]);
    }
  }
  return out;
}
const runnable = runnableEntries();
const isToolConfig = (rel) => /(^|\/)(vitest|vite|playwright|tailwind|eslint)\.[\w.-]*\.tsx?$/.test(rel)
  || /\.config\.tsx?$/.test(rel)
  || /(^|\/)__tests__\/helpers\//.test(rel);
/**
 * Files nothing reaches, split by what that absence means.
 *
 * A module imported only by its own test is not the same finding as a module
 * imported by nothing at all. The first is production code that is proven to
 * work and called by no one, a deletion candidate or a screen wired up
 * somewhere the graph cannot see. The second may simply be run rather than
 * imported. Collapsing them into one list makes both unactionable, so they are
 * reported apart.
 */
const unreached = source.filter(
  (r) => r.imported_by.length === 0
    && !RUN_NOT_IMPORTED.has(r.kind)
    && !runnable.has(r.file)
    && !isToolConfig(r.file),
);
const orphans = unreached.filter((r) => r.tested_by.length === 0);
const testOnly = unreached.filter((r) => r.tested_by.length > 0);

writeFileSync(join(root, 'docs/generated/atlas.json'), `${JSON.stringify({
  files: rows,
  barrels: Object.fromEntries([...barrels].map(([k, v]) => [k, { file: v.file, symbols: Object.fromEntries(v.symbols) }])),
}, null, 2)}\n`);

emit({
  by_package: rollup('package'),
  by_kind: rollup('kind'),
  public_surface: Object.fromEntries(
    [...barrels].map(([name, b]) => [name, [...b.symbols.keys()].sort()]),
  ),
  summary: {
    files: source.length,
    test_files: rows.length - source.length,
    lines: source.reduce((n, r) => n + r.lines, 0),
    exports: source.reduce((n, r) => n + r.exports.length, 0),
    undocumented_exports: source.reduce((n, r) => n + r.exports.filter((e) => !e.doc).length, 0),
    edges: source.reduce((n, r) => n + r.imported_by.length, 0),
    untested: source.filter((r) => r.tested_by.length === 0).length,
    no_consumer: orphans.map((r) => r.file),
    consumed_only_by_tests: testOnly.map((r) => r.file),
    most_depended_on: source
      .slice()
      .sort((a, b) => b.imported_by.length - a.imported_by.length)
      .slice(0, 15)
      .map((r) => ({ file: r.file, dependents: r.imported_by.length })),
    cross_package_edges: [...new Set(source.flatMap((r) => r.crosses))].sort(),
    dynamic_edges: source.reduce((n, r) => n + r.imports.filter((i) => i.dynamic).length, 0),
  },
}, 'docs/generated/atlas-summary.json', root, (d) =>
  `atlas: ${d.summary.files} files, ${d.summary.exports} exports ` +
  `(${d.summary.undocumented_exports} undocumented), ${d.summary.edges} dependency edges; ` +
  `${d.summary.no_consumer.length} files nothing imports, ${d.summary.untested} with no test`);
