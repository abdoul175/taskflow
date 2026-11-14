import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { config } from '../config.js';
import { db, newId } from '../db.js';
import { hashPassword, verifyPassword } from '../lib/password.js';
import { createSession, deleteSession } from '../lib/session.js';
import {
  clearedSessionCookieOptions,
  sessionCookieOptions,
} from '../lib/cookies.js';
import { requireAuth } from '../middleware/auth.js';
import { toPublicUser, type UserRow } from '../models.js';

export const authRouter = Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: (_req, res) => {
    res
      .status(429)
      .json({ error: 'Too many attempts. Please try again in a few minutes.' });
  },
});

const registerSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Enter your name (at least 2 characters).')
    .max(80, 'Name is too long.'),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email('Enter a valid email address.')
    .max(254, 'Email is too long.'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters.')
    .max(128, 'Password is too long.'),
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address.'),
  password: z.string().min(1, 'Enter your password.').max(128),
});

// Used to keep login timing similar when the email doesn't exist.
const dummyPasswordHash = await hashPassword('taskflow-dummy-password');

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    String((error as { code: unknown }).code).includes('SQLITE_CONSTRAINT')
  );
}

authRouter.post('/register', authLimiter, async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input.' });
    return;
  }

  const { name, email, password } = parsed.data;

  const existing = db
    .prepare('SELECT id FROM users WHERE email = ?')
    .get(email) as { id: string } | undefined;

  if (existing) {
    res.status(409).json({ error: 'An account with that email already exists.' });
    return;
  }

  const passwordHash = await hashPassword(password);
  const userId = newId();
  const now = new Date().toISOString();

  try {
    db.transaction(() => {
      db.prepare(
        'INSERT INTO users (id, name, email, password_hash, created_at) VALUES (?, ?, ?, ?, ?)',
      ).run(userId, name, email, passwordHash, now);

      db.prepare(
        'INSERT INTO projects (id, user_id, name, color, created_at) VALUES (?, ?, ?, ?, ?)',
      ).run(newId(), userId, 'Personal', '#6366f1', now);
    })();
  } catch (error) {
    if (isUniqueViolation(error)) {
      res.status(409).json({ error: 'An account with that email already exists.' });
      return;
    }
    throw error;
  }

  const token = createSession(userId);
  res.cookie(config.cookieName, token, sessionCookieOptions);

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as UserRow;
  res.status(201).json({ user: toPublicUser(user) });
});

authRouter.post('/login', authLimiter, async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input.' });
    return;
  }

  const { email, password } = parsed.data;
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email) as
    | UserRow
    | undefined;

  const passwordMatches = await verifyPassword(
    password,
    user?.password_hash ?? dummyPasswordHash,
  );

  if (!user || !passwordMatches) {
    res.status(401).json({ error: 'Invalid email or password.' });
    return;
  }

  const token = createSession(user.id);
  res.cookie(config.cookieName, token, sessionCookieOptions);
  res.json({ user: toPublicUser(user) });
});

authRouter.post('/logout', (req, res) => {
  const token = req.cookies?.[config.cookieName] as string | undefined;
  if (token) deleteSession(token);

  res.clearCookie(config.cookieName, clearedSessionCookieOptions);
  res.status(204).end();
});

authRouter.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});
