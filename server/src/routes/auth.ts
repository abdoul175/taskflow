import { createHash } from 'node:crypto';
import {
  Router,
  type CookieOptions,
  type Request,
  type Response,
} from 'express';
import { rateLimit } from 'express-rate-limit';
import QRCode from 'qrcode';
import { z } from 'zod';
import {
  config,
  emailPreviewMode,
  googleOAuthEnabled,
} from '../config.js';
import { db, newId } from '../db.js';
import { hashPassword, verifyPassword } from '../lib/password.js';
import { sendMail } from '../lib/mailer.js';
import {
  createSession,
  deleteOtherSessions,
  deleteSession,
} from '../lib/session.js';
import {
  clearedSessionCookieOptions,
  sessionCookieOptions,
} from '../lib/cookies.js';
import {
  hashSecret,
  numericCode,
  randomToken,
  recoveryCode,
  safeEqual,
} from '../lib/tokens.js';
import { createTotpSecret, totpProvisioningUri, verifyTotp } from '../lib/totp.js';
import { requireAuth } from '../middleware/auth.js';
import { toPublicUser, type UserRow } from '../models.js';

export const authRouter = Router();

const EMAIL_CODE_TTL_MS = 15 * 60 * 1000;
const RESET_TOKEN_TTL_MS = 30 * 60 * 1000;
const LOGIN_CHALLENGE_TTL_MS = 5 * 60 * 1000;
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
const MAX_CODE_ATTEMPTS = 5;
const RECOVERY_CODE_COUNT = 8;
const OAUTH_STATE_COOKIE = 'taskflow_oauth_state';
const LOGIN_CHALLENGE_COOKIE = 'taskflow_2fa_challenge';

const oauthStateCookieBase: CookieOptions = {
  httpOnly: true,
  sameSite: 'lax',
  secure: config.cookieSecure,
  path: '/api/auth/google',
};

const oauthStateCookieOptions: CookieOptions = {
  ...oauthStateCookieBase,
  maxAge: OAUTH_STATE_TTL_MS,
};

const loginChallengeCookieBase: CookieOptions = {
  httpOnly: true,
  sameSite: 'lax',
  secure: config.cookieSecure,
  path: '/',
};

const loginChallengeCookieOptions: CookieOptions = {
  ...loginChallengeCookieBase,
  maxAge: LOGIN_CHALLENGE_TTL_MS,
};

// Codes and links are only echoed back to the client when no mail transport is
// configured and the app is not running in production.
const exposeDevSecrets = emailPreviewMode && !config.isProduction;

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

const emailLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 8,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({
      error: 'Too many emails requested. Please try again in a few minutes.',
    });
  },
});

const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email('Enter a valid email address.')
  .max(254, 'Email is too long.');

const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters.')
  .max(128, 'Password is too long.');

const registerSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Enter your name (at least 2 characters).')
    .max(80, 'Name is too long.'),
  email: emailSchema,
  password: passwordSchema,
});

const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Enter your password.').max(128),
});

const profileSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Enter your name (at least 2 characters).')
    .max(80, 'Name is too long.'),
  email: emailSchema,
});

const changePasswordSchema = z.object({
  currentPassword: z
    .string()
    .min(1, 'Enter your current password.')
    .max(128, 'Password is too long.'),
  newPassword: passwordSchema,
});

const verifyEmailSchema = z.object({
  email: emailSchema,
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'Enter the 6-digit code from your email.'),
});

const resendVerificationSchema = z.object({ email: emailSchema });

const forgotPasswordSchema = z.object({ email: emailSchema });

const resetPasswordSchema = z.object({
  token: z.string().min(20, 'This reset link is invalid.').max(200),
  password: passwordSchema,
});

const twoFactorCodeSchema = z.object({
  code: z
    .string()
    .trim()
    .min(6, 'Enter the 6-digit code or a recovery code.')
    .max(20, 'That code is too long.'),
});

const twoFactorLoginSchema = z.object({
  challengeToken: z
    .string()
    .min(20, 'This sign-in attempt is invalid.')
    .max(200)
    .optional(),
  code: z
    .string()
    .trim()
    .min(6, 'Enter the 6-digit code or a recovery code.')
    .max(20, 'That code is too long.'),
});

const disableTwoFactorSchema = z.object({
  password: z.string().min(1, 'Enter your password.').max(128),
  code: z.string().trim().min(6).max(20),
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

function getUserRow(id: string): UserRow | undefined {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id) as
    | UserRow
    | undefined;
}

function startSession(res: Response, userId: string): void {
  const token = createSession(userId);
  res.cookie(config.cookieName, token, sessionCookieOptions);
}

function appOrigin(req: Request): string {
  const origin = req.get('origin');
  if (origin) {
    try {
      const url = new URL(origin);
      if (url.protocol === 'http:' || url.protocol === 'https:') {
        return url.origin;
      }
    } catch {
      // Fall through to configured values.
    }
  }
  if (config.appUrl) return config.appUrl;
  return `${req.protocol}://${req.get('host')}`;
}

function googleRedirectUri(req: Request): string {
  if (config.google.redirectUri) return config.google.redirectUri;
  return `${appOrigin(req)}/api/auth/google/callback`;
}

function clearOAuthStateCookie(res: Response): void {
  res.clearCookie(OAUTH_STATE_COOKIE, oauthStateCookieBase);
}

function clearLoginChallengeCookie(res: Response): void {
  res.clearCookie(LOGIN_CHALLENGE_COOKIE, loginChallengeCookieBase);
}

function emailFrame(title: string, body: string): string {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:32px 16px;background:#060911;font-family:Arial,Helvetica,sans-serif;color:#e2e8f0">
    <div style="max-width:480px;margin:0 auto;background:#0b1220;border:1px solid #1e293b;border-radius:16px;padding:32px">
      <p style="margin:0 0 24px;font-size:18px;font-weight:700;color:#ffffff">Taskflow</p>
      <h1 style="margin:0 0 12px;font-size:20px;color:#ffffff">${title}</h1>
      ${body}
      <p style="margin:28px 0 0;font-size:12px;color:#64748b">Taskflow — focus, organized.</p>
    </div>
  </body>
</html>`;
}

async function issueVerificationCode(user: UserRow): Promise<string> {
  const code = numericCode(6);
  const now = new Date();

  db.prepare(
    `INSERT INTO email_verification_tokens (user_id, code_hash, attempts, expires_at, created_at)
     VALUES (?, ?, 0, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       code_hash = excluded.code_hash,
       attempts = 0,
       expires_at = excluded.expires_at,
       created_at = excluded.created_at`,
  ).run(
    user.id,
    hashSecret(code),
    new Date(now.getTime() + EMAIL_CODE_TTL_MS).toISOString(),
    now.toISOString(),
  );

  try {
    await sendMail({
      to: user.email,
      subject: 'Your Taskflow verification code',
      text: `Hi ${user.name},\n\nYour Taskflow verification code is ${code}. It expires in 15 minutes.\n\nIf you didn't create a Taskflow account, you can ignore this email.`,
      html: emailFrame(
        'Verify your email',
        `<p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#94a3b8">Hi ${user.name}, use this code to finish creating your Taskflow account. It expires in 15 minutes.</p>
         <p style="margin:0;padding:16px;border-radius:12px;background:#111a2e;border:1px solid #1e293b;text-align:center;font-size:30px;letter-spacing:8px;font-weight:700;color:#ffffff">${code}</p>`,
      ),
    });
  } catch (error) {
    console.error('Could not send verification email:', error);
  }

  return code;
}

function normalizeRecoveryCode(code: string): string {
  return code.replace(/[^a-z0-9]/gi, '').toUpperCase();
}

function issueRecoveryCodes(userId: string): string[] {
  const codes = Array.from({ length: RECOVERY_CODE_COUNT }, () => recoveryCode());
  const now = new Date().toISOString();

  db.transaction(() => {
    db.prepare('DELETE FROM recovery_codes WHERE user_id = ?').run(userId);
    const insert = db.prepare(
      'INSERT INTO recovery_codes (id, user_id, code_hash, used_at, created_at) VALUES (?, ?, ?, NULL, ?)',
    );
    for (const code of codes) {
      insert.run(newId(), userId, hashSecret(normalizeRecoveryCode(code)), now);
    }
  })();

  return codes;
}

function consumeRecoveryCode(userId: string, code: string): boolean {
  const normalized = normalizeRecoveryCode(code);
  if (normalized.length !== 10) return false;

  const candidates = db
    .prepare(
      'SELECT id, code_hash FROM recovery_codes WHERE user_id = ? AND used_at IS NULL',
    )
    .all(userId) as { id: string; code_hash: string }[];

  const targetHash = hashSecret(normalized);
  const match = candidates.find((candidate) =>
    safeEqual(candidate.code_hash, targetHash),
  );

  if (!match) return false;

  db.prepare('UPDATE recovery_codes SET used_at = ? WHERE id = ?').run(
    new Date().toISOString(),
    match.id,
  );
  return true;
}

/** Accepts either a TOTP code or a single-use recovery code. */
function verifySecondFactor(user: UserRow, code: string): boolean {
  if (user.totp_secret) {
    const result = verifyTotp(user.totp_secret, code);
    if (result) {
      if (
        user.totp_last_step !== null &&
        result.step <= user.totp_last_step
      ) {
        return false;
      }
      db.prepare('UPDATE users SET totp_last_step = ? WHERE id = ?').run(
        result.step,
        user.id,
      );
      return true;
    }
  }

  return consumeRecoveryCode(user.id, code);
}

function createLoginChallenge(userId: string): string {
  const token = randomToken();
  const now = Date.now();

  db.transaction(() => {
    db.prepare('DELETE FROM login_challenges WHERE user_id = ?').run(userId);
    db.prepare(
      'INSERT INTO login_challenges (id, user_id, attempts, expires_at, created_at) VALUES (?, ?, 0, ?, ?)',
    ).run(
      hashSecret(token),
      userId,
      new Date(now + LOGIN_CHALLENGE_TTL_MS).toISOString(),
      new Date(now).toISOString(),
    );
  })();

  return token;
}

authRouter.get('/providers', (_req, res) => {
  res.json({ google: googleOAuthEnabled });
});

authRouter.get('/google', authLimiter, (req, res) => {
  if (!googleOAuthEnabled) {
    res.redirect('/login?oauth=unavailable');
    return;
  }

  const state = randomToken();
  const codeVerifier = randomToken();
  const codeChallenge = createHash('sha256')
    .update(codeVerifier)
    .digest('base64url');
  const redirectUri = googleRedirectUri(req);

  const statePayload = Buffer.from(
    JSON.stringify({ state, codeVerifier, redirectUri }),
  ).toString('base64url');

  res.cookie(OAUTH_STATE_COOKIE, statePayload, oauthStateCookieOptions);

  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', config.google.clientId);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', 'openid email profile');
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('code_challenge', codeChallenge);
  authUrl.searchParams.set('code_challenge_method', 'S256');
  authUrl.searchParams.set('prompt', 'select_account');

  res.redirect(authUrl.toString());
});

authRouter.get('/google/callback', authLimiter, async (req, res) => {
  const fail = (reason = 'error') => {
    clearOAuthStateCookie(res);
    res.redirect(`/login?oauth=${reason}`);
  };

  if (!googleOAuthEnabled) {
    fail('unavailable');
    return;
  }

  const rawState = req.cookies?.[OAUTH_STATE_COOKIE];
  if (typeof rawState !== 'string') {
    fail();
    return;
  }

  let oauthState: {
    state?: string;
    codeVerifier?: string;
    redirectUri?: string;
  };

  try {
    oauthState = JSON.parse(
      Buffer.from(rawState, 'base64url').toString('utf8'),
    ) as typeof oauthState;
  } catch {
    fail();
    return;
  }

  const returnedState =
    typeof req.query.state === 'string' ? req.query.state : '';
  const code = typeof req.query.code === 'string' ? req.query.code : '';

  if (
    !oauthState.state ||
    !oauthState.codeVerifier ||
    !oauthState.redirectUri ||
    !returnedState ||
    !code ||
    !safeEqual(oauthState.state, returnedState)
  ) {
    fail();
    return;
  }

  try {
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: config.google.clientId,
        client_secret: config.google.clientSecret,
        redirect_uri: oauthState.redirectUri,
        grant_type: 'authorization_code',
        code_verifier: oauthState.codeVerifier,
      }),
    });

    if (!tokenResponse.ok) {
      console.error(
        'Google token exchange failed:',
        tokenResponse.status,
        await tokenResponse.text(),
      );
      fail();
      return;
    }

    const tokens = (await tokenResponse.json()) as { access_token?: string };
    if (!tokens.access_token) {
      fail();
      return;
    }

    const profileResponse = await fetch(
      'https://openidconnect.googleapis.com/v1/userinfo',
      { headers: { Authorization: `Bearer ${tokens.access_token}` } },
    );

    if (!profileResponse.ok) {
      console.error('Google userinfo request failed:', profileResponse.status);
      fail();
      return;
    }

    const profile = (await profileResponse.json()) as {
      sub?: string;
      email?: string;
      email_verified?: boolean;
      name?: string;
    };

    if (!profile.sub || !profile.email || profile.email_verified !== true) {
      fail();
      return;
    }

    const email = profile.email.trim().toLowerCase();
    const displayName =
      profile.name?.trim().slice(0, 80) ||
      email.split('@')[0] ||
      'Taskflow user';

    let user = db
      .prepare('SELECT * FROM users WHERE google_id = ?')
      .get(profile.sub) as UserRow | undefined;

    if (user) {
      if (user.name !== displayName) {
        db.prepare('UPDATE users SET name = ? WHERE id = ?').run(
          displayName,
          user.id,
        );
        user = getUserRow(user.id)!;
      }
    } else {
      const existing = db
        .prepare('SELECT * FROM users WHERE email = ?')
        .get(email) as UserRow | undefined;

      if (existing) {
        if (existing.google_id && existing.google_id !== profile.sub) {
          fail('link-conflict');
          return;
        }

        const wasUnverified = existing.email_verified === 0;
        const passwordHash = wasUnverified
          ? await hashPassword(randomToken())
          : existing.password_hash;

        db.transaction(() => {
          db.prepare(
            'UPDATE users SET google_id = ?, email_verified = 1, password_hash = ? WHERE id = ?',
          ).run(profile.sub, passwordHash, existing.id);

          if (wasUnverified) {
            // Google has now proven ownership of an address that was only
            // pre-registered. Invalidate the old password and sessions.
            db.prepare('DELETE FROM sessions WHERE user_id = ?').run(existing.id);
            db.prepare('DELETE FROM login_challenges WHERE user_id = ?').run(
              existing.id,
            );
            db.prepare(
              'DELETE FROM email_verification_tokens WHERE user_id = ?',
            ).run(existing.id);
          }
        })();

        user = getUserRow(existing.id)!;
      } else {
        const passwordHash = await hashPassword(randomToken());
        const userId = newId();
        const now = new Date().toISOString();

        try {
          db.transaction(() => {
            db.prepare(
              `INSERT INTO users (id, name, email, password_hash, google_id, email_verified, created_at)
               VALUES (?, ?, ?, ?, ?, 1, ?)`,
            ).run(
              userId,
              displayName,
              email,
              passwordHash,
              profile.sub,
              now,
            );

            db.prepare(
              'INSERT INTO projects (id, user_id, name, color, created_at) VALUES (?, ?, ?, ?, ?)',
            ).run(newId(), userId, 'Personal', '#6366f1', now);
          })();
        } catch (error) {
          if (isUniqueViolation(error)) {
            fail('link-conflict');
            return;
          }
          throw error;
        }

        user = getUserRow(userId)!;
      }
    }

    if (!user) {
      fail();
      return;
    }

    clearOAuthStateCookie(res);
    clearLoginChallengeCookie(res);

    if (user.totp_enabled === 1) {
      const challengeToken = createLoginChallenge(user.id);
      res.cookie(
        LOGIN_CHALLENGE_COOKIE,
        challengeToken,
        loginChallengeCookieOptions,
      );
      res.redirect('/login?oauth=2fa');
      return;
    }

    startSession(res, user.id);
    res.redirect('/');
  } catch (error) {
    console.error('Google sign-in failed:', error);
    fail();
  }
});

authRouter.post('/register', authLimiter, emailLimiter, async (req, res) => {
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
        `INSERT INTO users (id, name, email, password_hash, email_verified, created_at)
         VALUES (?, ?, ?, ?, 0, ?)`,
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

  const user = getUserRow(userId)!;
  const code = await issueVerificationCode(user);

  res.status(201).json({
    verificationRequired: true,
    email: user.email,
    ...(exposeDevSecrets ? { devCode: code } : {}),
  });
});

authRouter.post('/verify-email', authLimiter, (req, res) => {
  const parsed = verifyEmailSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input.' });
    return;
  }

  const { email, code } = parsed.data;
  const user = db
    .prepare('SELECT * FROM users WHERE email = ?')
    .get(email) as UserRow | undefined;

  if (!user) {
    res.status(400).json({ error: 'That code is invalid or has expired.' });
    return;
  }

  if (user.email_verified === 1) {
    res.status(400).json({ error: 'That email is already verified. Please sign in.' });
    return;
  }

  const token = db
    .prepare('SELECT * FROM email_verification_tokens WHERE user_id = ?')
    .get(user.id) as
    | { code_hash: string; attempts: number; expires_at: string }
    | undefined;

  if (!token || new Date(token.expires_at).getTime() <= Date.now()) {
    db.prepare('DELETE FROM email_verification_tokens WHERE user_id = ?').run(
      user.id,
    );
    res.status(400).json({
      error: 'That code is invalid or has expired. Request a new code.',
    });
    return;
  }

  if (token.attempts >= MAX_CODE_ATTEMPTS) {
    db.prepare('DELETE FROM email_verification_tokens WHERE user_id = ?').run(
      user.id,
    );
    res.status(400).json({
      error: 'Too many attempts. Request a new verification code.',
    });
    return;
  }

  if (!safeEqual(token.code_hash, hashSecret(code))) {
    db.prepare(
      'UPDATE email_verification_tokens SET attempts = attempts + 1 WHERE user_id = ?',
    ).run(user.id);
    res.status(400).json({ error: 'That code is invalid or has expired.' });
    return;
  }

  db.transaction(() => {
    db.prepare('UPDATE users SET email_verified = 1 WHERE id = ?').run(user.id);
    db.prepare('DELETE FROM email_verification_tokens WHERE user_id = ?').run(
      user.id,
    );
  })();

  startSession(res, user.id);
  res.json({ user: toPublicUser({ ...user, email_verified: 1 }) });
});

authRouter.post(
  '/resend-verification',
  emailLimiter,
  async (req, res) => {
    const parsed = resendVerificationSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input.' });
      return;
    }

    const user = db
      .prepare('SELECT * FROM users WHERE email = ?')
      .get(parsed.data.email) as UserRow | undefined;

    let devCode: string | undefined;
    if (user && user.email_verified === 0) {
      const code = await issueVerificationCode(user);
      if (exposeDevSecrets) devCode = code;
    }

    res.status(202).json({
      ok: true,
      message:
        'If that account is waiting for verification, a new code has been sent.',
      ...(devCode ? { devCode } : {}),
    });
  },
);

authRouter.post('/login', authLimiter, async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input.' });
    return;
  }

  const { email, password } = parsed.data;
  const user = db
    .prepare('SELECT * FROM users WHERE email = ?')
    .get(email) as UserRow | undefined;

  const passwordMatches = await verifyPassword(
    password,
    user?.password_hash ?? dummyPasswordHash,
  );

  if (!user || !passwordMatches) {
    res.status(401).json({ error: 'Invalid email or password.' });
    return;
  }

  if (user.email_verified !== 1) {
    res.status(403).json({
      error: 'Verify your email address before signing in.',
      code: 'email_not_verified',
      email: user.email,
    });
    return;
  }

  if (user.totp_enabled === 1) {
    res.json({
      requires2fa: true,
      challengeToken: createLoginChallenge(user.id),
    });
    return;
  }

  startSession(res, user.id);
  res.json({ user: toPublicUser(user) });
});

authRouter.post('/login/2fa', authLimiter, (req, res) => {
  const parsed = twoFactorLoginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input.' });
    return;
  }

  const cookieChallengeToken = req.cookies?.[LOGIN_CHALLENGE_COOKIE];
  const challengeToken =
    parsed.data.challengeToken ??
    (typeof cookieChallengeToken === 'string' ? cookieChallengeToken : '');
  const { code } = parsed.data;

  if (!challengeToken) {
    clearLoginChallengeCookie(res);
    res.status(401).json({
      error: 'This sign-in attempt expired. Please sign in again.',
    });
    return;
  }

  const challengeId = hashSecret(challengeToken);
  const challenge = db
    .prepare('SELECT * FROM login_challenges WHERE id = ?')
    .get(challengeId) as
    | { id: string; user_id: string; attempts: number; expires_at: string }
    | undefined;

  if (!challenge) {
    clearLoginChallengeCookie(res);
    res.status(401).json({
      error: 'This sign-in attempt expired. Please sign in again.',
    });
    return;
  }

  if (new Date(challenge.expires_at).getTime() <= Date.now()) {
    db.prepare('DELETE FROM login_challenges WHERE id = ?').run(challenge.id);
    clearLoginChallengeCookie(res);
    res.status(401).json({
      error: 'This sign-in attempt expired. Please sign in again.',
    });
    return;
  }

  const user = getUserRow(challenge.user_id);
  if (!user || user.totp_enabled !== 1) {
    db.prepare('DELETE FROM login_challenges WHERE id = ?').run(challenge.id);
    clearLoginChallengeCookie(res);
    res.status(401).json({
      error: 'This sign-in attempt expired. Please sign in again.',
    });
    return;
  }

  if (!verifySecondFactor(user, code)) {
    const attempts = challenge.attempts + 1;
    if (attempts >= MAX_CODE_ATTEMPTS) {
      db.prepare('DELETE FROM login_challenges WHERE id = ?').run(challenge.id);
      clearLoginChallengeCookie(res);
      res.status(401).json({
        error: 'Too many incorrect codes. Please sign in again.',
      });
    } else {
      db.prepare('UPDATE login_challenges SET attempts = ? WHERE id = ?').run(
        attempts,
        challenge.id,
      );
      res.status(401).json({ error: 'That authentication code is incorrect.' });
    }
    return;
  }

  db.prepare('DELETE FROM login_challenges WHERE id = ?').run(challenge.id);
  clearLoginChallengeCookie(res);
  startSession(res, user.id);
  res.json({ user: toPublicUser(user) });
});

authRouter.post(
  '/forgot-password',
  emailLimiter,
  async (req, res) => {
    const parsed = forgotPasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input.' });
      return;
    }

    const user = db
      .prepare('SELECT * FROM users WHERE email = ?')
      .get(parsed.data.email) as UserRow | undefined;

    let devResetUrl: string | undefined;

    if (user) {
      const token = randomToken();
      const now = new Date();

      db.transaction(() => {
        db.prepare('DELETE FROM password_reset_tokens WHERE user_id = ?').run(
          user.id,
        );
        db.prepare(
          'INSERT INTO password_reset_tokens (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)',
        ).run(
          hashSecret(token),
          user.id,
          new Date(now.getTime() + RESET_TOKEN_TTL_MS).toISOString(),
          now.toISOString(),
        );
      })();

      const resetUrl = `${appOrigin(req)}/reset-password?token=${encodeURIComponent(token)}`;

      try {
        await sendMail({
          to: user.email,
          subject: 'Reset your Taskflow password',
          text: `Hi ${user.name},\n\nUse this link to choose a new Taskflow password. It expires in 30 minutes:\n\n${resetUrl}\n\nIf you didn't request a reset, you can ignore this email.`,
          html: emailFrame(
            'Reset your password',
            `<p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#94a3b8">Hi ${user.name}, click the button below to choose a new password. This link expires in 30 minutes.</p>
             <p style="margin:0 0 20px"><a href="${resetUrl}" style="display:inline-block;padding:12px 20px;border-radius:10px;background:#6366f1;color:#ffffff;font-size:14px;font-weight:700;text-decoration:none">Choose new password</a></p>
             <p style="margin:0;font-size:12px;line-height:1.6;color:#64748b">If you didn't request a reset, you can safely ignore this email.</p>`,
          ),
        });
      } catch (error) {
        console.error('Could not send password reset email:', error);
      }

      if (exposeDevSecrets) devResetUrl = resetUrl;
    }

    res.status(202).json({
      ok: true,
      message:
        'If an account exists for that email, a reset link has been sent.',
      ...(devResetUrl ? { devResetUrl } : {}),
    });
  },
);

authRouter.post('/reset-password', authLimiter, async (req, res) => {
  const parsed = resetPasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input.' });
    return;
  }

  const { token, password } = parsed.data;
  const tokenId = hashSecret(token);
  const row = db
    .prepare('SELECT * FROM password_reset_tokens WHERE id = ?')
    .get(tokenId) as
    | { id: string; user_id: string; expires_at: string }
    | undefined;

  if (!row || new Date(row.expires_at).getTime() <= Date.now()) {
    if (row) {
      db.prepare('DELETE FROM password_reset_tokens WHERE id = ?').run(row.id);
    }
    res.status(400).json({
      error: 'This reset link is invalid or has expired. Request a new one.',
    });
    return;
  }

  const user = getUserRow(row.user_id);
  if (!user) {
    res.status(400).json({
      error: 'This reset link is invalid or has expired. Request a new one.',
    });
    return;
  }

  const passwordHash = await hashPassword(password);

  db.transaction(() => {
    db.prepare(
      'UPDATE users SET password_hash = ?, email_verified = 1 WHERE id = ?',
    ).run(passwordHash, user.id);
    db.prepare('DELETE FROM password_reset_tokens WHERE user_id = ?').run(
      user.id,
    );
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(user.id);
    db.prepare('DELETE FROM login_challenges WHERE user_id = ?').run(user.id);
  })();

  res.status(204).end();
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

authRouter.patch('/profile', requireAuth, emailLimiter, async (req, res) => {
  const parsed = profileSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input.' });
    return;
  }

  const { name, email } = parsed.data;
  const currentUser = req.user!;
  const emailChanged = email !== currentUser.email.toLowerCase();

  const existing = db
    .prepare('SELECT id FROM users WHERE email = ? AND id <> ?')
    .get(email, currentUser.id) as { id: string } | undefined;

  if (existing) {
    res.status(409).json({ error: 'An account with that email already exists.' });
    return;
  }

  try {
    if (emailChanged) {
      db.prepare(
        'UPDATE users SET name = ?, email = ?, email_verified = 0 WHERE id = ?',
      ).run(name, email, currentUser.id);
    } else {
      db.prepare('UPDATE users SET name = ? WHERE id = ?').run(
        name,
        currentUser.id,
      );
    }
  } catch (error) {
    if (isUniqueViolation(error)) {
      res.status(409).json({ error: 'An account with that email already exists.' });
      return;
    }
    throw error;
  }

  const row = getUserRow(currentUser.id)!;

  if (emailChanged) {
    const code = await issueVerificationCode(row);
    if (req.sessionToken) deleteOtherSessions(row.id, req.sessionToken);

    res.json({
      user: toPublicUser(row),
      verificationRequired: true,
      ...(exposeDevSecrets ? { devCode: code } : {}),
    });
    return;
  }

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

  const row = getUserRow(req.user!.id);
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

authRouter.post('/2fa/setup', requireAuth, async (req, res) => {
  const row = getUserRow(req.user!.id);
  if (!row) {
    res.status(401).json({ error: 'Please sign in to continue.' });
    return;
  }

  if (row.totp_enabled === 1) {
    res.status(400).json({ error: 'Two-factor authentication is already enabled.' });
    return;
  }

  const secret = createTotpSecret();
  db.prepare('UPDATE users SET totp_secret = ? WHERE id = ?').run(
    secret,
    row.id,
  );

  const otpauthUrl = totpProvisioningUri(secret, row.email);
  const qrDataUrl = await QRCode.toDataURL(otpauthUrl, {
    errorCorrectionLevel: 'M',
    margin: 2,
    width: 240,
    color: { dark: '#0b1220', light: '#ffffff' },
  });

  res.json({ secret, otpauthUrl, qrDataUrl });
});

authRouter.post('/2fa/enable', requireAuth, authLimiter, (req, res) => {
  const parsed = twoFactorCodeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input.' });
    return;
  }

  const row = getUserRow(req.user!.id);
  if (!row) {
    res.status(401).json({ error: 'Please sign in to continue.' });
    return;
  }

  if (row.totp_enabled === 1) {
    res.status(400).json({ error: 'Two-factor authentication is already enabled.' });
    return;
  }

  if (!row.totp_secret) {
    res.status(400).json({
      error: 'Start the setup first to generate a secret.',
    });
    return;
  }

  const result = verifyTotp(row.totp_secret, parsed.data.code);
  if (!result) {
    res.status(400).json({
      error: 'That code is incorrect. Check your authenticator app and try again.',
    });
    return;
  }

  const codes = issueRecoveryCodes(row.id);
  db.prepare(
    'UPDATE users SET totp_enabled = 1, totp_last_step = ? WHERE id = ?',
  ).run(result.step, row.id);

  if (req.sessionToken) deleteOtherSessions(row.id, req.sessionToken);

  res.json({ recoveryCodes: codes });
});

authRouter.post('/2fa/disable', requireAuth, authLimiter, async (req, res) => {
  const parsed = disableTwoFactorSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input.' });
    return;
  }

  const row = getUserRow(req.user!.id);
  if (!row) {
    res.status(401).json({ error: 'Please sign in to continue.' });
    return;
  }

  if (row.totp_enabled !== 1) {
    res.status(400).json({ error: 'Two-factor authentication is not enabled.' });
    return;
  }

  const passwordMatches = await verifyPassword(
    parsed.data.password,
    row.password_hash,
  );
  if (!passwordMatches) {
    res.status(400).json({ error: 'Your password is incorrect.' });
    return;
  }

  if (!verifySecondFactor(row, parsed.data.code)) {
    res.status(400).json({ error: 'That authentication code is incorrect.' });
    return;
  }

  db.transaction(() => {
    db.prepare(
      'UPDATE users SET totp_enabled = 0, totp_secret = NULL, totp_last_step = NULL WHERE id = ?',
    ).run(row.id);
    db.prepare('DELETE FROM recovery_codes WHERE user_id = ?').run(row.id);
    db.prepare('DELETE FROM login_challenges WHERE user_id = ?').run(row.id);
  })();

  if (req.sessionToken) deleteOtherSessions(row.id, req.sessionToken);

  res.status(204).end();
});
