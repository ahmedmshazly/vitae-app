/**
 * Buildsvc client: HMAC request shape and offline degradation (FR-RES-013).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHmac } from 'node:crypto';

describe('buildsvc compile client', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.resetModules();
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('signs timestamp.body with HMAC-SHA256 and posts to /compile', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ pdf: 'cGRm', pages: 1, duration_ms: 12, text: 'hi' }),
    });
    const { compile } = await import('./buildsvc-client.js');
    const { env } = await import('../env.js');

    const result = await compile({ template: 'onyx@1.0.0', mainTex: '\\documentclass{article}' });
    expect(result.ok).toBe(true);
    expect(result.pdfBase64).toBe('cGRm');

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${env.BUILDSVC_URL}/compile`);
    const headers = init.headers as Record<string, string>;
    const ts = headers['x-timestamp'];
    const sig = headers['x-signature'];
    const body = String(init.body);
    expect(ts).toMatch(/^\d+$/);
    expect(sig).toBe(createHmac('sha256', env.BUILDSVC_HMAC_SECRET).update(`${ts}.${body}`).digest('hex'));
  });

  it('returns offline=true when the build service is unreachable', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));
    const { compile } = await import('./buildsvc-client.js');
    const result = await compile({ template: 'onyx@1.0.0', mainTex: 'x' });
    expect(result.ok).toBe(false);
    expect(result.offline).toBe(true);
    expect(result.error?.code).toBe('BUILDSVC_OFFLINE');
  });

  it('maps a non-OK compile response into a structured error without offline', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      json: async () => ({ error: { code: 'TEX_ERROR', message: 'undefined control sequence' }, log_tail: '!' }),
    });
    const { compile } = await import('./buildsvc-client.js');
    const result = await compile({ template: 'onyx@1.0.0', mainTex: 'x' });
    expect(result.ok).toBe(false);
    expect(result.offline).toBeUndefined();
    expect(result.error?.code).toBe('TEX_ERROR');
    expect(result.logTail).toBe('!');
  });
});
