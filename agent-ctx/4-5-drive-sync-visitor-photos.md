# Tasks 4 + 5 — Visitor Photo → Google Drive Sync

## Agent
Z.ai Code (Code mode)

## Deliverables
- **Extended** `src/lib/drive-sync.ts` with three new helpers + a status helper (file already existed with Drive→DB scan sync logic; the new visitor-photo→Drive upload helpers were appended below it so all Drive-sync code lives together).
- **Created** `src/app/api/settings/drive-sync/route.ts` — admin-only manual sync trigger + status endpoint.

## Important engineering decision
`src/lib/drive-sync.ts` already existed (Tasks 1–3 era) with `syncProjectWithToken` and `SyncResult` — the Drive→DB pull direction, used by `/api/projects/[id]/sync/route.ts`. The task asked to "create" `src/lib/drive-sync.ts` with three new visitor-photo→Drive upload helpers. Overwriting the file would have broken the existing project sync route (compile-time missing `syncProjectWithToken`). I therefore **extended** the file: kept all existing code untouched, added the new helpers in a clearly-sectioned block at the bottom, and added the new query-helper imports (`getDriveSyncRefreshToken`, `getSetting`, `setSetting`) plus `db` from `@/lib/db` to the existing import statement.

## What was built — `src/lib/drive-sync.ts` (new exports)

### `exchangeRefreshTokenForAccessToken(refreshToken): Promise<string>`
- POSTs `grant_type=refresh_token&refresh_token=<token>` to
  `https://securetoken.googleapis.com/v1/token?key=AIzaSyAC_DfA1kfZhDn8DcHcJdl4edM3J52Gt-I`
  (Firebase API key, hardcoded from `src/lib/firebase.ts`).
- Returns the `access_token` (short-lived, ~1h).
- Throws a descriptive `Error` on non-2xx or missing `access_token`.
- This is the correct approach for token exchange without a Google OAuth
  client_id: Firebase Auth tokens ARE Google OAuth tokens, so they work
  with the Drive API directly.

### `uploadPhotoToDrive(accessToken, folderId, fileName, base64Data, mimeType): Promise<DriveUploadResult | null>`
- Multipart/related upload to
  `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,thumbnailLink,webContentLink`.
- Decodes base64 with `atob` (Web Standard, available on Workers) → Uint8Array.
- Builds the multipart body as concatenated `Uint8Array` parts via
  `TextEncoder` for the textual frame + raw bytes for the image payload.
- Boundary: `lihum-<random>-<timestamp>` (unique per request).
- Returns `{ fileId, thumbnailLink, webContentLink }` on success; `null` on
  failure (logged to console with HTTP status + first 200 chars of error).

### `syncVisitorPhotosToDrive(limit = 5): Promise<{ synced, failed, remaining }>`
Pipeline:
1. Load refresh token via `getDriveSyncRefreshToken()`. If missing → return `{0,0,0}` (admin hasn't connected Google account).
2. SELECT pending visitor photos JOIN Project on driveFolderId != '' (we can't upload to a project with no Drive folder). ORDER BY createdTime ASC, LIMIT `limit`. After sync, `visitorData` is cleared so the row no longer matches.
3. Exchange refresh token for access token. If exchange fails, log + return `{synced:0, failed:0, remaining: pending.length}` without touching `last_drive_sync` (so the admin can tell the sync didn't actually run).
4. For each photo:
   - Parse `data:<mime>;base64,<data>` via regex. Invalid → `failed++`, continue.
   - Call `uploadPhotoToDrive(...)`.
   - On success, UPDATE Photo SET thumbnailLink=?, webContentLink=?, visitorData='' WHERE id=? AND projectId=?.
   - On Drive-upload-but-DB-update-failed, log loudly (would cause Drive duplicates on re-run since visitorData is still set).
5. Count remaining pending photos (whole table, not just this batch) for the response.
6. Update Setting `last_drive_sync` with current ISO timestamp.

Important: the photo's `id` (local `visitor_<ts>_<i>_<rand>` UUID) is intentionally NOT changed. Gallery view, `/api/visitor-photo` endpoint, and share links continue to reference the same row. After sync, the gallery shows the Drive-hosted `thumbnailLink` directly (no DB hit), and `/api/visitor-photo` returns 404 for synced photos (correct behavior — they're now served from Drive via the existing photo-proxy).

### `getDriveSyncStatus()` — bonus helper used by the route's GET handler
Returns `{ pending, refreshConnected, lastSyncAt }` via three parallel `Promise.all` queries (one COUNT, one Setting lookup for the token, one for `last_drive_sync`). Added because the GET route needs the same data and a single helper avoids duplicating the query logic.

## What was built — `src/app/api/settings/drive-sync/route.ts`

### GET `/api/settings/drive-sync` (admin OR manager)
Calls `getDriveSyncStatus()` and returns `{ pending, refreshConnected, lastSyncAt }`. Auth via `x-user-email` header + `getAccountRole`. Returns 403 if not admin/manager. Wrapped in try/catch with 500 fallback.

### POST `/api/settings/drive-sync` (admin ONLY)
- Auth: `role !== "admin"` → 403 with message "Hanya admin yang dapat memicu sync."
- Optional JSON body `{ limit?: number }` — clamped to `[1, 10]`. Empty/non-JSON body falls back to default `5`.
- Calls `syncVisitorPhotosToDrive(limit)` and returns `{ synced, failed, remaining }`.
- Console-logs the result for Cloudflare dashboard inspection.
- Wrapped in try/catch with 500 fallback (returns `{error, synced:0, failed:0, remaining:0}`).

## Auth pattern (consistent with existing LIHUM routes)
- `x-user-email` header → `getAccountRole` (from `@/lib/lihum`).
- `ensureSeed()` first to ensure the Account table exists.
- POST is stricter (admin only) since it has side effects (writes Drive files, mutates DB rows).

## Files referenced (read for context, not modified)
- `src/lib/queries.ts` — `findPhotoById`, `getDriveSyncRefreshToken`, `getSetting`, `setSetting`, `PhotoRow` interface (columns: id, name, mimeType, thumbnailLink, webContentLink, size, createdTime, modifiedTime, aiHidden, visitorData, projectId).
- `src/lib/db.ts` — `db` export (Proxy to D1/libSQL adapter).
- `src/lib/lihum.ts` — `getAccountRole`, `ensureSeed`.
- `src/lib/firebase.ts` — confirmed Firebase API key `AIzaSyAC_DfA1kfZhDn8DcHcJdl4edM3J52Gt-I`.
- `src/app/api/settings/drive-sync-token/route.ts` — auth/role-check pattern + how the refresh token is stored.
- `src/app/api/settings/route.ts` — direct `db.execute` usage pattern.
- `src/app/api/visitor-photo/route.ts` — confirmed `visitorData` format `data:image/jpeg;base64,...`.
- `src/app/api/projects/[id]/visitor-upload/route.ts` — confirmed visitor photo id format `visitor_<ts>_<i>_<rand>` and the full insert shape.
- `src/app/api/projects/[id]/sync/route.ts` — confirmed existing `drive-sync.ts` consumer (must not break).

## Worker compatibility notes
- `atob`, `fetch`, `URLSearchParams`, `TextEncoder`, `Uint8Array` are all Web Standards available on Cloudflare Workers.
- Limit defaults to 5 per call → stays well within Worker 10s CPU budget even with multi-MB photos + Drive upload latency.
- The admin UI can call POST repeatedly to drain a backlog (e.g., 50 photos = 10 calls × 5 photos each).

## Verification
- `bun run lint` → **0 errors, 0 warnings** (exit code 0).
- `bunx eslint src/lib/drive-sync.ts src/app/api/settings/drive-sync/route.ts` → 0 errors.
- `bunx tsc --noEmit` → 0 errors in either of my files (other pre-existing errors in the repo are unchanged and out of scope).
- Did NOT run `bun run build` or deploy — per task instructions.
