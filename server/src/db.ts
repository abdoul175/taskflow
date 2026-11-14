import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { config } from './config.js';

/**
 * Small async database layer shared by local development and production.
 *
 * - Local development: embedded Postgres via PGlite (no server to install).
 * - Production (Vercel): Neon Postgres over its HTTP driver.
 *
 * All SQL uses `?` placeholders, which are translated to `$1...$n` here so the
 * rest of the codebase stays database-agnostic.
 */

export interface Statement {
  sql: string;
  params?: unknown[];
}

export interface RunResult {
  changes: number;
}

interface QueryResult<T> {
  rows: T[];
  changes: number;
}

interface SqlDriver {
  query<T>(sql: string, params?: unknown[]): Promise<QueryResult<T>>;
  transaction(statements: Statement[]): Promise<void>;
  close(): Promise<void>;
}

function toPostgresPlaceholders(sql: string): string {
  let index = 0;
  return sql.replace(/\?/g, () => `$${++index}`);
}

function toParams(params: unknown[] | undefined): unknown[] {
  return (params ?? []).map((value) => (value === undefined ? null : value));
}

async function createPgliteDriver(dataDir: string): Promise<SqlDriver> {
  const { PGlite } = await import('@electric-sql/pglite');
  fs.mkdirSync(dataDir, { recursive: true });

  const pglite = new PGlite(dataDir);
  await pglite.waitReady;

  return {
    async query<T>(sql: string, params?: unknown[]): Promise<QueryResult<T>> {
      const result = await pglite.query<T>(
        toPostgresPlaceholders(sql),
        toParams(params),
      );
      return { rows: result.rows, changes: result.affectedRows ?? 0 };
    },

    async transaction(statements: Statement[]): Promise<void> {
      if (statements.length === 0) return;

      await pglite.transaction(async (tx) => {
        for (const statement of statements) {
          await tx.query(
            toPostgresPlaceholders(statement.sql),
            toParams(statement.params),
          );
        }
      });
    },

    async close(): Promise<void> {
      await pglite.close();
    },
  };
}

interface NeonQueryResult<T> {
  rows: T[];
  rowCount: number;
}

interface NeonSql {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ): Promise<NeonQueryResult<T>>;
  transaction(queries: Promise<unknown>[]): Promise<unknown>;
}

async function createNeonDriver(connectionString: string): Promise<SqlDriver> {
  const { neon } = await import('@neondatabase/serverless');
  const sql = neon(connectionString, {
    fullResults: true,
  }) as unknown as NeonSql;

  return {
    async query<T>(query: string, params?: unknown[]): Promise<QueryResult<T>> {
      const result = await sql.query<T>(
        toPostgresPlaceholders(query),
        toParams(params),
      );
      return { rows: result.rows, changes: result.rowCount ?? 0 };
    },

    async transaction(statements: Statement[]): Promise<void> {
      if (statements.length === 0) return;

      await sql.transaction(
        statements.map((statement) =>
          sql.query(
            toPostgresPlaceholders(statement.sql),
            toParams(statement.params),
          ),
        ),
      );
    },

    async close(): Promise<void> {
      // The HTTP driver has no persistent connection to close.
    },
  };
}

async function createDriver(): Promise<SqlDriver> {
  if (config.databaseUrl) {
    return createNeonDriver(config.databaseUrl);
  }

  if (process.env.VERCEL) {
    throw new Error(
      'DATABASE_URL is not set. Add a Neon Postgres database to this Vercel project and set DATABASE_URL.',
    );
  }

  return createPgliteDriver(config.pgliteDataDir);
}

const schemaStatements: Statement[] = [
  {
    // Serialize schema creation when several cold starts happen at once.
    sql: `SELECT pg_advisory_xact_lock(hashtext('taskflow_schema_init')::bigint)`,
  },
  {
    sql: `CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      google_id TEXT,
      email_verified SMALLINT NOT NULL DEFAULT 0,
      totp_secret TEXT,
      totp_enabled SMALLINT NOT NULL DEFAULT 0,
      totp_last_step INTEGER,
      created_at TEXT NOT NULL
    )`,
  },
  {
    sql: `CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id)`,
  },
  {
    sql: `CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`,
  },
  { sql: `CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id)` },
  {
    sql: `CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      color TEXT NOT NULL DEFAULT '#6366f1',
      created_at TEXT NOT NULL
    )`,
  },
  { sql: `CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects(user_id)` },
  {
    sql: `CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'in_progress', 'done')),
      priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
      due_date TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
  },
  { sql: `CREATE INDEX IF NOT EXISTS idx_tasks_user_id ON tasks(user_id)` },
  { sql: `CREATE INDEX IF NOT EXISTS idx_tasks_project_id ON tasks(project_id)` },
  {
    sql: `CREATE TABLE IF NOT EXISTS email_verification_tokens (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      code_hash TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`,
  },
  {
    sql: `CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`,
  },
  {
    sql: `CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user_id
      ON password_reset_tokens(user_id)`,
  },
  {
    sql: `CREATE TABLE IF NOT EXISTS login_challenges (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      attempts INTEGER NOT NULL DEFAULT 0,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`,
  },
  {
    sql: `CREATE INDEX IF NOT EXISTS idx_login_challenges_user_id
      ON login_challenges(user_id)`,
  },
  {
    sql: `CREATE TABLE IF NOT EXISTS recovery_codes (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      code_hash TEXT NOT NULL,
      used_at TEXT,
      created_at TEXT NOT NULL
    )`,
  },
  {
    sql: `CREATE INDEX IF NOT EXISTS idx_recovery_codes_user_id ON recovery_codes(user_id)`,
  },
];

// Idempotent and safe to run on every cold start: all statements use
// IF NOT EXISTS, and the advisory lock serializes concurrent cold starts.
async function initialize(): Promise<SqlDriver> {
  const driver = await createDriver();
  await driver.transaction(schemaStatements);

  // Housekeeping: expired sessions and one-time tokens are useless.
  const nowIso = new Date().toISOString();
  for (const table of [
    'sessions',
    'login_challenges',
    'password_reset_tokens',
    'email_verification_tokens',
  ]) {
    await driver.query(`DELETE FROM ${table} WHERE expires_at <= ?`, [nowIso]);
  }

  return driver;
}

// Initialization is lazy so importing the app (for example during a Vercel
// build) never opens a database connection, and so a transient startup error
// is retried on the next request instead of poisoning the whole instance.
let driverPromise: Promise<SqlDriver> | undefined;

function getDriver(): Promise<SqlDriver> {
  if (!driverPromise) {
    driverPromise = initialize().catch((error: unknown) => {
      driverPromise = undefined;
      throw error;
    });
  }
  return driverPromise;
}

export const db = {
  async all<T>(sql: string, params?: unknown[]): Promise<T[]> {
    const driver = await getDriver();
    const result = await driver.query<T>(sql, params);
    return result.rows;
  },

  async get<T>(sql: string, params?: unknown[]): Promise<T | undefined> {
    const driver = await getDriver();
    const result = await driver.query<T>(sql, params);
    return result.rows[0];
  },

  async run(sql: string, params?: unknown[]): Promise<RunResult> {
    const driver = await getDriver();
    const result = await driver.query(sql, params);
    return { changes: result.changes };
  },

  async transaction(statements: Statement[]): Promise<void> {
    const driver = await getDriver();
    await driver.transaction(statements);
  },

  async close(): Promise<void> {
    if (!driverPromise) return;
    const driver = await driverPromise;
    driverPromise = undefined;
    await driver.close();
  },
};

export function newId(): string {
  return randomUUID();
}
