# Pulse — Social Media Management Platform

Multi-tenant Buffer/Hootsuite-style platform: connect social accounts, compose & schedule posts, publish reliably, reply from a unified inbox, and track analytics. Official platform APIs only.

## Stack

| Layer | Tech |
|---|---|
| API | NestJS + Prisma + PostgreSQL + Redis + BullMQ |
| Web | Next.js 15 (App Router) + custom design tokens (Hallmark "cobalt workbench") |
| Jobs | BullMQ (Redis) — publishing engine |
| Storage | S3-compatible (MinIO in dev) |
| Auth | JWT access (Bearer) + rotating refresh cookie; OAuth 2.0 for social connections |
| Infra | Docker Compose (postgres, redis, minio, mailpit) |

## Quick start

Prereqs: Docker Desktop running, Node 20+, pnpm 11.

```bash
pnpm install          # installs all workspace packages
docker compose up -d  # postgres :5432, redis :6379, minio :9000/:9001, mailpit :1025/:8025
cp .env.example .env  # generate secrets (see comments in the file)
pnpm db:migrate -- --name init
pnpm db:seed          # pulse@example.com / pulse1234 (owner), editor@example.com
pnpm --filter @pulse/api start:dev   # API on http://localhost:4000/api
pnpm --filter @pulse/web dev         # web app on http://localhost:3000
```

Health check: `GET http://localhost:4000/api/auth/me` returns 401 without a token (guards working).

## Verified API surface (stage 1)

All under `/api`. Auth:

- `POST /auth/signup` `{email, password, name}` → user + default workspace + `pulse_refresh` cookie
- `POST /auth/login` `{email, password}` → access token + refresh cookie
- `POST /auth/refresh` (cookie) → rotates refresh token, new access token
- `POST /auth/logout` (cookie) → revokes session
- `GET /auth/me` (Bearer)

Workspaces (all Bearer):

- `POST /workspaces` `{name, plan?}` — creator becomes owner
- `GET /workspaces` — my workspaces (with my role)
- `GET|PATCH|DELETE /workspaces/:id` — scoped; PATCH/DELETE need owner/admin; DELETE requires no other members
- `GET /workspaces/:id/audit` — audit trail

Members & invites:

- `GET /workspaces/:id/members` · `PATCH .../members/:userId {role}` · `DELETE .../members/:userId` (owner/admin)
- `POST /workspaces/:id/invitations {email, role}` (owner/admin) → emails a link (dev: link returned in response)
- `GET /workspaces/:id/invitations` · `DELETE .../invitations/:id` (owner/admin)
- `POST /invitations/accept {token}` — must be logged in as the invited email
- `GET /users/search?q=` — member autocomplete

Isolation: `:workspaceId` is validated against your JWT membership by `WorkspaceScopeGuard`; client-supplied ids are never trusted. Roles: owner > admin > editor > viewer.

## Verified UI surface (stage 2)

Web app (Next.js 15, `apps/web`, port :3000). All app pages are client-side under `/app`; login/signup/invite are public. Smoke + Playwright E2E verified end-to-end: login → dashboard → composer → schedule → BullMQ fire → published.

- `/` → `/login` · `/signup` · `/invite/[token]` (accept invite)
- `/app` — publish desk: stats (published/scheduled/awaiting approval/connected), status-filtered post list, refresh
- `/app/composer` — pick target accounts, write copy + media URLs, scheduled-at datetime, needs-approval flag, status select, live publish preview (variants/platforms/chars/mode/fires), "Queue for publish"
- `/app/accounts` — connected channels (refresh/disconnect) + connect a platform (reconnect replaces token)
- `/app/members` — roles UI · `/app/audit` — audit trail · `/app/settings` — workspace + account
- Design: custom token system (cool paper/ink oklch palette, cobalt accent, side-rail nav) in `apps/web/src/styles/tokens.css`

## Environment variables

`.env.example` documents every variable. Highlights:

- `TOKEN_ENCRYPTION_KEY` — 32-byte base64 key for AES-256-GCM token encryption: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`
- `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` — long random hex strings
- `SMTP_*` — point at mailpit (localhost:1025) in dev; UI at http://localhost:8025
- `S3_*` — MinIO in dev (console http://localhost:9001, user `pulse` / `pulse-minio-secret`)
- Platform credentials `META_*`, `X_*`, `LINKEDIN_*`, `GOOGLE_*` (YouTube), `PINTEREST_*`, `TIKTOK_*` + `<PLATFORM>_ENABLED` flags

## Connecting social platforms

Step-by-step registration for every platform is in `apps/api/src/oauth/PROVIDERS-GUIDE.md` (Meta, X, LinkedIn, YouTube, Pinterest, TikTok). The gist:

1. Create a developer app in the platform's console (links in the guide).
2. Set the OAuth redirect URI to `http://localhost:4000/api/oauth/callback/<platform>` — platforms validate these exactly.
3. Put the app id/secret in the root `.env`.
4. Provider implementations are the next build stage; until then `SocialProvider` interface + registry exist in `apps/api/src/oauth/`.

## Repository layout

```
apps/api/         NestJS API (all routes /api), Prisma schema + migrations
apps/web/         Next.js 15 web app (auth, publish desk, composer, accounts, members, audit, settings)
packages/shared-types/  shared Platform/Role/limits types (raw TS source, workspace dep)
```

## Roadmap / status

- [x] Monorepo, docker-compose, env wiring, Prisma schema + initial migration, seed
- [x] Auth (signup/login/refresh/logout/me), refresh rotation, httpOnly cookie
- [x] Workspaces, members, role-based guards, invite-by-email flow, audit log
- [x] AES-256-GCM token encryption, `SocialProvider` interface + provider registry
- [x] Posts/composer/scheduler, per-account variants, approval workflow, CSV bulk
- [x] BullMQ publishing engine (idempotent, retry/backoff) — verified live fire
- [x] Next.js web app: auth, publish desk, composer, accounts, members, audit, settings
- [ ] Meta provider end-to-end (connect → post → analytics) — reference implementation
- [ ] X / LinkedIn / YouTube / Pinterest / TikTok providers
- [ ] Unified inbox, analytics + export, notifications
- [ ] Dockerfile/deploy config for Render/Railway/Fly.io

## Security notes

- OAuth tokens AES-256-GCM encrypted at rest; decrypted in memory only at call time.
- Refresh tokens stored hashed (sha256), rotated on use.
- Global rate limit 120 req/min/IP; Helmet headers; DTO whitelist validation.
- Workspace data isolation enforced by guards from the JWT actor, never client input.
