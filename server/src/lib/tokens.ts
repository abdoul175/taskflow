import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

/** SHA-256 hash used to store one-time tokens and codes at rest. */
export function hashSecret(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** 32 random bytes, URL-safe — used for reset links and login challenges. */
export function randomToken(): string {
  return randomBytes(32).toString('base64url');
}

/** Zero-padded numeric code, e.g. "004217". */
export function numericCode(digits = 6): string {
  return String(randomInt(0, 10 ** digits)).padStart(digits, '0');
}

/** Human-friendly recovery code, e.g. "A1B2C-3D4E5". */
export function recoveryCode(): string {
  const raw = randomBytes(5).toString('hex').toUpperCase();
  return `${raw.slice(0, 5)}-${raw.slice(5)}`;
}

/** Constant-time comparison for two strings of equal length. */
export function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
