import { describe, expect, it } from 'vitest';
import {
  changedFields,
  deepEqual,
  patchForFields,
  readField,
  statedFieldsOnly,
  SYNC_BOOKKEEPING_FIELDS,
} from './convergence.js';

describe('changedFields', () => {
  it('reports nothing when the import would write what is already stored', () => {
    const stored = { title: 'Sarah Chen', props: { city: 'Berlin', emails: ['s@n.test'] } };
    const incoming = { title: 'Sarah Chen', props: { city: 'Berlin', emails: ['s@n.test'] } };
    expect(changedFields(stored, incoming)).toEqual([]);
  });

  it('names the one nested field that moved, not the whole props bag', () => {
    const stored = { title: 'Sarah Chen', props: { city: 'Berlin', headline: 'Staff SWE' } };
    const incoming = { title: 'Sarah Chen', props: { city: 'Cairo', headline: 'Staff SWE' } };
    expect(changedFields(stored, incoming)).toEqual([
      { key: 'props.city', from: 'Berlin', to: 'Cairo' },
    ]);
  });

  it('ignores stored fields the importer never sets, since absence is not removal', () => {
    const stored = { title: 'Sarah Chen', notes_md: 'hand written', props: { city: 'Berlin' } };
    const incoming = { title: 'Sarah Chen' };
    expect(changedFields(stored, incoming)).toEqual([]);
  });

  it('skips undefined incoming values, which mean the source said nothing', () => {
    const stored = { title: 'Sarah Chen', props: { city: 'Berlin' } };
    const incoming = { title: 'Sarah Chen', subtitle: undefined, props: { city: undefined } };
    expect(changedFields(stored, incoming)).toEqual([]);
  });

  it('reports a nested field the record does not have yet', () => {
    const stored = { props: { city: 'Berlin' } };
    const incoming = { props: { headline: 'Staff SWE' } };
    expect(changedFields(stored, incoming)).toEqual([
      { key: 'props.headline', from: undefined, to: 'Staff SWE' },
    ]);
  });

  it('descends into props even when the record has none at all', () => {
    expect(changedFields({}, { props: { city: 'Cairo' } })).toEqual([
      { key: 'props.city', from: undefined, to: 'Cairo' },
    ]);
  });

  it('does not report a props bag rewritten in a different key order', () => {
    // Bags are rebuilt from scratch on every import, so a serialise-and-compare
    // shortcut would call this a change and the unchanged bucket would be zero.
    const stored = { props: { city: 'Berlin', headline: 'Staff SWE' } };
    const incoming = { props: { headline: 'Staff SWE', city: 'Berlin' } };
    expect(changedFields(stored, incoming)).toEqual([]);
  });

  it('treats a reordered array as a change, because the value really differs', () => {
    const stored = { props: { emails: ['a@x.test', 'b@x.test'] } };
    const incoming = { props: { emails: ['b@x.test', 'a@x.test'] } };
    expect(changedFields(stored, incoming)).toHaveLength(1);
  });

  it('excludes an ignored dotted key', () => {
    const stored = { props: { stars: 3, last_synced_at: '2026-08-01T00:00:00.000Z' } };
    const incoming = { props: { stars: 3, last_synced_at: '2026-08-27T00:00:00.000Z' } };
    expect(changedFields(stored, incoming, { ignore: ['props.last_synced_at'] })).toEqual([]);
  });

  it('keeps a real change on a record whose bookkeeping also moved', () => {
    const stored = { props: { stars: 3, last_synced_at: '2026-08-01T00:00:00.000Z' } };
    const incoming = { props: { stars: 9, last_synced_at: '2026-08-27T00:00:00.000Z' } };
    expect(changedFields(stored, incoming, { ignore: SYNC_BOOKKEEPING_FIELDS })).toEqual([
      { key: 'props.stars', from: 3, to: 9 },
    ]);
  });
});

describe('SYNC_BOOKKEEPING_FIELDS', () => {
  it('covers the GitHub sync stamp that moves on every run', () => {
    // Without this exclusion every synced repository reads as changed forever,
    // and the unchanged bucket of the batch report is permanently zero.
    expect(SYNC_BOOKKEEPING_FIELDS).toContain('props.last_synced_at');
  });
});

describe('statedFieldsOnly', () => {
  it('drops the empty values an importer has to invent to create a record', () => {
    expect(
      statedFieldsOnly({
        title: 'Sarah Chen',
        notes_md: '',
        props: { emails: ['s@n.test'], phones: [], socials: {}, city: undefined },
      }),
    ).toEqual({ title: 'Sarah Chen', props: { emails: ['s@n.test'] } });
  });

  it('stops a sparse export from proposing to wipe what is already stored', () => {
    // A vCard with no TEL still parses to phones: [], and comparing that would
    // offer to delete the phone numbers on the record.
    const stored = { props: { phones: ['+20 100 555 0101'], emails: ['s@n.test'] } };
    const sparse = { props: { emails: ['s@n.test'], phones: [] } };
    expect(changedFields(stored, statedFieldsOnly(sparse))).toEqual([]);
  });

  it('keeps values that are false or zero, which are things the source said', () => {
    expect(statedFieldsOnly({ props: { is_private: false, stars: 0 } })).toEqual({
      props: { is_private: false, stars: 0 },
    });
  });
});

describe('patchForFields', () => {
  it('rebuilds the whole parent bag so a spread cannot erase its other keys', () => {
    const current = { props: { city: 'Berlin', headline: 'Staff SWE' } };
    expect(patchForFields(current, [{ key: 'props.city', value: 'Cairo' }])).toEqual({
      props: { city: 'Cairo', headline: 'Staff SWE' },
    });
  });

  it('merges several nested keys into one parent', () => {
    const current = { props: { city: 'Berlin', headline: 'Staff SWE' } };
    expect(
      patchForFields(current, [
        { key: 'props.city', value: 'Cairo' },
        { key: 'props.headline', value: 'Principal' },
      ]),
    ).toEqual({ props: { city: 'Cairo', headline: 'Principal' } });
  });

  it('deletes a nested key set to undefined, which is how an added field reverses', () => {
    const current = { props: { city: 'Berlin', headline: 'Staff SWE' } };
    expect(patchForFields(current, [{ key: 'props.headline', value: undefined }])).toEqual({
      props: { city: 'Berlin' },
    });
  });

  it('sets a top level key directly', () => {
    expect(patchForFields({ title: 'Old' }, [{ key: 'title', value: 'New' }])).toEqual({
      title: 'New',
    });
  });

  it('leaves the record it was built from untouched', () => {
    const current = { props: { city: 'Berlin' } };
    patchForFields(current, [{ key: 'props.city', value: 'Cairo' }]);
    expect(current).toEqual({ props: { city: 'Berlin' } });
  });
});

describe('readField', () => {
  it('reads both flat and dotted keys', () => {
    const record = { title: 'Sarah Chen', props: { city: 'Berlin' } };
    expect(readField(record, 'title')).toBe('Sarah Chen');
    expect(readField(record, 'props.city')).toBe('Berlin');
    expect(readField(record, 'props.headline')).toBeUndefined();
    expect(readField(record, 'missing.city')).toBeUndefined();
  });
});

describe('deepEqual', () => {
  it('compares nested structures by value', () => {
    expect(deepEqual({ a: [1, { b: 2 }] }, { a: [1, { b: 2 }] })).toBe(true);
    expect(deepEqual({ a: [1, { b: 2 }] }, { a: [1, { b: 3 }] })).toBe(false);
    expect(deepEqual(null, undefined)).toBe(false);
    expect(deepEqual([1, 2], [1, 2, 3])).toBe(false);
  });
});
