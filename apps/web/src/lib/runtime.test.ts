import { describe, expect, it } from 'vitest';
import { isLoopbackHostname } from './runtime.js';

describe('browser runtime safety', () => {
  it('allows developer-only behavior exclusively on loopback hostnames', () => {
    expect(isLoopbackHostname('localhost')).toBe(true);
    expect(isLoopbackHostname('127.0.0.1')).toBe(true);
    expect(isLoopbackHostname('::1')).toBe(true);
    expect(isLoopbackHostname('app.vitae.example')).toBe(false);
    expect(isLoopbackHostname('vitae-branch.vercel.app')).toBe(false);
  });
});
