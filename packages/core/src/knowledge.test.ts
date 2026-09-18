import { describe, expect, it } from 'vitest';
import type { NodeRecord } from './schema/envelope.js';
import {
  entityIdentityKeys,
  reconcileField,
  relationshipEpisodeKey,
  resolveEntityIdentity,
} from './knowledge.js';

const node = (id: string, props: Record<string, unknown>, keys: string[] = []): NodeRecord => ({
  id,
  type: 'person',
  title: 'Same Name',
  props,
  identity_keys: keys,
  notes_md: '',
  date_precision: 'day',
  pinned: false,
  sensitivity: 'normal',
  source: 'manual',
  confidence: 1,
  captured_at: '2026-01-01T00:00:00Z',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  archived_at: null,
  deleted_at: null,
  merged_into: null,
  rev: 1,
});

describe('knowledge identity', () => {
  it('matches exact identifiers while duplicate names remain new', () => {
    const existing = [node('one', { emails: ['A@example.com'] })];
    expect(
      resolveEntityIdentity(node('incoming', { emails: ['a@example.com'] }), existing),
    ).toMatchObject({ status: 'matched', candidates: ['one'] });
    expect(resolveEntityIdentity(node('incoming', {}), existing)).toMatchObject({
      status: 'new',
      candidates: [],
    });
  });

  it('reports an identifier claimed by multiple live records as ambiguous', () => {
    const existing = [
      node('one', { emails: ['same@example.com'] }),
      node('two', {}, ['email:person:same@example.com']),
    ];
    expect(
      resolveEntityIdentity(node('incoming', { emails: ['SAME@example.com'] }), existing),
    ).toMatchObject({
      status: 'ambiguous',
      candidates: ['one', 'two'],
      conflicts: ['email:person:same@example.com'],
    });
  });

  it('normalizes typed external identifiers without provider-specific email rewriting', () => {
    expect(
      entityIdentityKeys(node('x', { emails: ['First.Last+tag@Gmail.com'] }, ['CRM:Person:ABC'])),
    ).toEqual(['crm:person:abc', 'email:person:first.last+tag@gmail.com']);
  });
});

describe('knowledge reconciliation', () => {
  it('complements missing values and lists but preserves scalar conflicts', () => {
    expect(reconcileField('', 'Cairo')).toEqual({ status: 'complement', value: 'Cairo' });
    expect(reconcileField(['a@example.com'], ['A@example.com', 'b@example.com'])).toEqual({
      status: 'complement',
      value: ['a@example.com', 'b@example.com'],
    });
    expect(reconcileField('Cairo', 'Berlin')).toEqual({ status: 'conflict', value: 'Berlin' });
  });

  it('keeps repeated relationship periods distinct', () => {
    const base = { type: 'MEMBER_OF' as const, src: 'p', dst: 'o', source_ref: 'gmail:m1' };
    expect(
      relationshipEpisodeKey({ ...base, start_date: '2020-01-01', end_date: '2021-01-01' }),
    ).not.toBe(
      relationshipEpisodeKey({ ...base, start_date: '2024-01-01', end_date: '2025-01-01' }),
    );
  });
});
