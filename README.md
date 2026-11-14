# Taskflow

A full-stack task manager with email/password authentication. Built with a React SPA, an Express JSON API, and SQLite — no external services required.

![Stack](https://img.shields.io/badge/React_19-Vite_8-6366f1) ![Stack](https://img.shields.io/badge/Express_5-TypeScript-0ea5e9) ![Stack](https://img.shields.io/badge/SQLite-better--sqlite3-22c55e)

## Features

- **Accounts** — register, sign in, sign out, persistent cookie sessions
- **Email verification** — new accounts get a 6-digit code before they can sign in; changing your email requires re-verification
- **Two-factor authentication** — TOTP setup with a QR code, one-time recovery codes, and a second step at sign-in
- **Password reset** — “Forgot password?” emails a single-use link; other sessions are revoked after a reset
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
| Database | SQLite via `better-sqlite3`                        |
| Auth     | `scrypt` password hashing + opaque session cookies |
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

The Vite dev server proxies `/api` to Express, so cookies and requests stay same-origin.

### Demo account

| Email               | Password      |
| ------------------- | ------------- |
| `demo@taskflow.dev` | `taskflow123` |

The login screen also has a **Use demo** button that fills these in. The demo account is pre-verified and starts without 2FA.

### Email in development

No SMTP server is required locally. Verification codes and password-reset links are printed to the API console and also shown directly in the UI when the server is not running in production. See [Configuration](#configuration) for SMTP settings.

> **npm 12 note:** npm blocks dependency install scripts by default. This repo already allow-lists `better-sqlite3` and `esbuild` in the root `package.json` (`allowScripts`), so `npm install` works out of the box. If you later add a native dependency, review it with `npm install-scripts ls` and approve it explicitly.

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
│  └─ vite.config.ts        # Dev proxy: /api → localhost:4000
├─ server/                  # Express API
│  ├─ src/
│  │  ├─ routes/            # auth, projects, tasks
│  │  ├─ lib/               # password hashing, sessions, cookie options
│  │  ├─ middleware/        # requireAuth, origin/CSRF guard
│  │  ├─ db.ts              # SQLite connection + schema bootstrap
│  │  ├─ seed.ts            # Demo account/data
│  │  └─ index.ts           # App wiring, static client serving
│  └─ data/                 # SQLite database (gitignored)
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
10. **Hardening** — `helmet` headers, a 100 kB JSON body limit, auth rate limiting (30 attempts / 15 minutes / IP), stricter email-sending limits, and an origin allow-list on state-changing requests as defense-in-depth alongside SameSite cookies.

Passwords are never stored or logged in plain text. No application secret is required: sessions, verification codes, reset tokens, and login challenges are all random values whose hashes are what the database stores.

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
| `DATABASE_PATH` | `server/data/taskflow.db`| SQLite file location                                        |
| `APP_ORIGIN`    | —                        | Extra origin allowed to send mutating requests (e.g. `https://taskflow.example.com`) |
| `APP_URL`       | request origin           | Public app URL used in emails when the request origin is unavailable |
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

> **2FA recovery:** users who lose their authenticator can sign in with a recovery code. If those are lost too, an administrator can clear `totp_enabled`, `totp_secret`, and `recovery_codes` for the account directly in SQLite.

## Production

```bash
npm run build
NODE_ENV=production npm start
```

Express serves `client/dist` and the API from the same origin at `http://localhost:4000`. On Windows PowerShell:

```powershell
$env:NODE_ENV = 'production'; npm start
```

Notes:

- Put the app behind HTTPS (or a reverse proxy that terminates TLS). `NODE_ENV=production` sets secure cookies, and the app trusts one proxy hop for client IPs.
- Persist `server/data/` (or point `DATABASE_PATH` at a mounted volume). SQLite is ideal for a single instance; move to Postgres before running multiple API replicas.
- Set `APP_ORIGIN` to the public URL if the proxy rewrites the `Host` header.
- The rate limiter is in-memory per process. Use a shared store if you scale horizontally.

## Resetting or moving the database

The schema is created automatically on server start (no migration CLI needed for this starter). To start over:

```bash
# stop the server first
rm -rf server/data        # Windows: Remove-Item -Recurse -Force server\data
npm run seed
```

## Not included (deliberate starter scope)

OAuth/social login, email-change notifications to the old address, and audit logs are not implemented. Add them before exposing the app to real users. The structure — separate route modules, Zod schemas, hashed one-time tokens, session helpers — is meant to make those additions straightforward.
