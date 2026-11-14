import type { CookieOptions } from 'express';
import { config } from '../config.js';

const baseOptions: CookieOptions = {
  httpOnly: true,
  sameSite: 'lax',
  secure: config.cookieSecure,
  path: '/',
};

export const sessionCookieOptions: CookieOptions = {
  ...baseOptions,
  maxAge: config.sessionTtlMs,
};

export const clearedSessionCookieOptions: CookieOptions = baseOptions;
