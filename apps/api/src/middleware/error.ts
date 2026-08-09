/**
 * Central error handling. All API errors serialize as
 * `{error:{code,message,details?,request_id?}}` (SRS §8.2). Domain errors map to
 * appropriate status codes.
 */
import type { NextFunction, Request, Response } from 'express';
import { NotFoundError, ValidationError } from '../db/repository.js';
import { currentRequestId } from './request-context.js';

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

/** Wrap an async route handler so rejections reach the error middleware. */
export function asyncHandler<T extends (req: Request, res: Response, next: NextFunction) => Promise<unknown>>(
  fn: T,
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res, next).catch(next);
  };
}

/**
 * body-parser rejects malformed or oversized payloads with a tagged Error.
 * FR-010: these used to fall through to the generic 500 handler, so a too-large
 * import or a truncated upload told the client "Something went wrong."
 */
interface BodyParserError extends Error {
  type?: string;
  status?: number;
  limit?: number;
}

function bodyParserStatus(err: BodyParserError): { status: number; code: string; message: string } | null {
  switch (err.type) {
    case 'entity.too.large':
      return {
        status: 413,
        code: 'PAYLOAD_TOO_LARGE',
        message: `Upload is too large${err.limit ? ` (limit ${Math.round(err.limit / 1_048_576)} MB)` : ''}.`,
      };
    case 'entity.parse.failed':
      return { status: 400, code: 'MALFORMED_JSON', message: 'Request body is not valid JSON.' };
    case 'encoding.unsupported':
      return { status: 415, code: 'UNSUPPORTED_ENCODING', message: 'Unsupported content encoding.' };
    case 'request.aborted':
      return { status: 400, code: 'REQUEST_ABORTED', message: 'Upload was interrupted.' };
    default:
      return null;
  }
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  const request_id = currentRequestId();

  if (err instanceof ValidationError) {
    res.status(422).json({ error: { code: 'VALIDATION', message: err.message, details: err.errors, request_id } });
    return;
  }
  if (err instanceof NotFoundError) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: err.message, request_id } });
    return;
  }
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details, request_id } });
    return;
  }
  const parser = err instanceof Error ? bodyParserStatus(err as BodyParserError) : null;
  if (parser) {
    res.status(parser.status).json({ error: { code: parser.code, message: parser.message, request_id } });
    return;
  }
  console.error('[api] unhandled error:', request_id, err);
  res.status(500).json({ error: { code: 'INTERNAL', message: 'Something went wrong.', request_id } });
}
