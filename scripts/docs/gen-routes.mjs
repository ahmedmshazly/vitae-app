#!/usr/bin/env node
/**
 * Build docs/generated/routes.json: every address the browser can reach, the
 * component behind it, and whether reaching it requires a session.
 *
 * Access is read from the JSX tree rather than from a list, because in this
 * application it is a property of POSITION. apps/web/src/App.tsx matches every
 * public path first and ends with `<Route path="*" element={<AuthGate />} />`;
 * a route registered below that wildcard is private no matter what it looks
 * like, and a route registered above it is public no matter what it renders.
 * That makes route order load-bearing and easy to break silently, so this
 * generator records which `<Routes>` block each route was found in.
 *
 * The JSX comment above a route is carried through as a note. It is the only
 * place the source distinguishes the canonical addresses from the stable
 * legacy ones, and dropping it would lose a distinction nothing else records.
 *
 * Usage: node scripts/docs/gen-routes.mjs [--check|--stdout]
 */
import { existsSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { emit } from './lib/emit.mjs';
import { lineOf, parse, stringOf, ts, walk } from './lib/ts-index.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = process.env.VITAE_DOCS_ROOT ? resolve(process.env.VITAE_DOCS_ROOT) : join(here, '../..');
const APP = join(root, 'apps/web/src/App.tsx');
const rel = (abs) => relative(root, abs).split('\\').join('/');

/** Component identifier to the module it is loaded from, lazily or statically. */
function componentSources(sf) {
  const map = new Map();
  for (const st of sf.statements) {
    if (ts.isImportDeclaration(st) && ts.isStringLiteral(st.moduleSpecifier)) {
      const target = st.moduleSpecifier.text;
      if (!target.startsWith('.')) continue;
      const clause = st.importClause;
      const record = (name) => map.set(name, { module: target, lazy: false });
      if (clause?.name) record(clause.name.text);
      const bindings = clause?.namedBindings;
      if (bindings && ts.isNamedImports(bindings)) for (const el of bindings.elements) record(el.name.text);
      continue;
    }
    if (!ts.isVariableStatement(st)) continue;
    for (const decl of st.declarationList.declarations) {
      if (!ts.isIdentifier(decl.name) || !decl.initializer) continue;
      let target = null;
      walk(decl.initializer, (node) => {
        if (target) return;
        if (node.kind === ts.SyntaxKind.ImportKeyword && ts.isCallExpression(node.parent)) {
          target = stringOf(node.parent.arguments[0]);
        }
      });
      if (target) map.set(decl.name.text, { module: target, lazy: true });
    }
  }
  // Functions declared in App.tsx itself are components too: LegacyWelcomeRedirect,
  // NetworkIntelligence and BrowseRedirect all render a route without a module.
  for (const st of sf.statements) {
    if (ts.isFunctionDeclaration(st) && st.name && !map.has(st.name.text)) {
      map.set(st.name.text, { module: rel(sf.fileName), lazy: false, local: true, line: lineOf(sf, st) });
    }
  }
  return map;
}

/** The name of the enclosing function declaration, which is the routing block. */
function enclosingFunction(node) {
  let cur = node.parent;
  while (cur) {
    if (ts.isFunctionDeclaration(cur) && cur.name) return cur.name.text;
    cur = cur.parent;
  }
  return null;
}

function attributeOf(element, name) {
  const attrs = element.attributes?.properties ?? [];
  for (const attr of attrs) {
    if (!ts.isJsxAttribute(attr) || attr.name.getText() !== name) continue;
    return attr.initializer ?? null;
  }
  return null;
}

/** `<Foo bar />` inside `element={...}` to the component name and its props. */
function elementInfo(initializer) {
  if (!initializer || !ts.isJsxExpression(initializer) || !initializer.expression) return null;
  let found = null;
  walk(initializer.expression, (node) => {
    if (found) return;
    if (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) found = node;
  });
  if (!found) return null;
  const name = found.tagName.getText();
  const to = stringOf(attributeOf(found, 'to')?.expression ?? attributeOf(found, 'to'));
  return { name, redirectTo: to };
}

/** The nearest JSX comment above this route within the same parent element. */
function noteAbove(routeNode, sf) {
  const siblings = routeNode.parent?.children ?? [];
  const index = siblings.indexOf(routeNode);
  for (let i = index - 1; i >= 0; i -= 1) {
    const sib = siblings[i];
    if (ts.isJsxText(sib) && !sib.getText(sf).trim()) continue;
    if (ts.isJsxExpression(sib)) {
      const text = sib.getText(sf);
      const match = /\{\s*\/\*([\s\S]*?)\*\/\s*\}/.exec(text);
      if (match) return match[1].split('\n').map((l) => l.trim()).join(' ').replace(/\s+/g, ' ').trim();
    }
    return null;
  }
  return null;
}

function build() {
  const sf = parse(APP);
  const sources = componentSources(sf);
  const routes = [];
  const blocks = new Map();

  walk(sf, (node) => {
    const isRoute = (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node))
      && node.tagName.getText() === 'Route';
    if (!isRoute) return;
    const path = stringOf(attributeOf(node, 'path')?.expression ?? attributeOf(node, 'path'));
    if (path === null) return;
    const element = elementInfo(attributeOf(node, 'element'));
    const block = enclosingFunction(node) ?? 'App';
    blocks.set(block, (blocks.get(block) ?? 0) + 1);
    const source = element ? sources.get(element.name) ?? null : null;
    routes.push({
      path,
      params: [...path.matchAll(/:([A-Za-z0-9_]+)/g)].map((m) => m[1]),
      wildcard: path.includes('*'),
      block,
      // A route in App's own <Routes> is matched before the AuthGate wildcard;
      // anything inside AuthedApp is only reached once a session exists.
      // The wildcard that renders AuthGate is not a page. Calling it public
      // would put the entrance to the private application in the public list.
      access: element?.name === 'AuthGate' ? 'auth-gate'
        : block === 'AuthedApp' ? 'private'
        : block === 'App' ? 'public'
        : 'signed-out-fallback',
      element: element?.name ?? null,
      redirect_to: element?.redirectTo ?? null,
      module: source?.module ?? null,
      lazy: source ? Boolean(source.lazy) : null,
      note: noteAbove(node.parent ?? node, sf) ?? noteAbove(node, sf),
      source: `${rel(APP)}:${lineOf(sf, node)}`,
    });
  });

  routes.sort((a, b) => a.block.localeCompare(b.block) || a.path.localeCompare(b.path));

  const publicMeta = readPublicMetadata(root);
  // A redirect has no content of its own and a parameterised path has no fixed
  // address, so neither can be prerendered. Listing them as gaps would bury the
  // one real finding under three that cannot be acted on.
  const publicPaths = new Set(
    routes
      .filter((r) => r.access === 'public' && !r.wildcard && !r.redirect_to && !r.params.length)
      .map((r) => r.path),
  );
  const prerendered = new Set(publicMeta);

  return {
    generated_by: 'scripts/docs/gen-routes.mjs',
    note: 'Derived from the JSX route tree in apps/web/src/App.tsx. Do not edit by hand.',
    totals: {
      routes: routes.length,
      public: routes.filter((r) => r.access === 'public').length,
      private: routes.filter((r) => r.access === 'private').length,
      lazy: routes.filter((r) => r.lazy).length,
      redirects: routes.filter((r) => r.redirect_to).length,
      with_params: routes.filter((r) => r.params.length).length,
      prerendered: publicMeta.length,
    },
    blocks: [...blocks.entries()].sort().map(([name, count]) => ({ name, routes: count })),
    routes,
    // A public route with no PUBLIC_METADATA entry ships no prerendered HTML and
    // no sitemap row, so it is invisible to a reader without JavaScript.
    public_without_metadata: [...publicPaths].filter((p) => !prerendered.has(p)).sort(),
    metadata_without_route: publicMeta.filter((p) => !publicPaths.has(p) && !p.includes(':')).sort(),
  };
}

/** Public route metadata drives prerendering and the sitemap, so it is joined here. */
function readPublicMetadata(rootDir) {
  const file = join(rootDir, 'apps/web/src/public/site.ts');
  if (!existsSync(file)) return [];
  const sf = parse(file);
  const paths = new Set();
  walk(sf, (node) => {
    if (!ts.isPropertyAssignment(node)) return;
    const key = ts.isIdentifier(node.name) || ts.isStringLiteral(node.name) ? node.name.text : null;
    if (key !== 'path') return;
    const value = stringOf(node.initializer);
    if (value && value.startsWith('/')) paths.add(value);
  });
  return [...paths].sort();
}

emit(build(), 'docs/generated/routes.json', root, (a) =>
  `routes: ${a.totals.routes} (${a.totals.public} public, ${a.totals.private} private, `
  + `${a.totals.lazy} lazy, ${a.totals.prerendered} with public metadata)`);
