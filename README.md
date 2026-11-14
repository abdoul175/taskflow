# Taskflow

A full-stack task manager with email/password authentication and optional Google sign-in. Built with a React SPA, an Express JSON API, and PostgreSQL — Neon in production, an embedded Postgres (PGlite) locally, so the core app needs no external services to run on your machine.

![Stack](https://img.shields.io/badge/React_19-Vite_8-6366f1) ![Stack](https://img.shields.io/badge/Express_5-TypeScript-0ea5e9) ![Stack](https://img.shields.io/badge/PostgreSQL-Neon_|_PGlite-22c55e)

## Features

- **Accounts** — register, sign in, sign out, persistent cookie sessions
- **Email verification** — new accounts get a 6-digit code before they can sign in; changing your email requires re-verification
- **Two-factor authentication** — TOTP setup with a QR code (Microsoft Authenticator, Google Authenticator, 1Password, Authy), one-time recovery codes, and a second step at sign-in
- **Password reset** — “Forgot password?” emails a single-use link; other sessions are revoked after a reset
- **Google sign-in** — optional “Continue with Google” using OAuth 2.0 with PKCE; it creates new accounts or signs in to accounts already linked to Google, never attaching to an existing email/password account. 2FA still applies when enabled
- **Profile** — update your name and email, and change your password from the sidebar
- **Projects** — create and delete color-coded projects; every account starts with a “Personal” project
- **Tasks** — title, description, status (To do / In progress / Done), priority, and due date
- **Kanban board** — quick status transitions, overdue highlighting, per-column counts, and live stats
- **Private by default** — every query is scoped to the signed-in user
- **Demo data** — one command seeds a ready-to-explore workspace

## Stack

| Layer    | Choice                                             |
| -------- | -------------------------------------------------- |
| Frontend | React 19, Vite 8, TypeScript, Tailwind CSS 4       |
| Backend  | Express 5, TypeScript, Zod validation              |
| Database | PostgreSQL — Neon serverless in production, PGlite locally |
| Auth     | `scrypt` password hashing + opaque session cookies; Google OAuth 2.0 (PKCE) |
| Security | Email verification, TOTP two-factor auth, single-use reset links |
| Email    | Nodemailer over SMTP; console preview when unconfigured |
| Icons    | `lucide-react`                                     |
| Font     | Plus Jakarta Sans, bundled locally via Fontsource  |

## Quick start

Requires **Node.js 20+** (tested on Node 24) and npm.

```bash
npm install
npm run seed      # optional: creates the demo account and sample data
npm run dev
```

- Web app: <http://localhost:5173>
- API: <http://localhost:4000>

The Vite dev server proxies `/api` to Express, so cookies and requests stay same-origin. The API uses an embedded Postgres (PGlite) by default and keeps its data in `server/data/pglite/` (gitignored). Set `DATABASE_URL` to use a real Postgres server instead.

### Demo account

| Email               | Password      |
| ------------------- | ------------- |
| `demo@taskflow.dev` | `taskflow123` |

The login screen also has a **Use demo** button that fills these in. The demo account is pre-verified and starts without 2FA.

### Email in development

No SMTP server is required locally. Verification codes and password-reset links are printed to the API console and also shown directly in the UI when the server is not running in production. See [Configuration](#configuration) for SMTP settings.

> **npm 12 note:** npm blocks dependency install scripts by default. This repo allow-lists `esbuild` in the root `package.json` (`allowScripts`), so `npm install` works out of the box. If you later add a native dependency, review it with `npm install-scripts ls` and approve it explicitly.

## Scripts

Run from the repository root:

| Command             | What it does                                             |
| ------------------- | -------------------------------------------------------- |
| `npm run dev`       | Starts the API (`tsx watch`) and Vite together            |
| `npm run build`     | Type-checks and builds the server and the client          |
| `npm start`         | Serves the built API **and** the client on port 4000      |
| `npm run seed`      | Seeds the demo account (idempotent)                       |
| `npm run typecheck` | Type-checks both workspaces without emitting files        |

Use `npm run dev -w server` or `npm run dev -w client` to run one side alone.

## Project structure

```
.
├─ client/                  # React SPA
│  ├─ src/
│  │  ├─ pages/             # AuthPage, Dashboard
│  │  ├─ components/        # TaskCard, modals, sidebar…
│  │  ├─ api.ts             # Typed fetch wrapper
│  │  ├─ auth.tsx           # Auth context (/auth/me bootstrap, login, logout)
│  │  └─ types.ts
│  └─ vite.config.ts        # Dev proxy: /api → localhost:4000; builds into public/
├─ server/                  # Express API
│  ├─ src/
│  │  ├─ routes/            # auth, projects, tasks
│  │  ├─ lib/               # password hashing, sessions, cookie options
│  │  ├─ middleware/        # requireAuth, origin/CSRF guard
│  │  ├─ app.ts             # Express app (shared by the listener and Vercel)
│  │  ├─ db.ts              # Postgres adapter (Neon / PGlite) + schema bootstrap
│  │  ├─ seed.ts            # Demo account/data
│  │  └─ index.ts           # Local HTTP listener
│  └─ data/                 # Local PGlite data (gitignored)
├─ public/                  # Built client, generated by Vite (gitignored)
├─ api/
│  └─ index.ts              # Vercel Function: default-exports the Express app
├─ server.ts                # Optional zero-config Express entrypoint (unused under "Other")
├─ vercel.json              # Vercel build/output settings + API/SPA rewrites
└─ package.json             # npm workspaces + root scripts
```

## How authentication works

1. **Registration** validates input with Zod, hashes the password with Node’s `scrypt` (random 16-byte salt, 64-byte key), creates the user plus a default project, and emails a 6-digit code. No session is created until that code is verified.
2. **Email verification** — codes are stored as SHA-256 hashes, expire after 15 minutes, and allow five attempts. Changing your email in the profile requires verifying the new address too.
3. **Sessions** are opaque 32-byte random tokens. Only a SHA-256 hash of the token is stored in the `sessions` table, so a database leak cannot be replayed against the API.
4. The raw token travels in an **httpOnly, SameSite=Lax cookie** (`Secure` in production), valid for 7 days. JavaScript never sees it.
5. **Login** uses a generic “Invalid email or password” message and a dummy hash comparison when the email doesn’t exist, reducing account enumeration and timing clues. Verified accounts with 2FA receive a short-lived challenge token instead of a session.
6. **Two-factor authentication** uses TOTP (30-second codes, one-step clock drift). Recovery codes are single-use, stored hashed, and shown only once. Enabling or disabling 2FA revokes other sessions.
7. **Password reset** — single-use links are stored hashed, expire after 30 minutes, mark the email verified, and revoke every session. Reset requests are rate-limited and return the same generic message for unknown emails.
8. **Authorization** — `requireAuth` resolves the cookie on every protected request; all project/task queries include the user ID so users can only ever touch their own rows.
9. **Password changes** — verified against the stored hash, then re-hashed with a fresh salt. Every other session for the account is revoked, so a stolen session cannot outlive the change.
10. **Google sign-in (optional)** — a standard OAuth 2.0 authorization-code flow with PKCE; the random state value and PKCE verifier travel in a short-lived httpOnly cookie. Profile data comes from Google’s OpenID userinfo endpoint, and only addresses Google reports as verified are accepted. A Google sign-in only creates a new account when the email is not already in the database; when an email/password account already owns that address, the attempt is rejected (`email-exists`) instead of linked, so Google can never take over an existing account. Google-created accounts get a random password hash and a default project. Accounts with 2FA still complete the TOTP step through a short-lived challenge cookie. No Google tokens are stored.
11. **Hardening** — `helmet` headers, a 100 kB JSON body limit, auth rate limiting (30 attempts / 15 minutes / IP), stricter email-sending limits, and an origin allow-list on state-changing requests as defense-in-depth alongside SameSite cookies.

Passwords are never stored or logged in plain text. No application secret is required: sessions, verification codes, reset tokens, and login challenges are all random values whose hashes are what the database stores.

### Using Microsoft Authenticator

Taskflow uses standard TOTP, so Microsoft Authenticator works without connecting a Microsoft or Azure account:

1. Open **Profile → Two-factor authentication → Set up 2FA**.
2. In Microsoft Authenticator, tap **+ → Other account**.
3. Scan the QR code, or enter the setup key shown below it.
4. Enter the 6-digit code from the app, then save your recovery codes.

Microsoft Authenticator's phone sign-in and push approvals only work with Microsoft accounts; Taskflow uses the app's regular one-time-code mode.

### Google sign-in setup

Google sign-in is optional and disabled until credentials are configured, so local email/password flows keep working out of the box.

1. In [Google Cloud Console](https://console.cloud.google.com/apis/credentials), create or select a project.
2. Configure the OAuth consent screen (External is fine for testing; add test users while the app is in testing mode). Request the `openid`, `email`, and `profile` scopes.
3. Create an **OAuth client ID → Web application**.
4. Add the authorized redirect URI(s):
   - Local production build: `http://localhost:4000/api/auth/google/callback`
   - Vite dev server: `http://localhost:5173/api/auth/google/callback`
   - Deployed app: `https://your-domain.example/api/auth/google/callback`
5. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `server/.env`. If the callback URL differs from `<app origin>/api/auth/google/callback`, also set `GOOGLE_REDIRECT_URI`; the value must exactly match one of the URIs registered in Google Cloud.
6. Restart the API. The “Continue with Google” button appears on `/login` and `/register` when both values are present.

The redirect URI is derived from `GOOGLE_REDIRECT_URI`, then `APP_URL`, then the request origin. Behind a reverse proxy, set `APP_URL` (and `APP_ORIGIN` if the proxy rewrites `Host`) so the derived callback matches Google’s registration. Google-created accounts can later set a password through “Forgot password?”. Google sign-in never attaches to an existing email/password account.

## API reference

All routes are prefixed with `/api`. Protected routes require the session cookie.

| Method   | Route                 | Auth | Description                            |
| -------- | --------------------- | :--: | -------------------------------------- |
| `GET`    | `/health`             |      | Health check                           |
| `POST`   | `/auth/register`      |      | `{ name, email, password }` → sends verification code |
| `POST`   | `/auth/verify-email`  |      | `{ email, code }` → user + cookie      |
| `POST`   | `/auth/resend-verification` | | `{ email }` → sends a new code     |
| `POST`   | `/auth/login`         |      | `{ email, password }` → user + cookie, or `{ requires2fa, challengeToken }` |
| `POST`   | `/auth/login/2fa`     |      | `{ challengeToken, code }` → user + cookie |
| `POST`   | `/auth/forgot-password` |    | `{ email }` → sends a single-use reset link |
| `POST`   | `/auth/reset-password` |     | `{ token, password }` → revokes all sessions |
| `POST`   | `/auth/logout`        |      | Clears the session and cookie          |
| `GET`    | `/auth/me`            |  ✓   | Current user                           |
| `PATCH`  | `/auth/profile`       |  ✓   | `{ name, email }` → updated user; a new email requires verification |
| `POST`   | `/auth/change-password` | ✓  | `{ currentPassword, newPassword }`; revokes other sessions |
| `POST`   | `/auth/2fa/setup`     |  ✓   | Generates a TOTP secret, provisioning URI, and QR data URL |
| `POST`   | `/auth/2fa/enable`    |  ✓   | `{ code }` → recovery codes            |
| `POST`   | `/auth/2fa/disable`   |  ✓   | `{ password, code }`                   |
| `GET`    | `/auth/providers`     |      | `{ google: boolean }` — which social providers are configured |
| `GET`    | `/auth/google`        |      | Starts the Google OAuth redirect (state + PKCE) |
| `GET`    | `/auth/google/callback` |    | Google callback; sets a session cookie or a 2FA challenge |
| `GET`    | `/projects`           |  ✓   | Projects with task counts              |
| `POST`   | `/projects`           |  ✓   | `{ name, color? }`                     |
| `PATCH`  | `/projects/:id`       |  ✓   | `{ name?, color? }`                    |
| `DELETE` | `/projects/:id`       |  ✓   | Deletes project and its tasks (last project is protected) |
| `GET`    | `/tasks`              |  ✓   | All tasks; optional `?projectId=`      |
| `POST`   | `/tasks`              |  ✓   | `{ projectId, title, description?, status?, priority?, dueDate? }` |
| `PATCH`  | `/tasks/:id`          |  ✓   | Any subset of task fields              |
| `DELETE` | `/tasks/:id`          |  ✓   | Deletes a task                         |

Dates use `YYYY-MM-DD`. Status is `todo | in_progress | done`; priority is `low | medium | high`. Errors return `{ "error": "message" }` with an appropriate status code.

## Configuration

Copy `server/.env.example` to `server/.env` if you need to override anything. All values are optional.

| Variable        | Default                  | Purpose                                                     |
| --------------- | ------------------------ | ----------------------------------------------------------- |
| `PORT`          | `4000`                   | API port                                                    |
| `DATABASE_URL`  | — (local PGlite)         | PostgreSQL connection string. The Neon/Vercel integrations may name it `POSTGRES_URL`, `POSTGRES_PRISMA_URL`, `DATABASE_URL_UNPOOLED`, or `POSTGRES_URL_NON_POOLING`; all are accepted. |
| `PGLITE_DATA_DIR` | `server/data/pglite`   | Local embedded Postgres directory used when `DATABASE_URL` is unset |
| `APP_ORIGIN`    | —                        | Extra origin allowed to send mutating requests (e.g. `https://taskflow.example.com`) |
| `APP_URL`       | request origin           | Public app URL used in emails and to derive the Google callback when the request origin is unavailable |
| `GOOGLE_CLIENT_ID` | —                     | Google OAuth client ID; enables Google sign-in with the secret |
| `GOOGLE_CLIENT_SECRET` | —                  | Google OAuth client secret                                  |
| `GOOGLE_REDIRECT_URI` | `<app origin>/api/auth/google/callback` | Fixed OAuth callback URL; must match Google Cloud exactly |
| `SMTP_HOST`     | —                        | SMTP server host; when unset, emails are previewed in the console |
| `SMTP_PORT`     | `587`                    | SMTP port (`465` enables implicit TLS)                      |
| `SMTP_SECURE`   | `true` when port is 465  | Force implicit TLS                                          |
| `SMTP_USER`     | —                        | SMTP username (optional for unauthenticated relays)         |
| `SMTP_PASS`     | —                        | SMTP password                                               |
| `SMTP_FROM`     | `Taskflow <no-reply@taskflow.local>` | From address for outgoing mail                 |
| `COOKIE_SECURE` | `true` in production     | Force secure cookies; set `false` for local HTTP production tests |
| `NODE_ENV`      | —                        | Enables production behavior (trust proxy, secure cookies)   |

### Email in development

No SMTP server is required locally. Every outgoing message is printed to the API console, and verification codes and reset links are also returned to the UI when the server is not running in production. To deliver real email, set the `SMTP_*` variables; development-only codes disappear automatically once SMTP is configured or `NODE_ENV=production`.

### Sending email with Resend

1. Create an account at <https://resend.com> and add your domain under **Domains**. Copy the DKIM and SPF records it shows into your DNS provider and wait for the domain to be marked **Verified**. The MX record Resend suggests is for the `send` subdomain and does not affect your normal inbox.
2. Create an API key under **API Keys** with **Sending access** permission.
3. Configure these variables (in `server/.env` locally, or in Vercel under **Project Settings → Environment Variables**):

   ```env
   SMTP_HOST=smtp.resend.com
   SMTP_PORT=465
   SMTP_SECURE=true
   SMTP_USER=resend
   SMTP_PASS=re_your_api_key
   SMTP_FROM="Taskflow <no-reply@yourdomain.com>"
   ```

   `SMTP_USER` must be literally `resend`; the API key is the password. `SMTP_FROM` must use the verified domain.

4. Redeploy on Vercel, register an account, then check **Emails** in the Resend dashboard for delivery status.

Until a domain is verified, Resend only delivers to the address that owns the Resend account, so you can smoke-test with `SMTP_FROM="Taskflow <onboarding@resend.dev>"`.

> **2FA recovery:** users who lose their authenticator can sign in with a recovery code. If those are lost too, an administrator can clear `totp_enabled`, `totp_secret`, and the account's rows in `recovery_codes` directly in the database.

## Deploying to Vercel + Neon

The repository is ready for Vercel's Git integration. The Express API runs as a Vercel Function, the Vite build is served from `public/**`, and data lives in Neon Postgres (Vercel Functions have an ephemeral filesystem, so a local database file cannot be used there).

### 1. Import the repository

1. Go to <https://vercel.com/new> and import `abdoul175/taskflow`.
2. Keep the root directory as the repository root.
3. Framework preset: **Other** (the repo includes `vercel.json`, which sets the build command to `npm run build` and the output directory to `public`). The `api/index.ts` function is detected automatically, so no framework-specific preset is required.
4. Don't deploy yet — add the database and environment variables first.

### 2. Add Neon Postgres

1. In the Vercel project, open **Storage** (or **Marketplace**) and add **Neon**.
2. Create a database and connect it to the project for **Production** (and **Preview** if you want preview deployments to work).
3. Vercel injects the connection string as `DATABASE_URL` (or `POSTGRES_URL`). The app accepts either; you do not need to copy the value anywhere.

### 3. Environment variables

Add these in **Project Settings → Environment Variables** (Production, and Preview if desired):

| Variable | Value |
| -------- | ----- |
| `APP_URL` | `https://<your-vercel-domain>` |
| `APP_ORIGIN` | `https://<your-vercel-domain>` |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | Your production SMTP credentials |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Your Google OAuth web client |
| `GOOGLE_REDIRECT_URI` | `https://<your-vercel-domain>/api/auth/google/callback` |

`NODE_ENV=production` is set by Vercel automatically, which enables secure cookies and trust-proxy handling.

In Google Cloud Console, add the same callback URL to the OAuth client's **Authorized redirect URIs**. If you also test preview deployments, add each preview callback URL or use a single stable production domain.

### 4. Deploy

Trigger the deployment from the Vercel dashboard (or push to `main`). The build:

1. Compiles the API to `server/dist/`.
2. Builds the React client into `public/`.
3. Deploys `api/index.ts` as the Express function and serves `public/**` from Vercel's CDN.
4. Routes `/api/*` to the function and rewrites every other path to `index.html` for client-side routing.

The database schema is created automatically on the first request (idempotent `CREATE TABLE IF NOT EXISTS`), and expired sessions/tokens are pruned on startup.

Check `https://<your-vercel-domain>/api/health` — it should return `{"status":"ok",...}`.

### Optional: demo data in production

`npm run seed` creates an account with a publicly known password, so **do not run it on a public production database** unless you plan to change or remove that account. To seed a Neon database from your machine:

```bash
# PowerShell
$env:DATABASE_URL = 'postgresql://...'
npm run seed
```

## Self-hosting the built app

```bash
npm run build
NODE_ENV=production DATABASE_URL=postgresql://... npm start
```

Express serves `public/` and the API from the same origin at `http://localhost:4000`. On Windows PowerShell:

```powershell
$env:NODE_ENV = 'production'
$env:DATABASE_URL = 'postgresql://...'
npm start
```

Notes:

- Put the app behind HTTPS (or a reverse proxy that terminates TLS). `NODE_ENV=production` sets secure cookies, and the app trusts one proxy hop for client IPs.
- Use a managed Postgres (Neon, Supabase, RDS…) rather than a local file; the database is the only stateful component.
- Set `APP_ORIGIN` to the public URL if the proxy rewrites the `Host` header.
- The rate limiter is in-memory per process. Use a shared store if you scale horizontally across many instances.

## Resetting or moving the database

The schema is created automatically on server start (no migration CLI needed for this starter). To start over locally:

```bash
# stop the server first
rm -rf server/data        # Windows: Remove-Item -Recurse -Force server\data
npm run seed
```

For Neon, connect with `psql` or the Neon SQL editor and drop the tables, then restart the app to recreate them:

```sql
DROP TABLE IF EXISTS recovery_codes, login_challenges, password_reset_tokens,
  email_verification_tokens, tasks, projects, sessions, users CASCADE;
```

To move data, export from the old database and import into Neon using `pg_dump` / `pg_restore` or Neon's import tooling.

## Not included (deliberate starter scope)

Email-change notifications to the old address and audit logs are not implemented. Add them before exposing the app to real users. The structure — separate route modules, Zod schemas, hashed one-time tokens, session helpers — is meant to make those additions straightforward. Google sign-in is implemented but stays hidden until you supply OAuth credentials.
