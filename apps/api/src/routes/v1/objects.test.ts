import { describe, expect, it } from 'vitest';
import { HttpError } from '../../middleware/error.js';
import { parseObjectKey } from './objects.js';

describe('parseObjectKey', () => {
  it('accepts a storage key', () => {
    expect(parseObjectKey('vitae/workspace-legacy-real/ab/abcdef0123456789')).toBe(
      'vitae/workspace-legacy-real/ab/abcdef0123456789',
    );
  });

  it('refuses a missing key', () => {
    try {
      parseObjectKey(undefined);
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(HttpError);
      expect((err as HttpError).status).toBe(400);
    }
  });

  it('refuses an oversized key', () => {
    try {
      parseObjectKey('a'.repeat(513));
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(HttpError);
    }
  });
});
