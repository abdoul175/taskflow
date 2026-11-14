import type { RequestHandler } from 'express';
import { config } from '../config.js';

const devOrigins = new Set([
  'http://localhost:5173',
  'http://127.0.0.1:5173',
]);

if (config.appOrigin) {
  devOrigins.add(config.appOrigin.replace(/\/$/, ''));
}

/**
 * Defense-in-depth CSRF protection alongside the SameSite=Lax session cookie.
 * State-changing requests carrying a browser Origin must come from an allowed
 * origin or the same host.
 */
export const checkOrigin: RequestHandler = (req, res, next) => {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
    next();
    return;
  }

  const origin = req.get('origin');
  if (!origin) {
    // Non-browser clients (curl, server-to-server) don't send Origin.
    next();
    return;
  }

  if (devOrigins.has(origin)) {
    next();
    return;
  }

  try {
    if (new URL(origin).host === req.get('host')) {
      next();
      return;
    }
  } catch {
    // Malformed Origin falls through to rejection.
  }

  res.status(403).json({ error: 'Request origin is not allowed.' });
};
