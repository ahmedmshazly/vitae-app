/**
 * Error middleware: domain errors and body-parser failures map to envelopes
 * with request_id (SRS §8.2, FR-010).
 */
import { describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';
import { NotFoundError, ValidationError } from '../db/repository.js';
import { asyncHandler, errorHandler, HttpError } from './error.js';
import * as requestContext from './request-context.js';

function mockRes() {
  const state: { status?: number; body?: unknown } = {};
  const res = {
    status(code: number) {
      state.status = code;
      return this;
    },
    json(body: unknown) {
      state.body = body;
      return this;
    },
  };
  return { res: res as unknown as Response, state };
}

describe('errorHandler', () => {
  it('maps ValidationError to 422 with details and request_id', () => {
    vi.spyOn(requestContext, 'currentRequestId').mockReturnValue('req-val');
    const { res, state } = mockRes();
    errorHandler(
      new ValidationError('invalid', [{ path: 'title', message: 'required' }]),
      {} as Request,
      res,
      () => {},
    );
    expect(state.status).toBe(422);
    expect(state.body).toEqual({
      error: {
        code: 'VALIDATION',
        message: 'invalid',
        details: [{ path: 'title', message: 'required' }],
        request_id: 'req-val',
      },
    });
  });

  it('maps NotFoundError and HttpError with request_id', () => {
    vi.spyOn(requestContext, 'currentRequestId').mockReturnValue('req-nf');
    const { res, state } = mockRes();
    errorHandler(new NotFoundError('node'), {} as Request, res, () => {});
    expect(state.status).toBe(404);
    expect((state.body as { error: { request_id: string } }).error.request_id).toBe('req-nf');

    const again = mockRes();
    errorHandler(new HttpError(409, 'NOT_FINAL', 'draft'), {} as Request, again.res, () => {});
    expect(again.state.status).toBe(409);
    expect((again.state.body as { error: { code: string } }).error.code).toBe('NOT_FINAL');
  });

  it('maps body-parser entity.too.large to 413', () => {
    vi.spyOn(requestContext, 'currentRequestId').mockReturnValue('req-413');
    const { res, state } = mockRes();
    const err = Object.assign(new Error('too large'), { type: 'entity.too.large', limit: 2_097_152 });
    errorHandler(err, {} as Request, res, () => {});
    expect(state.status).toBe(413);
    expect((state.body as { error: { code: string; request_id: string } }).error.code).toBe('PAYLOAD_TOO_LARGE');
    expect((state.body as { error: { request_id: string } }).error.request_id).toBe('req-413');
  });
});

describe('asyncHandler', () => {
  it('forwards rejections to next', async () => {
    const boom = new Error('async fail');
    const next = vi.fn();
    const wrapped = asyncHandler(async () => {
      throw boom;
    });
    wrapped({} as Request, {} as Response, next);
    await new Promise((r) => setImmediate(r));
    expect(next).toHaveBeenCalledWith(boom);
  });
});
