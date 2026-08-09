/**
 * Request correlation: echo x-request-id and expose it via currentRequestId.
 */
import { describe, expect, it } from 'vitest';
import type { Request, Response } from 'express';
import { currentRequestId, requestContext, runtimeMetrics } from './request-context.js';

function mockReqRes(headers: Record<string, string> = {}) {
  const setHeaders = new Map<string, string>();
  const listeners = new Map<string, Array<(...args: unknown[]) => void>>();
  const req = {
    header(name: string) {
      return headers[name.toLowerCase()] ?? headers[name];
    },
    method: 'GET',
    path: '/health',
    baseUrl: '',
    originalUrl: '/health',
    once(event: string, fn: (...args: unknown[]) => void) {
      const list = listeners.get(`req:${event}`) ?? [];
      list.push(fn);
      listeners.set(`req:${event}`, list);
      return this;
    },
  };
  const res = {
    statusCode: 200,
    writableFinished: true,
    setHeader(name: string, value: string) {
      setHeaders.set(name.toLowerCase(), value);
    },
    on(event: string, fn: (...args: unknown[]) => void) {
      const list = listeners.get(`res:${event}`) ?? [];
      list.push(fn);
      listeners.set(`res:${event}`, list);
      return this;
    },
    once(event: string, fn: (...args: unknown[]) => void) {
      return this.on(event, fn);
    },
  };
  return { req: req as unknown as Request, res: res as unknown as Response, setHeaders, listeners };
}

describe('requestContext', () => {
  it('echoes a client x-request-id and exposes it inside the ALS store', () => {
    const { req, res, setHeaders, listeners } = mockReqRes({ 'x-request-id': 'client-id-1' });
    let seen: string | undefined;
    requestContext(req, res, () => {
      seen = currentRequestId();
    });
    expect(setHeaders.get('x-request-id')).toBe('client-id-1');
    expect(seen).toBe('client-id-1');
    // Finish so metrics settle without leaking active request counts.
    for (const fn of listeners.get('res:finish') ?? []) fn();
  });

  it('mints a request id when the client omits one', () => {
    const { req, res, setHeaders, listeners } = mockReqRes();
    let seen: string | undefined;
    requestContext(req, res, () => {
      seen = currentRequestId();
    });
    expect(setHeaders.get('x-request-id')).toBeTruthy();
    expect(seen).toBe(setHeaders.get('x-request-id'));
    for (const fn of listeners.get('res:finish') ?? []) fn();
    expect(runtimeMetrics().activeRequests).toBeGreaterThanOrEqual(0);
  });
});
