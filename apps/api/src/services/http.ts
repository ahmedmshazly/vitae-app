/**
 * Outbound HTTP with a deadline (FR-026).
 *
 * `fetch` has no default timeout: a hung GitHub or build-service connection
 * holds the request, its database work, and a connection slot open until the
 * platform kills the instance. Every outbound call goes through here so it
 * fails in bounded time with a message an operator can act on.
 */
export class TimeoutError extends Error {
  constructor(url: string, ms: number) {
    super(`${url} did not respond within ${ms}ms`);
    this.name = 'TimeoutError';
  }
}

export const DEFAULT_TIMEOUT_MS = 10_000;

export async function fetchWithDeadline(
  url: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<Response> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, ...rest } = init;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...rest, signal: controller.signal });
  } catch (err) {
    if (controller.signal.aborted) throw new TimeoutError(url, timeoutMs);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
