# Taskflow

A full-stack task manager with email/password authentication. Built with a React SPA, an Express JSON API, and SQLite — no external services required.

![Stack](https://img.shields.io/badge/React_19-Vite_8-6366f1) ![Stack](https://img.shields.io/badge/Express_5-TypeScript-0ea5e9) ![Stack](https://img.shields.io/badge/SQLite-better--sqlite3-22c55e)

## Features

- **Accounts** — register, sign in, sign out, persistent cookie sessions
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

The login screen also has a **Use demo** button that fills these in.

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

1. **Registration** validates input with Zod, hashes the password with Node’s `scrypt` (random 16-byte salt, 64-byte key), creates the user plus a default project, and starts a session.
2. **Sessions** are opaque 32-byte random tokens. Only a SHA-256 hash of the token is stored in the `sessions` table, so a database leak cannot be replayed against the API.
3. The raw token travels in an **httpOnly, SameSite=Lax cookie** (`Secure` in production), valid for 7 days. JavaScript never sees it.
4. **Login** uses a generic “Invalid email or password” message and a dummy hash comparison when the email doesn’t exist, reducing account enumeration and timing clues.
5. **Authorization** — `requireAuth` resolves the cookie on every protected request; all project/task queries include the user ID so users can only ever touch their own rows.
6. **Password changes** — verified against the stored hash, then re-hashed with a fresh salt. Every other session for the account is revoked, so a stolen session cannot outlive the change.
7. **Hardening** — `helmet` headers, a 100 kB JSON body limit, auth rate limiting (30 attempts / 15 minutes / IP), and an origin allow-list on state-changing requests as defense-in-depth alongside SameSite cookies.

Passwords are never stored or logged in plain text. No application secret is required: sessions are random tokens, and only their hashes are persisted.

## API reference

All routes are prefixed with `/api`. Protected routes require the session cookie.

| Method   | Route                 | Auth | Description                            |
| -------- | --------------------- | :--: | -------------------------------------- |
| `GET`    | `/health`             |      | Health check                           |
| `POST`   | `/auth/register`      |      | `{ name, email, password }` → user + cookie |
| `POST`   | `/auth/login`         |      | `{ email, password }` → user + cookie  |
| `POST`   | `/auth/logout`        |      | Clears the session and cookie          |
| `GET`    | `/auth/me`            |  ✓   | Current user                           |
| `PATCH`  | `/auth/profile`       |  ✓   | `{ name, email }` → updated user       |
| `POST`   | `/auth/change-password` | ✓  | `{ currentPassword, newPassword }`; revokes other sessions |
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
| `COOKIE_SECURE` | `true` in production     | Force secure cookies; set `false` for local HTTP production tests |
| `NODE_ENV`      | —                        | Enables production behavior (trust proxy, secure cookies)   |

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

Email verification, password reset, 2FA/OAuth, and audit logs are not implemented. Add them before exposing the app to real users. The structure — separate route modules, Zod schemas, session helpers — is meant to make those additions straightforward.
