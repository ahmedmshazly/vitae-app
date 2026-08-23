#!/usr/bin/env node
/**
 * Prove the shared AST layer reads what it claims to read.
 *
 * Every generated artifact in docs/generated/ is derived through this module,
 * so a misreading here is not one wrong page — it is twelve reference surfaces
 * that agree with each other and disagree with the code. The failures are
 * silent by nature: a missed import shape produces a smaller dependency graph,
 * not an error, and a smaller graph looks exactly like a smaller codebase.
 *
 * Each case below is a source fragment with a known answer, chosen because
 * getting it wrong changes an artifact without breaking a run. The dynamic and
 * re-export cases exist because both were absent once: the first reported 46
 * of the product's screens as unreachable, the second reported every package
 * barrel as depending on nothing.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  parse, lineOf, leadingDoc, importsOf, exportsOf, reExports, dynamicImports,
  methodCalls, functionCalls, arrayExport, stringOf, walk, ts,
} from './ts-index.mjs';

const dir = mkdtempSync(join(tmpdir(), 'vitae-ts-index-'));
let failures = 0;
let n = 0;

/** Parse a fragment as a real file, so extension-driven parsing is exercised. */
function source(code, ext = '.ts') {
  const file = join(dir, `f${(n += 1)}${ext}`);
  writeFileSync(file, code);
  return parse(file);
}

function check(label, actual, expected) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a === b) {
    console.log(`  ok  ${label}`);
    return;
  }
  failures += 1;
  console.error(`  FAIL ${label}\n       expected ${b}\n       actual   ${a}`);
}

// -- imports ---------------------------------------------------------------
// Four shapes that all mean "this file depends on that one". Missing any of
// them silently shrinks the dependency graph.
{
  const sf = source(`
import { a, b as c } from './one.js';
import def from './two.js';
import * as ns from './three.js';
import type { T } from './four.js';
import { type U, v } from './five.js';
import './side-effect.js';
`);
  const rows = importsOf(sf);
  check('import: every declaration is one row', rows.map((r) => r.module), [
    './one.js', './two.js', './three.js', './four.js', './five.js', './side-effect.js',
  ]);
  check('import: a renamed binding keeps both names',
    rows[0].names, [
      { imported: 'a', local: 'a', typeOnly: false },
      { imported: 'b', local: 'c', typeOnly: false },
    ]);
  check('import: default and namespace are not named bindings',
    [rows[1].defaultName, rows[2].namespace, rows[1].names.length], ['def', 'ns', 0]);
  check('import: type-only is marked at both levels',
    [rows[3].typeOnly, rows[4].names[0].typeOnly, rows[4].names[1].typeOnly], [true, true, false]);
  check('import: a side-effect import is a real edge with no names',
    [rows[5].module, rows[5].names.length], ['./side-effect.js', 0]);
  check('import: line numbers are 1-based and exact', rows.map((r) => r.line), [2, 3, 4, 5, 6, 7]);
}

// -- re-exports ------------------------------------------------------------
// A re-export is a dependency. Reading it as anything else makes each barrel
// look like it depends on nothing.
{
  const sf = source(`
export { Alpha, Beta as Gamma } from './impl.js';
export * from './all.js';
export type { Delta } from './types.js';
export const local = 1;
`);
  const rows = reExports(sf);
  check('re-export: only declarations with a module specifier count',
    rows.map((r) => r.module), ['./impl.js', './all.js', './types.js']);
  check('re-export: a rename records the exported name, not the local alias',
    rows[0].names, [
      { imported: 'Alpha', local: 'Alpha', typeOnly: false },
      { imported: 'Beta', local: 'Gamma', typeOnly: false },
    ]);
  check('re-export: a star carries no names and says so',
    [rows[1].star, rows[1].names.length, rows[0].star], [true, 0, false]);
  check('re-export: type-only is marked', rows[2].typeOnly, true);
}

// -- dynamic imports -------------------------------------------------------
// The route table reaches most screens only this way.
{
  const sf = source(`
const A = lazyNamed(() => import('./routes/Dashboard.js'), 'Dashboard');
const B = lazy(() => import('./routes/GraphView.js'));
async function c() { return import('./late.js'); }
import { statically } from './static.js';
`);
  const rows = dynamicImports(sf);
  check('dynamic: every call site is found, static ones are not',
    rows.map((r) => r.module), ['./routes/Dashboard.js', './routes/GraphView.js', './late.js']);
  check('dynamic: the lazyNamed shape yields the exported name',
    [rows[0].names, rows[0].loader], [['Dashboard'], 'lazyNamed']);
  check('dynamic: nothing is guessed beyond that shape',
    [rows[1].names, rows[2].names], [[], []]);
  check('dynamic: static imports stay out of this list',
    rows.some((r) => r.module === './static.js'), false);
  check('dynamic: importsOf does not return them either',
    importsOf(sf).map((r) => r.module), ['./static.js']);
}

// -- exports ---------------------------------------------------------------
{
  const sf = source(`
/** Documented. */
export function fn() {}
// Not a doc comment.
export class Cls {}
export interface Iface { a: string }
export type Alias = string;
export enum E { A }
export const schema = z.object({ a: z.string() });
export const router = Router();
export const list = [1, 2];
export const config = { a: 1 };
export const plain = 1;
function notExported() {}
`);
  const rows = exportsOf(sf);
  check('export: nothing unexported leaks in',
    rows.some((r) => r.name === 'notExported'), false);
  check('export: each declaration is classified',
    rows.map((r) => [r.name, r.kind]), [
      ['fn', 'function'], ['Cls', 'class'], ['Iface', 'interface'], ['Alias', 'type'],
      ['E', 'enum'], ['schema', 'schema'], ['router', 'router'], ['list', 'array'],
      ['config', 'object'], ['plain', 'const'],
    ]);
  check('export: a line comment is not documentation',
    [rows[0].doc, rows[1].doc], ['Documented.', null]);
}

// -- calls and literals ----------------------------------------------------
{
  const sf = source(`
router.get('/a', handler);
router.post('/b', handler);
db.selectFrom('people');
helper(1);
export const NAMES = ['one', 'two'];
`);
  check('methodCalls: filtered by both object and method',
    methodCalls(sf, { objects: ['router'], methods: ['get', 'post'] }).map((c) => c.method),
    ['get', 'post']);
  check('methodCalls: an unlisted object is excluded',
    methodCalls(sf, { objects: ['router'], methods: ['selectFrom'] }).length, 0);
  check('functionCalls: bare calls only, not member calls',
    functionCalls(sf).map((c) => c.name), ['helper']);
  check('arrayExport: string members of a named array export',
    arrayExport(sf, 'NAMES'), ['one', 'two']);
  // `null` for "no such export", distinct from `[]` for "declared and empty".
  // A caller asking which mount prefixes exist must be able to tell a renamed
  // constant from a genuinely empty list.
  check('arrayExport: an absent name is null, not an empty list',
    arrayExport(sf, 'MISSING'), null);
  check('arrayExport: a declared-but-empty array is an empty list',
    arrayExport(source('export const NONE: string[] = [];'), 'NONE'), []);
}

// -- tsx and doc comments --------------------------------------------------
{
  const sf = source(`
/**
 * Two lines
 * of documentation.
 */
export function Widget() { return <div className="x" />; }
`, '.tsx');
  check('tsx: JSX parses rather than throwing', exportsOf(sf).map((r) => r.name), ['Widget']);
  check('doc: multi-line documentation is joined', exportsOf(sf)[0].doc, 'Two lines of documentation.');
}

// -- walk and stringOf -----------------------------------------------------
{
  const sf = source("const a = 'x'; const b = `y`;");
  const strings = [];
  walk(sf, (node) => {
    if (ts.isStringLiteralLike(node)) strings.push(stringOf(node));
  });
  check('walk: reaches nested nodes; stringOf reads both quote forms', strings, ['x', 'y']);
  check('lineOf: the first statement is line 1', lineOf(sf, sf.statements[0]), 1);
  check('leadingDoc: a node with no comment yields null', leadingDoc(sf.statements[0], sf), null);
}

rmSync(dir, { recursive: true, force: true });
if (failures) {
  console.error(`\nts-index selftest: ${failures} case(s) failed`);
  process.exit(1);
}
console.log('ts-index selftest: ok');
