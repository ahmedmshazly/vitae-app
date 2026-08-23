/**
 * Read TypeScript structure without running TypeScript.
 *
 * Every generated reference artifact in docs/generated/ answers a question of
 * the form "what exists, and where". A regular expression can approximate that
 * and will be wrong in the cases that matter: `router.get` inside a string, a
 * multi-line call whose path argument is three lines below the verb, an export
 * list split across a `export { a, b } from './x.js'` re-export. This module
 * uses the real parser instead, so a wrong answer requires the parser to be
 * wrong rather than the pattern to be naive.
 *
 * It deliberately does NOT build a `ts.Program`. A program resolves modules,
 * loads lib.d.ts and type-checks, which costs seconds per package and needs a
 * correct tsconfig for every workspace. Nothing here needs a type — only shape.
 * `ts.createSourceFile` gives that in milliseconds and cannot be affected by a
 * build state, which is what makes the generators reproducible in CI.
 */
import { readFileSync } from 'node:fs';
import ts from 'typescript';

/** Parse one file. `setParentNodes` is on so callers can walk upward. */
export function parse(absPath) {
  const text = readFileSync(absPath, 'utf8');
  const kind = absPath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  return ts.createSourceFile(absPath, text, ts.ScriptTarget.Latest, true, kind);
}

/** 1-based line, matching what an editor and a `path:line` citation show. */
export function lineOf(sf, node) {
  return sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
}

/**
 * The doc comment immediately above a node, stripped of its comment syntax.
 *
 * Only `/** ... *\/` is read. A `//` comment above a route handler is nearly
 * always a note to the next maintainer rather than a description of the
 * endpoint, and promoting those into a public catalog produces documentation
 * that reads like someone's margin notes.
 */
export function leadingDoc(node, sf) {
  const full = sf.getFullText();
  const ranges = ts.getLeadingCommentRanges(full, node.getFullStart()) ?? [];
  const doc = ranges.filter((r) => full.slice(r.pos, r.pos + 3) === '/**').pop();
  // `null`, not `''`: a caller counting undocumented exports and a caller
  // rendering a description both need to tell "there is no doc comment" from
  // "the doc comment is empty", and only one of those is a real state here.
  if (!doc) return null;
  return full
    .slice(doc.pos + 3, doc.end - 2)
    .split('\n')
    .map((line) => line.replace(/^\s*\*\s?/, '').trim())
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Every `import` in the file, flattened to one row per statement. */
export function importsOf(sf) {
  const out = [];
  for (const st of sf.statements) {
    if (!ts.isImportDeclaration(st) || !ts.isStringLiteral(st.moduleSpecifier)) continue;
    const row = {
      module: st.moduleSpecifier.text,
      names: [],
      defaultName: null,
      namespace: null,
      typeOnly: Boolean(st.importClause?.isTypeOnly),
      line: lineOf(sf, st),
    };
    const clause = st.importClause;
    if (clause?.name) row.defaultName = clause.name.text;
    const bindings = clause?.namedBindings;
    if (bindings && ts.isNamespaceImport(bindings)) row.namespace = bindings.name.text;
    if (bindings && ts.isNamedImports(bindings)) {
      for (const el of bindings.elements) {
        row.names.push({
          imported: (el.propertyName ?? el.name).text,
          local: el.name.text,
          typeOnly: row.typeOnly || Boolean(el.isTypeOnly),
        });
      }
    }
    out.push(row);
  }
  return out;
}

const DECL_KIND = [
  [ts.isFunctionDeclaration, 'function'],
  [ts.isClassDeclaration, 'class'],
  [ts.isInterfaceDeclaration, 'interface'],
  [ts.isTypeAliasDeclaration, 'type'],
  [ts.isEnumDeclaration, 'enum'],
];

function isExported(node) {
  return Boolean(node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword));
}

/**
 * Every exported name, with the kind a reader would call it.
 *
 * A `const` bound to an arrow function is reported as `function`, because the
 * distinction is a style choice in the source and a distraction in a catalog.
 * A `const` bound to a `z.object(...)` is reported as `schema`, because that
 * distinction is the whole point of the schema catalog.
 */
export function exportsOf(sf) {
  const out = [];
  const add = (name, kind, node, extra = {}) =>
    out.push({ name, kind, line: lineOf(sf, node), doc: leadingDoc(node, sf), ...extra });

  for (const st of sf.statements) {
    if (ts.isExportDeclaration(st)) {
      const from = st.moduleSpecifier && ts.isStringLiteral(st.moduleSpecifier) ? st.moduleSpecifier.text : null;
      if (st.exportClause && ts.isNamedExports(st.exportClause)) {
        for (const el of st.exportClause.elements) {
          add(el.name.text, 're-export', el, { from, typeOnly: Boolean(st.isTypeOnly || el.isTypeOnly) });
        }
      } else if (from) {
        add('*', 're-export', st, { from, typeOnly: Boolean(st.isTypeOnly) });
      }
      continue;
    }
    if (!isExported(st)) continue;

    const matched = DECL_KIND.find(([test]) => test(st));
    if (matched && st.name) {
      add(st.name.text, matched[1], st);
      continue;
    }
    if (ts.isVariableStatement(st)) {
      for (const decl of st.declarationList.declarations) {
        if (!ts.isIdentifier(decl.name)) continue;
        add(decl.name.text, valueKind(decl.initializer), st.declarationList.declarations.length === 1 ? st : decl);
      }
    }
  }
  return out;
}

function valueKind(init) {
  if (!init) return 'const';
  const inner = ts.isAsExpression(init) || ts.isSatisfiesExpression(init) ? init.expression : init;
  if (ts.isArrowFunction(inner) || ts.isFunctionExpression(inner)) return 'function';
  if (ts.isArrayLiteralExpression(inner)) return 'array';
  if (ts.isCallExpression(inner)) {
    const callee = inner.expression;
    if (rootIdentifier(callee) === 'Router') return 'router';
    // `z.object(...)`, `z.enum(...)`, `personSchema.extend(...)` are all schemas;
    // so is anything whose call chain starts at the `z` namespace.
    if (rootIdentifier(callee) === 'z') return 'schema';
    if (/[Ss]chema$/.test(rootIdentifier(callee) ?? '')) return 'schema';
    return 'const';
  }
  if (ts.isObjectLiteralExpression(inner)) return 'object';
  return 'const';
}

function rootIdentifier(node) {
  let cur = node;
  while (cur && (ts.isPropertyAccessExpression(cur) || ts.isCallExpression(cur))) {
    cur = ts.isCallExpression(cur) ? cur.expression : cur.expression;
  }
  return cur && ts.isIdentifier(cur) ? cur.text : null;
}

/**
 * Find `object.method(...)` calls anywhere in the file.
 *
 * `statement` is returned alongside the call because a doc comment attaches to
 * the statement, not to the expression inside it. Reading the comment from the
 * call node returns nothing for every route handler in this repository.
 */
export function methodCalls(sf, { objects = null, methods = null } = {}) {
  // Both filters accept a list or a predicate. They took different shapes for
  // a while — `objects` a function, `methods` an array — which reads fine at
  // the three call sites that were written together and throws at the fourth.
  const accepts = (filter) => {
    if (!filter) return () => true;
    if (typeof filter === 'function') return filter;
    const set = new Set(filter);
    return (value) => set.has(value);
  };
  const objectOk = accepts(objects);
  const methodOk = accepts(methods);
  const out = [];
  const visit = (node, statement) => {
    const st = ts.isStatement(node) ? node : statement;
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const target = node.expression.expression;
      const object = ts.isIdentifier(target) ? target.text : null;
      const method = node.expression.name.text;
      if (object !== null && objectOk(object) && methodOk(method)) {
        out.push({ object, method, args: node.arguments, call: node, statement: st, line: lineOf(sf, node) });
      }
    }
    ts.forEachChild(node, (child) => visit(child, st));
  };
  ts.forEachChild(sf, (node) => visit(node, node));
  return out;
}

/** Every call to a bare function, e.g. `asyncHandler(...)` or `requireOwner(...)`. */
export function functionCalls(sf) {
  const out = [];
  const visit = (node) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      out.push({ name: node.expression.text, args: node.arguments, call: node, line: lineOf(sf, node) });
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(sf, visit);
  return out;
}

/** The text of a string literal or no-substitution template, else null. */
export function stringOf(node) {
  if (!node) return null;
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  return null;
}

/** `export const NAME = ['a', 'b'] as const` to `['a', 'b']`, else null. */
export function arrayExport(sf, name) {
  for (const st of sf.statements) {
    if (!ts.isVariableStatement(st) || !isExported(st)) continue;
    for (const decl of st.declarationList.declarations) {
      if (!ts.isIdentifier(decl.name) || decl.name.text !== name || !decl.initializer) continue;
      const init = ts.isAsExpression(decl.initializer) ? decl.initializer.expression : decl.initializer;
      if (!ts.isArrayLiteralExpression(init)) continue;
      const items = init.elements.map(stringOf);
      if (items.every((item) => item !== null)) return items;
    }
  }
  return null;
}

/** Walk every node, for generators that need a shape this module does not name. */
export function walk(node, visit) {
  visit(node);
  ts.forEachChild(node, (child) => walk(child, visit));
}

export { ts };

/**
 * `import('./x.js')` call sites, which `importsOf` deliberately does not
 * return.
 *
 * A static import declaration and a dynamic import mean different things — one
 * is a hard dependency resolved at load, the other is a chunk boundary the
 * bundler is asked to split on — and a caller measuring bundle shape needs to
 * tell them apart. But a caller asking "what depends on this module" needs both,
 * and in this repository it needs the dynamic ones most: `App.tsx` reaches 46 of
 * its route modules only this way, so a reverse-dependency map built from
 * static imports alone reports most of the product's screens as orphaned.
 *
 * When the loader is the first argument of a call whose next argument is a
 * string — the `lazyNamed(() => import('./Dashboard.js'), 'Dashboard')` shape
 * this codebase uses to lazy-load a named export — that string is recorded as
 * the imported name. Nothing is guessed beyond that shape; every other dynamic
 * import is reported as a module edge with no named symbol, because that is all
 * the source says.
 */
export function dynamicImports(sf) {
  const out = [];
  walk(sf, (node) => {
    if (!ts.isCallExpression(node)) return;
    if (node.expression.kind !== ts.SyntaxKind.ImportKeyword) return;
    const arg = node.arguments[0];
    if (!arg || !ts.isStringLiteralLike(arg)) return;

    // Climb out of the arrow that wraps the loader, if there is one.
    let outer = node.parent;
    if (outer && ts.isArrowFunction(outer)) outer = outer.parent;
    const names = [];
    if (outer && ts.isCallExpression(outer)) {
      const index = outer.arguments.findIndex((a) => a === node || a.getStart(sf) === (node.parent?.getStart?.(sf) ?? -1));
      const next = index >= 0 ? outer.arguments[index + 1] : undefined;
      if (next && ts.isStringLiteralLike(next)) names.push(next.text);
    }
    out.push({
      module: arg.text,
      names,
      loader: outer && ts.isCallExpression(outer) && ts.isIdentifier(outer.expression)
        ? outer.expression.text
        : null,
      line: lineOf(sf, node),
    });
  });
  return out;
}

/**
 * `export { x } from './y.js'` — the dependency edge a re-export creates.
 *
 * `importsOf` returns import declarations only, and for most questions that is
 * the right set. But a re-export is a load-bearing dependency in both
 * directions: the re-exporting module cannot resolve without the target, and
 * the target's symbols reach consumers only through it. This repository leans
 * on the form heavily — every package barrel is built from it, and three route
 * modules are nothing but `export { GraphView, default } from
 * '../features/graph/GraphView.js'` — so a graph built from import
 * declarations alone reports the file holding the actual screen as imported by
 * nobody while the two-line shim in front of it looks like the implementation.
 *
 * Rows match `importsOf`'s shape so a caller can concatenate the two lists.
 * `star` marks `export * from`, where the names are whatever the target
 * exports and the source does not say.
 */
export function reExports(sf) {
  const out = [];
  for (const st of sf.statements) {
    if (!ts.isExportDeclaration(st) || !st.moduleSpecifier) continue;
    const named = st.exportClause && ts.isNamedExports(st.exportClause);
    out.push({
      module: st.moduleSpecifier.text,
      names: named
        ? st.exportClause.elements.map((el) => ({
            imported: el.propertyName?.text ?? el.name.text,
            local: el.name.text,
            typeOnly: st.isTypeOnly || el.isTypeOnly,
          }))
        : [],
      star: !st.exportClause,
      typeOnly: st.isTypeOnly,
      line: lineOf(sf, st),
    });
  }
  return out;
}
