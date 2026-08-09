import { describe, expect, it } from 'vitest';
import {
  validateEdgeCreate,
  validateEdgeUpdate,
  validateNodeCreate,
  validateNodeUpdate,
} from './validate.js';

describe('validateNodeCreate (envelope + per-type props)', () => {
  it('accepts a valid person and applies defaults', () => {
    const r = validateNodeCreate({ type: 'person', title: 'Sarah Chen', props: { emails: ['s@x.com'] } });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.pinned).toBe(false);
      expect(r.value.confidence).toBe(1);
      expect(r.value.sensitivity).toBe('normal');
    }
  });

  it('rejects a role missing its required employment_type (FR-CAP-002)', () => {
    const r = validateNodeCreate({ type: 'role', title: 'SWE', props: {} });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.some((e) => e.path.includes('employment_type'))).toBe(true);
  });

  it('rejects an unknown node type', () => {
    const r = validateNodeCreate({ type: 'dragon', title: 'x' });
    expect(r.ok).toBe(false);
  });

  it('rejects an empty title', () => {
    const r = validateNodeCreate({ type: 'person', title: '' });
    expect(r.ok).toBe(false);
  });

  it('validates a bad email in props', () => {
    const r = validateNodeCreate({ type: 'person', title: 'x', props: { emails: ['not-an-email'] } });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]!.path).toContain('props');
  });
});

describe('validateEdgeCreate', () => {
  it('accepts a KNOWS edge with closeness', () => {
    const r = validateEdgeCreate({ type: 'KNOWS', src: 'a', dst: 'b', props: { closeness: 4 } });
    expect(r.ok).toBe(true);
  });
  it('rejects an out-of-range closeness', () => {
    const r = validateEdgeCreate({ type: 'KNOWS', src: 'a', dst: 'b', props: { closeness: 9 } });
    expect(r.ok).toBe(false);
  });
  it('rejects an unknown edge type', () => {
    const r = validateEdgeCreate({ type: 'LOVES', src: 'a', dst: 'b' });
    expect(r.ok).toBe(false);
  });
});

describe('validateNodeUpdate', () => {
  it('accepts a title-only patch without revalidating props', () => {
    const r = validateNodeUpdate('person', { title: 'Renamed' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.title).toBe('Renamed');
  });

  it('accepts a valid props patch and keeps the props object', () => {
    const r = validateNodeUpdate('person', { props: { emails: ['ok@example.com'] } });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.props).toMatchObject({ emails: ['ok@example.com'] });
  });

  it('rejects an invalid envelope field on update', () => {
    const r = validateNodeUpdate('person', { confidence: 2 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.length).toBeGreaterThan(0);
  });

  it('rejects invalid props when props are present', () => {
    const r = validateNodeUpdate('person', { props: { emails: ['not-an-email'] } });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors[0]!.path).toContain('props');
      expect(r.errors.some((e) => e.path.startsWith('props'))).toBe(true);
    }
  });
});

describe('validateEdgeUpdate', () => {
  it('accepts a notes patch on a KNOWS edge', () => {
    const r = validateEdgeUpdate('KNOWS', { notes_md: 'met at DevFest' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.notes_md).toBe('met at DevFest');
  });

  it('accepts a valid closeness patch', () => {
    const r = validateEdgeUpdate('KNOWS', { props: { closeness: 3 } });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.props).toMatchObject({ closeness: 3 });
  });

  it('rejects an invalid envelope field on edge update', () => {
    const r = validateEdgeUpdate('KNOWS', { confidence: -1 });
    expect(r.ok).toBe(false);
  });

  it('rejects an out-of-range closeness on update', () => {
    const r = validateEdgeUpdate('KNOWS', { props: { closeness: 99 } });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.some((e) => e.path.includes('props'))).toBe(true);
  });
});

describe('validateEdgeCreate result shape', () => {
  it('returns the parsed edge fields on success', () => {
    const r = validateEdgeCreate({ type: 'KNOWS', src: 'a', dst: 'b', props: { closeness: 4 } });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.type).toBe('KNOWS');
      expect(r.value.src).toBe('a');
      expect(r.value.dst).toBe('b');
      expect(r.value.props).toMatchObject({ closeness: 4 });
    }
  });

  it('prefixes prop errors with props.', () => {
    const r = validateEdgeCreate({ type: 'KNOWS', src: 'a', dst: 'b', props: { closeness: 9 } });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]!.path.startsWith('props')).toBe(true);
  });
});
