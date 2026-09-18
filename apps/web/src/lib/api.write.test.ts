import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from './api.js';

afterEach(() => vi.unstubAllGlobals());

describe('API write options', () => {
  it('sends an optional retry key while retaining normal transport headers', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ favors: [] }), { headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetcher);
    await api.post('/people/p1/favors', { what: 'Review' }, { idempotencyKey: 'same-favor' });
    expect(fetcher).toHaveBeenCalledWith(expect.stringContaining('/people/p1/favors'), expect.objectContaining({
      credentials: 'include', method: 'POST',
      headers: expect.objectContaining({ 'content-type': 'application/json', 'x-idempotency-key': 'same-favor', 'x-vitae-space': expect.any(String), 'x-vitae-tz': expect.any(String) }),
    }));
  });
});
