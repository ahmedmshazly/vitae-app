/**
 * The catalog specs, and the filtering that reads them.
 *
 * The last test is the one that earns its place: it opens the real generated
 * artifacts and checks that every column and facet names a field they actually
 * contain. A spec is written once and then never looked at again, so the way it
 * fails is silent — a generator renames a field, the column keeps rendering, and
 * every cell in it quietly reads as an em dash. This catches that at the moment
 * the generator changes rather than the day someone notices.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CATALOGS,
  type Row,
  catalogByKey,
  cellText,
  detailFields,
  facetValues,
  filterRows,
  rowText,
} from './docsReference.js';

const rows: readonly Row[] = [
  { path: '/career', access: 'private', lazy: true, params: [], note: null },
  { path: '/pricing', access: 'public', lazy: false, params: [], note: 'Marketing.' },
  { path: '/n/:id', access: 'private', lazy: true, params: ['id'], note: null },
];

const spec = catalogByKey('routes')!;

describe('showing a value a reader did not write', () => {
  it('says nothing rather than the word null', () => {
    expect(cellText(null)).toBe('—');
    expect(cellText(undefined)).toBe('—');
    expect(cellText('')).toBe('—');
    expect(cellText([])).toBe('—');
  });

  it('answers a yes-or-no column with yes or no', () => {
    // A column headed "Validated" holding the word `false` reads as a value
    // rather than as an answer.
    expect(cellText(true)).toBe('Yes');
    expect(cellText(false)).toBe('No');
  });

  it('joins a list and keeps a number a number', () => {
    expect(cellText(['a', 'b'])).toBe('a, b');
    expect(cellText(0)).toBe('0');
  });
});

describe('what a row can be searched by', () => {
  it('flattens every scalar in it, however deep the artifact nests', () => {
    const text = rowText({ a: 'Alpha', b: { c: 'Bravo' }, d: ['Charlie'] });
    expect(text).toContain('alpha');
    expect(text).toContain('bravo');
    expect(text).toContain('charlie');
  });

  it('stops before it walks a whole nested artifact into one string', () => {
    const deep = { a: { b: { c: { d: { e: 'buried' } } } } };
    expect(rowText(deep)).not.toContain('buried');
  });
});

describe('narrowing a catalog', () => {
  it('returns everything when nothing is asked', () => {
    expect(filterRows(rows, '', {})).toHaveLength(3);
  });

  it('requires every word, because a second word that does nothing is a bug', () => {
    expect(filterRows(rows, 'career', {}).map((r) => r.path)).toStrictEqual(['/career']);
    expect(filterRows(rows, 'private', {})).toHaveLength(2);
    expect(filterRows(rows, 'career pricing', {})).toHaveLength(0);
  });

  it('searches what a row says, not what its fields are called', () => {
    // A reader sees column labels, never the artifact's field names, so
    // matching on a key would make a word work that they cannot see.
    expect(filterRows(rows, 'access', {})).toHaveLength(0);
    expect(filterRows(rows, 'public', {})).toHaveLength(1);
  });

  it('matches a word anywhere in the row, not only in a column', () => {
    expect(filterRows(rows, 'marketing', {}).map((r) => r.path)).toStrictEqual(['/pricing']);
  });

  it('filters by facet, and by two facet values as an either-or', () => {
    expect(filterRows(rows, '', { access: ['public'] })).toHaveLength(1);
    expect(filterRows(rows, '', { access: ['public', 'private'] })).toHaveLength(3);
  });

  it('combines a query with a facet as an and', () => {
    expect(filterRows(rows, 'lazy', { access: ['public'] })).toHaveLength(0);
  });

  it('ignores a facet with nothing chosen', () => {
    expect(filterRows(rows, '', { access: [] })).toHaveLength(3);
  });
});

describe('counting facet values', () => {
  it('counts each distinct value, commonest first', () => {
    expect(facetValues(rows, { key: 'access', label: 'Access' })).toStrictEqual([
      { value: 'private', count: 2 },
      { value: 'public', count: 1 },
    ]);
  });

  it('counts a row once per value when the field is a list', () => {
    const tagged = [{ tags: ['a', 'b'] }, { tags: ['a'] }];
    expect(facetValues(tagged, { key: 'tags', label: 'Tags' })).toStrictEqual([
      { value: 'a', count: 2 },
      { value: 'b', count: 1 },
    ]);
  });
});

describe('what an expanded row shows', () => {
  it('leaves out what a column already showed', () => {
    const keys = detailFields(spec, rows[0]!).map(([key]) => key);
    for (const column of spec.columns) expect(keys).not.toContain(column.key);
  });

  it('leaves out fields with nothing in them', () => {
    const keys = detailFields(spec, rows[0]!).map(([key]) => key);
    expect(keys).not.toContain('note');
    expect(keys).not.toContain('params');
  });

  it('keeps a field a column forgot', () => {
    const keys = detailFields(spec, rows[1]!).map(([key]) => key);
    expect(keys).toContain('note');
  });
});

describe('the specs against the artifacts they read', () => {
  const root = resolve(__dirname, '../../../../..');
  const where = (file: string) =>
    resolve(root, file === 'requirements.json' ? 'docs/registry' : 'docs/generated', file);
  const artifact = (file: string): Record<string, unknown> =>
    JSON.parse(readFileSync(where(file), 'utf8'));

  it.each(CATALOGS.map((catalog) => [catalog.key, catalog] as const))(
    'the %s catalog names fields its artifact really has',
    (_key, catalog) => {
      if (catalog.buildTimeOnly && !existsSync(where(catalog.artifact))) {
        // Generated by the build and never committed, so a checkout that has
        // not run `pnpm docs:gen` genuinely does not have it. Continuous
        // integration regenerates before this runs, so the check still happens
        // where it matters.
        return;
      }
      const data = artifact(catalog.artifact);
      const collection = data[catalog.collection];
      expect(Array.isArray(collection), `${catalog.artifact} has no ${catalog.collection} list`).toBe(
        true,
      );
      const list = collection as readonly Row[];
      expect(list.length).toBeGreaterThan(0);
      const fields = new Set(Object.keys(list[0]!));
      expect(fields.has(catalog.id), `${catalog.key}: id field ${catalog.id}`).toBe(true);
      for (const column of catalog.columns) {
        expect(fields.has(column.key), `${catalog.key}: column ${column.key}`).toBe(true);
      }
      for (const facet of catalog.facets) {
        expect(fields.has(facet.key), `${catalog.key}: facet ${facet.key}`).toBe(true);
      }
    },
  );

  it('gives every catalog a distinct key and a page to reach it by', () => {
    const keys = CATALOGS.map((catalog) => catalog.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const key of keys) expect(catalogByKey(key)?.key).toBe(key);
    expect(catalogByKey('nothing')).toBeUndefined();
  });
});
