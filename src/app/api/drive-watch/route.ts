import { NextRequest, NextResponse } from "next/server";
import { ensureSeed, getAccountRole } from "@/lib/lihum";
import {
  getWatchChannel,
  upsertWatchChannel,
  deleteWatchChannel,
} from "@/lib/queries";

// ── Drive Push Notification constants ──
// Google allows a maximum channel expiration of 24h (86400000 ms).
// We use 23h to leave a safety margin for renewal before expiry.
const CHANNEL_TTL_MS = 23 * 60 * 60 * 1000; // 23 hours
const RENEW_WINDOW_MS = 2 * 60 * 60 * 1000; // renew if < 2h remaining

// Webhook URL — Google calls this when Drive changes.
// Uses the APP_URL env var (set in wrangler.jsonc) so it works in production.
function getWebhookUrl(): string {
  const appUrl =
    process.env.APP_URL || "https://lihum.synclicen.workers.dev";
  return `${appUrl}/api/drive-webhook`;
}

// Generates a random 32-char hex token for webhook verification.
// Google sends this back as the X-Goog-Channel-Token header on every
// webhook call, so we can verify the request is genuinely from Google.
function generateToken(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function generateChannelId(): string {
  return crypto.randomUUID();
}

/**
 * GET /api/drive-watch — Check if the current admin has an active Drive
 * push notification channel. Returns the channel status + expiration.
 */
export async function GET(req: NextRequest) {
  await ensureSeed();
  const userEmail = req.headers.get("x-user-email") || undefined;
  const role = await getAccountRole(userEmail);
  if (!role) {
    return NextResponse.json(
      { error: "Akses ditolak." },
      { status: 403 }
    );
  }

  const channel = userEmail ? await getWatchChannel(userEmail) : null;
  if (!channel) {
    return NextResponse.json({ active: false });
  }

  const expirationMs = new Date(channel.expiration).getTime();
  const nowMs = Date.now();
  const msRemaining = expirationMs - nowMs;
  const needsRenewal = msRemaining < RENEW_WINDOW_MS;

  return NextResponse.json({
    active: true,
    channelId: channel.id,
    expiration: channel.expiration,
    msRemaining,
    needsRenewal,
    webhookUrl: getWebhookUrl(),
  });
}

/**
 * POST /api/drive-watch — Register (or renew) a Drive push notification
 * channel for the current admin.
 *
 * Flow:
 *   1. Get the admin's OAuth token from the Authorization header.
 *   2. Call Google's changes/startPageToken to get a starting point.
 *   3. Call Google's changes/watch to register our webhook URL.
 *   4. Store the channel info in D1 for webhook verification + renewal.
 *
 * Google sends a "sync" confirmation immediately, then fires the webhook
 * whenever any file in the admin's Drive changes.
 */
export async function POST(req: NextRequest) {
  await ensureSeed();
  const userEmail = req.headers.get("x-user-email") || undefined;
  const role = await getAccountRole(userEmail);
  if (!role) {
    return NextResponse.json(
      { error: "Akses ditolak. Hubungi Admin Utama untuk didaftarkan." },
      { status: 403 }
    );
  }

  const authHeader = req.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return NextResponse.json(
      {
        error:
          "Token otorisasi Google tidak ditemukan. Silakan login Admin terlebih dahulu.",
      },
      { status: 401 }
    );
  }
  const token = authHeader.split(" ")[1];
  const webhookUrl = getWebhookUrl();

  try {
    // Step 1: Get the start page token for changes/watch.
    // This tells Google "notify me about changes from this point forward".
    const startRes = await fetch(
      "https://www.googleapis.com/drive/v3/changes/startPageToken",
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!startRes.ok) {
      const errText = await startRes.text();
      return NextResponse.json(
        {
          error: `Gagal mendapatkan startPageToken dari Google (HTTP ${startRes.status}). Pastikan domain sudah diverifikasi di Google Search Console dan terdaftar di OAuth consent screen. Detail: ${errText.slice(0, 200)}`,
        },
        { status: 502 }
      );
    }
    const startData: any = await startRes.json();
    const startPageToken = startData.startPageToken;

    // Step 2: Create the watch channel via changes/watch.
    const channelId = generateChannelId();
    const channelToken = generateToken();
    const expiration = Date.now() + CHANNEL_TTL_MS;

    const watchBody = {
      id: channelId,
      type: "web_hook",
      address: webhookUrl,
      token: channelToken,
      expiration: expiration.toString(),
    };

    const watchRes = await fetch(
      `https://www.googleapis.com/drive/v3/changes/watch?pageToken=${startPageToken}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(watchBody),
      }
    );

    if (!watchRes.ok) {
      const errText = await watchRes.text();
      let hint = "";
      if (watchRes.status === 400 && errText.includes("web_hook")) {
        hint =
          " Domain ini mungkin belum diverifikasi di Google Search Console atau belum ditambahkan ke authorized domains di OAuth consent screen.";
      } else if (watchRes.status === 403) {
        hint =
          " Cek scope OAuth — butuh https://www.googleapis.com/auth/drive.metadata.readonly atau drive.readonly.";
      }
      return NextResponse.json(
        {
          error: `Google Drive menolak permintaan watch (HTTP ${watchRes.status}).${hint} Detail: ${errText.slice(0, 300)}`,
        },
        { status: 502 }
      );
    }

    const watchData: any = await watchRes.json();
    const resourceId = watchData.resourceId || "";
    const actualExpiration = watchData.expiration
      ? new Date(parseInt(watchData.expiration)).toISOString()
      : new Date(expiration).toISOString();

    // Step 3: Store the channel in D1 for webhook verification + renewal.
    await upsertWatchChannel({
      id: channelId,
      userEmail: userEmail!,
      resourceId,
      startPageToken,
      token: channelToken,
      expiration: actualExpiration,
    });

    console.log(
      `[DriveWatch] Channel registered for ${userEmail}: expires ${actualExpiration}`
    );

    return NextResponse.json({
      success: true,
      active: true,
      channelId,
      resourceId,
      startPageToken,
      expiration: actualExpiration,
      webhookUrl,
    });
  } catch (err: any) {
    console.error("[DriveWatch] Registration failed:", err);
    return NextResponse.json(
      { error: err.message || "Gagal mendaftarkan push notification." },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/drive-watch — Stop the current admin's push notification channel.
 *
 * Calls Google's channels/stop endpoint to unsubscribe, then removes the
 * channel from D1.
 */
export async function DELETE(req: NextRequest) {
  await ensureSeed();
  const userEmail = req.headers.get("x-user-email") || undefined;
  const role = await getAccountRole(userEmail);
  if (!role) {
    return NextResponse.json(
      { error: "Akses ditolak." },
      { status: 403 }
    );
  }

  const authHeader = req.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.split(" ")[1]
    : null;

  const channel = userEmail ? await getWatchChannel(userEmail) : null;
  if (!channel) {
    return NextResponse.json({ success: true, message: "No active channel." });
  }

  // Best-effort: tell Google to stop sending notifications.
  // If this fails (token expired, etc.), we still delete from D1.
  if (token) {
    try {
      await fetch("https://www.googleapis.com/drive/v3/channels/stop", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: channel.id,
          resourceId: channel.resourceId,
        }),
      });
    } catch (err) {
      console.warn("[DriveWatch] channels/stop failed (non-fatal):", err);
    }
  }

  await deleteWatchChannel(userEmail!);
  console.log(`[DriveWatch] Channel stopped for ${userEmail}`);

  return NextResponse.json({ success: true });
}
