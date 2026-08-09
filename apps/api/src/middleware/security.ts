/**
 * Security headers + per-request CSP nonce (SRS §7.1, T2). Ports the main site's
 * hardening: HSTS, no-sniff, frame-deny, referrer policy, and a strict CSP whose
 * script-src is nonce-based. The nonce is attached to the response for any
 * server-rendered surface to consume.
 */
import { randomBytes } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';

export function cspNonce(_req: Request, res: Response, next: NextFunction): void {
  res.locals.cspNonce = randomBytes(16).toString('base64');
  next();
}

export function securityHeaders() {
  return helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", (_req, res) => `'nonce-${(res as Response).locals.cspNonce}'`, "'strict-dynamic'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'", 'https:'],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        frameAncestors: ["'none'"],
      },
    },
    crossOriginResourcePolicy: { policy: 'same-site' },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  });
}
