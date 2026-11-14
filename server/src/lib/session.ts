import { createHash, randomBytes } from 'node:crypto';
import { db } from '../db.js';
import { config } from '../config.js';
import { toPublicUser, type PublicUser, type UserRow } from '../models.js';

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Create an opaque session token. Only the SHA-256 hash is stored, so a
 * database leak cannot be used to hijack live sessions.
 */
export function createSession(userId: string): string {
  const token = randomBytes(32).toString('base64url');
  const now = Date.now();

  db.prepare(
    'INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)',
  ).run(
    hashToken(token),
    userId,
    new Date(now + config.sessionTtlMs).toISOString(),
    new Date(now).toISOString(),
  );

  return token;
}

export function deleteSession(token: string): void {
  db.prepare('DELETE FROM sessions WHERE id = ?').run(hashToken(token));
}

export function findSessionUser(token: string): PublicUser | null {
  const row = db
    .prepare(
      `SELECT u.*, s.expires_at AS session_expires_at
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.id = ?`,
    )
    .get(hashToken(token)) as (UserRow & { session_expires_at: string }) | undefined;

  if (!row) return null;

  if (new Date(row.session_expires_at).getTime() <= Date.now()) {
    deleteSession(token);
    return null;
  }

  return toPublicUser(row);
}
