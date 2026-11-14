import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { config } from '../config.js';
import { db, newId } from '../db.js';
import { hashPassword, verifyPassword } from '../lib/password.js';
import { createSession, deleteOtherSessions, deleteSession } from '../lib/session.js';
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

const profileSchema = z.object({
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
});

const changePasswordSchema = z.object({
  currentPassword: z
    .string()
    .min(1, 'Enter your current password.')
    .max(128, 'Password is too long.'),
  newPassword: z
    .string()
    .min(8, 'New password must be at least 8 characters.')
    .max(128, 'Password is too long.'),
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

authRouter.patch('/profile', requireAuth, (req, res) => {
  const parsed = profileSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input.' });
    return;
  }

  const { name, email } = parsed.data;
  const userId = req.user!.id;

  const existing = db
    .prepare('SELECT id FROM users WHERE email = ? AND id <> ?')
    .get(email, userId) as { id: string } | undefined;

  if (existing) {
    res.status(409).json({ error: 'An account with that email already exists.' });
    return;
  }

  try {
    db.prepare('UPDATE users SET name = ?, email = ? WHERE id = ?').run(
      name,
      email,
      userId,
    );
  } catch (error) {
    if (isUniqueViolation(error)) {
      res.status(409).json({ error: 'An account with that email already exists.' });
      return;
    }
    throw error;
  }

  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as UserRow;
  res.json({ user: toPublicUser(row) });
});

authRouter.post('/change-password', requireAuth, authLimiter, async (req, res) => {
  const parsed = changePasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input.' });
    return;
  }

  const { currentPassword, newPassword } = parsed.data;

  if (currentPassword === newPassword) {
    res.status(400).json({ error: 'Choose a password different from your current one.' });
    return;
  }

  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user!.id) as
    | UserRow
    | undefined;

  if (!row) {
    res.status(401).json({ error: 'Please sign in to continue.' });
    return;
  }

  const passwordMatches = await verifyPassword(currentPassword, row.password_hash);
  if (!passwordMatches) {
    res.status(400).json({ error: 'Your current password is incorrect.' });
    return;
  }

  const passwordHash = await hashPassword(newPassword);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(
    passwordHash,
    row.id,
  );

  // Sign out every other device; the session that made this change stays valid.
  if (req.sessionToken) deleteOtherSessions(row.id, req.sessionToken);

  res.status(204).end();
});
