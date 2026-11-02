import { NextRequest, NextResponse } from "next/server";
import {
  getWatchChannel,
  markAllAutoSyncProjectsNeedSync,
} from "@/lib/queries";

/**
 * POST /api/drive-webhook — Receiver for Google Drive Push Notifications.
 *
 * Google calls this endpoint whenever ANY file in a watched admin's Google
 * Drive changes (added, modified, renamed, trashed, deleted).
 *
 * The request has NO body — all info is in headers:
 *   X-Goog-Channel-ID          — the channel UUID we registered
 *   X-Goog-Resource-ID         — Drive resource being watched
 *   X-Goog-Resource-State      — "sync" | "update" | "delete" | "trash" | ...
 *   X-Goog-Channel-Token        — the secret token we set during registration
 *   X-Goog-Message-Number      — monotonically increasing message number
 *   X-Goog-Resource-Change     — (sometimes) the type of change
 *
 * Security:
 *   We verify X-Goog-Channel-Token against the stored token in D1. If it
 *   doesn't match (or no channel exists for the implied admin), we reject.
 *   Since the token is 32 random hex chars, guessing is infeasible.
 *
 * Response:
 *   Google requires a 2xx response within ~30 seconds, ideally faster.
 *   We respond 200 immediately and do the minimal work (mark needsSync=1)
 *   synchronously — it's a single D1 write, ~1ms.
 *
 * Flow after this endpoint:
 *   1. Google POSTs here → we mark needsSync=1 on all auto-sync galleries.
 *   2. Admin's browser scheduler checks needsSync every 60s.
 *   3. If needsSync=1, it triggers an immediate delta-sync (0 writes if the
 *      Drive change didn't actually affect watched gallery photos).
 *
 * Note on state "sync":
 *   Google sends an initial "sync" notification right after channel
 *   registration. This is just a confirmation that the channel is active —
 *   NOT a file change. We acknowledge but do NOT mark needsSync.
 */
export async function POST(req: NextRequest) {
  const channelId = req.headers.get("x-goog-channel-id") || "";
  const resourceId = req.headers.get("x-goog-resource-id") || "";
  const resourceState = req.headers.get("x-goog-resource-state") || "";
  const channelToken = req.headers.get("x-goog-channel-token") || "";
  const messageNumber = req.headers.get("x-goog-message-number") || "";

  // Basic validation — Google always sends these headers.
  if (!channelId || !resourceState) {
    return NextResponse.json(
      { error: "Missing required Google webhook headers." },
      { status: 400 }
    );
  }

  // Look up the channel by ID. We don't have the userEmail in the request,
  // so we search by channelId. Since channelId is a UUID and userEmail is
  // unique per channel, finding the channel tells us which admin's Drive
  // changed.
  // NOTE: getWatchChannel takes userEmail, but we have channelId. We need a
  // lookup by channelId instead. For simplicity, we store channelId → userEmail
  // mapping. Actually, let's just query by channelId directly.
  const channel = await findChannelById(channelId);
  if (!channel) {
    // Unknown channel — could be a stale notification from an old channel.
    // Acknowledge with 200 so Google doesn't retry, but do nothing.
    return NextResponse.json({ ok: true, ignored: "unknown channel" });
  }

  // SECURITY: Verify the token matches what we stored.
  // This confirms the request genuinely came from Google (or someone who
  // knows the 32-char random token we set during registration).
  if (channelToken !== channel.token) {
    console.warn(
      `[DriveWebhook] Token mismatch for channel ${channelId} — rejecting`
    );
    return NextResponse.json({ error: "Invalid token." }, { status: 403 });
  }

  console.log(
    `[DriveWebhook] Received: channel=${channelId.slice(0, 8)}... state=${resourceState} msg=#${messageNumber} user=${channel.userEmail}`
  );

  // Handle different resource states:
  //   "sync"    — channel confirmation (not a file change), don't mark dirty
  //   "update"  — a file/folder changed → mark galleries dirty
  //   "delete"  — a resource was deleted → mark galleries dirty
  //   "trash"   — a resource was trashed → mark galleries dirty
  //   "add"     — a new resource was added → mark galleries dirty
  if (resourceState === "sync") {
    // Initial channel confirmation — just log, no sync needed.
    return NextResponse.json({
      ok: true,
      confirmed: true,
      userEmail: channel.userEmail,
    });
  }

  // For all other states (update, delete, trash, add), mark all of this
  // admin's auto-sync-enabled galleries as needing sync. The true-delta
  // sync means galleries with no actual changes cost 0 writes.
  try {
    const affected = await markAllAutoSyncProjectsNeedSync();
    console.log(
      `[DriveWebhook] Marked ${affected} auto-sync galleries as needsSync (user=${channel.userEmail}, state=${resourceState})`
    );
    return NextResponse.json({
      ok: true,
      state: resourceState,
      markedNeedsSync: affected,
    });
  } catch (err: any) {
    console.error("[DriveWebhook] Failed to mark needsSync:", err);
    // Return 200 anyway so Google doesn't retry — the next 5m fallback
    // poll in the admin's browser will catch up.
    return NextResponse.json(
      { ok: true, warning: "markNeedsSync failed, will retry via fallback" },
      { status: 200 }
    );
  }
}

/**
 * GET /api/drive-webhook — Health check endpoint.
 * Google doesn't use this, but it's useful for debugging.
 */
export async function GET() {
  return NextResponse.json({
    ok: true,
    endpoint: "drive-webhook",
    description: "Google Drive Push Notification receiver",
  });
}

// Helper: find a channel by channelId (not userEmail).
// The webhook only sends channelId, not userEmail, so we need this lookup.
async function findChannelById(channelId: string): Promise<{
  userEmail: string;
  token: string;
} | null> {
  // We can't easily query by channelId using getWatchChannel (which takes
  // userEmail), so we do a direct query here.
  // Importing db directly would create a circular dependency, so we use
  // a lightweight approach via the existing query infrastructure.
  const { db } = await import("@/lib/db");
  const r = await db.execute({
    sql: "SELECT userEmail, token FROM DriveWatchChannel WHERE id = ? LIMIT 1",
    args: [channelId],
  });
  if (r.rows.length === 0) return null;
  const row = r.rows[0] as Record<string, unknown>;
  return {
    userEmail: String(row.userEmail),
    token: String(row.token ?? ""),
  };
}
