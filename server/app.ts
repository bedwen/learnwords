import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import cors from 'cors';

import wordsRouter from './routes/words';
import studyRouter from './routes/study';
import dashboardRouter from './routes/dashboard';
import foldersRouter from './routes/folders';
import dataRouter from './routes/data';

/**
 * Browser origins allowed to call the API (see D018).
 * - 5173: Vite dev server
 * - 4173: Vite preview server (proxies /api to the backend)
 * - 3001: the API itself (same-origin)
 */
export const ALLOWED_ORIGINS: readonly string[] = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
  'http://localhost:3001',
  'http://127.0.0.1:3001',
];

/** Routes that define their own, larger JSON body parser. */
const CUSTOM_BODY_LIMIT_PATHS = new Set(['/api/data/import']);

function isAllowedOrigin(origin: string | undefined): boolean {
  // Requests without an Origin header come from local tools (curl, scripts)
  // or same-origin navigation, which are not cross-origin browser requests.
  return !origin || ALLOWED_ORIGINS.includes(origin);
}

/** Zero-dependency security headers (replaces the need for helmet). */
function securityHeaders(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
}

/**
 * Rejects requests from untrusted browser origins before they reach any route.
 * CORS alone only hides responses; it does not stop "simple" cross-origin
 * requests (e.g. form POSTs) from executing side effects.
 */
function originGuard(req: Request, res: Response, next: NextFunction): void {
  if (!isAllowedOrigin(req.headers.origin)) {
    res.status(403).json({ error: 'Origin not allowed' });
    return;
  }
  next();
}

const standardJsonParser = express.json({ limit: '1mb' });

function jsonBodyParser(req: Request, res: Response, next: NextFunction): void {
  if (CUSTOM_BODY_LIMIT_PATHS.has(req.path)) {
    next();
    return;
  }
  standardJsonParser(req, res, next);
}

export function createApp(): express.Express {
  const app = express();

  app.disable('x-powered-by');
  app.use(securityHeaders);
  app.use(originGuard);
  app.use(
    cors({
      origin: (origin, callback) => callback(null, isAllowedOrigin(origin)),
    })
  );
  app.use(jsonBodyParser);

  app.use('/api/words', wordsRouter);
  app.use('/api/study', studyRouter);
  app.use('/api/dashboard', dashboardRouter);
  app.use('/api/folders', foldersRouter);
  app.use('/api/data', dataRouter);

  // Health check endpoint
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  return app;
}
