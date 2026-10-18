import os from 'os';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import cors from 'cors';

import wordsRouter from './routes/words';
import studyRouter from './routes/study';
import homeRouter from './routes/home';
import foldersRouter from './routes/folders';
import dataRouter from './routes/data';
import syncRouter from './routes/sync';

/**
 * Browser and Capacitor WebView origins allowed to call the API (see D018).
 * - 5173: Vite dev server
 * - 4173: Vite preview server (proxies /api to the backend)
 * - 3001: the API itself (same-origin)
 * - portless localhost / capacitor:// / ionic://: Capacitor Android/iOS WebViews
 */
export const ALLOWED_ORIGINS: readonly string[] = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
  'http://localhost:3001',
  'http://127.0.0.1:3001',
  'http://localhost',
  'https://localhost',
  'capacitor://localhost',
  'ionic://localhost',
  'http://127.0.0.1',
  'https://127.0.0.1',
];

/** Routes that define their own, larger JSON body parser. */
const CUSTOM_BODY_LIMIT_PATHS = new Set(['/api/data/import', '/api/sync']);

/** RFC 1918 private network origin matcher for LAN Wi-Fi sync. */
const RFC1918_ORIGIN_REGEX = /^https?:\/\/(?:192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})(?::\d+)?$/;

/** mDNS (.local) hostname origin matcher for LAN discovery. */
const MDNS_ORIGIN_REGEX = /^https?:\/\/[a-zA-Z0-9._-]+\.local(?::\d+)?$/i;

function isAllowedOrigin(origin: string | undefined): boolean {
  // Requests without an Origin header come from local tools (curl, scripts)
  // or same-origin navigation, which are not cross-origin browser requests.
  if (!origin) return true;
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  if (RFC1918_ORIGIN_REGEX.test(origin)) return true;
  return MDNS_ORIGIN_REGEX.test(origin);
}

/**
 * Resolves the primary non-internal IPv4 LAN address of the host machine.
 */
export function getLanIpAddress(): string | null {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    const netList = interfaces[name];
    if (!netList) continue;
    for (const net of netList) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return null;
}

/** Zero-dependency security headers (replaces the need for helmet). */
function securityHeaders(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self';"
  );
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
  app.use('/api/home', homeRouter);
  app.use('/api/dashboard', homeRouter);
  app.use('/api/folders', foldersRouter);
  app.use('/api/data', dataRouter);
  app.use('/api/sync', syncRouter);

  // Health check endpoint
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  return app;
}
