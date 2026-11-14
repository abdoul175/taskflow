import type { RequestHandler } from 'express';
import { config } from '../config.js';
import { findSessionUser } from '../lib/session.js';

export const requireAuth: RequestHandler = (req, res, next) => {
  const token = req.cookies?.[config.cookieName] as string | undefined;

  if (!token) {
    res.status(401).json({ error: 'Please sign in to continue.' });
    return;
  }

  const user = findSessionUser(token);
  if (!user) {
    res.status(401).json({ error: 'Your session expired. Please sign in again.' });
    return;
  }

  req.user = user;
  req.sessionToken = token;
  next();
};
