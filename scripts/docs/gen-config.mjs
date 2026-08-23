#!/usr/bin/env node
/**
 * Build docs/generated/config.json: every environment variable this system
 * reads, where it is declared, where it is read, and whether anything checks it.
 *
 * Four things in this repository describe the configuration surface and none of
 * them describes all of it:
 *
 *   1. `serverEnvSchema` (packages/config/src/env.ts) — Zod, fail-fast at boot,
 *      and the only source that can reject a bad value.
 *   2. `ImportMetaEnv` (apps/web/src/vite-env.d.ts) — the browser contract.
 *      Vite inlines these at BUILD time, so a missing one is not a boot error;
 *      it is `undefined` inside a shipped bundle. Different failure, own scope.
 *   3. Raw `process.env.X` reads — no schema, no default, no boot check.
 *      VITAE_CLOUD_ENABLED and every PADDLE_* credential live only here.
 *   4. `.env.example` — the file an operator actually copies.
 *
 * A catalog built from any single one is wrong in a way that costs somebody a
 * deployment, so this reads all four and records the disagreements as data.
 * The summary's three lists are the point of the artifact: server keys nothing
 * validates, deployment keys the example file never names, and names in the
 * example file that no first-party source reads.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse, ts, lineOf, walk } from './lib/ts-index.mjs';
import { emit } from './lib/emit.mjs';
import { citationsIn, compareIds, optionsFrom } from './lib/citations.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const cite = optionsFrom(JSON.parse(readFileSync(join(root, 'docs/registry/requirements.json'), 'utf8')));

/** Trees swept for reads, with the area name each read is attributed to. */
const SCAN = [
  ['apps/api/src', 'api'],
  ['apps/web/src', 'web'],
  ['services/buildsvc/src', 'buildsvc'],
  ['packages/core/src', 'core'],
  ['packages/config/src', 'config'],
  ['scripts', 'scripts'],
  ['e2e', 'e2e'],
];

/**
 * Areas whose reads happen in a deployed process. A key read only by `scripts`
 * or `e2e` configures a developer's machine, so holding `.env.example`
 * responsible for documenting it would bury the operator-facing gaps.
 */
const DEPLOYED_AREAS = new Set(['api', 'web', 'buildsvc', 'core', 'config', 'deploy']);

/** Names the shell, the OS or the CI runner sets. Not Vitae configuration. */
const SHELL_PROVIDED = new Set([
  'PATH', 'HOME', 'PWD', 'OLDPWD', 'USER', 'SHELL', 'TERM', 'LANG', 'LC_ALL', 'IFS',
  'RANDOM', 'PS1', 'PS2', 'HOSTNAME', 'UID', 'EUID', 'SHLVL', 'TMPDIR', 'EDITOR',
  'BASH_SOURCE', 'FUNCNAME', 'LINENO', 'SECONDS', 'REPLY', 'OPTARG', 'OPTIND', 'PIPESTATUS',
]);

/** Vite owns these; telling an operator to set one would be wrong. */
const VITE_BUILTIN = new Set(['DEV', 'PROD', 'MODE', 'SSR', 'BASE_URL', 'LEGACY']);

const CODE_EXT = new Set(['.ts', '.tsx', '.mjs', '.js']);
const SHELL_EXT = new Set(['.sh', '.yml', '.yaml', '.service', '.env', '']);

function files(dir, extensions, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist' || name === 'coverage') continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      files(full, extensions, out);
      continue;
    }
    const dot = name.lastIndexOf('.');
    if (extensions.has(dot === -1 ? '' : name.slice(dot))) out.push(full);
  }
  return out;
}

/** Strip a `── Section title ────` rule down to its title, or return null. */
function sectionTitle(line) {
  const inner = line.replace(/^[\s─—=*#-]+/, '').replace(/[\s─—=*-]+$/, '').trim();
  const ruled = /^[\s─—=*#-]/.test(line) && /[─—=*-]\s*$/.test(line);
  return ruled && inner && inner.length < 60 ? inner : null;
}

/**
 * Comments above a config key, both `/** *\/` and `//`.
 *
 * Elsewhere the generators take only doc comments, because a `//` above a
 * function is usually a note to the next maintainer. Here it IS the
 * documentation: `// Comma-separated browser origins allowed by CORS` is the
 * only description WEB_ORIGIN has anywhere in the repository.
 */
function commentAbove(node, sf) {
  const ranges = ts.getLeadingCommentRanges(sf.text, node.getFullStart()) ?? [];
  const lines = [];
  let section = null;
  for (const range of ranges) {
    for (const line of sf.text.slice(range.pos, range.end).split('\n')) {
      const clean = line
        .replace(/^\s*\/\*\*?/, '')
        .replace(/\*\/\s*$/, '')
        .replace(/^\s*\*\s?/, '')
        .replace(/^\s*\/\/\s?/, '')
        .trimEnd();
      const title = sectionTitle(clean);
      if (title) { section = title; continue; }
      if (/^[\s─—=*-]*$/.test(clean)) continue;
      lines.push(clean.trim());
    }
  }
  return { doc: lines.join(' ').replace(/\s+/g, ' ').trim() || null, section };
}

/** Render a literal the way it would be written in a `.env` file. */
function literal(node) {
  if (!node) return null;
  if (ts.isStringLiteralLike(node)) return node.text;
  if (ts.isNumericLiteral(node)) return node.text;
  if (node.kind === ts.SyntaxKind.TrueKeyword) return 'true';
  if (node.kind === ts.SyntaxKind.FalseKeyword) return 'false';
  if (ts.isArrayLiteralExpression(node)) return node.elements.map(literal);
  return node.getText(node.getSourceFile()).replace(/\s+/g, ' ');
}

/**
 * Flatten a Zod chain into what an operator needs: base type, whether a value
 * must be supplied, its default, and the constraints that will reject it.
 *
 * Two subtleties decide whether this is right or merely plausible.
 *
 * `z.string()` is a call on a property access, so a loop that peels calls
 * bottoms out at the bare identifier `z` and reports the type as "z" for every
 * key in the schema. The base is therefore the FIRST modifier once the chain is
 * back in source order, not the node the walk stopped on.
 *
 * `boolish` is an identifier, not a `z.` call, so a reader that stops at the
 * bottom of the chain reports three keys as untyped. Resolving the alias and
 * splicing its own modifiers in underneath recovers `enum(...)  → boolean`.
 */
function zodChain(expr, aliases) {
  const modifiers = [];
  let node = expr;
  while (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
    modifiers.push({ name: node.expression.name.text, args: node.arguments.map(literal) });
    node = node.expression.expression;
  }
  modifiers.reverse();

  let prefix = node.getText(node.getSourceFile()).replace(/\s+/g, '').replace(/^z\.?/, '');
  if (ts.isIdentifier(node) && aliases[node.text]) {
    const alias = aliases[node.text];
    modifiers.unshift(...alias.modifiers);
    prefix = alias.prefix;
  }

  const base = modifiers.shift() ?? { name: prefix || 'unknown', args: [] };
  const named = (name) => modifiers.find((m) => m.name === name);
  const dflt = named('default');
  const transformed = named('transform');

  const constraints = [];
  for (const m of modifiers) {
    if (['optional', 'default', 'transform', 'superRefine', 'refine'].includes(m.name)) continue;
    const args = m.args.flat().filter((a) => a !== null && a !== undefined);
    constraints.push(args.length ? `${m.name}(${args.join(', ')})` : `${m.name}()`);
  }

  return {
    // `coerce` matters to an operator: it says a numeric string is accepted.
    type: (prefix ? `${prefix}.` : '') + base.name,
    // A `.transform` after `z.enum` is how this schema spells "boolean": the
    // variable is four legal strings on the wire and a boolean in the process.
    parsed_as: transformed ? 'boolean' : null,
    enum_values: base.name === 'enum' ? (base.args[0] ?? []).flat() : [],
    required: !named('optional') && !dflt,
    default: dflt ? dflt.args[0] : null,
    constraints,
  };
}

/** The Zod object literal that is the server's configuration contract. */
function serverContract() {
  const rel = 'packages/config/src/env.ts';
  const sf = parse(join(root, rel));
  const aliases = {};
  const keys = [];

  // Pass one collects the shared refinements declared above the schema, so
  // pass two can resolve a chain that bottoms out at one of them.
  for (const stmt of sf.statements) {
    if (!ts.isVariableStatement(stmt)) continue;
    for (const decl of stmt.declarationList.declarations) {
      if (!decl.initializer || !ts.isIdentifier(decl.name)) continue;
      if (decl.name.text === 'serverEnvSchema' || !/^z\b/.test(decl.initializer.getText(sf))) continue;
      const modifiers = [];
      let node = decl.initializer;
      while (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
        modifiers.push({ name: node.expression.name.text, args: node.arguments.map(literal) });
        node = node.expression.expression;
      }
      aliases[decl.name.text] = {
        prefix: node.getText(sf).replace(/\s+/g, '').replace(/^z\.?/, ''),
        modifiers: modifiers.reverse(),
      };
    }
  }

  for (const stmt of sf.statements) {
    if (!ts.isVariableStatement(stmt)) continue;
    for (const decl of stmt.declarationList.declarations) {
      if (!ts.isIdentifier(decl.name) || decl.name.text !== 'serverEnvSchema') continue;
      const objectArg = decl.initializer?.arguments?.[0];
      if (!objectArg || !ts.isObjectLiteralExpression(objectArg)) continue;
      for (const prop of objectArg.properties) {
        if (!ts.isPropertyAssignment(prop)) continue;
        const { doc, section } = commentAbove(prop, sf);
        keys.push({
          name: prop.name.getText(sf).replace(/['"]/g, ''),
          scope: 'server',
          declared_in: 'serverEnvSchema',
          validated: true,
          ...zodChain(prop.initializer, aliases),
          section,
          description: doc,
          requirements: citationsIn(doc ?? '', cite).sort(compareIds),
          source: `${rel}:${lineOf(sf, prop)}`,
        });
      }
    }
  }
  return keys;
}

/**
 * The `ImportMetaEnv` interface, which is the browser's configuration contract.
 *
 * The web keys cannot be found by sweeping for `import.meta.env.VITE_X`,
 * because `getPublicLaunchConfig(env)` takes the whole object as a parameter
 * and reads `env.VITE_PUBLIC_SITE_URL` off it. Six of the eight public launch
 * keys are invisible to a read-site sweep, and reporting them as unused would
 * be exactly backwards: they gate whether the public site may launch at all.
 */
function webContract() {
  const rel = 'apps/web/src/vite-env.d.ts';
  const sf = parse(join(root, rel));
  const keys = [];
  for (const stmt of sf.statements) {
    if (!ts.isInterfaceDeclaration(stmt) || stmt.name.text !== 'ImportMetaEnv') continue;
    for (const member of stmt.members) {
      if (!ts.isPropertySignature(member)) continue;
      const { doc, section } = commentAbove(member, sf);
      keys.push({
        name: member.name.getText(sf),
        scope: 'web-build',
        declared_in: 'ImportMetaEnv',
        // A TypeScript declaration constrains the code that reads the value; it
        // does nothing at runtime. Saying it validates the value would be a
        // guarantee this repository does not make.
        validated: false,
        type: member.type?.getText(sf) ?? 'string',
        parsed_as: null,
        enum_values: [],
        required: !member.questionToken,
        default: null,
        constraints: [],
        section,
        description: doc,
        requirements: citationsIn(doc ?? '', cite).sort(compareIds),
        source: `${rel}:${lineOf(sf, member)}`,
      });
    }
  }
  return keys;
}

/**
 * Every read site, from the parsed source rather than a grep: a name inside a
 * documentation string or a commented-out line is not a read, and counting one
 * would put a key in this catalog that nothing consults.
 *
 * `process.env[MAP[period]]` is a read whose key is not in the expression at
 * all. When a file performs a dynamic read like that, the uppercase string
 * literals in the same file are recorded as `computed` — evidence that they
 * are env names sitting beside a dynamic lookup, which is weaker than a direct
 * read and labelled as such rather than being silently promoted or dropped.
 */
function codeReads() {
  const reads = new Map();
  const add = (name, via, area, source, isTest) => {
    if (!reads.has(name)) reads.set(name, { via, areas: new Set(), sites: [] });
    const entry = reads.get(name);
    if (entry.via === 'computed' && via !== 'computed') entry.via = via;
    entry.areas.add(area);
    entry.sites.push({ source, test: isTest, via });
  };

  for (const [dir, area] of SCAN) {
    for (const abs of files(join(root, dir), CODE_EXT)) {
      const rel = relative(root, abs);
      const isTest = /\.(test|spec)\.[tj]sx?$/.test(rel) || rel.startsWith('e2e/');
      let sf;
      try { sf = parse(abs); } catch { continue; }

      let dynamic = false;
      const literals = [];
      walk(sf, (node) => {
        if (ts.isStringLiteralLike(node) && /^[A-Z][A-Z0-9_]{3,}$/.test(node.text)) {
          literals.push({ text: node.text, line: lineOf(sf, node) });
        }
        let name = null;
        let via = null;
        if (ts.isPropertyAccessExpression(node)) {
          const owner = node.expression.getText(sf).replace(/\s+/g, '');
          if (owner === 'process.env') { name = node.name.text; via = 'process.env'; }
          else if (owner === 'import.meta.env') { name = node.name.text; via = 'import.meta.env'; }
        } else if (ts.isElementAccessExpression(node)) {
          const owner = node.expression.getText(sf).replace(/\s+/g, '');
          if (owner !== 'process.env' && owner !== 'import.meta.env') return;
          if (ts.isStringLiteralLike(node.argumentExpression)) {
            name = node.argumentExpression.text;
            via = owner;
          } else {
            dynamic = true;
          }
        }
        if (name && /^[A-Z][A-Z0-9_]*$/.test(name)) add(name, via, area, `${rel}:${lineOf(sf, node)}`, isTest);
      });

      if (dynamic) {
        for (const lit of literals) add(lit.text, 'computed', area, `${rel}:${lit.line}`, isTest);
      }
    }
  }
  return reads;
}

/**
 * Configuration read by the deployment material — compose files, unit files,
 * the Caddyfile and the shell scripts under deploy/.
 *
 * A `${NAME}` in a shell script is usually a local variable, not configuration:
 * `S3_BASE`, `STAMP` and `FAILED` are computed a few lines above their first
 * use. A sweep that took every reference would add seventy names to this
 * catalog and instruct an operator to set the loop counter.
 *
 * Order settles it. Two forms mean "this comes from the environment":
 *
 *   NAME="${NAME:-default}"      the canonical shell default idiom — the read
 *                                on the right runs before the assignment
 *   ...${NAME}... before NAME=   read first, assigned later as a fallback
 *                                (restore-from-s3.sh does exactly this with
 *                                BACKUP_DAY: line 42 reads it, 43 fills it in)
 *
 * Anything whose first appearance is its own assignment is a local. Compose,
 * unit and Caddy files have no locals at all, so every reference there is an
 * environment read by definition.
 */
function shellReads() {
  const out = new Map();
  const REFERENCE = /\$\{?([A-Z][A-Z0-9_]{2,})[}:%#/^,[]?/g;
  const ASSIGNMENT = /(?:^|;|\bexport\s+|\blocal\s+|\breadonly\s+|\bdeclare\s+[-\w]*\s+)\s*([A-Z][A-Z0-9_]{2,})\+?=/g;

  const candidates = [
    ...files(join(root, 'deploy'), SHELL_EXT),
    ...files(join(root, 'scripts'), new Set(['.sh'])),
  ];
  for (const abs of candidates) {
    const rel = relative(root, abs);
    const isScript = rel.endsWith('.sh');
    const lines = readFileSync(abs, 'utf8').split('\n');

    const fromEnvironment = new Set();
    if (isScript) {
      const firstRead = new Map();
      const firstAssign = new Map();
      lines.forEach((line, row) => {
        if (/^\s*#/.test(line)) return;
        const assigns = [...line.matchAll(ASSIGNMENT)].map((m) => [m[1], m.index]);
        for (const [name, col] of assigns) {
          if (!firstAssign.has(name)) firstAssign.set(name, [row, col]);
        }
        for (const match of line.matchAll(REFERENCE)) {
          const name = match[1];
          if (!firstRead.has(name)) firstRead.set(name, [row, match.index]);
          // `NAME="${NAME:-x}"`: the read is to the right of the assignment on
          // the same line, and the shell evaluates it first.
          const own = assigns.find(([n, col]) => n === name && col < match.index);
          if (own) fromEnvironment.add(name);
        }
      });
      for (const [name, read] of firstRead) {
        const assign = firstAssign.get(name);
        if (!assign || read[0] < assign[0] || (read[0] === assign[0] && read[1] < assign[1])) {
          fromEnvironment.add(name);
        }
      }
    }

    lines.forEach((line, i) => {
      if (/^\s*#/.test(line)) return;
      for (const match of line.matchAll(REFERENCE)) {
        const name = match[1];
        if (SHELL_PROVIDED.has(name)) continue;
        if (isScript && !fromEnvironment.has(name)) continue;
        if (!out.has(name)) out.set(name, { areas: new Set(['deploy']), sites: [] });
        const sites = out.get(name).sites;
        const source = `${rel}:${i + 1}`;
        if (!sites.some((s) => s.source === source)) sites.push({ source, test: false, via: 'shell' });
      }
    });
  }
  return out;
}

/** Names, sections and inline notes from the file an operator copies. */
function envExample() {
  const path = join(root, '.env.example');
  if (!existsSync(path)) return new Map();
  const out = new Map();
  let pending = [];
  let section = null;
  readFileSync(path, 'utf8').split('\n').forEach((line, i) => {
    const trimmed = line.trim();
    if (!trimmed) { pending = []; return; }
    // A commented assignment is still documentation: every optional key here is
    // written `# KEY=value` so that copying the file does not set it.
    const match = trimmed.match(/^#?\s*([A-Z][A-Z0-9_]*)=(.*)$/);
    if (match) {
      out.set(match[1], {
        commented: trimmed.startsWith('#'),
        example: match[2],
        section,
        note: pending.join(' ').replace(/\s+/g, ' ').trim() || null,
        source: `.env.example:${i + 1}`,
      });
      pending = [];
      return;
    }
    if (trimmed.startsWith('#')) {
      const clean = trimmed.replace(/^#\s?/, '').trimEnd();
      const title = sectionTitle(clean);
      if (title) { section = title; pending = []; return; }
      if (clean.trim() && !/^[\s─—=*-]*$/.test(clean)) pending.push(clean.trim());
      return;
    }
    pending = [];
  });
  return out;
}

const byName = new Map();
for (const key of [...serverContract(), ...webContract()]) byName.set(key.name, key);

const reads = new Map(codeReads());
for (const [name, entry] of shellReads()) {
  if (reads.has(name)) {
    reads.get(name).areas.add('deploy');
    reads.get(name).sites.push(...entry.sites);
  } else {
    reads.set(name, { via: 'shell', areas: entry.areas, sites: entry.sites });
  }
}

for (const [name, read] of reads) {
  if (VITE_BUILTIN.has(name) && read.via === 'import.meta.env') continue;
  const production = read.sites.filter((s) => !s.test);
  const existing = byName.get(name);
  const entry = existing ?? {
    name,
    scope: name.startsWith('VITE_') ? 'web-build' : read.via === 'shell' ? 'deploy' : 'server',
    declared_in: null,
    validated: false,
    type: 'string',
    parsed_as: null,
    enum_values: [],
    required: false,
    default: null,
    constraints: [],
    section: null,
    description: null,
    requirements: [],
    source: (production[0] ?? read.sites[0]).source,
  };
  entry.reads = [...new Set(production.map((s) => s.source))].sort();
  entry.read_by = [...read.areas].sort();
  entry.read_via = read.via;
  // A key seen only in tests configures the harness, not the product.
  entry.test_only = production.length === 0;
  if (!existing) byName.set(name, entry);
}

for (const [name, entry] of byName) {
  const doc = envExample().get(name) ?? null;
  entry.reads ??= [];
  entry.read_by ??= [];
  entry.read_via ??= entry.declared_in ? 'declaration-only' : null;
  entry.test_only ??= false;
  // The surface decides who is responsible for the key. `.env.example` answers
  // to an operator, so a key only ever read by the test harness or a developer
  // script is not a documentation gap in it.
  entry.surface = entry.read_by.some((a) => DEPLOYED_AREAS.has(a)) || entry.declared_in ? 'deployment' : 'tooling';
  entry.documented = Boolean(doc);
  entry.example = doc ? { value: doc.example, commented: doc.commented, source: doc.source } : null;
  if (!entry.description && doc?.note) entry.description = doc.note;
  if (!entry.section && doc?.section) entry.section = doc.section;
}

const keys = [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
const example = envExample();

// Three disagreements, each with a different consequence for a real person.
// Unvalidated: a typo changes behaviour instead of refusing to boot.
// Undocumented: an operator cannot discover the key exists.
// Example-only: an operator sets a key nothing reads and believes it took.
const unvalidated = keys.filter((k) => k.scope === 'server' && !k.validated && k.surface === 'deployment');
const undocumented = keys.filter((k) => !k.documented && k.surface === 'deployment');
const exampleOnly = [...example.keys()].filter((n) => !byName.has(n)).sort();

emit(
  {
    keys,
    sections: [...new Set(keys.map((k) => k.section).filter(Boolean))].sort(),
    summary: {
      total: keys.length,
      by_scope: keys.reduce((acc, k) => ({ ...acc, [k.scope]: (acc[k.scope] ?? 0) + 1 }), {}),
      declared: keys.filter((k) => k.declared_in).length,
      validated: keys.filter((k) => k.validated).length,
      server_unvalidated: unvalidated.map((k) => k.name),
      undocumented: undocumented.map((k) => k.name),
      example_only: exampleOnly,
      tooling_only: keys.filter((k) => k.surface === 'tooling').map((k) => k.name),
    },
  },
  'docs/generated/config.json',
  root,
  (a) =>
    `config: ${a.summary.total} keys (${a.summary.validated} validated, ` +
    `${a.summary.server_unvalidated.length} server keys unvalidated, ` +
    `${a.summary.undocumented.length} undocumented, ${a.summary.example_only.length} example-only)`,
);
