# LIHUM: Lihat dan Unduh Mandiri

Galeri foto publik dengan integrasi Google Drive, pencarian nama foto, dan
fitur unduhan mandiri bagi pengunjung. Admin/Manajer membuat galeri dari folder
Google Drive, lalu membagikan tautan/QR kepada publik untuk melihat & mengunduh.

Dibangun dengan **Next.js 16** + **Turso (libSQL)** + **Cloudflare Workers**.

---

## Tech stack

| Layer        | Technology                                                        |
| ------------ | ----------------------------------------------------------------- |
| Framework    | Next.js 16 (App Router, TypeScript)                               |
| Database     | Turso (libSQL) — `@libsql/client` (Workers-native, no Prisma)     |
| Hosting      | Cloudflare Workers via `@opennextjs/cloudflare`                   |
| Auth         | Firebase Google OAuth (scope `drive.readonly`)                    |
| Source       | GitHub (Cloudflare auto-deploys on push)                          |
| Styling      | Tailwind CSS 4 + shadcn/ui (Purple Haze / Gold / White Asgard)    |

---

## Local development

```bash
bun install
cp .env.example .env          # then edit DATABASE_URL if needed
bun run dev                   # http://localhost:3000
```

The schema auto-creates on the first API request (`ensureSchema()`), and the
two demo galleries + admin account auto-seed when the DB is empty. No migration
CLI is needed.

Local DB default: `file:/home/z/my-project/db/custom.db` (libSQL local file).

---

## Production deployment: GitHub → Cloudflare → Turso

### 1. Create a Turso database

```bash
# Install the Turso CLI: https://docs.turso.tech/cli/installation
turso auth login
turso db create lihum --location sin1   # pick the region closest to your users

# Grab the connection string + auth token:
turso db show lihum --url         # -> libsql://lihum-<org>.turso.io
turso db tokens create lihum      # -> eyJhbGciOi...
```

The schema will auto-create on the first request after deploy — no manual
migration step required.

### 2. Push the code to GitHub

```bash
git init && git add . && git commit -m "LIHUM: Cloudflare + Turso"
git remote add origin https://github.com/<you>/LIHUM.git
git push -u origin main
```

### 3. Connect Cloudflare to GitHub

1. Open the **Cloudflare dashboard → Workers & Pages → Create → Pages → Connect to Git**.
2. Select the `LIHUM` repository.
3. Build settings:
   - **Framework preset:** Next.js
   - **Build command:** `bun run build:cloudflare`
     (or `npm run build:cloudflare` / `npx opennextjs-cloudflare build`)
   - **Build output directory:** `.open-next`
4. **Environment variables** (Settings → Variables):
   | Variable           | Value                                        |
   | ------------------ | -------------------------------------------- |
   | `DATABASE_URL`     | `libsql://lihum-<org>.turso.io`              |
   | `TURSO_AUTH_TOKEN` | `eyJhbGciOi...`                              |
   | `APP_URL`          | `https://lihum.<your-subdomain>.workers.dev` |
   | `NODE_VERSION`     | `20`                                         |
5. **Save and Deploy.** Cloudflare rebuilds on every `git push`.

### 4. (Alternative) Deploy from CLI

```bash
bun run deploy
# == opennextjs-cloudflare build && opennextjs-cloudflare deploy
```

`wrangler login` once first. Set the same environment variables with:
```bash
wrangler secret put DATABASE_URL
wrangler secret put TURSO_AUTH_TOKEN
wrangler secret put APP_URL
```

### 5. Firebase OAuth — authorize the production domain

In the [Firebase console](https://console.firebase.google.com) → your project →
**Authentication → Settings → Authorized domains**, add your Cloudflare domain
(e.g. `lihum.<your-subdomain>.workers.dev`) so Google sign-in works in
production.

---

## Project structure

```
src/
├─ app/
│  ├─ api/                    # 9 route handlers (all Turso-backed)
│  │  ├─ config/              # APP_URL for share links
│  │  ├─ accounts/            # CRUD + /me role lookup (admin-only)
│  │  ├─ accounts/[id]/       # DELETE (admin-only)
│  │  ├─ projects/            # GET summaries, POST create
│  │  ├─ projects/[id]/       # GET (search-aware), PUT, DELETE
│  │  ├─ projects/[id]/sync/  # POST: pull photos from Drive folder
│  │  └─ photo-proxy/         # image proxy + download proxy
│  ├─ layout.tsx              # LIHUM metadata + theme
│  ├─ page.tsx                # App: hero, admin panel, gallery grid
│  └─ globals.css             # Purple Haze / Gold / White Asgard theme
├─ components/lihum/          # Header, AdminPanel, GalleryView, ShareModal
└─ lib/
   ├─ db.ts                   # Turso/libSQL client + ensureSchema()
   ├─ queries.ts              # typed CRUD (raw SQL, no ORM)
   ├─ seed.ts                 # default galleries + admin account
   ├─ lihum.ts                # helpers: getAccountRole, parseDriveFolderId, ...
   └─ firebase.ts             # Google OAuth client (drive.readonly scope)

wrangler.jsonc                # Cloudflare Workers config (OpenNext)
open-next.config.ts           # OpenNext build config
.env.example                  # all required vars documented
```

---

## Notes

- **No Prisma, no migration CLI.** All DB access is raw SQL via `@libsql/client`,
  which runs identically on Node.js (local file) and Cloudflare Workers (HTTP to
  Turso). The schema is created with `CREATE TABLE IF NOT EXISTS` on first
  request, so a fresh Turso DB is ready to use immediately after deploy.
- **Admin access.** `synclicen@gmail.com` is auto-seeded as the primary admin
  and auto-registered on first login. Other emails must be added via the
  Accounts tab (admin-only).
- **Drive sync.** Clicking "Sinkron Drive" calls the Google Drive API with the
  signed-in admin's Bearer token and stores photo metadata in Turso. Public
  visitors see photos through the `/api/photo-proxy` route, which fetches
  thumbnails directly from Google Drive.

---

&copy; 2026 LIHUM: Lihat, Unduh Mandiri! — Made by Fajrianor.
