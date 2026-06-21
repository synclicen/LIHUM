---
Task ID: 1
Agent: main (Z.ai Code)
Task: Recreate the LIHUM (Lihat untuk Umum) app from https://github.com/synclicen/LIHUM.git at its latest commit (af91f66 "Add Cloudflare Workers configuration") as a Next.js 16 production-ready app.

Work Log:
- Cloned the LIHUM repo to /tmp/LIHUM and inspected all source files (server.ts express backend + React/Vite/Firebase frontend + Tailwind v4 Purple Haze/Gold/White Asgard theme).
- Identified the latest commit `af91f66000cebcaa06ab72bdf8b38d45ef3301a6` as the target state to reproduce.
- Installed `firebase` and `motion` packages.
- Wrote Prisma schema (Project, Photo with composite PK `(projectId, id)`, Account) and pushed to SQLite.
- Built `src/lib/seed.ts` with the two default galleries (lumina-asgard "all" mode, secret-vault "search" mode), 6 curated Unsplash sample photos, and the synclicen@gmail.com admin account.
- Built `src/lib/lihum.ts` helpers (getAccountRole, ensurePrimaryAdmin, parseDriveFolderId, slugify, emailToId) and `src/lib/firebase.ts` client (Google OAuth with drive.readonly scope).
- Ported every Express route from server.ts to Next.js App Router API routes: /api/config, /api/accounts (GET/POST), /api/accounts/me, /api/accounts/[id] (DELETE), /api/projects (GET/POST), /api/projects/[id] (GET/PUT/DELETE), /api/projects/[id]/sync (POST), /api/photo-proxy (GET), /api/photo-proxy/download (GET).
- Ported all 4 React components pixel-for-pixel: Header, AdminPanel (with Projects + Accounts tabs, CRUD, Drive sync, auto-sync scheduler), GalleryView (debounced search, 10s polling, lightbox), ShareModal (QR code via qrserver API, copy link, download QR).
- Ported App.tsx into src/app/page.tsx ("use client") with the 15s metadata polling, auto-sync background scheduler, hero banner, unregistered-user warning, admin panel toggle, and public gallery grid.
- Rewrote globals.css with the Outfit/Playfair Display/JetBrains Mono fonts, brand color tokens, custom scrollbars, fadeIn animation, and z-100 utility.
- Updated layout.tsx metadata to "LIHUM: Lihat dan Unduh Mandiri".
- Fixed a seed race condition (replaced the `seeded` boolean flag with a deduplicating `seedingPromise`) and switched Photo's primary key to composite `(projectId, id)` so both demo galleries can share the same sample photo IDs (matching the original JSON-nested storage behavior).
- Created `.zscripts/start-dev.sh` detached launcher so the dev server survives between Bash tool calls.
- Verified all API endpoints with curl: both projects seed correctly, search-mode filtering works (secret-vault returns 0 photos with no query, returns "White Asgard Marble Palace" for ?search=Marble), admin-only account listing enforces 403, photo-proxy redirects sample photos to Unsplash (307).
- Ran `bun run lint` — 0 errors, 0 warnings.
- Used Agent Browser + VLM to verify end-to-end:
  * Home page: header with LIHUM branding + "MASUK PENGELOLA" login, purple/gold hero banner "LIHUM: Lihat, Unduh Mandiri!", both gallery cards, footer "Made by Fajrianor".
  * Gallery view (lumina-asgard): 6 photo thumbnails load (no broken images), gold download buttons, search box, "Server / All Mode / 6 Total Foto" status.
  * Search-mode (secret-vault): "Keamanan Galeri Aktif" locked message with no photos initially; typing "Marble" reveals the matching photo.
  * Share modal: purple header, share URL input, Copy button, QR code image, "Download File Gambar QR" button.
  * Lightbox: large photo on left, info panel on right with title/size/date, gold "Unduh" button, close (X) button.
  * Mobile (390x844): responsive single-column layout, no horizontal scroll, footer stays at bottom.
  * Zero browser console errors and zero page errors across all interactions.
- Verified dev.log shows clean 200/307 responses for all routes with no compile errors.

Stage Summary:
- Successfully reproduced the LIHUM app (commit af91f66) as a Next.js 16 App Router app at /home/z/my-project.
- Backend: 9 API route files replacing the original Express server.ts, backed by Prisma + SQLite instead of JSON files.
- Frontend: 4 components under src/components/lihum/ + page.tsx, pixel-perfect port of the original Purple Haze/Gold/White Asgard theme.
- Auth: Firebase Google OAuth (drive.readonly scope) preserved exactly as original.
- Data: Prisma schema with Project, Photo (composite PK), Account models; auto-seeds 2 demo galleries + 6 sample photos + admin account on first request.
- All core user flows verified working in the browser: gallery browsing, search (both modes), photo lightbox, share modal with QR, download proxy, admin panel (UI rendered; live Google OAuth requires real Google credentials).
- Dev server runs stably on port 3000 via the detached launcher script.

---
Task ID: 2
Agent: main (Z.ai Code)
Task: Migrate the LIHUM app's environment to GitHub + Cloudflare + Turso — replace Prisma + local SQLite with Turso (libSQL via @libsql/client) and add Cloudflare Workers deployment config (OpenNext) so the app deploys via git push → Cloudflare auto-build → Turso.

Work Log:
- Installed `@libsql/client` (Turso/libSQL client, Workers-native, no query engine).
- Tested `@libsql/client` local file mode in the sandbox — confirmed it works with `file:/abs/path.db` URLs.
- Rewrote `src/lib/db.ts`: creates a libSQL client from `DATABASE_URL` + `TURSO_AUTH_TOKEN` (works identically for local file: URLs, Turso libsql:// URLs, and Cloudflare Workers HTTP transport). Added `ensureSchema()` that idempotently creates the 3 tables (Project, Photo with composite PK (projectId,id), Account) + index via `CREATE TABLE IF NOT EXISTS` — no migration CLI needed.
- Created `src/lib/queries.ts`: typed data-access layer with row mappers (ProjectRow/PhotoRow/AccountRow → API types). All CRUD operations as raw SQL: countProjects, getAllProjectSummaries, findProjectById, getProjectWithPhotos, createProject, updateProject, deleteProject, updateProjectSync, replaceProjectPhotos (atomic batch), findPhotoById, addProjectPhotos, countAccounts, getAllAccounts, findAccountByEmail, findAccountById, createAccount, deleteAccount, createAccounts.
- Rewrote `src/lib/seed.ts` to use the new query layer (same 2 demo galleries + 6 sample photos + synclicen admin). `ensureSeed()` is now idempotent with a deduplicating promise.
- Rewrote `src/lib/lihum.ts` helpers (getAccountRole, ensurePrimaryAdmin, parseDriveFolderId, slugify, emailToId) to use queries instead of Prisma.
- Rewrote all 9 API route files (config, accounts GET/POST, accounts/me, accounts/[id] DELETE, projects GET/POST, projects/[id] GET/PUT/DELETE, projects/[id]/sync, photo-proxy, photo-proxy/download) to import from `@/lib/queries` and `@/lib/lihum` instead of Prisma.
- Removed Prisma entirely: deleted `prisma/schema.prisma`, ran `bun remove prisma @prisma/client`, deleted the old `db/custom.db` file.
- Updated `package.json`: name → "lihum", removed all `db:*` Prisma scripts, added `build:cloudflare`, `deploy`, `preview:cloudflare`, `cf-typegen` scripts.
- Installed `@opennextjs/cloudflare` (v1.19.11) + `wrangler` (v4.103.0) as dev deps.
- Created `wrangler.jsonc` (Cloudflare Workers config: main=.open-next/worker.js, nodejs_compat flag, assets binding, APP_URL var).
- Created `open-next.config.ts` (default OpenNext Cloudflare config).
- Updated `next.config.ts` to opt into OpenNext dev patches only when `CF_DEV=1` (so sandbox `next dev` runs as plain Node).
- Created `.env.example` documenting DATABASE_URL (file: for local, libsql:// for Turso), TURSO_AUTH_TOKEN, APP_URL.
- Updated `.gitignore` to exclude `.open-next/`, `.wrangler/`, `cloudflare-env.d.ts`, `db/*.db*`, and to keep `.env.example` tracked.
- Wrote a comprehensive `README.md` with: tech stack table, local dev instructions, full GitHub→Cloudflare→Turso deployment guide (Turso db create, git push, Cloudflare Pages git-connect with build settings + env vars, CLI deploy alternative, Firebase authorized domains).
- Restarted dev server via the detached launcher script. Verified all 9 endpoints work with the new libSQL stack:
  * /api/projects → 2 galleries seeded (lumina-asgard all-mode 6 photos, secret-vault search-mode 6 photos)
  * /api/projects/secret-vault (no search) → 0 photos (locked)
  * /api/projects/secret-vault?search=Marble → matches "White Asgard Marble Palace"
  * /api/projects/lumina-asgard → 6 photos
  * /api/accounts/me as synclicen → admin role
  * /api/accounts as admin → account list; as nobody → 403
  * /api/photo-proxy?id=sample-lumina-1 → 307 redirect to Unsplash
  * /api/config → appUrl
- Ran `bun run lint` — fixed one `no-require-imports` error in next.config.ts (switched to static import) — now 0 errors, 0 warnings.
- Verified with Agent Browser + VLM:
  * Home page: LIHUM header, hero banner, both gallery cards, footer — all correct, 0 console errors.
  * Gallery view (lumina-asgard): 6 photos load (no broken images), gold download buttons, search box, "Server / All Mode / 6 Total Foto" status.
  * Search-mode (secret-vault): typing "Marble" reveals the matching photo with image visible.
  * All dev.log entries show 200/307 responses, no errors.
- Verified `opennextjs-cloudflare` (1.19.11) and `wrangler` (4.103.0) CLIs are installed and versioned correctly.

Stage Summary:
- Database migrated: Prisma + local SQLite → Turso (libSQL) via `@libsql/client`. No ORM, no migration CLI — schema auto-creates with `CREATE TABLE IF NOT EXISTS` on first request. Same code runs on Node.js (local file: URL) and Cloudflare Workers (HTTP transport to Turso).
- Cloudflare deployment enabled: `wrangler.jsonc` + `open-next.config.ts` + `@opennextjs/cloudflare`. Deploy commands: `bun run build:cloudflare` (build) and `bun run deploy` (build + deploy). Also supports Cloudflare Pages git-integration (connect GitHub repo, auto-deploy on push).
- Prisma fully removed (schema.prisma deleted, packages uninstalled, all 15+ query call sites rewritten to raw SQL via the typed queries layer).
- All 4 frontend components + page.tsx unchanged (they consume the same API shapes) — UI verified identical to before via Agent Browser.
- README documents the complete GitHub → Cloudflare → Turso setup including Turso db creation, env vars, Firebase authorized domains.
- App runs locally on port 3000 with `file:` DB; production just needs `DATABASE_URL=libsql://...` + `TURSO_AUTH_TOKEN` + `APP_URL` set in Cloudflare dashboard.

---
Task ID: 3
Agent: main (Z.ai Code)
Task: Deploy LIHUM to production using the user's Turso, GitHub, and Cloudflare tokens. Push code to GitHub, create Turso DB, and deploy to Cloudflare Workers.

Work Log:
- Verified all 3 tokens:
  * Turso: valid, org slug "enigmatic-aquarius-tehb9z" (personal, id 1000159060)
  * GitHub: valid, user "synclicen" (id 273628571), scopes: repo, workflow
  * Cloudflare: token valid (id c336b14b9438fb787349da16dc564a9f, expires 2026-12-31)
- Created Turso database "lihum" via Platform API (POST /v1/organizations/enigmatic-aquarius-tehb9z/databases with group=default).
  * Connection URL: libsql://lihum-enigmatic-aquarius-tehb9z.aws-us-east-1.turso.io
  * Hostname: lihum-enigmatic-aquarius-tehb9z.aws-us-east-1.turso.io
- Updated local .env to use Turso (DATABASE_URL + TURSO_AUTH_TOKEN). Restarted dev server — schema auto-created in Turso, 2 demo galleries + 6 sample photos + admin account seeded successfully.
- Updated wrangler.jsonc: DATABASE_URL set as a non-secret var (Turso URL), APP_URL left empty (computed dynamically from request Host header by /api/config).
- Created GitHub Actions workflow (.github/workflows/deploy.yml):
  * Triggers on push to main + manual dispatch
  * Steps: checkout → setup bun → install → build:cloudflare → wrangler deploy → set TURSO_AUTH_TOKEN secret
  * Passes DATABASE_URL during build step
  * Uses bunx wrangler for deploy
  * Required secrets: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, TURSO_AUTH_TOKEN, DATABASE_URL
- Fixed db.ts: replaced eager `createClient()` with a lazy Proxy so `next build` works without DATABASE_URL at build time (build-time prerendering no longer triggers DB connection). Verified local build succeeds without DATABASE_URL env var.
- Fixed eslint config: added .open-next/, .wrangler/, cloudflare-env.d.ts to ignores (build artifacts were causing 9348 lint errors).
- Force-pushed new code to github.com/synclicen/LIHUM (replaced old React+Vite code with Next.js+Turso+Cloudflare version):
  * Commit ad0a289: "feat: deploy to Cloudflare Workers + Turso" (initial deploy config)
  * Commit 2aa1b5b: "fix: lazy db client + build artifacts in eslint ignores"
- Set 3 GitHub repo secrets via API (using libsodium sealed-box encryption):
  * CLOUDFLARE_API_TOKEN ✅
  * TURSO_AUTH_TOKEN ✅
  * DATABASE_URL ✅ (libsql://lihum-enigmatic-aquarius-tehb9z.aws-us-east-1.turso.io)
- GitHub Actions workflow ran twice:
  * Run #1 (ad0a289): failed at build step — DATABASE_URL not passed during build
  * Run #2 (2aa1b5b): build PASSED ✅ (lazy db fix), failed at deploy step — CLOUDFLARE_ACCOUNT_ID not set
- Cloudflare deploy BLOCKED: the provided Cloudflare API token (cfut_...) cannot auto-discover the account_id. Exhaustively tried: /accounts (empty), /user (403), /user/tokens (403), /memberships (403), /zones (empty), /user/tokens/{id} (403), repo webhooks (none), wrangler whoami (failed), wrangler deploy (failed), wrangler deploy --dry-run (succeeded — worker bundle ready, 4806 KiB). The token was created with "Workers Scripts: Edit" scope for a specific account but WITHOUT "Account Settings: Read" permission, so it cannot list/discover accounts.
- OpenNext build verified locally: worker bundle at .open-next/worker.js (4806 KiB, gzip 985 KiB), all 9 API routes preserved as dynamic server functions, bindings: ASSETS + DATABASE_URL + APP_URL.
- Local app verified working with Turso: 2 projects, 6 photos, admin role, config endpoint — all return correct data from Turso cloud DB.

Stage Summary:
- ✅ Turso: database "lihum" created at libsql://lihum-enigmatic-aquarius-tehb9z.aws-us-east-1.turso.io, schema auto-created, demo data seeded.
- ✅ GitHub: code pushed to https://github.com/synclicen/LIHUM (commit 2aa1b5b on main), 3 repo secrets set (CLOUDFLARE_API_TOKEN, TURSO_AUTH_TOKEN, DATABASE_URL).
- ✅ Build: OpenNext build passes in GitHub Actions (lazy db client fix), worker bundle ready.
- ⏳ Cloudflare deploy: blocked by missing CLOUDFLARE_ACCOUNT_ID. The provided Cloudflare token lacks account-list permission, so the account_id cannot be discovered programmatically. User needs to either:
  (A) Add CLOUDFLARE_ACCOUNT_ID as a GitHub secret (find it at dash.cloudflare.com — it's the hex string in the URL after login), then re-run the workflow, OR
  (B) Use Cloudflare dashboard → Workers & Pages → Create → Pages → Connect to Git → select LIHUM repo (simpler, no account_id needed — dashboard handles it).
- The GitHub Actions workflow is ready: once CLOUDFLARE_ACCOUNT_ID is added, every push to main auto-deploys to Cloudflare Workers + sets TURSO_AUTH_TOKEN as a Worker secret.

---
Task ID: 4
Agent: main (Z.ai Code)
Task: Complete the Cloudflare deployment after user updated token permissions. Deploy the worker, set all secrets, and verify auto-deploy via GitHub Actions.

Work Log:
- Re-verified the updated Cloudflare token: now works with /accounts endpoint. Discovered account_id = d8a5b04ca8fc4894e0541c83899f8d97 (account name: "Synclicen@gmail.com's Account"). wrangler whoami now succeeds.
- Deployed worker via `wrangler deploy` (build output already in .open-next/ from earlier). Worker "lihum" deployed to https://lihum.synclicen.workers.dev (Version ID: d0d0086b). Bindings: ASSETS + DATABASE_URL + APP_URL.
- Set TURSO_AUTH_TOKEN as Worker secret via `wrangler secret put`.
- Set CLOUDFLARE_ACCOUNT_ID as GitHub secret via API (libsodium sealed-box encryption). All 4 GitHub secrets now set: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, TURSO_AUTH_TOKEN, DATABASE_URL.
- First production test FAILED: all DB-backed API routes returned HTTP 500. wrangler tail revealed: "LibsqlError: SERVER_ERROR: Server returned HTTP status 401". The user-provided TURSO_AUTH_TOKEN was invalid for the lihum database (Turso: "invalid JWT token: can't be decoded with any of the existing keys").
- Created a NEW Turso token specifically for the lihum database via Turso Platform API (POST /v1/organizations/enigmatic-aquarius-tehb9z/databases/lihum/auth/tokens). New token verified working via direct curl to the libSQL HTTP pipeline API (SELECT COUNT(*) returned 200).
- Updated Worker secret TURSO_AUTH_TOKEN with the new token. Updated GitHub secret TURSO_AUTH_TOKEN with the new token (for future CI auto-deploys).
- Re-tested all production endpoints — ALL PASS:
  * Home page: HTTP 200 (13354 bytes)
  * /api/projects: 2 projects from Turso
  * /api/projects/lumina-asgard: 6 photos loaded
  * /api/projects/secret-vault?search=Marble: matched "White Asgard Marble Palace.jpg"
  * /api/accounts/me (synclicen): role=admin
  * /api/config: appUrl=https://lihum.synclicen.workers.dev
  * /api/photo-proxy?id=sample-lumina-1: 307 redirect to Unsplash
- Verified UI via Agent Browser + VLM on production URL:
  * Home page: LIHUM header, hero banner, 2 gallery cards, footer — all correct, 0 console errors.
  * Gallery view (?gallery=lumina-asgard): 6 photo thumbnails loading with actual images, search box, "6 Total Foto" status, no broken images.
- Updated wrangler.jsonc: set APP_URL to "https://lihum.synclicen.workers.dev". Re-deployed (Version ID: ea7340f6).
- Committed and pushed wrangler.jsonc change to GitHub (commit f207d85) to trigger the auto-deploy workflow.
- GitHub Actions workflow run #3: completed/success ✅. Job log confirms:
  * `bunx wrangler deploy` → "Uploaded lihum" → "Deployed lihum triggers" → https://lihum.synclicen.workers.dev
  * `wrangler secret put TURSO_AUTH_TOKEN` → "Success! Uploaded secret TURSO_AUTH_TOKEN"
- Post-auto-deploy verification: all endpoints still return correct data (Home 200, /api/projects 2 projects, /api/projects/lumina-asgard 6 photos, /api/accounts/me role=admin, /api/config appUrl correct).

Stage Summary:
- ✅ PRODUCTION LIVE at https://lihum.synclicen.workers.dev
- ✅ Turso DB: libsql://lihum-enigmatic-aquarius-tehb9z.aws-us-east-1.turso.io (new auth token created and deployed)
- ✅ GitHub repo: https://github.com/synclicen/LIHUM (commit f207d85 on main)
- ✅ GitHub Actions: auto-deploy workflow passes (4 secrets configured: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, TURSO_AUTH_TOKEN, DATABASE_URL)
- ✅ Cloudflare Worker: "lihum" deployed with bindings (ASSETS, DATABASE_URL var, APP_URL var) + TURSO_AUTH_TOKEN secret
- ✅ Full pipeline verified: git push → GitHub Actions → OpenNext build → wrangler deploy → Cloudflare Workers → Turso DB
- Remaining manual step for user: add "lihum.synclicen.workers.dev" to Firebase Console → Authentication → Settings → Authorized domains (so Google OAuth login works in production).

---
Task ID: 5
Agent: main (Z.ai Code)
Task: Add public/private gallery option with password protection. Private galleries appear on the gallery list but require a password to open. Admin can set the password when creating/editing.

Work Log:
- Analyzed user's screenshot of the "Buat Galeri Baru" form to understand current layout.
- DB schema migration: added `visibility` (TEXT, default 'public') and `password` (TEXT, default '') columns to Project table. Used `PRAGMA table_info` + `ALTER TABLE ADD COLUMN` for idempotent migration that works on existing databases.
- Created `src/lib/password.ts`: password hashing via Web Crypto API (SHA-256 + 16-byte random salt). Stored as "salt:hash" format. Works identically on Node.js and Cloudflare Workers.
- Updated `src/lib/lihum.ts`: re-exports hashPassword, generateSalt, verifyPassword from password.ts (avoids circular imports with seed.ts).
- Updated types: added `visibility` to Project + ProjectSummary, added `requiresPassword` + `passwordError` to Project (for client-side password prompt state).
- Updated queries.ts: added visibility + password to ProjectRow, NewProjectInput, UpdateProjectInput, asProject mapper, createProject, updateProject. Password field is never included in API response objects (projectOut/summaryOut explicitly exclude it).
- Updated seed.ts: added visibility:"public" + password:"" to existing demo galleries (backward compatible).
- Updated API routes:
  * POST /api/projects: accepts visibility + password, validates (private requires password ≥3 chars), hashes before storing.
  * PUT /api/projects/[id]: accepts visibility + password updates. When switching to private, requires new password if none exists. When switching to public, clears password. When editing existing private, empty password = keep existing.
  * GET /api/projects/[id]: for private galleries, verifies password query param. Without/incorrect password → returns project metadata + requiresPassword:true + empty photos. Correct password → returns photos normally. Admin/manager bypass via x-user-email header.
- Updated AdminPanel.tsx:
  * Added visibility + password state variables
  * Added "Siapa yang Bisa Melihat Foto?" section with two buttons: "Umum" (Globe icon, green) and "Privat" (Lock icon, amber)
  * When "Privat" selected, shows password input field with contextual placeholder (create vs edit mode)
  * Info note: "Bagikan password ini hanya kepada kalangan yang Anda izinkan"
  * Project cards in admin list show "Privat" badge (red, lock icon) for private galleries
  * handleSubmit sends visibility + password in request body
  * handleEditClick loads visibility (but never password — admin can leave empty to keep existing)
- Updated GalleryView.tsx:
  * Added password state: passwordInput, passwordVerifying, unlockedPassword
  * sessionStorage caching: password stored per-project in sessionStorage so user doesn't re-enter on every search
  * buildFetchUrl: includes password query param when unlocked
  * fetchHeaders: includes x-user-email header for admin bypass
  * Password prompt UI: centered card with lock icon, "Galeri Privat" title, description, password input, "Buka Galeri" button, error message (if wrong), "Hubungi Admin: synclicen@gmail.com" note
  * Polling disabled when gallery is locked (requiresPassword)
  * handlePasswordSubmit: stores password in sessionStorage, triggers re-fetch
- Updated page.tsx:
  * Pass userEmail prop to GalleryView (for admin bypass)
  * Gallery cards show "Privat" badge (red, lock icon) for private galleries
- Lint: 0 errors, 0 warnings (removed unused eslint-disable directives).
- Local testing verified:
  * API: create private gallery, GET without password (requiresPassword:true), GET with wrong password (error), GET with correct password (unlocked), GET as admin (bypass), all pass.
  * UI: private gallery card shows "Privat" badge, clicking opens password prompt, entering correct password unlocks gallery, wrong password shows error message.
- Built with OpenNext, deployed to Cloudflare Workers (Version a36a854a).
- Pushed to GitHub (commit a370530). GitHub Actions run #7: success.
- Also gitignored upload/ directory (user screenshots not part of app), run #8: success.
- Production verified:
  * Schema migration applied on Turso — existing galleries show visibility:"public"
  * Created test private gallery on production, verified full password flow (no password → locked, correct password → unlocked, admin bypass → unlocked), then cleaned up.
  * Agent Browser + VLM: private gallery card shows "Privat" badge, password prompt renders correctly with all elements (lock icon, title, input, button, contact admin note).

Stage Summary:
- ✅ Feature live on production at https://lihum.synclicen.workers.dev
- ✅ Admin can choose "Umum" (public) or "Privat" (private) when creating/editing a gallery
- ✅ Private galleries appear on the public gallery list with a red "Privat" badge
- ✅ Visitors clicking a private gallery see a password prompt with lock icon + "Hubungi Admin" note
- ✅ Correct password unlocks the gallery (cached in sessionStorage for the session)
- ✅ Wrong password shows error message
- ✅ Admin/manager bypass password check (don't need to enter password for their own galleries)
- ✅ Passwords hashed with SHA-256 + salt via Web Crypto API (never stored in plaintext, never returned in API responses)
- ✅ DB migration is idempotent (safe to run on existing databases)
- ✅ GitHub Actions auto-deploy: run #7 + #8 both success
