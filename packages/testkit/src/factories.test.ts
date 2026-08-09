import { beforeEach, describe, expect, it } from 'vitest';
import { fixedClock } from './clock.js';
import { buildEdgeCreate, buildNodeCreate, buildNodeRecord, buildSelfWithRole } from './factories.js';
import { nextId, resetIdSequence } from './ids.js';

describe('testkit factories', () => {
  beforeEach(() => {
    resetIdSequence(0);
  });

  it('builds a valid person create payload with a stable title id', () => {
    const node = buildNodeCreate({ type: 'person' });
    expect(node.type).toBe('person');
    expect(node.title).toContain('person-0001');
    expect(node.source).toBe('manual');
  });

  it('rejects invalid node overrides with a clear error', () => {
    expect(() => buildNodeCreate({ type: 'person', title: '' })).toThrow(/buildNodeCreate invalid/);
  });

  it('fills system fields from the fixed clock', () => {
    const clock = fixedClock('2026-01-15T09:30:00.000Z');
    const record = buildNodeRecord({ type: 'organization', title: 'Acme' }, clock);
    expect(record.id).toBe('organization-0001');
    expect(record.created_at).toBe('2026-01-15T09:30:00.000Z');
    expect(record.rev).toBe(0);
  });

  it('builds a HELD edge between self and role', () => {
    const { self, role, held } = buildSelfWithRole();
    expect(held.type).toBe('HELD');
    expect(held.src).toBe(self.id);
    expect(held.dst).toBe(role.id);
    expect(role.start_date).toBe('2024-02-01');
  });

  it('advances the id sequence across calls', () => {
    expect(nextId('x')).toBe('x-0001');
    expect(nextId('x')).toBe('x-0002');
    expect(buildEdgeCreate({ type: 'KNOWS', src: 'a', dst: 'b' }).src).toBe('a');
  });
});
