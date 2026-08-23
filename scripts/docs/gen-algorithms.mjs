#!/usr/bin/env node
/**
 * Build docs/generated/algorithms.json: the deterministic core, its tuning
 * constants, and who calls it.
 *
 * `packages/core/src/algorithms/` is the part of Vitae that decides things —
 * how strong a relationship is, who to call next, which evidence goes on a
 * résumé, whether two records are the same person. Everything else moves data
 * around. It is also the part a reader cannot understand from its exports
 * alone, because the behaviour lives in the numbers: `tauDays: 90` is why a
 * contact fades over a quarter, and nothing in the function signature says so.
 *
 * So this artifact joins three things a prose page would otherwise have to
 * restate by hand and get wrong on the next tuning commit:
 *
 *   - the module's exported surface, from the parser;
 *   - the constant groups it reads, resolved to their literal values, so an
 *     explainer can name the number without copying it;
 *   - its callers, resolved through the `@vitae/core` barrel.
 *
 * That last one needs the barrel. Nothing outside the package imports
 * `algorithms/tie-strength.js` — everything imports `@vitae/core`, so a naive
 * reverse-dependency sweep reports every algorithm as having no consumers.
 * Mapping each exported symbol back to the module that declares it is what
 * turns "who uses this" from an unanswerable question into a list.
 */
import { existsSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { parse, ts, lineOf, leadingDoc, exportsOf, walk } from './lib/ts-index.mjs';
import { emit } from './lib/emit.mjs';
import { citationsIn, compareIds, optionsFrom } from './lib/citations.mjs';
import { root, sourceFiles, importGraph, isTest } from './lib/workspace.mjs';

const cite = optionsFrom(JSON.parse(readFileSync(join(root, 'docs/registry/requirements.json'), 'utf8')));
const DIR = 'packages/core/src/algorithms';

/** First sentence of a doc comment, for a catalog row that has to fit a line. */
function firstSentence(doc) {
  if (!doc) return null;
  const match = doc.match(/^(.*?[.!?])(\s|$)/s);
  return (match ? match[1] : doc).replace(/\s+/g, ' ').trim() || null;
}

/** The file-level comment: the one above the first import or statement. */
function moduleDoc(sf) {
  const first = sf.statements[0];
  return first ? leadingDoc(first, sf) : null;
}

/**
 * Flatten an exported constant object to leaf paths and literal values.
 *
 * `TIE_STRENGTH.kindWeights.coffee` is the unit a reader needs; reporting
 * `TIE_STRENGTH` as one opaque object would document the existence of the
 * tuning surface without exposing any of it.
 */
function flattenConstants(sf) {
  const groups = [];
  for (const st of sf.statements) {
    if (!ts.isVariableStatement(st)) continue;
    if (!st.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) continue;
    for (const decl of st.declarationList.declarations) {
      if (!ts.isIdentifier(decl.name) || !decl.initializer) continue;
      const init = ts.isAsExpression(decl.initializer) ? decl.initializer.expression : decl.initializer;
      const values = [];
      const visit = (node, path) => {
        if (!ts.isObjectLiteralExpression(node)) return;
        for (const prop of node.properties) {
          if (!ts.isPropertyAssignment(prop)) continue;
          const key = prop.name.getText(sf).replace(/['"]/g, '');
          const next = path ? `${path}.${key}` : key;
          const value = ts.isAsExpression(prop.initializer) ? prop.initializer.expression : prop.initializer;
          if (ts.isObjectLiteralExpression(value)) {
            visit(value, next);
            continue;
          }
          values.push({
            path: next,
            value: value.getText(sf).replace(/\s+/g, ' '),
            doc: firstSentence(leadingDoc(prop, sf)),
            line: lineOf(sf, prop),
          });
        }
      };
      if (ts.isObjectLiteralExpression(init)) visit(init, '');
      if (!values.length) continue;
      const doc = leadingDoc(st, sf);
      groups.push({
        name: decl.name.text,
        description: firstSentence(doc),
        requirements: citationsIn(doc ?? '', cite).sort(compareIds),
        source: `${DIR}/constants.ts:${lineOf(sf, st)}`,
        values,
      });
    }
  }
  return groups;
}

/** Identifiers a module references, used to find the constants it depends on. */
function identifiersIn(sf) {
  const names = new Set();
  walk(sf, (node) => {
    if (ts.isIdentifier(node)) names.add(node.text);
  });
  return names;
}

const constantsFile = parse(join(root, DIR, 'constants.ts'));
const constantGroups = flattenConstants(constantsFile);
const constantNames = new Set(constantGroups.map((g) => g.name));

const modules = [];
const symbolToModule = new Map();

for (const rel of sourceFiles(DIR, { tests: false })) {
  const name = basename(rel, '.ts');
  if (name === 'index') continue;
  const sf = parse(join(root, rel));
  const doc = moduleDoc(sf);
  const exports = exportsOf(sf)
    .filter((e) => e.kind !== 're-export')
    .map((e) => ({ ...e, doc: firstSentence(e.doc), source: `${rel}:${e.line}` }));
  for (const e of exports) symbolToModule.set(e.name, name);

  const identifiers = identifiersIn(sf);
  const tests = [`${DIR}/${name}.test.ts`, `${DIR}/${name}.property.test.ts`, `${DIR}/${name}.bench.ts`]
    .filter((t) => existsSync(join(root, t)));

  modules.push({
    id: name,
    module: rel,
    title: firstSentence(doc),
    description: doc,
    // A pure module is one an explainer can run in the browser with fictional
    // inputs. Everything here is pure by construction — no import that is not
    // a sibling algorithm or a type — and recording it is what lets the docs
    // surface call the real function instead of restating its formula.
    pure: !sf.statements.some(
      (st) =>
        ts.isImportDeclaration(st) &&
        ts.isStringLiteral(st.moduleSpecifier) &&
        !st.moduleSpecifier.text.startsWith('.') &&
        !st.importClause?.isTypeOnly,
    ),
    // A module that exports no callable is the tuning surface, not a decision
    // procedure. Counting `constants.ts` as an untested algorithm would report
    // a coverage gap where a test would only restate the literals.
    kind: exports.some((e) => e.kind === 'function') ? 'algorithm' : 'data',
    exports,
    constants: [...constantNames].filter((c) => identifiers.has(c)).sort(),
    requirements: citationsIn(doc ?? '', cite).sort(compareIds),
    tests,
    consumers: [],
  });
}

/**
 * Resolve `@vitae/core` imports back to the algorithm that declares each
 * symbol. Anything imported from the barrel that is not an algorithm export —
 * a schema, a repository type — simply does not match, which is the correct
 * outcome rather than a miss to compensate for.
 */
const graph = importGraph(['apps/api/src', 'apps/web/src', 'packages/core/src', 'services/buildsvc/src']);
const byId = new Map(modules.map((m) => [m.id, m]));

for (const [specifier, importers] of graph.bySpecifier) {
  const viaBarrel = specifier === '@vitae/core' || specifier.endsWith('/algorithms/index.js');
  for (const importer of importers) {
    for (const named of importer.names) {
      // A sibling import inside the algorithms directory is written `./x.js`,
      // with no `algorithms/` segment to match on. Missing those reports
      // aho-corasick as unused when jd-parser is built on top of it.
      const sibling = importer.file.startsWith(`${DIR}/`) && specifier.startsWith('./')
        ? specifier.replace(/^\.\/|\.js$/g, '')
        : null;
      const owner = viaBarrel
        ? symbolToModule.get(named.imported)
        : sibling ?? /\/algorithms\/([\w-]+)\.js$/.exec(specifier)?.[1];
      const target = owner && byId.get(owner);
      if (!target) continue;
      target.consumers.push({ file: importer.file, symbol: named.imported, test: isTest(importer.file) });
    }
  }
}

for (const m of modules) {
  const unique = new Map();
  for (const c of m.consumers) unique.set(`${c.file}::${c.symbol}`, c);
  m.consumers = [...unique.values()].sort((a, b) => a.file.localeCompare(b.file) || a.symbol.localeCompare(b.symbol));
  // Product callers and test callers answer different questions: one is "what
  // breaks if this changes", the other is "what proves it works".
  m.consumer_count = { product: m.consumers.filter((c) => !c.test).length, test: m.consumers.filter((c) => c.test).length };
}

modules.sort((a, b) => a.id.localeCompare(b.id));

emit(
  {
    modules,
    constants: constantGroups,
    summary: {
      modules: modules.length,
      exported_symbols: modules.reduce((n, m) => n + m.exports.length, 0),
      constant_groups: constantGroups.length,
      constant_values: constantGroups.reduce((n, g) => n + g.values.length, 0),
      // A module with no test is a decision nothing protects; a module with no
      // product consumer is either dead or reached only through a path this
      // resolver cannot see. Both are worth naming rather than counting.
      untested: modules.filter((m) => m.kind === 'algorithm' && !m.tests.length).map((m) => m.id),
      unused_in_product: modules.filter((m) => m.consumer_count.product === 0).map((m) => m.id),
      impure: modules.filter((m) => !m.pure).map((m) => m.id),
    },
  },
  'docs/generated/algorithms.json',
  root,
  (a) =>
    `algorithms: ${a.summary.modules} modules, ${a.summary.exported_symbols} exports, ` +
    `${a.summary.constant_values} tuned values in ${a.summary.constant_groups} groups ` +
    `(${a.summary.untested.length} untested, ${a.summary.unused_in_product.length} unused in product)`,
);
