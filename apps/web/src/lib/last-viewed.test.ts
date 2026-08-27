import { afterEach, describe, expect, it } from 'vitest';
import { lastViewedId, rememberViewed } from './last-viewed.js';

describe('last viewed record (FR-CAP-008)', () => {
  afterEach(() => {
    sessionStorage.clear();
  });

  it('remembers the id capture will append a note to', () => {
    rememberViewed('person-nour');
    expect(lastViewedId()).toBe('person-nour');
  });

  it('ignores an empty id so a blank route cannot clobber the last real record', () => {
    rememberViewed('person-nour');
    rememberViewed('');
    expect(lastViewedId()).toBe('person-nour');
  });
});
