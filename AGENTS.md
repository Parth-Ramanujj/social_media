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
pnpm db:deploy                    # apply without diffing (prod) — actual: pnpm --filter @pulse/api prisma:deploy
pnpm db:seed                      # pulse@example.com / pulse1234 (owner) + editor@example.com
pnpm db:studio                    # prisma studio
pnpm --filter @pulse/api build    # nest build → dist/
pnpm --filter @pulse/api start:dev
# manual run (no watch): node dist/main.js from apps/api
```

Seed workspace: `Pulse HQ` (`seed-workspace`). Dev invite links are returned in API responses (Mailpit UI: http://localhost:8025).

### Restarting the API manually (reliable loop)

```powershell
$conn = Get-NetTCPConnection -LocalPort 4000 -State Listen -ErrorAction SilentlyContinue
if ($conn) { Stop-Process -Id $conn.OwningProcess -Force; Start-Sleep 2 }
Start-Process node dist/main.js -WorkingDirectory apps/api -WindowStyle Hidden `-RedirectStandardOutput api.out.log `-RedirectStandardError api.err.log
```

`main.ts` loads the root `.env` itself — no env vars needed at launch. Always rebuild (`pnpm --filter @pulse/api build`) first; the server runs `dist/`.

## Architecture / wiring

- Ports: API `:4000`, all routes under `/api`. Web `:3000`. OAuth callback: `http://localhost:4000/api/oauth/callback/:platform` → 302 to `{frontendUrl}/app/accounts?connected=<platform>` (or `?error=connect_failed`).
- Auth: access JWT in `Authorization: Bearer` (15 min); refresh token in httpOnly cookie `pulse_refresh`, path `/api/auth`, SameSite=Lax, rotated on every `/api/auth/refresh`, stored hashed (sha256) in `refresh_tokens`.
- Tenant isolation: `WorkspaceScopeGuard` takes `workspaceId` from the ROUTE PARAM (never the body), resolves membership from the JWT actor, attaches `req.membership`/`req.workspace`. Client-supplied ids are never trusted.
- Guard order is fixed: `JwtAuthGuard → WorkspaceScopeGuard → RolesGuard` (roles check `req.membership.role`).
- OAuth tokens encrypted at rest: AES-256-GCM via `EncryptionService`, key `TOKEN_ENCRYPTION_KEY` (32-byte base64). Decrypt only in-memory at call time.
- Social platforms implement `SocialProvider` (`apps/api/src/oauth/social-provider.interface.ts`) and register in `OauthModule`. Registration guide: `apps/api/src/oauth/PROVIDERS-GUIDE.md`. `httpJson()` wraps fetch with a 45s timeout — provider calls must never block the worker.
- Dry-run mode: any provider without app credentials returns `dry-run:` results from `BaseProvider` (publish/mock/connect all work). Dry-run reconnects REUSE the existing dry-run account (`oauth.service.ts` upserts by `metadata.dryRun`) instead of duplicating rows.
- Global API rate limit: 120 req/min/IP (ThrottlerModule). Helmet + cookie-parser in `main.ts`.
- All state-changing ops write `audit_logs` via `AuditService.log()`.
- **Webhooks** (`src/webhooks/`): `GET/POST /api/webhooks/:platform` (meta, whatsapp), no auth — HMAC-verified. `main.ts` sets `rawBody: true` (verification needs exact bytes). Handshake: `hub.mode/hub.verify_token/hub.challenge` → echo challenge (401 on mismatch). Delivery: `x-hub-signature-256: sha256=<hmac>` over the raw body with the platform app secret → else 401. Ingested into `WebhookEvent` (deduped by sha256 `eventHash` of the raw body — duplicates ack `processed:false`), then BullMQ queue `webhook-events` → `WebhookProcessor` normalizes: page comments (post_id or comment id) → `Inbox` comment rows, IG messages → DM rows, WA messages → DM rows; the account is resolved by page id / `igBusinessAccountId` / `phoneNumberId` — unmatched events are marked processed without writing inbox rows. Job ids `webhook_<eventId>`; retry on failure (max 5, backoff), `dead` after. `removeOnComplete/removeOnFail: false` keeps every job for audit. Newly CREATED inbox rows (not updates) trigger `inbox.new` workspace notifications.
- **Notifications**: `NotificationService` (global) persists rows AND emits per-user events; `GET /api/notifications/stream?token=<jwt>` is an SSE stream (EventSource can't set headers, so the access token rides the query string; ping heartbeat every 25s). The bell (`apps/web/src/components/notifications-bell.tsx`) subscribes and refreshes on `notification.created` / `notifications.updated`; a 120s poll is the fallback. Full history: `/app/notifications` (all/unread tabs). Events wired: `post.published`/`post.failed` (publish processor), `inbox.new` (inbox sync + webhook normalization), `account_needs_reconnect` (token refresh failure), `invitation.accepted` (to other members), `member.role_changed`/`member.removed` (to the affected user).
- **Token refresh**: the `refresh-tokens` BullMQ queue has an hourly scheduler (`PublishingService.onModuleInit`) AND now a real processor (`refresh-tokens.processor.ts`) — it refreshes accounts whose `tokenExpiresAt` is < 1h out, skips dry-run + `needs_reconnect` + whatsapp; failures mark the account and notify via `OauthService.performRefresh`.

## Meta provider specifics (verified against live API)

- The connect flow picks the FIRST page from `/me/accounts` and stores its **page token** (`externalAccountId` = page id; `metadata.pageId`, `metadata.igBusinessAccountId`). With a page token, `/me` returns the PAGE. Page tokens can't be refreshed — `doRefreshToken` mints a fresh long-lived token from the app pair.
- Publish: text → `/{pageId}/feed`; single image → `/{pageId}/photos` (direct image URL only — see gotchas); IG account present + media → `/media` → `/media_publish`.
- Inbox sync walks `/feed` (25 posts) → per-post `/comments`, plus `/conversations` for DMs. Never use `/{pageId}/comments`.
- **DM replies**: Messenger message ids start with `m_`. They CANNOT use `/{comment-id}/replies`. `doReply` resolves the participant via `GET /{message-id}?fields=from{id}`, then `POST /me/messages` with a **JSON body** (`recipient`/`message`/`messaging_type: RESPONSE`). Form/query-string params fail with `(#100) Message cannot be empty` — the message param only parses from a JSON body.

## Gotchas (learned the hard way)

- **`req.user` is typed optional** (passport). Don't read `req.user` directly — use the `@CurrentUser()`, `@Membership()`, `@CurrentWorkspace()` param decorators (`src/common/auth/current-user.decorator.ts`). Express type augmentation alone does NOT fix it (optional merges win).
- **tsconfig: `incremental: false`** in `apps/api/tsconfig.json`. With incremental + nest's `deleteOutDir`, a stale `tsconfig.build.tsbuildinfo` makes tsc emit nothing while exiting 0. If a build "succeeds" but `dist/` is empty, delete the tsbuildinfo.
- **class-validator rejects `undefined`** on optional DTO fields — add `@IsOptional()` (e.g. `plan?` in CreateWorkspaceDto).
- Prisma: hung `prisma migrate dev` processes hold a postgres advisory lock; kill stray node processes before retrying.
- `@prisma/client` IDs are cuid strings, NOT UUIDs — don't use `@IsUUID` on route params.
- Count endpoints that the web reads as `{count}` must return an OBJECT (`{ count }`), not a bare number (bitten by `/notifications/unread-count` — badge + mark-all-read silently didn't render).
- `pnpm --filter @pulse/api exec <cmd>` runs with cwd = `apps/api`. Relative env-file paths are resolved from the schema dir; prefer the prisma.config.ts mechanism.
- Schema edits: edit `prisma/schema.prisma` → `pnpm db:migrate -- --name x` → `pnpm db:generate`. Run `pnpm --filter @pulse/api build` before starting the server (manual start uses `dist/`). Migrations so far: `20260808134528_init`, `20260808211904_inbox_replies`, `20260811_remove_tiktok_pinterest`.
- **PostgreSQL 16 has NO `ALTER TYPE ... DROP VALUE`** (that's PG 17). To remove enum values: create new type → `ALTER TABLE ... TYPE ... USING (col::text::newtype)` on every column → drop old → rename. Also: `prisma migrate deploy` refuses to run while a previous attempt is recorded failed — fix the SQL, `prisma migrate resolve --rolled-back <name>`, then re-deploy.
- Prisma 7 deprecation: `package.json#prisma` seed config removed in favor of `prisma.config.ts` (already migrated).
- **Never run `start:dev` AND `node dist/main.js` at the same time.** Two API processes = two BullMQ workers competing for the same queue: jobs get stolen mid-flight, die with the crashing instance, and variants get stuck in `publishing`. The dev watcher's worker also starts before its HTTP bind fails on EADDRINUSE. (Safety nets exist: the processor resumes `publishing` variants and `PublishingService` recovers variants stuck > 15 min at boot — but avoid the corruption.)
- **Web dev server**: serve with `node node_modules\next\dist\bin\next dev -p 3000` (cwd `apps/web`), NOT `pnpm --filter @pulse/web dev` — the pnpm wrapper gets reaped when the launching shell exits, while a direct node process survives. Also: `next start` serves the LAST BUILT assets — after source changes the old production server returns 400 on `/_next/static/*`; use dev mode (or rebuild + restart) or you'll chase phantom failures.
- **BullMQ dedupes `queue.add()` on existing job ids INCLUDING failed jobs.** After a job fails, retrying the same variant silently no-ops unless the failed job is removed first. `PublishingService.scheduleVariant`/`publishNow` call `queue.remove(jobId)` before add — keep it that way. Job ids are `pub_<variantId>` (BullMQ forbids `:` in custom ids).
- **Meta publishes require DIRECT image URLs** (JPG/PNG/GIF/TIFF/HEIF/WebP). Share links like `ibb.co/xvxSTqp` → Graph API `400 Invalid parameter` ("Can't read files"). Errors now surface `error_user_msg` via `MetaProvider.fbError()`.
- **Meta page-level `/comments` is unreliable** (returns `(#100) nonexisting field` on some pages). `doFetchInbox` walks `/feed` → per-post `/comments` + `/conversations` instead. Page tokens also can't comment on their own page's posts (200 insufficient permissions).
- **Providers: X/YouTube are dry-run** (no app credentials in `.env`; verified E2E: dry-run connect → publish → metrics). **LinkedIn is LIVE** (real `LINKEDIN_CLIENT_ID/SECRET` in `.env`) — its OAuth needs a browser consent, and its scope list is the modern `w_member_social openid profile email` (the old `r_liteprofile r_emailaddress` are removed by LinkedIn and break the consent screen).
- **Inbox replies to REAL (non-`dry-run:`) messages call the provider** (`inbox.service.ts` → `provider.reply`). Provider rejections are wrapped as 400s with the platform's reason — never a bare 500. Keep that wrapping.
- **A post with zero variants is un-publishable** — `publishNow` 400s on it and `create()` rejects empty variant lists. Variants are only ever deleted via post delete (cascade); if rows vanish without an audit entry, it was manual DB access, not the API.
- **PowerShell 5.1 + curl mangles JSON params** (`\"` escaping, `{id}` braces, spaces) and produced repeated bogus Graph errors. To verify a live Graph call, write a small Node script (global fetch, decrypt via `node:crypto` + Prisma) instead of curl. Also: the user's Facebook "page" here is a real FB Page (`Parth` / Computer Store, id `969090626286278`).
- Disk: `D:` drive is nearly full (~1GB free). Avoid `pnpm add` of large deps without checking space; pnpm store is on `D:` so node_modules uses hardlinks (don't relocate the store or everything becomes copies).

## Testing style

No test framework wired yet (Jest not installed). Verification is manual:
1. `docker compose up -d`, `pnpm db:deploy` (if migrations not yet applied), `pnpm db:seed`
2. `pnpm --filter @pulse/api build`, restart API per the loop above
3. Smoke: signup → login (capture `pulse_refresh` cookie) → create workspace → invite → accept. PS 5.1 calls need `-UseBasicParsing` on Invoke-WebRequest.

## Repo status (what exists vs. planned)

Done: monorepo scaffold, auth (signup/login/refresh/logout/me), workspaces, members/roles, invitations, audit log, encryption, SocialProvider interface + registry, full Prisma schema + migrations, docker-compose (postgres/redis/minio/mailpit), .env.example, seed, posts/composer/scheduler + CSV bulk + approval, BullMQ publishing engine (verified live fire + crash recovery + hourly token-refresh scheduler), **Meta provider end-to-end (real page connect, publish, inbox sync, DM/comment replies verified live)**, **X/LinkedIn/YouTube providers (x/youtube dry-run E2E verified; linkedin LIVE — real creds in `.env`, scope `w_member_social openid profile email`; needs browser consent)**, Next.js web app (auth, publish desk, composer, accounts, members, audit, settings, analytics), unified inbox (live sync from connected accounts via POST /inbox/sync + mock → assign → reply → resolve), analytics + CSV export (demo data), notifications (bell, unread badge, mark-all-read, SSE stream, /app/notifications page), **Docker deploy config (images build + prod stack E2E-verified locally: web container → api container → containerized postgres/redis/minio/mailpit → login → dashboard)**. All E2E verified via Playwright.
Planned: none remaining — providers, Docker/deploy, notifications polish all done. Next natural steps: commit the accumulated work, run the prod stack on a real host, or polish (SSE reconnect, inbox assignment UIs).

## Docker / prod deploy (verified)

- **Images**: `docker compose -f docker-compose.prod.yml build` builds `social_media-api` / `social_media-web` (~1.3GB each — devDeps ship on purpose: the `migrate` service runs prisma CLI from the same image). Verified end-to-end locally.
- **`docker-compose.prod.yml`** = postgres + redis + minio + mailpit + `migrate` (one-off, `service_completed_successfully` gates api) + api + web. `env_file: .env` (repo root) + `environment:` overrides re-pointing to service names. Fresh deploy = `up -d` handles migrations automatically; seeding stays manual (`prisma db seed` needs tsx on PATH).
- **Local verification** (dev stack occupies 5432/6379/4000/3000): use the override file `docker-compose.prod.verify.yml` — `docker compose -f docker-compose.prod.yml -f docker-compose.prod.verify.yml up -d` → api on :4100, web on :3100, postgres :55432, redis :56379, minio :9100/9101, mailpit :11025/18025. Web's `NEXT_PUBLIC_API_URL` is BAKED at build time — rebuild with `--build-arg NEXT_PUBLIC_API_URL=http://localhost:4100/api`, and set api `FRONTEND_URL` (CORS allowlist) accordingly.
- **Containerized API gotchas**: api crashes at boot on an empty DB (PublishingService recovery query) — apply migrations via the `migrate` service before starting. `--env-file` passes env at container creation — recreate after `.env` changes.
- **Docker build gotchas**:
  - Both Dockerfiles: `node:24-alpine` — pnpm 11.20 requires `node:sqlite` (Node ≥22.5); node:20 fails with `ERR_UNKNOWN_BUILTIN_MODULE`. `packageManager: pnpm@11.20.0` is in root package.json.
  - Dockerfile order matters: `prisma generate` must run BEFORE `nest build` (the install-time client is empty — no schema in the deps stage; building against it fails with "Prisma has no exported member 'JsonValue'").
  - `pnpm install --frozen-lockfile --filter <pkg> --fetch-retries=6 --fetch-retry-mintimeout=30000 --network-concurrency=6` — the Docker VM drops large registry downloads on this network otherwise (host is fine).
  - **Docker env-file does NOT support inline `# comments`** in values (dotenv does). `ACCESS_TOKEN_TTL=900 # seconds` → jwt `expiresIn: "900 # seconds"` → login 500. Keep .env values comment-free (fixed in .env + .env.example).
  - `pnpm-workspace.yaml` uses `allowBuilds:` (pnpm 11) with BOOLEANS. A leftover `sharp: set this to true or false` placeholder overrides the legacy list and fails installs with `ERR_PNPM_IGNORED_BUILDS`.

## Web app (apps/web)

- Next.js 15 App Router, client-side app shell; public routes `/login`, `/signup`, `/invite/[token]`, `/advanceguide` (static Gujarati setup guide); protected `/app/*` (dashboard, composer, accounts, inbox, members, audit, analytics, settings).
- Custom design tokens (Hallmark "modern-minimal / workbench / cobalt"): `src/styles/tokens.css` (oklch palette), `globals.css`, `app.css`. No Tailwind.
- Auth state: `src/lib/auth-context.tsx` (access token in memory, refresh via cookie). API client: `src/lib/api.ts` (base `http://localhost:4000/api`).
- Composer: account chips → per-account variant copy → `POST /posts` → BullMQ schedules → dashboard "↻ refresh" shows published/failed. Dry-run `meta` account (seed) publishes instantly for local testing.
- Playwright browser check: use the pip-installed driver at `C:\Users\parth\.claude\skills\seo\.venv\Lib\site-packages\playwright\driver\package\cli.js` via `node <path> cli <cmd>` (playwright-cli not installed globally).
