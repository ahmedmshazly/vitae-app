/**
 * Request correlation + access logging (FR-026).
 *
 * Every request gets an id (echoed as `x-request-id` and included in error
 * envelopes) and every response logs one structured line with method, route,
 * status, and duration, the minimum an operator needs to attribute a latency
 * or quota regression to a route instead of guessing.
 */
import type { NextFunction, Request, Response } from 'express';
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

const als = new AsyncLocalStorage<{ requestId: string }>();
let activeRequests = 0;
let abortedRequests = 0;
const routeMetrics = new Map<string, { requests: number; errors: number; durationMs: number }>();

export function currentRequestId(): string | undefined {
  return als.getStore()?.requestId;
}

export function requestContext(req: Request, res: Response, next: NextFunction): void {
  const requestId = req.header('x-request-id') || randomUUID();
  res.setHeader('x-request-id', requestId);
  const startedAt = process.hrtime.bigint();
  activeRequests += 1;
  let settled = false;
  const settle = (aborted: boolean): void => {
    if (settled) return;
    settled = true;
    activeRequests -= 1;
    if (aborted) abortedRequests += 1;
  };
  req.once('aborted', () => settle(true));
  res.once('close', () => settle(!res.writableFinished));

  res.on('finish', () => {
    settle(false);
    const ms = Number(process.hrtime.bigint() - startedAt) / 1e6;
    // Route pattern, not the raw path, ids in the path would shard the metric.
    const route = (req.route?.path as string | undefined) ?? (req.baseUrl || req.path);
    const line = {
      at: new Date().toISOString(),
      request_id: requestId,
      method: req.method,
      route,
      path: req.originalUrl.split('?')[0],
      status: res.statusCode,
      duration_ms: Math.round(ms),
    };
    const metric = routeMetrics.get(route) ?? { requests: 0, errors: 0, durationMs: 0 };
    metric.requests += 1;
    metric.errors += res.statusCode >= 500 ? 1 : 0;
    metric.durationMs += ms;
    routeMetrics.set(route, metric);
    if (res.statusCode >= 500) console.error('[api]', JSON.stringify(line));
    else if (res.statusCode >= 400) console.warn('[api]', JSON.stringify(line));
    else console.log('[api]', JSON.stringify(line));
  });

  als.run({ requestId }, next);
}

export function runtimeMetrics(): {
  activeRequests: number;
  abortedRequests: number;
  routes: Record<string, { requests: number; errors: number; averageDurationMs: number }>;
} {
  return {
    activeRequests,
    abortedRequests,
    routes: Object.fromEntries(
      [...routeMetrics].map(([route, value]) => [
        route,
        {
          requests: value.requests,
          errors: value.errors,
          averageDurationMs: value.requests ? Math.round(value.durationMs / value.requests) : 0,
        },
      ]),
    ),
  };
}
