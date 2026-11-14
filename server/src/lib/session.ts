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
export async function createSession(userId: string): Promise<string> {
  const token = randomBytes(32).toString('base64url');
  const now = Date.now();

  await db.run(
    'INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)',
    [
      hashToken(token),
      userId,
      new Date(now + config.sessionTtlMs).toISOString(),
      new Date(now).toISOString(),
    ],
  );

  return token;
}

export async function deleteSession(token: string): Promise<void> {
  await db.run('DELETE FROM sessions WHERE id = ?', [hashToken(token)]);
}

/**
 * Revoke every session for a user except the one making the request.
 * Used after a password change so other devices are signed out.
 */
export async function deleteOtherSessions(
  userId: string,
  keepToken: string,
): Promise<void> {
  await db.run('DELETE FROM sessions WHERE user_id = ? AND id <> ?', [
    userId,
    hashToken(keepToken),
  ]);
}

export async function findSessionUser(token: string): Promise<PublicUser | null> {
  const row = await db.get<UserRow & { session_expires_at: string }>(
    `SELECT u.*, s.expires_at AS session_expires_at
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.id = ?`,
    [hashToken(token)],
  );

  if (!row) return null;

  if (new Date(row.session_expires_at).getTime() <= Date.now()) {
    await deleteSession(token);
    return null;
  }

  return toPublicUser(row);
}
