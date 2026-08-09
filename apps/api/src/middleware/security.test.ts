import { describe, expect, it } from 'vitest';
import type { Request, Response } from 'express';
import { cspNonce, securityHeaders } from './security.js';

function mockRes() {
  const headers = new Map<string, string>();
  const res = {
    locals: {} as Record<string, unknown>,
    setHeader(name: string, value: string) {
      headers.set(name.toLowerCase(), value);
      return this;
    },
    getHeader(name: string) {
      return headers.get(name.toLowerCase());
    },
    removeHeader() {
      return this;
    },
  };
  return { res: res as unknown as Response, headers };
}

describe('cspNonce', () => {
  it('attaches a base64 nonce to res.locals for the request', () => {
    const { res } = mockRes();
    let nexted = false;
    cspNonce({} as Request, res, () => {
      nexted = true;
    });
    expect(nexted).toBe(true);
    expect(typeof res.locals.cspNonce).toBe('string');
    expect(String(res.locals.cspNonce).length).toBeGreaterThan(10);
  });
});

describe('securityHeaders', () => {
  it('sets frame-deny and no-sniff headers', async () => {
    const { res, headers } = mockRes();
    res.locals.cspNonce = 'test-nonce';
    const mw = securityHeaders();
    await new Promise<void>((resolve, reject) => {
      mw({} as Request, res, (err?: unknown) => (err ? reject(err) : resolve()));
    });
    expect(headers.get('x-content-type-options')).toBe('nosniff');
    expect(headers.get('x-frame-options') ?? headers.get('content-security-policy')).toBeTruthy();
    const csp = headers.get('content-security-policy') ?? '';
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain('nonce-test-nonce');
  });
});
