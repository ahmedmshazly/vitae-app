import { describe, expect, it } from 'vitest';
import { shortTypeLabel } from './constants.js';

describe('shortTypeLabel', () => {
  it('shortens known multi-word types', () => {
    expect(shortTypeLabel('organization')).toBe('org');
    expect(shortTypeLabel('journal_entry')).toBe('journal');
    expect(shortTypeLabel('job_posting')).toBe('job');
  });

  it('replaces underscores for other types', () => {
    expect(shortTypeLabel('role')).toBe('role');
    expect(shortTypeLabel('work_item')).toBe('work item');
  });
});
