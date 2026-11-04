import { NextRequest, NextResponse } from "next/server";
import { ensureSeed, getAccountRole } from "@/lib/lihum";
import {
  getDriveSyncTokenConfig,
  setDriveSyncToken,
  clearDriveSyncToken,
} from "@/lib/queries";

/**
 * GET /api/settings/drive-sync-token — Admin only.
 *
 * Returns whether a Google Drive sync token is connected (refresh token saved).
 * Does NOT return the token itself (sensitive — only the admin's email + timestamp).
 *
 * Response: { connected: boolean, userEmail: string, connectedAt: string }
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
  const config = await getDriveSyncTokenConfig();
  return NextResponse.json(config);
}

/**
 * PUT /api/settings/drive-sync-token — Admin only.
 *
 * Saves the Google OAuth refresh token so the Worker can run background sync
 * (upload visitor photos to Drive) 24/7 without requiring the admin to keep
 * a browser tab open.
 *
 * Body: { refreshToken: string, userEmail: string }
 * The refreshToken is obtained from Firebase Auth after admin login.
 */
export async function PUT(req: NextRequest) {
  await ensureSeed();
  const userEmail = req.headers.get("x-user-email") || undefined;
  const role = await getAccountRole(userEmail);
  if (!role) {
    return NextResponse.json(
      { error: "Akses ditolak. Hanya admin/manager." },
      { status: 403 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const { refreshToken, userEmail: tokenUserEmail } = body;

  if (typeof refreshToken !== "string" || refreshToken.length < 10) {
    return NextResponse.json(
      { error: "Field 'refreshToken' tidak valid." },
      { status: 400 }
    );
  }

  await setDriveSyncToken(refreshToken, tokenUserEmail || userEmail || "");
  console.log(`[DriveSync] Refresh token saved by ${userEmail}`);

  return NextResponse.json({
    success: true,
    connected: true,
    userEmail: tokenUserEmail || userEmail,
  });
}

/**
 * DELETE /api/settings/drive-sync-token — Admin only.
 *
 * Clears the saved refresh token (disconnect Google Drive sync).
 */
export async function DELETE(req: NextRequest) {
  await ensureSeed();
  const userEmail = req.headers.get("x-user-email") || undefined;
  const role = await getAccountRole(userEmail);
  if (!role) {
    return NextResponse.json(
      { error: "Akses ditolak. Hanya admin/manager." },
      { status: 403 }
    );
  }

  await clearDriveSyncToken();
  console.log(`[DriveSync] Refresh token cleared by ${userEmail}`);

  return NextResponse.json({ success: true, connected: false });
}
