/**
 * The generated catalogs, described once.
 *
 * This is the other half of the corpus. Curated pages explain why something is
 * the way it is; these answer what exists, what depends on it and what proves
 * it, and they are derived from the source by scripts rather than written. The
 * separation is the whole point: prose that enumerates what a generator can
 * index is prose nobody keeps up to date.
 *
 * Eleven catalogs, one renderer. Each is described here as a spec — where its
 * data lives, what identifies a row, which few fields are worth a column, and
 * what a reader would want to narrow by — because eleven hand-written tables
 * would be eleven places for the same layout bug and eleven things to update
 * when an artifact gains a field. Everything not given a column is still shown:
 * a row expands to whatever the artifact actually holds, so this surface cannot
 * quietly under-report the file it reads.
 */
import { normalizeForMatch } from '@vitae/core';

/** A value as it came out of the artifact. */
export type Cell = unknown;
export type Row = Readonly<Record<string, Cell>>;

export interface CatalogColumn {
  key: string;
  label: string;
  /** A path, an identifier or a literal, set in the mono face. */
  mono?: boolean;
  /** Numbers align right and use tabular figures. */
  numeric?: boolean;
}

export interface CatalogFacet {
  key: string;
  label: string;
}

export interface CatalogSpec {
  key: string;
  title: string;
  /** One sentence, shown on the reference index and above the table. */
  summary: string;
  /** The artifact file, relative to the content root's `reference/` directory. */
  artifact: string;
  /** The array inside it that holds the rows. */
  collection: string;
  /** The field that names a row. */
  id: string;
  columns: readonly CatalogColumn[];
  facets: readonly CatalogFacet[];
  /** The curated page that explains this catalog, if one does. */
  explains?: string;
  /**
   * Is this artifact generated at build time rather than committed?
   *
   * The per-symbol atlas is too large and too churny to keep in the repository
   * — a rename would rewrite thousands of lines — so it is produced by the
   * build and never committed. A checkout that has not run `pnpm docs:gen` will
   * not have it, and this says so rather than letting the catalog look broken.
   */
  buildTimeOnly?: boolean;
}

export const CATALOGS: readonly CatalogSpec[] = [
  {
    key: 'routes',
    title: 'Routes',
    summary: 'Every address the application serves, and whether reaching it needs a session.',
    artifact: 'routes.json',
    collection: 'routes',
    id: 'path',
    columns: [
      { key: 'path', label: 'Path', mono: true },
      { key: 'access', label: 'Access' },
      { key: 'element', label: 'Screen' },
      { key: 'lazy', label: 'Lazy' },
    ],
    facets: [
      { key: 'access', label: 'Access' },
      { key: 'block', label: 'Route block' },
    ],
    explains: '/docs/use/screens',
  },
  {
    key: 'api',
    title: 'API endpoints',
    summary: 'Every live handler, derived from the routers rather than from the OpenAPI document.',
    artifact: 'api.json',
    collection: 'endpoints',
    id: 'id',
    columns: [
      { key: 'method', label: 'Method' },
      { key: 'path', label: 'Path', mono: true },
      { key: 'mount', label: 'Mount', mono: true },
      { key: 'auth', label: 'Auth' },
    ],
    facets: [
      { key: 'method', label: 'Method' },
      { key: 'mount', label: 'Mount' },
      { key: 'auth', label: 'Auth' },
    ],
    explains: '/docs/architecture/request-lifecycle',
  },
  {
    key: 'config',
    title: 'Configuration',
    summary: 'Every environment key, where it is read, and whether anything validates it.',
    artifact: 'config.json',
    collection: 'keys',
    id: 'name',
    columns: [
      { key: 'name', label: 'Key', mono: true },
      { key: 'scope', label: 'Scope' },
      { key: 'type', label: 'Type' },
      { key: 'validated', label: 'Validated' },
    ],
    facets: [
      { key: 'scope', label: 'Scope' },
      { key: 'section', label: 'Section' },
      { key: 'validated', label: 'Validated' },
    ],
    explains: '/docs/operate/configuration',
  },
  {
    key: 'algorithms',
    title: 'Algorithms',
    summary: 'The deterministic modules in the core package, their exports and their tuned constants.',
    artifact: 'algorithms.json',
    collection: 'modules',
    id: 'id',
    columns: [
      { key: 'id', label: 'Module', mono: true },
      { key: 'title', label: 'Title' },
      { key: 'kind', label: 'Kind' },
      { key: 'consumer_count', label: 'Used by', numeric: true },
    ],
    facets: [
      { key: 'kind', label: 'Kind' },
      { key: 'pure', label: 'Pure' },
    ],
    explains: '/docs/architecture/algorithms',
  },
  {
    key: 'database',
    title: 'Database tables',
    summary: 'Every table, the migration that created it, and the code that reads and writes it.',
    artifact: 'database.json',
    collection: 'tables',
    id: 'name',
    columns: [
      { key: 'name', label: 'Table', mono: true },
      { key: 'created_in', label: 'Created in', mono: true },
      { key: 'description', label: 'What it holds' },
    ],
    facets: [{ key: 'created_in', label: 'Created in' }],
    explains: '/docs/architecture/persistence',
  },
  {
    key: 'migrations',
    title: 'Migrations',
    summary: 'Every migration in order, what it creates and alters, and whether it can be reversed.',
    artifact: 'database.json',
    collection: 'migrations',
    id: 'id',
    columns: [
      { key: 'id', label: 'Migration', mono: true },
      { key: 'title', label: 'What it does' },
      { key: 'reversible', label: 'Reversible' },
    ],
    facets: [{ key: 'reversible', label: 'Reversible' }],
    explains: '/docs/operate/migrations',
  },
  {
    key: 'tokens',
    title: 'Design tokens',
    summary: 'Every custom property, its value, where it is declared and what consumes it.',
    artifact: 'tokens.json',
    collection: 'tokens',
    id: 'name',
    columns: [
      { key: 'name', label: 'Token', mono: true },
      { key: 'value', label: 'Value', mono: true },
      { key: 'section', label: 'Section' },
    ],
    facets: [{ key: 'section', label: 'Section' }],
    explains: '/docs/design/tokens',
  },
  {
    key: 'components',
    title: 'Design system',
    summary: 'Every component and hook in the design system, its props and whether it is tested.',
    artifact: 'components.json',
    collection: 'components',
    id: 'name',
    columns: [
      { key: 'name', label: 'Component', mono: true },
      { key: 'module', label: 'Module', mono: true },
      { key: 'section', label: 'Section' },
      { key: 'tested', label: 'Tested' },
    ],
    facets: [
      { key: 'section', label: 'Section' },
      { key: 'module', label: 'Module' },
      { key: 'tested', label: 'Tested' },
    ],
    explains: '/docs/design/patterns',
  },
  {
    key: 'packages',
    title: 'Packages',
    summary: 'The workspace packages, what each owns, and which of them depend on it.',
    artifact: 'packages.json',
    collection: 'packages',
    id: 'name',
    columns: [
      { key: 'name', label: 'Package', mono: true },
      { key: 'layer', label: 'Layer' },
      { key: 'source_files', label: 'Files', numeric: true },
      { key: 'source_lines', label: 'Lines', numeric: true },
    ],
    facets: [{ key: 'layer', label: 'Layer' }],
    explains: '/docs/architecture/system-overview',
  },
  {
    key: 'tests',
    title: 'Tests',
    summary: 'Every test file, how many cases it holds, and whether continuous integration runs it.',
    artifact: 'tests.json',
    collection: 'tests',
    id: 'file',
    columns: [
      { key: 'file', label: 'File', mono: true },
      { key: 'package', label: 'Package' },
      { key: 'cases', label: 'Cases', numeric: true },
      { key: 'run_in_ci', label: 'In CI' },
    ],
    facets: [
      { key: 'package', label: 'Package' },
      { key: 'run_in_ci', label: 'In CI' },
    ],
    explains: '/docs/develop/testing',
  },
  {
    key: 'atlas',
    title: 'Engineering atlas',
    summary: 'Every source file, what it exports, what it imports, what imports it, and what tests it.',
    artifact: 'atlas.json',
    collection: 'files',
    id: 'file',
    buildTimeOnly: true,
    columns: [
      { key: 'file', label: 'File', mono: true },
      { key: 'package', label: 'Package' },
      { key: 'kind', label: 'Kind' },
      { key: 'lines', label: 'Lines', numeric: true },
    ],
    facets: [
      { key: 'package', label: 'Package' },
      { key: 'kind', label: 'Kind' },
    ],
    explains: '/docs/architecture/system-overview',
  },
  {
    key: 'requirements',
    title: 'Requirements',
    summary: 'Every registered requirement, the capability it belongs to, and whether it ships.',
    artifact: 'requirements.json',
    collection: 'requirements',
    id: 'id',
    columns: [
      { key: 'id', label: 'Identifier', mono: true },
      { key: 'title', label: 'Requirement' },
      { key: 'implementation_status', label: 'Status' },
      { key: 'capability', label: 'Capability', mono: true },
    ],
    facets: [
      { key: 'implementation_status', label: 'Status' },
      { key: 'capability', label: 'Capability' },
      { key: 'definition_provenance', label: 'Where the wording came from' },
    ],
    explains: '/docs/product/capabilities',
  },
];

export function catalogByKey(key: string): CatalogSpec | undefined {
  return CATALOGS.find((catalog) => catalog.key === key);
}

// ---------------------------------------------------------------------------
// Reading a row without knowing its shape
// ---------------------------------------------------------------------------

/**
 * A value as a reader should see it.
 *
 * `null` and `undefined` become an em dash rather than the word "null", which
 * is a JavaScript fact and not a documentation one. A boolean becomes yes or
 * no, because a column headed "Validated" holding the word `false` reads as a
 * value rather than as an answer.
 */
export function cellText(value: Cell): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) return value.length === 0 ? '—' : value.map(cellText).join(', ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/** The text a row is searched by: every scalar in it, flattened once. */
export function rowText(row: Row): string {
  const parts: string[] = [];
  const walk = (value: Cell, depth: number) => {
    if (value === null || value === undefined) return;
    if (Array.isArray(value)) {
      if (depth > 2) return;
      for (const item of value) walk(item, depth + 1);
      return;
    }
    if (typeof value === 'object') {
      if (depth > 2) return;
      for (const item of Object.values(value as Record<string, Cell>)) walk(item, depth + 1);
      return;
    }
    parts.push(String(value));
  };
  walk(row, 0);
  return normalizeForMatch(parts.join(' '));
}

export type Selection = Readonly<Record<string, readonly string[]>>;

/**
 * The distinct values of a facet, with how many rows carry each.
 *
 * Counted over the rows the *other* facets and the query already allow, so a
 * reader narrowing by two things at once sees counts that describe what is
 * actually reachable rather than what the catalog holds in total.
 */
export function facetValues(
  rows: readonly Row[],
  facet: CatalogFacet,
): readonly { value: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const raw = row[facet.key];
    const values = Array.isArray(raw) ? raw.map(cellText) : [cellText(raw)];
    for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}

function allows(row: Row, key: string, chosen: readonly string[]): boolean {
  if (chosen.length === 0) return true;
  const raw = row[key];
  const values = Array.isArray(raw) ? raw.map(cellText) : [cellText(raw)];
  return chosen.some((value) => values.includes(value));
}

/**
 * The rows a query and a set of chosen facet values leave.
 *
 * Words are required to all be present, in any order and anywhere in the row.
 * A catalog filter is not a ranked search: someone typing two words is naming
 * two constraints, and returning rows that satisfy only one of them would make
 * the second word do nothing.
 */
export function filterRows(rows: readonly Row[], query: string, selection: Selection): readonly Row[] {
  const words = normalizeForMatch(query).split(' ').filter(Boolean);
  return rows.filter((row) => {
    for (const [key, chosen] of Object.entries(selection)) {
      if (!allows(row, key, chosen)) return false;
    }
    if (words.length === 0) return true;
    const text = rowText(row);
    return words.every((word) => text.includes(word));
  });
}

/** The fields of a row that no column already shows, in the artifact's own order. */
export function detailFields(spec: CatalogSpec, row: Row): readonly (readonly [string, Cell])[] {
  const shown = new Set(spec.columns.map((column) => column.key));
  return Object.entries(row).filter(([key, value]) => {
    if (shown.has(key)) return false;
    return !(value === null || value === undefined || value === '' || (Array.isArray(value) && value.length === 0));
  });
}
