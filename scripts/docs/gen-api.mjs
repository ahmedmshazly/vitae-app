#!/usr/bin/env node
/**
 * Build docs/generated/api.json: every HTTP endpoint the server actually
 * registers, joined to the schema, service, error and test that surround it.
 *
 * Why not read docs/api/openapi.json. That document is hand-built in
 * apps/api/src/openapi/spec.ts and describes 52 operations. This walk finds
 * substantially more. The gap is structural rather than accidental: `stubGet`
 * exists to give every entry of `V1_MOUNT_PREFIXES` one path so the per-mount
 * contract assertion passes, which means the OpenAPI document's shape is a
 * function of the MOUNT list, not of the HANDLER list. A catalog derived from
 * it would document the mounts and call that the API.
 *
 * Three facts here are read out of middleware rather than assumed, because
 * assuming them is how a security claim goes stale:
 *   - which paths skip authentication, from PUBLIC_PATHS in middleware/auth.ts;
 *   - which paths keep working when a workspace is read-only, from the
 *     allow-list inside entitlementGate in middleware/workspace.ts;
 *   - which prefix each router is mounted at, from routes/v1/index.ts.
 *
 * Usage: node scripts/docs/gen-api.mjs [--check|--stdout]
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { citationsIn } from './lib/citations.mjs';
import { arrayExport, importsOf, leadingDoc, lineOf, methodCalls, parse, stringOf, ts, walk } from './lib/ts-index.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = process.env.VITAE_DOCS_ROOT ? resolve(process.env.VITAE_DOCS_ROOT) : join(here, '../..');
const API = join(root, 'apps/api/src');
const VERBS = ['get', 'post', 'put', 'patch', 'delete'];
const OUT = 'docs/generated/api.json';

const registry = JSON.parse(readFileSync(join(root, 'docs/registry/requirements.json'), 'utf8'));
const reader = { aliases: registry.id_aliases ?? {}, families: Object.keys(registry.families ?? {}).sort() };

const rel = (abs) => relative(root, abs).split('\\').join('/');
const toOpenApiPath = (p) => p.replace(/:([A-Za-z0-9_]+)/g, '{$1}');
const joinPath = (...parts) => ('/' + parts.join('/')).replace(/\/{2,}/g, '/').replace(/(.)\/$/, '$1');

/** Regex literals out of a `const NAME = [/…/, /…/]` array, as live RegExps. */
function regexArray(sf, name) {
  let found = null;
  walk(sf, (node) => {
    if (found || !ts.isVariableDeclaration(node)) return;
    if (!ts.isIdentifier(node.name) || node.name.text !== name || !node.initializer) return;
    if (!ts.isArrayLiteralExpression(node.initializer)) return;
    found = node.initializer.elements.filter(ts.isRegularExpressionLiteral).map((el) => {
      const last = el.text.lastIndexOf('/');
      return new RegExp(el.text.slice(1, last), el.text.slice(last + 1));
    });
  });
  return found ?? [];
}

/**
 * The paths entitlementGate lets through while a workspace is read-only.
 *
 * Read from the function body rather than restated here, because a restatement
 * is a copy that nothing keeps current: if someone adds a third allowed path,
 * this catalog would keep telling an operator that it is blocked.
 */
function readOnlyAllowList(sf) {
  const exact = [];
  const prefixes = [];
  walk(sf, (node) => {
    if (!ts.isFunctionDeclaration(node) || node.name?.text !== 'entitlementGate') return;
    walk(node, (inner) => {
      if (ts.isBinaryExpression(inner) && inner.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken) {
        const value = stringOf(inner.right);
        if (value && value.startsWith('/api')) exact.push(value);
      }
      if (ts.isCallExpression(inner) && ts.isPropertyAccessExpression(inner.expression)
        && inner.expression.name.text === 'startsWith') {
        const value = stringOf(inner.arguments[0]);
        if (value && value.startsWith('/api')) prefixes.push(value);
      }
    });
  });
  return { exact, prefixes };
}

/** Router identifier to source file, from the mounting module's own imports. */
function routerSources(sf, dir) {
  const map = new Map();
  for (const imp of importsOf(sf)) {
    if (!imp.module.startsWith('.')) continue;
    const abs = join(dir, imp.module.replace(/\.js$/, '.ts'));
    for (const n of imp.names) map.set(n.local, abs);
    if (imp.defaultName) map.set(imp.defaultName, abs);
  }
  return map;
}

/** Statement-level facts about one handler: statuses, errors, schemas, services. */
function handlerFacts(call, sf, serviceNames) {
  const statuses = [];
  const errors = [];
  const schemas = new Set();
  const services = new Set();
  walk(call, (node) => {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const method = node.expression.name.text;
      if (method === 'status' && node.arguments[0] && ts.isNumericLiteral(node.arguments[0])) {
        statuses.push(Number(node.arguments[0].text));
      }
      if (method === 'safeParse' || method === 'parse') {
        const target = node.expression.expression;
        const name = ts.isIdentifier(target) ? target.text
          : ts.isCallExpression(target) || ts.isPropertyAccessExpression(target) ? rootName(target) : null;
        if (name) schemas.add(name);
      }
    }
    if (ts.isNewExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'HttpError') {
      const status = node.arguments?.[0];
      const code = stringOf(node.arguments?.[1]);
      if (status && ts.isNumericLiteral(status)) errors.push({ status: Number(status.text), code: code ?? null });
    }
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && serviceNames.has(node.expression.text)) {
      services.add(node.expression.text);
    }
  });
  return { statuses, errors, schemas: [...schemas].sort(), services: [...services].sort() };
}

function rootName(node) {
  let cur = node;
  while (cur && (ts.isPropertyAccessExpression(cur) || ts.isCallExpression(cur))) cur = cur.expression;
  return cur && ts.isIdentifier(cur) ? cur.text : null;
}

function dedupeErrors(errors) {
  const seen = new Map();
  for (const e of errors) seen.set(`${e.status}:${e.code}`, e);
  return [...seen.values()].sort((a, b) => a.status - b.status || String(a.code).localeCompare(String(b.code)));
}

function build() {
  const appFile = join(API, 'app.ts');
  const appSf = parse(appFile);
  const publicPatterns = regexArray(parse(join(API, 'middleware/auth.ts')), 'PUBLIC_PATHS');
  const allowList = readOnlyAllowList(parse(join(API, 'middleware/workspace.ts')));
  const mountPrefixes = arrayExport(parse(join(API, 'openapi/mounts.ts')), 'V1_MOUNT_PREFIXES') ?? [];

  const endpoints = [];
  const mounts = [];

  // 1. Routes registered on the application itself, outside any router. The
  //    liveness probes, the metrics route and the Paddle webhook all live here,
  //    and a router-only walk reports them as if they did not exist.
  //
  //    Two passes, because Express registration order is not reading order:
  //    /health and /ready are registered ABOVE `app.use('/api', authGate)`, so
  //    a single pass would classify them before it knows where the gate is and
  //    report an unauthenticated probe as authenticated. Both gates are read
  //    from their mount calls for the same reason the allow-list is read from
  //    its function: a security claim restated by hand goes stale silently.
  const appHandlerSources = routerSources(appSf, dirname(appFile));
  const appCalls = methodCalls(appSf, { objects: (o) => o === 'app', methods: [...VERBS, 'use'] });
  const gates = { auth: null, entitlement: null, workspace: null };
  let v1Base = '/api/v1';
  for (const call of appCalls) {
    if (call.method !== 'use') continue;
    const path = stringOf(call.args[0]);
    const ident = call.args.find((a) => ts.isIdentifier(a));
    if (!ident) continue;
    if (ident.text === 'v1Router' && path) v1Base = path;
    if (ident.text === 'authGate') gates.auth = path ?? '/';
    if (ident.text === 'entitlementGate') gates.entitlement = path ?? '/';
    if (ident.text === 'workspaceMiddleware') gates.workspace = path ?? '/';
  }
  for (const call of appCalls) {
    const path = stringOf(call.args[0]);
    if (!path || call.method === 'use') continue;
    const handlerIdent = [...call.args].reverse().find((a) => ts.isIdentifier(a));
    const handlerName = handlerIdent ? handlerIdent.text : null;
    const handlerFile = handlerName ? appHandlerSources.get(handlerName) : null;
    endpoints.push(makeEndpoint({
      method: call.method, path, mount: null, sf: appSf, call, file: appFile,
      publicPatterns, allowList, gates, serviceNames: new Set(),
      handler: handlerName,
      handler_source: handlerFile ? rel(handlerFile) : null,
    }));
  }

  // 2. The v1 router tree. Prefix comes from `v1Router.use(prefix, router)` and
  //    the router's file from that module's own import list, so a router that
  //    is exported but never mounted is visible as an absence rather than lost.
  const indexFile = join(API, 'routes/v1/index.ts');
  const indexSf = parse(indexFile);
  const sources = routerSources(indexSf, dirname(indexFile));
  const mountedRouters = new Set();

  for (const call of methodCalls(indexSf, { objects: (o) => o === 'v1Router', methods: ['use'] })) {
    const prefix = stringOf(call.args[0]);
    const ident = call.args.find((a) => ts.isIdentifier(a));
    if (!prefix || !ident) continue;
    const file = sources.get(ident.text);
    mountedRouters.add(ident.text);
    const row = { prefix, router: ident.text, source: file ? rel(file) : null, endpoints: 0 };
    mounts.push(row);
    if (!file || !existsSync(file)) continue;

    const sf = parse(file);
    const serviceNames = new Set(
      importsOf(sf).filter((i) => i.module.includes('services/')).flatMap((i) => i.names.map((n) => n.local)),
    );
    for (const handler of methodCalls(sf, { objects: (o) => o === ident.text, methods: VERBS })) {
      const sub = stringOf(handler.args[0]);
      if (sub === null) continue;
      endpoints.push(makeEndpoint({
        method: handler.method, path: joinPath(v1Base, prefix, sub), mount: prefix,
        sf, call: handler, file, publicPatterns, allowList, gates, serviceNames,
      }));
      row.endpoints += 1;
    }
  }

  // 3. Routers that exist but are never mounted, and mounts that carry no
  //    handler. Both are silent in every other view of this codebase.
  const unmounted = [];
  for (const name of readdirSync(join(API, 'routes/v1'))) {
    if (!name.endsWith('.ts') || name.includes('.test.') || name === 'index.ts') continue;
    const sf = parse(join(API, 'routes/v1', name));
    for (const ex of exportedRouters(sf)) {
      if (!mountedRouters.has(ex.name)) unmounted.push({ router: ex.name, source: rel(join(API, 'routes/v1', name)) });
    }
  }

  const openapi = JSON.parse(readFileSync(join(root, 'docs/api/openapi.json'), 'utf8'));
  const documented = new Set();
  for (const [path, item] of Object.entries(openapi.paths ?? {})) {
    for (const method of Object.keys(item)) {
      if (VERBS.includes(method)) documented.add(`${method.toUpperCase()} ${path}`);
    }
  }
  // Paths in the document are relative to a server entry, and this document has
  // two: one rooted at /api/v1 for the application API, one at the origin for
  // the health probes and the provider webhook. Comparing against only the
  // first reports 133 of 135 endpoints as undocumented, which is a defect in
  // the comparison rather than a finding about the API.
  const bases = (openapi.servers ?? [])
    .map((server) => {
      try {
        return new URL(server.url).pathname.replace(/\/$/, '');
      } catch {
        return String(server.url ?? '').replace(/\/$/, '');
      }
    })
    .concat('')
    .filter((base, i, all) => all.indexOf(base) === i)
    .sort((a, b) => b.length - a.length);

  for (const endpoint of endpoints) {
    endpoint.openapi = bases.some((base) => {
      if (base && !endpoint.path.startsWith(base + '/')) return false;
      const suffix = base ? endpoint.path.slice(base.length) || '/' : endpoint.path;
      return documented.has(`${endpoint.method} ${suffix}`);
    });
  }

  // The reverse gap. An operation in the document that no router registers is
  // a promise the server does not keep, which is worse than an undocumented
  // endpoint: a client written against it fails at runtime, not at review.
  const registered = new Set();
  for (const endpoint of endpoints) {
    for (const base of bases) {
      if (base && !endpoint.path.startsWith(base + '/')) continue;
      registered.add(`${endpoint.method} ${base ? endpoint.path.slice(base.length) || '/' : endpoint.path}`);
    }
  }
  const phantom = [...documented].filter((op) => !registered.has(op)).sort();

  endpoints.sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));
  mounts.sort((a, b) => a.prefix.localeCompare(b.prefix));

  const undocumented = endpoints.filter((e) => !e.openapi);
  return {
    generated_by: 'scripts/docs/gen-api.mjs',
    note: 'Derived from the Express routers, not from docs/api/openapi.json. Do not edit by hand.',
    totals: {
      endpoints: endpoints.length,
      mounts: mounts.length,
      declared_mount_prefixes: mountPrefixes.length,
      public_endpoints: endpoints.filter((e) => e.auth === 'public').length,
      outside_auth_gate: endpoints.filter((e) => e.auth === 'outside-auth-gate').length,
      blocked_when_read_only: endpoints.filter((e) => e.entitlement === 'blocked-when-read-only').length,
      documented_in_openapi: endpoints.length - undocumented.length,
      undocumented_in_openapi: undocumented.length,
      openapi_operations: documented.size,
      documented_but_not_registered: phantom.length,
      endpoints_with_tests: endpoints.filter((e) => e.tests.length).length,
      endpoints_citing_requirements: endpoints.filter((e) => e.requirements.length).length,
    },
    gates,
    mounts,
    declared_but_unmounted_prefixes: mountPrefixes.filter((p) => !mounts.some((m) => toOpenApiPath(m.prefix) === p)),
    mounted_but_undeclared_prefixes: mounts.map((m) => toOpenApiPath(m.prefix)).filter((p) => !mountPrefixes.includes(p)),
    routers_never_mounted: unmounted,
    endpoints,
    undocumented_in_openapi: undocumented.map((e) => `${e.method} ${e.path}`),
    documented_but_not_registered: phantom,
  };
}

function exportedRouters(sf) {
  const out = [];
  walk(sf, (node) => {
    if (!ts.isVariableStatement(node)) return;
    if (!node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) return;
    for (const decl of node.declarationList.declarations) {
      if (ts.isIdentifier(decl.name) && /Router$/.test(decl.name.text)) out.push({ name: decl.name.text });
    }
  });
  return out;
}

/** Is `path` inside the sub-application a middleware was mounted on? */
function underMount(path, mount) {
  if (!mount || mount === '/') return true;
  return path === mount || path.startsWith(mount.replace(/\/$/, '') + '/');
}

function makeEndpoint({
  method, path, mount, sf, call, file, publicPatterns, allowList, gates, serviceNames,
  handler = null, handler_source = null,
}) {
  const verb = method.toUpperCase();
  const openApiPath = toOpenApiPath(path);
  const doc = leadingDoc(call.statement, sf);
  const facts = handlerFacts(call.call, sf, serviceNames);
  const testFile = file.replace(/\.ts$/, '.integration.test.ts');
  const isWrite = !['GET', 'HEAD', 'OPTIONS'].includes(verb);
  const exempt = allowList.exact.includes(path) || allowList.prefixes.some((p) => path.startsWith(p));
  const gated = underMount(path, gates?.auth);
  const metered = underMount(path, gates?.entitlement);

  return {
    id: `${verb} ${openApiPath}`,
    slug: `${verb.toLowerCase()}${openApiPath.replace(/[^A-Za-z0-9]+/g, '-')}`.replace(/-+$/, ''),
    method: verb,
    path: openApiPath,
    express_path: path,
    mount,
    source: `${rel(file)}:${lineOf(sf, call.call)}`,
    summary: doc,
    requirements: citationsIn(`${doc}\n${call.call.getText(sf)}`, reader),
    request_schemas: facts.schemas,
    services: facts.services,
    success_status: facts.statuses.find((s) => s < 400) ?? 200,
    errors: dedupeErrors(facts.errors),
    // Three states, not two. `outside-auth-gate` is not a synonym for `public`:
    // /webhooks/paddle is unauthenticated because it is registered above the
    // gate and verifies a provider signature instead, which is a different
    // security posture from a path the gate deliberately lets through.
    auth: !gated ? 'outside-auth-gate' : publicPatterns.some((re) => re.test(path)) ? 'public' : 'authenticated',
    // A read request is never blocked: entitlementGate only inspects mutations.
    entitlement: !metered ? 'outside-entitlement-gate'
      : !isWrite ? 'read-always-allowed'
      : exempt ? 'allowed-when-read-only'
      : 'blocked-when-read-only',
    handler,
    handler_source,
    tests: existsSync(testFile) ? [rel(testFile)] : [],
    openapi: false,
  };
}

const artifact = build();
const serialized = JSON.stringify(artifact, null, 2) + '\n';
const outPath = join(root, OUT);

if (process.argv.includes('--stdout')) {
  process.stdout.write(serialized);
} else if (process.argv.includes('--check')) {
  const current = existsSync(outPath) ? readFileSync(outPath, 'utf8') : '';
  if (current !== serialized) {
    console.error(`${OUT} is stale. Run \`pnpm docs:gen\` and commit the result.`);
    process.exit(1);
  }
  console.log(`api catalog: up to date (${artifact.totals.endpoints} endpoints)`);
} else {
  writeFileSync(outPath, serialized);
  const t = artifact.totals;
  console.log(
    `api: ${t.endpoints} endpoints across ${t.mounts} mounts `
    + `(${t.documented_in_openapi} in OpenAPI, ${t.undocumented_in_openapi} not, `
    + `${t.public_endpoints} public, ${t.blocked_when_read_only} blocked when read-only)`,
  );
}
