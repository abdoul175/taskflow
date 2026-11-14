import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Load server/.env when present (Node's built-in loader — no dotenv dependency).
try {
  process.loadEnvFile();
} catch {
  // .env is optional.
}

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const isProduction = process.env.NODE_ENV === 'production';

const smtpPort = Number(process.env.SMTP_PORT ?? 587);
const googleClientId = process.env.GOOGLE_CLIENT_ID?.trim() ?? '';
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim() ?? '';

export const config = {
  port: Number(process.env.PORT ?? 4000),
  isProduction,
  serverRoot,
  /** Path to the SQLite database file. */
  databasePath: process.env.DATABASE_PATH
    ? path.resolve(process.env.DATABASE_PATH)
    : path.join(serverRoot, 'data', 'taskflow.db'),
  /** Built client assets, served by Express in production. */
  clientDistPath: path.resolve(serverRoot, '..', 'client', 'dist'),
  /** Extra allowed browser origin, useful behind a reverse proxy. */
  appOrigin: process.env.APP_ORIGIN,
  /** Public app URL used in emails when the request origin is unavailable. */
  appUrl: process.env.APP_URL?.replace(/\/$/, '') ?? '',
  cookieName: 'taskflow_session',
  sessionTtlMs: 7 * 24 * 60 * 60 * 1000,
  cookieSecure: process.env.COOKIE_SECURE
    ? process.env.COOKIE_SECURE === 'true'
    : isProduction,
  google: {
    clientId: googleClientId,
    clientSecret: googleClientSecret,
    /** Optional override; otherwise derived from the request origin. */
    redirectUri: process.env.GOOGLE_REDIRECT_URI?.trim() ?? '',
  },
  smtp: {
    host: process.env.SMTP_HOST ?? '',
    port: smtpPort,
    secure: process.env.SMTP_SECURE
      ? process.env.SMTP_SECURE === 'true'
      : smtpPort === 465,
    user: process.env.SMTP_USER ?? '',
    pass: process.env.SMTP_PASS ?? '',
    from: process.env.SMTP_FROM ?? 'Taskflow <no-reply@taskflow.local>',
  },
};

/** True when no SMTP server is configured, so emails can only be previewed. */
export const emailPreviewMode = !config.smtp.host;

/** Google sign-in is available once both OAuth client values are configured. */
export const googleOAuthEnabled = Boolean(
  config.google.clientId && config.google.clientSecret,
);
