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
