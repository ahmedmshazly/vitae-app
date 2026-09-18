import { describe, expect, it } from 'vitest';
import { bundleEdgeId } from './imports.js';

describe('imported relationship identity', () => {
  it('converges on reimport and preserves separate dated episodes', () => {
    const first = bundleEdgeId('MEMBER_OF', 'person', 'org', { start_date: '2020-01-01', end_date: '2021-01-01' });
    expect(bundleEdgeId('MEMBER_OF', 'person', 'org', { start_date: '2020-01-01', end_date: '2021-01-01' })).toBe(first);
    expect(bundleEdgeId('MEMBER_OF', 'person', 'org', { start_date: '2024-01-01', end_date: '2025-01-01' })).not.toBe(first);
  });
});
