import { describe, expect, it } from 'vitest';
import { PRODUCTIVITY_WEB_FLAG, isProductivityEnabled } from './productivity-flag.js';

describe('isProductivityEnabled', () => {
  it('names the public web flag and defaults off', () => {
    expect(PRODUCTIVITY_WEB_FLAG).toBe('VITE_PUBLIC_PRODUCTIVITY_ENABLED');
    expect(isProductivityEnabled(undefined)).toBe(false);
    expect(isProductivityEnabled('false')).toBe(false);
    expect(isProductivityEnabled('0')).toBe(false);
    expect(isProductivityEnabled('on')).toBe(false);
  });

  it('treats true, 1, and yes as on, ignoring case and surrounding space', () => {
    expect(isProductivityEnabled('true')).toBe(true);
    expect(isProductivityEnabled('1')).toBe(true);
    expect(isProductivityEnabled('yes')).toBe(true);
    expect(isProductivityEnabled(' YES ')).toBe(true);
  });
});
