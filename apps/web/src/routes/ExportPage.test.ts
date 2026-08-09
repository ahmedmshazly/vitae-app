import { describe, expect, it } from 'vitest';
import { formatLastExport } from './ExportPage.js';

describe('formatLastExport', () => {
  it('formats an ISO timestamp without inventing an export', () => {
    expect(formatLastExport(null)).toBe('never');
    expect(formatLastExport(undefined)).toBe('never');
    expect(formatLastExport('2026-08-01T10:15:00.000Z')).toBe('2026-08-01 10:15');
  });
});
