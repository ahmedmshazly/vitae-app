import { afterEach, describe, expect, it } from 'vitest';
import { PRODUCTIVITY_API_FLAG } from '@vitae/core';
import { isProductivityEnabled } from './flag.js';

const FLAG = PRODUCTIVITY_API_FLAG;

describe('isProductivityEnabled', () => {
  const original = process.env[FLAG];

  afterEach(() => {
    if (original === undefined) delete process.env[FLAG];
    else process.env[FLAG] = original;
  });

  it('treats unset as the FR-PROD-001 kill switch', () => {
    const env: NodeJS.ProcessEnv = {};
    expect(isProductivityEnabled(env)).toBe(false);
  });

  it('is false when unset or not an allowed token', () => {
    const env: NodeJS.ProcessEnv = {};
    expect(isProductivityEnabled(env)).toBe(false);
    expect(isProductivityEnabled({ [FLAG]: 'false' })).toBe(false);
    expect(isProductivityEnabled({ [FLAG]: '0' })).toBe(false);
    expect(isProductivityEnabled({ [FLAG]: 'on' })).toBe(false);
  });

  it('accepts true, 1, and yes without regard to case or surrounding space', () => {
    expect(isProductivityEnabled({ [FLAG]: 'true' })).toBe(true);
    expect(isProductivityEnabled({ [FLAG]: '1' })).toBe(true);
    expect(isProductivityEnabled({ [FLAG]: 'yes' })).toBe(true);
    expect(isProductivityEnabled({ [FLAG]: ' YES ' })).toBe(true);
  });
});
