import { describe, expect, it } from 'vitest';
import { daysUntilPurge, purgeUrgency, TRASH_RETENTION_DAYS } from './Trash.js';

describe('daysUntilPurge', () => {
  it('counts whole days remaining from the retention window', () => {
    const now = Date.parse('2026-08-09T12:00:00.000Z');
    const deleted = '2026-08-01T12:00:00.000Z'; // 8 days ago
    expect(daysUntilPurge(deleted, now)).toBe(TRASH_RETENTION_DAYS - 8);
  });

  it('reports zero once the record is past the retention window', () => {
    const now = Date.parse('2026-09-10T12:00:00.000Z');
    expect(daysUntilPurge('2026-08-01T12:00:00.000Z', now)).toBe(0);
  });
});

describe('purgeUrgency', () => {
  it('marks the final week and overdue window distinctly', () => {
    expect(purgeUrgency(30)).toBe('ok');
    expect(purgeUrgency(7)).toBe('ok');
    expect(purgeUrgency(6)).toBe('soon');
    expect(purgeUrgency(0)).toBe('due');
  });
});
