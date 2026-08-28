#!/usr/bin/env node
/**
 * Build docs/generated/database.json: every table, its columns, its indexes,
 * the migration that created it, and the code that queries it.
 *
 * Two sources, because they answer different questions and neither answers
 * both. `apps/api/src/db/schema.ts` is Kysely's typed view, authoritative for
 * what the running application believes exists right now, and the only place
 * the columns carry documentation. The migrations under db/migrations are the
 * history, the only place indexes, constraints and extensions appear at all,
 * since Kysely's model has no concept of an index.
 *
 * Reading only the schema would produce a catalog with no indexes, which for a
 * database whose entire design rests on generated columns being indexable
 * would omit the point. Reading only the migrations means interpreting DDL
 * through two helper functions and a shared `BASE` fragment, and being wrong
 * about the current shape wherever a later migration altered it. So: shape and
 * documentation from the schema, history and physical design from the
 * migrations, and the disagreements between them reported rather than merged.
 */
import { readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { parse, ts, lineOf, leadingDoc, methodCalls, walk } from './lib/ts-index.mjs';
import { emit } from './lib/emit.mjs';
import { citationsIn, compareIds, optionsFrom } from './lib/citations.mjs';
import { root, sourceFiles, isTest } from './lib/workspace.mjs';

const cite = optionsFrom(JSON.parse(readFileSync(join(root, 'docs/registry/requirements.json'), 'utf8')));
const SCHEMA = 'apps/api/src/db/schema.ts';
const MIGRATIONS = 'apps/api/src/db/migrations';

function firstSentence(doc) {
  if (!doc) return null;
  const match = doc.match(/^(.*?[.!?])(\s|$)/s);
  return (match ? match[1] : doc).replace(/\s+/g, ' ').trim() || null;
}

/* ── Shape, from Kysely's typed view ─────────────────────────────────────── */

const schemaFile = parse(join(root, SCHEMA));
const interfaces = new Map();
for (const st of schemaFile.statements) {
  if (!ts.isInterfaceDeclaration(st)) continue;
  interfaces.set(st.name.text, st);
}

/**
 * Columns of an interface, following `extends DocTable<...>` to the base.
 *
 * Most tables here declare only their own promoted columns and inherit
 * `space`, `workspace_id`, `id` and `data` from `DocTable`. A reader who is
 * told `nodes` has five columns has been told something false.
 */
function columnsOf(name, seen = new Set()) {
  const decl = interfaces.get(name);
  if (!decl || seen.has(name)) return [];
  seen.add(name);
  const out = [];
  for (const clause of decl.heritageClauses ?? []) {
    for (const type of clause.types) {
      const base = type.expression.getText(schemaFile);
      out.push(...columnsOf(base, seen).map((c) => ({ ...c, inherited_from: base })));
    }
  }
  for (const member of decl.members) {
    if (!ts.isPropertySignature(member)) continue;
    const type = member.type?.getText(schemaFile).replace(/\s+/g, ' ') ?? 'unknown';
    out.push({
      name: member.name.getText(schemaFile).replace(/['"]/g, ''),
      type,
      // `GeneratedAlways` is the invariant the whole design rests on: Postgres
      // computes the value from `data`, and the type makes writing it an error,
      // so the indexed copy cannot drift from the document.
      writable: !/^GeneratedAlways</.test(type),
      generated: /^Generated(Always)?</.test(type),
      optional: Boolean(member.questionToken) || /\bnull\b/.test(type),
      doc: firstSentence(leadingDoc(member, schemaFile)),
      inherited_from: null,
      source: `${SCHEMA}:${lineOf(schemaFile, member)}`,
    });
  }
  // A subclass column shadows the inherited one of the same name.
  const byName = new Map();
  for (const column of out) byName.set(column.name, column);
  return [...byName.values()];
}

const tables = new Map();
for (const st of schemaFile.statements) {
  if (!ts.isInterfaceDeclaration(st) || st.name.text !== 'Database') continue;
  for (const member of st.members) {
    if (!ts.isPropertySignature(member)) continue;
    const name = member.name.getText(schemaFile).replace(/['"]/g, '');
    const iface = member.type.getText(schemaFile).replace(/<.*>$/s, '').trim();
    const doc = leadingDoc(member, schemaFile);
    tables.set(name, {
      name,
      interface: iface,
      description: firstSentence(doc) ?? firstSentence(leadingDoc(interfaces.get(iface) ?? member, schemaFile)),
      columns: columnsOf(iface),
      requirements: [],
      created_in: null,
      altered_in: [],
      indexes: [],
      queried_by: [],
      source: `${SCHEMA}:${lineOf(schemaFile, member)}`,
    });
  }
}

/* ── History and physical design, from the migrations ────────────────────── */

/**
 * The text of every `sql` tagged template in a file, with interpolations kept
 * as `${...}` markers.
 *
 * A template's substitutions are not always values: `${BASE}` is a shared
 * column fragment, `${sql.raw(name)}` is a table name that arrived as a
 * function parameter. Substituting them properly would mean evaluating the
 * module. Leaving the marker in place keeps the DDL readable and, more to the
 * point, keeps a table name that this reader could not resolve visibly
 * unresolved instead of silently absent.
 */
function sqlTemplates(sf) {
  const out = [];
  walk(sf, (node) => {
    if (!ts.isTaggedTemplateExpression(node)) return;
    const tag = node.tag.getText(sf).replace(/\s+/g, '');
    if (tag !== 'sql' && tag !== 'sql.raw') return;
    const template = node.template;
    let text = '';
    if (ts.isNoSubstitutionTemplateLiteral(template)) {
      text = template.text;
    } else {
      text = template.head.text;
      for (const span of template.templateSpans) {
        text += `\${${span.expression.getText(sf).replace(/\s+/g, ' ')}}` + span.literal.text;
      }
    }
    out.push({ text: text.replace(/\s+/g, ' ').trim(), line: lineOf(sf, node), node });
  });
  return out;
}

/**
 * The string values of the array a node is being iterated over, if any.
 *
 * Two of the thirty-two tables are created inside `for (const child of
 * ['import_rows', 'import_raw_chunks'])`, so their names never appear next to
 * the words CREATE TABLE: the DDL says `CREATE TABLE ${sql.raw(child)}` and
 * the names are in the array above it. Without this they are real tables in a
 * shipped migration that the catalog reports as belonging to no migration at
 * all, which is the one thing a migration catalog exists to answer.
 */
function iteratedStrings(node) {
  for (let cur = node.parent; cur; cur = cur.parent) {
    if (!ts.isForOfStatement(cur)) continue;
    const iterated = ts.isAsExpression(cur.expression) ? cur.expression.expression : cur.expression;
    if (ts.isArrayLiteralExpression(iterated)) {
      return iterated.elements.filter(ts.isStringLiteralLike).map((e) => e.text);
    }
  }
  return [];
}

const migrations = [];
for (const rel of sourceFiles(MIGRATIONS, { tests: false })) {
  const sf = parse(join(root, rel));
  const id = basename(rel, '.ts');
  const doc = leadingDoc(sf.statements[0], sf);

  /**
   * Functions in this file that create tables. `docTable(db, 'atoms', ...)` is
   * where twenty of the thirty-two tables are actually named; a reader that
   * only matched `CREATE TABLE` in template text would find the twelve written
   * out longhand and miss the rest.
   */
  const creators = new Set();
  for (const st of sf.statements) {
    if (!ts.isFunctionDeclaration(st) || !st.name) continue;
    if (/CREATE TABLE/i.test(st.getText(sf))) creators.add(st.name.text);
  }

  const created = new Set();
  const altered = new Set();
  const indexes = [];
  const extensions = new Set();

  for (const { text, line, node } of sqlTemplates(sf)) {
    for (const m of text.matchAll(/CREATE TABLE (?:IF NOT EXISTS )?([a-z_][a-z0-9_]*)/gi)) created.add(m[1]);
    if (/CREATE TABLE (?:IF NOT EXISTS )?\$\{/i.test(text)) {
      for (const name of iteratedStrings(node)) created.add(name);
    }
    for (const m of text.matchAll(/ALTER TABLE (?:IF EXISTS )?(?:ONLY )?([a-z_][a-z0-9_]*)/gi)) altered.add(m[1]);
    for (const m of text.matchAll(/CREATE EXTENSION (?:IF NOT EXISTS )?([a-z_][a-z0-9_]*)/gi)) extensions.add(m[1]);
    for (const m of text.matchAll(
      /CREATE (UNIQUE )?INDEX (?:CONCURRENTLY )?(?:IF NOT EXISTS )?([a-z_][a-z0-9_]*) ON ([a-z_][a-z0-9_]*)([^;]*)/gi,
    )) {
      const [, unique, name, table, tail] = m;
      indexes.push({
        name,
        table,
        unique: Boolean(unique),
        // A partial index is a design decision worth surfacing: it is why the
        // soft-deleted rows are not merely filtered out of a query, they are
        // not in the index at all.
        partial: / WHERE /i.test(tail),
        method: /USING (\w+)/i.exec(tail)?.[1]?.toLowerCase() ?? 'btree',
        definition: `CREATE ${unique ? 'UNIQUE ' : ''}INDEX ${name} ON ${table}${tail}`.replace(/\s+/g, ' ').trim(),
        migration: id,
        source: `${rel}:${line}`,
      });
    }
  }

  // Helper call sites: the string argument that names the table.
  walk(sf, (node) => {
    if (!ts.isCallExpression(node) || !ts.isIdentifier(node.expression)) return;
    if (!creators.has(node.expression.text)) return;
    const literal = node.arguments.find((a) => ts.isStringLiteralLike(a) && /^[a-z_][a-z0-9_]*$/.test(a.text));
    if (literal) {
      created.add(literal.text);
      return;
    }
    for (const name of iteratedStrings(node)) created.add(name);
  });

  // A migration that lists table names in a `const DOC_TABLES = [...] as const`
  // is altering every one of them; 007 partitions twenty-four tables that way.
  for (const st of sf.statements) {
    if (!ts.isVariableStatement(st)) continue;
    for (const decl of st.declarationList.declarations) {
      const init = ts.isAsExpression(decl.initializer ?? {}) ? decl.initializer.expression : decl.initializer;
      if (!init || !ts.isArrayLiteralExpression(init)) continue;
      const names = init.elements.filter(ts.isStringLiteralLike).map((e) => e.text);
      if (names.length < 3 || !names.every((n) => /^[a-z_][a-z0-9_]*$/.test(n))) continue;
      for (const name of names) if (tables.has(name)) altered.add(name);
    }
  }

  migrations.push({
    id,
    file: rel,
    title: firstSentence(doc),
    description: doc,
    requirements: citationsIn(doc ?? '', cite).sort(compareIds),
    creates: [...created].sort(),
    alters: [...altered].filter((t) => !created.has(t)).sort(),
    indexes: indexes.map((i) => i.name),
    extensions: [...extensions].sort(),
    // A migration without a `down` cannot be rolled back, which is an
    // operational fact a runbook has to know before it promises one.
    reversible: sf.statements.some((st) => ts.isFunctionDeclaration(st) && st.name?.text === 'down'),
  });

  for (const name of created) {
    const table = tables.get(name);
    if (table) table.created_in ??= id;
  }
  for (const name of altered) tables.get(name)?.altered_in.push(id);
  for (const index of indexes) tables.get(index.table)?.indexes.push(index);
}

/* ── Consumers, from the query builder ───────────────────────────────────── */

const QUERY_METHODS = ['selectFrom', 'insertInto', 'updateTable', 'deleteFrom', 'replaceInto'];
const AREAS = ['apps/api/src', 'packages/testkit/src', 'services/buildsvc/src'];

/**
 * Where this codebase says a value is a table name.
 *
 * Almost nothing here names a table in a Kysely call. Twenty-four of the
 * thirty-two tables hold identically shaped documents reached through one
 * generic repository (`repository.docGet('atoms', id)`), and the export bundle
 * names its collections in a declarative manifest. A scan for `selectFrom`
 * finds the eight relational tables and reports the rest of the graph, the
 * career graph included, as never queried.
 *
 * The alternative, treating any string that equals a table name as a
 * reference, is worse than the gap it fixes. `meta`, `tags` and `templates`
 * are ordinary words that appear all over an application, and a catalog that
 * cannot tell a table from a noun is not evidence of anything.
 *
 * So the annotation is the rule. `TableName` is a real type in this repository
 * and every position that holds a table name is declared with it, in exactly
 * two forms:
 *
 *   docGet(table: TableName, ...)            a parameter, at a known index
 *   { file: string; table: TableName }     a property, under a known name
 *
 * Reading those eighteen declarations yields the call signatures and property
 * names to look for. Nothing is inferred: a string is a table reference because
 * the surrounding type says the position holds one.
 */
function tableNamePositions() {
  const params = new Map();
  const props = new Set();
  const declared = (node, sf) =>
    node.parameters.findIndex((p) => p.type?.getText(sf).trim() === 'TableName');

  for (const dir of AREAS) {
    for (const rel of sourceFiles(dir, { tests: false })) {
      let sf;
      try { sf = parse(join(root, rel)); } catch { continue; }
      walk(sf, (node) => {
        if (ts.isPropertySignature(node) && node.type?.getText(sf).trim() === 'TableName') {
          if (ts.isIdentifier(node.name)) props.add(node.name.text);
          return;
        }
        // An arrow assigned to a `const` is named by its variable, not itself.
        const named = ts.isVariableDeclaration(node) && node.initializer
          && (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))
          ? [node.name, node.initializer]
          : (ts.isMethodDeclaration(node) || ts.isFunctionDeclaration(node)) && node.name
            ? [node.name, node]
            : null;
        if (!named) return;
        const [name, fn] = named;
        if (!ts.isIdentifier(name)) return;
        const index = declared(fn, sf);
        if (index >= 0) params.set(name.text, index);
      });
    }
  }
  return { params, props };
}


const { params: accessors, props: tableProps } = tableNamePositions();
for (const dir of AREAS) {
  for (const rel of sourceFiles(dir)) {
    let sf;
    try { sf = parse(join(root, rel)); } catch { continue; }
    for (const call of methodCalls(sf, {})) {
      const viaQueryBuilder = QUERY_METHODS.includes(call.method);
      const position = accessors.get(call.method);
      if (!viaQueryBuilder && position === undefined) continue;
      const arg = call.args[viaQueryBuilder ? 0 : position];
      if (!arg || !ts.isStringLiteralLike(arg)) continue;
      const table = tables.get(arg.text);
      if (!table) continue;
      table.queried_by.push({
        file: rel,
        method: call.method,
        access: viaQueryBuilder ? 'query-builder' : 'repository',
        line: call.line,
        test: isTest(rel),
      });
    }
    walk(sf, (node) => {
      if (!ts.isPropertyAssignment(node) || !ts.isIdentifier(node.name)) return;
      if (!tableProps.has(node.name.text) || !ts.isStringLiteralLike(node.initializer)) return;
      const table = tables.get(node.initializer.text);
      if (!table) return;
      table.queried_by.push({
        file: rel,
        method: node.name.text,
        access: 'declared',
        line: lineOf(sf, node),
        test: isTest(rel),
      });
    });
  }
}

for (const table of tables.values()) {
  const unique = new Map();
  for (const q of table.queried_by) unique.set(`${q.file}::${q.method}`, q);
  table.queried_by = [...unique.values()].sort((a, b) => a.file.localeCompare(b.file) || a.method.localeCompare(b.method));
  table.indexes.sort((a, b) => a.name.localeCompare(b.name));
  table.altered_in = [...new Set(table.altered_in)].sort();
  // A repository verb says which it is as plainly as the Kysely one does.
  const READS = /^(selectFrom|docGet|docList|docQuery|docCount|docIds)/;
  table.reads = table.queried_by.filter(
    (q) => !q.test && (READS.test(q.method) || q.access === 'declared'),
  ).length;
  table.writes = table.queried_by.filter((q) => !q.test && !READS.test(q.method)).length;
}

const list = [...tables.values()].sort((a, b) => a.name.localeCompare(b.name));
const allIndexes = list.flatMap((t) => t.indexes);

// Tables the migrations create that Kysely does not model are reachable only
// through raw SQL, a real fact about the system, not a defect in this reader.
const modelled = new Set(list.map((t) => t.name));
const unmodelled = [...new Set(migrations.flatMap((m) => m.creates))].filter((t) => !modelled.has(t) && !t.startsWith('${')).sort();

emit(
  {
    tables: list,
    migrations,
    indexes: allIndexes.sort((a, b) => a.name.localeCompare(b.name)),
    summary: {
      tables: list.length,
      columns: list.reduce((n, t) => n + t.columns.length, 0),
      indexes: allIndexes.length,
      partial_indexes: allIndexes.filter((i) => i.partial).length,
      migrations: migrations.length,
      irreversible: migrations.filter((m) => !m.reversible).map((m) => m.id),
      extensions: [...new Set(migrations.flatMap((m) => m.extensions))].sort(),
      // A table with no creating migration is one this reader could not trace,
      // which is a finding about the join, not about the database.
      untraced: list.filter((t) => !t.created_in).map((t) => t.name),
      unmodelled_in_kysely: unmodelled,
      never_queried: list.filter((t) => !t.queried_by.length).map((t) => t.name),
    },
  },
  'docs/generated/database.json',
  root,
  (a) =>
    `database: ${a.summary.tables} tables, ${a.summary.columns} columns, ` +
    `${a.summary.indexes} indexes (${a.summary.partial_indexes} partial) across ` +
    `${a.summary.migrations} migrations` +
    (a.summary.untraced.length ? `; untraced: ${a.summary.untraced.join(', ')}` : ''),
);
