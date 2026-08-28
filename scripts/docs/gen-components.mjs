#!/usr/bin/env node
/**
 * Build docs/generated/components.json: the design-system components, their
 * props, the CSS they emit, the accessibility they carry, and who uses them.
 *
 * `@vitae/ui` is the layer that decides what Vitae looks like and how much of
 * it works with a keyboard, and the questions a person actually has about it
 * are all relational. Is there already a component for this. What does it
 * accept. If I change this prop, whose screen moves. Does this one handle its
 * own focus, or must the caller. None of those are answerable from the source
 * of one file, which is why they get generated from all of them at once.
 *
 * Two joins carry most of the value. Components are matched to the Radix
 * primitive they wrap, because that is the difference between a component that
 * manages focus, escape and dismissal for you and one that only looks like it
 * does. And the class names each component emits are recorded, because the
 * component and the stylesheet that dresses it live in different files with
 * nothing linking them: `vt-skel` in feedback.tsx and `.vt-skel` in a
 * stylesheet are one design decision split across two directories.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse, ts, lineOf, leadingDoc, importsOf, walk } from './lib/ts-index.mjs';
import { root, sourceFiles, isTest } from './lib/workspace.mjs';
import { emit } from './lib/emit.mjs';

const UI = 'packages/ui/src';
const CONSUMERS = ['apps/web/src', 'packages/ui/src'];

/** A JSX-returning exported function whose name is capitalised: a component. */
const isComponentName = (name) => /^[A-Z]/.test(name);

/** The prose above a declaration, minus the box-drawing section rules. */
const clean = (text) => (text ?? '').replace(/[─—]{2,}/g, ' ').replace(/\s+/g, ' ').trim() || null;

/**
 * Read a props type into rows.
 *
 * Both spellings in this package are handled: a named `interface XProps` and a
 * type literal written inline in the parameter position. The distinction is
 * authorial rather than semantic, and a catalog that only understood one would
 * report half the package as taking no props.
 */
function membersOf(typeNode, sf, interfaces) {
  if (!typeNode) return [];
  let members = null;
  if (ts.isTypeLiteralNode(typeNode)) members = typeNode.members;
  else if (ts.isTypeReferenceNode(typeNode)) {
    members = interfaces.get(typeNode.typeName.getText(sf))?.members ?? null;
  } else if (ts.isIntersectionTypeNode(typeNode)) {
    return typeNode.types.flatMap((t) => membersOf(t, sf, interfaces));
  }
  if (!members) return [];
  return members.filter(ts.isPropertySignature).map((m) => ({
    name: m.name.getText(sf),
    type: m.type ? m.type.getText(sf).replace(/\s+/g, ' ') : 'unknown',
    optional: Boolean(m.questionToken),
    doc: clean(leadingDoc(m, sf)),
  }));
}

/**
 * What the caller gets when they pass nothing.
 *
 * Defaults live in the destructuring pattern (`{ height = 14 }`), not in the
 * type, so they are invisible to anyone reading the interface, which is
 * exactly why they belong in a reference that a person consults instead of the
 * source. `SkeletonRows` defaults `count` to 6 and `label` to "Loading"; the
 * interface says only that both are optional.
 */
function defaultsOf(param, sf) {
  const out = {};
  if (!param || !ts.isObjectBindingPattern(param.name)) return out;
  for (const element of param.name.elements) {
    if (element.initializer) out[element.name.getText(sf)] = element.initializer.getText(sf).replace(/\s+/g, ' ');
  }
  return out;
}

const components = [];
const hooks = [];
const files = sourceFiles(UI, { tests: false }).filter((f) => !f.includes('/test/'));

for (const rel of files) {
  const sf = parse(join(root, rel));
  const text = sf.getFullText();
  const module = rel.slice(UI.length + 1);

  const interfaces = new Map();
  walk(sf, (node) => {
    if (ts.isInterfaceDeclaration(node)) interfaces.set(node.name.text, node);
  });

  /**
   * Which Radix primitives this module imports, and under what local name.
   * A component that renders `Dialog.Content` inherits Radix's focus trap and
   * escape handling; one that hand-rolls a `<div role="dialog">` does not, and
   * the catalog should not let those look alike.
   */
  const radix = new Map();
  for (const imp of importsOf(sf)) {
    if (!imp.module.startsWith('@radix-ui/')) continue;
    const primitive = imp.module.replace('@radix-ui/react-', '');
    if (imp.namespace) radix.set(imp.namespace, primitive);
    if (imp.defaultName) radix.set(imp.defaultName, primitive);
    for (const n of imp.names) radix.set(n.local, primitive);
  }

  let section = null;
  for (const m of text.matchAll(/\/\/\s*[─—]{2,}\s*(.+?)\s*[─—]{2,}/g)) void m;

  const sectionAt = (pos) => {
    let found = null;
    for (const m of text.slice(0, pos).matchAll(/\/\/\s*[─—]{2,}\s*(.+?)\s*[─—]{2,}/g)) found = m[1].trim();
    return found;
  };
  void section;

  for (const st of sf.statements) {
    const fn = ts.isFunctionDeclaration(st)
      ? st
      : ts.isVariableStatement(st)
        ? st.declarationList.declarations[0]?.initializer
        : null;
    if (!fn) continue;
    const nameNode = ts.isFunctionDeclaration(st)
      ? st.name
      : st.declarationList.declarations[0]?.name;
    if (!nameNode || !ts.isIdentifier(nameNode)) continue;
    const exported = st.modifiers?.some((mod) => mod.kind === ts.SyntaxKind.ExportKeyword);
    if (!exported) continue;
    if (!ts.isFunctionDeclaration(fn) && !ts.isArrowFunction(fn) && !ts.isFunctionExpression(fn)) {
      // `forwardRef(...)` and `memo(...)` wrap the real function one call in.
      if (!ts.isCallExpression(fn)) continue;
    }
    const impl = ts.isCallExpression(fn)
      ? fn.arguments.find((a) => ts.isArrowFunction(a) || ts.isFunctionExpression(a))
      : fn;
    if (!impl) continue;

    const name = nameNode.text;
    const body = impl.getText(sf);
    const rendersJsx = /<[A-Za-z]/.test(body);
    const param = impl.parameters[0];
    const row = {
      name,
      module,
      source: `${rel}:${lineOf(sf, st)}`,
      section: sectionAt(st.getStart(sf)),
      doc: clean(leadingDoc(st, sf)),
      props: membersOf(param?.type, sf, interfaces),
      defaults: defaultsOf(param, sf),
      // Class names are string literals in a `cn(...)` call or a className
      // attribute; the `vt-` prefix is this package's convention.
      classes: [...new Set([...body.matchAll(/['"`](vt-[a-z0-9-]+(?:__[a-z0-9-]+)?(?:--[a-z0-9-]+)?)['"`]/g)].map((m) => m[1]))].sort(),
      wraps_radix: [...new Set([...body.matchAll(/\b([A-Z][A-Za-z]*)\s*\./g)].map((m) => radix.get(m[1])).filter(Boolean))],
      // Roles and aria attributes written directly, which is what a reviewer
      // needs to know a component contributes rather than merely permits.
      aria: [...new Set([...body.matchAll(/\b(aria-[a-z]+|role)=/g)].map((m) => m[1]))].sort(),
      renders_jsx: rendersJsx,
      used_by: [],
      uses: 0,
    };
    if (rendersJsx && isComponentName(name)) components.push(row);
    else if (/^use[A-Z]/.test(name)) hooks.push(row);
  }
}

/** Who imports each export, so "what moves if I change this" has an answer. */
const usage = new Map();
for (const dir of CONSUMERS) {
  for (const rel of sourceFiles(dir)) {
    let sf;
    try { sf = parse(join(root, rel)); } catch { continue; }
    for (const imp of importsOf(sf)) {
      if (!imp.module.startsWith('@vitae/ui') && !imp.module.startsWith('./') && !imp.module.startsWith('../')) continue;
      for (const n of imp.names) {
        if (!usage.has(n.imported)) usage.set(n.imported, []);
        usage.get(n.imported).push({ file: rel, test: isTest(rel) });
      }
    }
  }
}
for (const row of [...components, ...hooks]) {
  const hits = (usage.get(row.name) ?? []).filter((u) => !u.file.startsWith(`${UI}/${row.module}`));
  row.used_by = [...new Set(hits.filter((h) => !h.test).map((h) => h.file))].sort();
  row.uses = hits.filter((h) => !h.test).length;
  row.tested = hits.some((h) => h.test);
}

/** Which stylesheet dresses each class the components emit. */
const styled = new Map();
for (const rel of ['packages/ui/src/styles', 'apps/web/src/styles']) {
  const { readdirSync, existsSync } = await import('node:fs');
  if (!existsSync(join(root, rel))) continue;
  for (const name of readdirSync(join(root, rel))) {
    if (!name.endsWith('.css')) continue;
    const css = readFileSync(join(root, `${rel}/${name}`), 'utf8');
    for (const m of css.matchAll(/\.(vt-[a-z0-9_-]+)/g)) {
      if (!styled.has(m[1])) styled.set(m[1], new Set());
      styled.get(m[1]).add(`${rel}/${name}`);
    }
  }
}
for (const row of components) {
  row.styled_in = [...new Set(row.classes.flatMap((c) => [...(styled.get(c) ?? [])]))].sort();
  row.unstyled_classes = row.classes.filter((c) => !styled.has(c));
}

components.sort((a, b) => a.name.localeCompare(b.name));
hooks.sort((a, b) => a.name.localeCompare(b.name));

const modules = {};
for (const c of components) modules[c.module] = (modules[c.module] ?? 0) + 1;

emit({
  components,
  hooks,
  summary: {
    components: components.length,
    hooks: hooks.length,
    modules,
    with_props: components.filter((c) => c.props.length).length,
    radix_backed: components.filter((c) => c.wraps_radix.length).map((c) => c.name),
    undocumented: components.filter((c) => !c.doc && !c.section).map((c) => c.name),
    unused: components.filter((c) => c.uses === 0).map((c) => c.name),
    untested: components.filter((c) => !c.tested).map((c) => c.name),
    unstyled_classes: [...new Set(components.flatMap((c) => c.unstyled_classes))].sort(),
  },
}, 'docs/generated/components.json', root, (d) =>
  `components: ${d.summary.components} in ${Object.keys(d.summary.modules).length} modules ` +
  `+ ${d.summary.hooks} hooks (${d.summary.radix_backed.length} Radix-backed, ` +
  `${d.summary.unused.length} unused, ${d.summary.untested.length} untested, ` +
  `${d.summary.unstyled_classes.length} classes with no stylesheet)`);
