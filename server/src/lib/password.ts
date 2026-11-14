import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback) as (
  password: string,
  salt: Buffer,
  keyLength: number,
) => Promise<Buffer>;

const KEY_LENGTH = 64;

/**
 * Hash a password with scrypt using a random 16-byte salt.
 * Format: scrypt$<salt base64>$<derived key base64>
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scrypt(password, salt, KEY_LENGTH);
  return `scrypt$${salt.toString('base64')}$${derived.toString('base64')}`;
}

export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const [scheme, saltBase64, hashBase64] = stored.split('$');
  if (scheme !== 'scrypt' || !saltBase64 || !hashBase64) return false;

  const salt = Buffer.from(saltBase64, 'base64');
  const expected = Buffer.from(hashBase64, 'base64');
  if (expected.length !== KEY_LENGTH) return false;

  const derived = await scrypt(password, salt, expected.length);
  return timingSafeEqual(derived, expected);
}
