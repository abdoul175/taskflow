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
  cookieName: 'taskflow_session',
  sessionTtlMs: 7 * 24 * 60 * 60 * 1000,
  cookieSecure: process.env.COOKIE_SECURE
    ? process.env.COOKIE_SECURE === 'true'
    : isProduction,
};
