/** The Express application factory (kept separate from `index.ts` for testing). */
import express, { type Express } from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import { env } from './env.js';
import { authGate } from './middleware/auth.js';
import { spaceMiddleware } from './db/space.js';
import { timezoneMiddleware } from './db/timezone.js';
import { cspNonce, securityHeaders } from './middleware/security.js';
import { errorHandler } from './middleware/error.js';
import { livenessHandler, readinessHandler } from './middleware/health.js';
import { requestContext, runtimeMetrics } from './middleware/request-context.js';
import { v1Router } from './routes/v1/index.js';

/**
 * Uploads are posted as JSON text (no multipart), and a LinkedIn connections
 * export or a contacts dump runs to several MB. FR-010: this limit must be
 * mounted BEFORE the 2 MB default: Express runs body parsers in registration
 * order, and the router-local one in imports.ts never got a say, so ordinary
 * imports failed at 2 MB with a generic 500.
 */
const IMPORT_BODY_LIMIT = '15mb';
const DEFAULT_BODY_LIMIT = '2mb';

export function createApp(): Express {
  const app = express();
  app.disable('x-powered-by');

  app.use(requestContext);
  app.use(cspNonce);
  app.use(securityHeaders());
  app.use(
    cors({
      // Explicit allow-list (never a reflector). WEB_ORIGIN may be a single URL
      // or a comma-separated list (custom domain + Vercel alias).
      origin: [
        ...env.WEB_ORIGIN.split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        ...(env.APERTURE_ORIGIN ? [env.APERTURE_ORIGIN] : []),
      ],
      credentials: true,
    }),
  );
  app.use('/api/v1/imports', express.json({ limit: IMPORT_BODY_LIMIT }));
  app.use(express.json({ limit: DEFAULT_BODY_LIMIT }));
  app.use(cookieParser());
  app.use(spaceMiddleware);
  app.use(timezoneMiddleware); // FR-025: "today" is a question only a timezone can answer

  // Liveness (is the process up?) vs readiness (should it get traffic?): FR-026.
  app.get('/health', livenessHandler);
  app.get('/ready', readinessHandler);

  // Default-deny gate in front of everything under /api.
  app.use('/api', authGate);
  app.get('/api/v1/metrics', (_req, res) => res.json(runtimeMetrics()));
  app.use('/api/v1', v1Router);

  app.use(errorHandler);
  return app;
}
