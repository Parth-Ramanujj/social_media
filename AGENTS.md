# AGENTS.md

Pulse — multi-tenant social media management platform (Buffer/Hootsuite-style).
pnpm monorepo: `apps/api` (NestJS) · `apps/web` (Next.js 15, **done**) · `packages/shared-types`.

## Prerequisites / services

- Docker Desktop must be running: `docker compose up -d` (postgres :5432, redis :6379, minio :9000/:9001, mailpit :1025/:8025).
- **`.env` lives at the repo root only** (never in `apps/api/`). All loaders resolve it explicitly:
  - API bootstrap (`apps/api/src/main.ts`) probes `cwd`, then `cwd/../../.env`.
  - Prisma CLI uses `apps/api/prisma.config.ts`, which loads `resolve(cwd, '../../.env')` (CLI cwd = `apps/api`).
  - The repo root is TWO levels above `apps/api` (`apps/api` → `apps` → root). Confusing paths here have burned time already.
- Node 24, pnpm 11 (global). `onlyBuiltDependencies` (prisma, esbuild) is configured in `pnpm-workspace.yaml`.

## Commands (all verified)

```bash
pnpm install                      # after clone; also approves prisma/esbuild postinstall scripts
docker compose up -d              # start postgres/redis/minio/mailpit
pnpm db:generate                  # prisma generate (after schema edits)
pnpm db:migrate -- --name <name>  # create+apply migration (dev)
pnpm db:deploy                    # apply without diffing (prod)
pnpm db:seed                      # pulse@example.com / pulse1234 (owner) + editor@example.com
pnpm db:studio                    # prisma studio
pnpm --filter @pulse/api build    # nest build → dist/
pnpm --filter @pulse/api start:dev
# manual run (no watch): node dist/main.js from apps/api
```

Seed workspace: `Pulse HQ` (`seed-workspace`). Dev invite links are returned in API responses (Mailpit UI: http://localhost:8025).

## Architecture / wiring

- Ports: API `:4000`, all routes under `/api`. Web `:3000`. OAuth callbacks: `http://localhost:4000/api/oauth/callback/:platform` (planned — providers not implemented yet).
- Auth: access JWT in `Authorization: Bearer` (15 min); refresh token in httpOnly cookie `pulse_refresh`, path `/api/auth`, SameSite=Lax, rotated on every `/api/auth/refresh`, stored hashed (sha256) in `refresh_tokens`.
- Tenant isolation: `WorkspaceScopeGuard` takes `workspaceId` from the ROUTE PARAM (never the body), resolves membership from the JWT actor, attaches `req.membership`/`req.workspace`. Client-supplied ids are never trusted.
- Guard order is fixed: `JwtAuthGuard → WorkspaceScopeGuard → RolesGuard` (roles check `req.membership.role`).
- OAuth tokens encrypted at rest: AES-256-GCM via `EncryptionService`, key `TOKEN_ENCRYPTION_KEY` (32-byte base64). Decrypt only in-memory at call time.
- Social platforms implement `SocialProvider` (`apps/api/src/oauth/social-provider.interface.ts`) and register in `OauthModule`. Registration guide: `apps/api/src/oauth/PROVIDERS-GUIDE.md`.
- Global API rate limit: 120 req/min/IP (ThrottlerModule). Helmet + cookie-parser in `main.ts`.
- All state-changing ops write `audit_logs` via `AuditService.log()`.

## Gotchas (learned the hard way)

- **`req.user` is typed optional** (passport). Don't read `req.user` directly — use the `@CurrentUser()`, `@Membership()`, `@CurrentWorkspace()` param decorators (`src/common/auth/current-user.decorator.ts`). Express type augmentation alone does NOT fix it (optional merges win).
- **tsconfig: `incremental: false`** in `apps/api/tsconfig.json`. With incremental + nest's `deleteOutDir`, a stale `tsconfig.build.tsbuildinfo` makes tsc emit nothing while exiting 0. If a build "succeeds" but `dist/` is empty, delete the tsbuildinfo.
- **class-validator rejects `undefined`** on optional DTO fields — add `@IsOptional()` (e.g. `plan?` in CreateWorkspaceDto).
- Prisma: hung `prisma migrate dev` processes hold a postgres advisory lock; kill stray node processes before retrying.
- `@prisma/client` IDs are cuid strings, NOT UUIDs — don't use `@IsUUID` on route params.
- `pnpm --filter @pulse/api exec <cmd>` runs with cwd = `apps/api`. Relative env-file paths are resolved from the schema dir; prefer the prisma.config.ts mechanism.
- Schema edits: edit `prisma/schema.prisma` → `pnpm db:migrate -- --name x` → `pnpm db:generate`. Run `pnpm --filter @pulse/api build` before starting the server (manual start uses `dist/`).
- Prisma 7 deprecation: `package.json#prisma` seed config removed in favor of `prisma.config.ts` (already migrated).
- Disk: `D:` drive is nearly full (~1GB free). Avoid `pnpm add` of large deps without checking space; pnpm store is on `D:` so node_modules uses hardlinks (don't relocate the store or everything becomes copies).

## Testing style

No test framework wired yet (Jest not installed). Verification is manual:
1. `docker compose up -d`, `pnpm db:migrate -- --name init`, `pnpm db:seed`
2. `pnpm --filter @pulse/api build`, start API
3. Smoke: signup → login (capture `pulse_refresh` cookie) → create workspace → invite → accept. PS 5.1 calls need `-UseBasicParsing` on Invoke-WebRequest.

## Repo status (what exists vs. planned)

Done: monorepo scaffold, auth (signup/login/refresh/logout/me), workspaces, members/roles, invitations, audit log, encryption, SocialProvider interface + registry, full Prisma schema + initial migration, docker-compose (postgres/redis/minio/mailpit), .env.example, seed, posts/composer/scheduler + CSV bulk + approval, BullMQ publishing engine (verified live fire), Next.js web app (auth, publish desk, composer, accounts, members, audit, settings — E2E verified via Playwright).
Planned (build order): Meta provider end-to-end → X/LinkedIn/YouTube/Pinterest/TikTok → unified inbox → analytics + export → notifications → Docker/deploy config.

## Web app (apps/web)

- Next.js 15 App Router, client-side app shell; public routes `/login`, `/signup`, `/invite/[token]`; protected `/app/*` (dashboard, composer, accounts, members, audit, settings).
- Custom design tokens (Hallmark "modern-minimal / workbench / cobalt"): `src/styles/tokens.css` (oklch palette), `globals.css`, `app.css`. No Tailwind.
- Auth state: `src/lib/auth-context.tsx` (access token in memory, refresh via cookie). API client: `src/lib/api.ts` (base `http://localhost:4000/api`).
- Composer: account chips → per-account variant copy → `POST /posts` → BullMQ schedules → dashboard "↻ refresh" shows published/failed. Dry-run `meta` account (seed) publishes instantly for local testing.
- Playwright browser check: use the pip-installed driver at `C:\Users\parth\.claude\skills\seo\.venv\Lib\site-packages\playwright\driver\package\cli.js` via `node <path> cli <cmd>` (playwright-cli not installed globally).
