import { NextRequest, NextResponse } from "next/server";
import { ensureSeed, getAccountRole } from "@/lib/lihum";
import {
  getDriveSyncStatus,
  syncVisitorPhotosToDrive,
} from "@/lib/drive-sync";

/**
 * Visitor photo → Google Drive sync.
 *
 * Visitors upload photos via `/upload`; the photos land in D1 as base64 data
 * URLs in the `Photo.visitorData` column. Left unattended, those rows fill up
 * the 5 GB D1 quota fast. This endpoint lets an admin trigger a manual sync
 * that uploads each pending photo to its parent gallery's Drive folder and
 * clears `visitorData` afterwards — moving the bytes off D1 onto Drive,
 * which has effectively unlimited storage.
 *
 * The admin's Firebase refresh token (stored in D1 by
 * `/api/settings/drive-sync-token`) is exchanged for a short-lived Google
 * OAuth access token inside `syncVisitorPhotosToDrive`. No client_id /
 * client_secret is required — Firebase Auth tokens ARE Google OAuth tokens.
 *
 * Auth: `x-user-email` header, role must be admin (POST) or admin/manager
 * (GET). Set by the LIHUM auth proxy in front of the Worker.
 */

/**
 * GET /api/settings/drive-sync — admin/manager.
 *
 * Returns sync status without triggering a sync:
 *   - pending: count of visitor photos still holding base64 in D1
 *   - refreshConnected: whether the admin refresh token is stored
 *   - lastSyncAt: ISO timestamp of the last sync attempt (or '')
 */
export async function GET(req: NextRequest) {
  await ensureSeed();
  const userEmail = req.headers.get("x-user-email") || undefined;
  const role = await getAccountRole(userEmail);
  if (!role) {
    return NextResponse.json(
      { error: "Akses ditolak. Hanya admin/manager." },
      { status: 403 }
    );
  }

  try {
    const status = await getDriveSyncStatus();
    return NextResponse.json(status);
  } catch (err: any) {
    console.error(
      `[DriveSync] GET status failed: ${err?.message || err}`
    );
    return NextResponse.json(
      { error: "Gagal mengambil status sync Drive." },
      { status: 500 }
    );
  }
}

/**
 * POST /api/settings/drive-sync — admin only.
 *
 * Triggers a single sync pass: up to 5 visitor photos are uploaded to Drive
 * (per Worker CPU limit). Call repeatedly to drain a larger backlog.
 *
 * Optional body: { limit?: number } — clamped to [1, 10].
 *
 * Response: { synced, failed, remaining }
 *   - synced:     photos uploaded + DB updated this pass
 *   - failed:     photos that errored (upload OR DB update)
 *   - remaining:  photos still pending across the whole table
 */
export async function POST(req: NextRequest) {
  await ensureSeed();
  const userEmail = req.headers.get("x-user-email") || undefined;
  const role = await getAccountRole(userEmail);
  if (role !== "admin") {
    return NextResponse.json(
      { error: "Akses ditolak. Hanya admin yang dapat memicu sync." },
      { status: 403 }
    );
  }

  // Parse optional `limit` from the JSON body. Don't fail on empty body —
  // POSTing with no body is the common case (uses default limit of 5).
  let limit = 5;
  try {
    const body = await req.json();
    if (body && typeof body.limit === "number") {
      const requested = Math.floor(body.limit);
      if (requested > 0) limit = Math.min(requested, 10);
    }
  } catch {
    // Body wasn't JSON (or was empty) — fall back to default limit.
  }

  try {
    const result = await syncVisitorPhotosToDrive(limit);
    console.log(
      `[DriveSync] Sync triggered by ${userEmail}: synced=${result.synced} failed=${result.failed} remaining=${result.remaining}`
    );
    return NextResponse.json(result);
  } catch (err: any) {
    console.error(
      `[DriveSync] POST sync failed: ${err?.message || err}`
    );
    return NextResponse.json(
      {
        error:
          err?.message?.slice(0, 200) ||
          "Gagal menjalankan sync foto pengunjung ke Drive.",
        synced: 0,
        failed: 0,
        remaining: 0,
      },
      { status: 500 }
    );
  }
}
