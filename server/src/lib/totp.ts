import { Secret, TOTP } from 'otpauth';

const ISSUER = 'Taskflow';
const PERIOD_SECONDS = 30;
const DIGITS = 6;

function makeTotp(secretBase32: string, label: string): TOTP {
  return new TOTP({
    issuer: ISSUER,
    label,
    algorithm: 'SHA1',
    digits: DIGITS,
    period: PERIOD_SECONDS,
    secret: Secret.fromBase32(secretBase32),
  });
}

export function createTotpSecret(): string {
  return new Secret({ size: 20 }).base32;
}

export function totpProvisioningUri(
  secretBase32: string,
  accountEmail: string,
): string {
  return makeTotp(secretBase32, accountEmail).toString();
}

/**
 * Validate a 6-digit code, allowing one 30-second step of clock drift.
 * Returns the matched step so callers can reject replayed codes.
 */
export function verifyTotp(
  secretBase32: string,
  token: string,
): { step: number } | null {
  const normalized = token.replace(/\s+/g, '');
  if (!/^\d{6}$/.test(normalized)) return null;

  const delta = makeTotp(secretBase32, 'validation').validate({
    token: normalized,
    window: 1,
  });

  if (delta === null) return null;
  return { step: Math.floor(Date.now() / (PERIOD_SECONDS * 1000)) + delta };
}
