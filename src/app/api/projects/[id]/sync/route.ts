import { NextRequest, NextResponse } from "next/server";
import { ensureSeed, getAccountRole } from "@/lib/lihum";
import { findProjectById } from "@/lib/queries";
import { syncProjectWithToken } from "@/lib/drive-sync";
import {
  getServiceAccount,
  getServiceAccountAccessToken,
  DRIVE_SCOPE,
} from "@/lib/google-service-account";

// POST /api/projects/:id/sync
//
// Scans the project's Google Drive folder and refreshes the Photo table.
//
// Token resolution (in priority order):
//  1. Admin/manager's personal OAuth token (Authorization: Bearer …)
//     — used when admin clicks "Sinkron" in the panel after logging in.
//  2. Google Service Account token — used when GOOGLE_SERVICE_ACCOUNT is
//     configured AND no admin token is provided (e.g. auto-sync triggered
//     after a visitor upload). Requires the SA email to be an Editor on
//     the folder.
//
// Authorization:
//  - Admin OAuth token path: caller must be a registered admin/manager.
//  - Service Account path: caller must pass `x-internal-sync: 1` header
//    (set by the upload route's internal fetch) OR be a registered admin.
//    This prevents anonymous users from forcing expensive Drive scans.

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await ensureSeed();
  const userEmail = req.headers.get("x-user-email") || undefined;
  const role = await getAccountRole(userEmail);
  const internalHeader = req.headers.get("x-internal-sync");
  const isInternal = internalHeader === "1";

  if (!role && !isInternal) {
    return NextResponse.json(
      { error: "Akses ditolak. Hubungi Admin Utama untuk didaftarkan." },
      { status: 403 }
    );
  }

  const { id } = await params;
  const authHeader = req.headers.get("authorization");
  const hasBearer = !!authHeader && authHeader.startsWith("Bearer ");
  const sa = await getServiceAccount();

  let token: string;
  let tokenSource: string;

  if (hasBearer) {
    token = authHeader!.split(" ")[1];
    tokenSource = "admin-oauth";
  } else if (sa) {
    try {
      token = await getServiceAccountAccessToken(DRIVE_SCOPE);
      tokenSource = "service-account";
    } catch (err: any) {
      return NextResponse.json(
        { error: err?.message || "Gagal mendapatkan token service account." },
        { status: 500 }
      );
    }
  } else {
    return NextResponse.json(
      {
        error:
          "Token otorisasi Google tidak ditemukan. Silakan login Admin, atau konfigurasikan Service Account.",
      },
      { status: 401 }
    );
  }

  const project = await findProjectById(id);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  try {
    const result = await syncProjectWithToken(id, token);
    console.log(
      `[Sync] Project ${id}: source=${tokenSource}, user=${userEmail || "internal"}, ${result.photoCount} photos, strategy="${result.rootStrategy}"`
    );
    return NextResponse.json(result);
  } catch (err: any) {
    console.error("Drive Sync Error:", err);
    return NextResponse.json(
      { error: err.message || "Gagal sinkronisasi Google Drive." },
      { status: 500 }
    );
  }
}
