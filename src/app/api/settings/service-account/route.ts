import { NextRequest, NextResponse } from "next/server";
import { ensureSeed, getAccountRole } from "@/lib/lihum";
import { setSetting, deleteSetting, getSetting } from "@/lib/queries";
import {
  getServiceAccount,
  invalidateServiceAccountCache,
} from "@/lib/google-service-account";

// GET /api/settings/service-account
// Returns the SA status + client_email (non-sensitive). Admin only.
// NEVER returns the private key or full JSON.
export async function GET(req: NextRequest) {
  await ensureSeed();
  const userEmail = req.headers.get("x-user-email") || undefined;
  const role = await getAccountRole(userEmail);
  if (!role) {
    return NextResponse.json(
      { error: "Akses ditolak. Fitur admin only." },
      { status: 403 }
    );
  }

  const sa = await getServiceAccount();

  // Also report whether the SA is stored in the DB (so the UI can show a
  // "Delete from DB" button only when there's a DB-stored one).
  const dbStored = !!(await getSetting("google_service_account"));

  return NextResponse.json({
    configured: !!sa,
    clientEmail: sa?.clientEmail || null,
    source: sa?.source || null,
    storedInDatabase: dbStored,
    storedInEnv: !!process.env.GOOGLE_SERVICE_ACCOUNT,
  });
}

// PUT /api/settings/service-account
// Saves the service account JSON key to the DB. Admin only.
// Body: { "serviceAccount": "<full JSON key string>" }
export async function PUT(req: NextRequest) {
  await ensureSeed();
  const userEmail = req.headers.get("x-user-email") || undefined;
  const role = await getAccountRole(userEmail);
  if (!role) {
    return NextResponse.json(
      { error: "Akses ditolak. Fitur admin only." },
      { status: 403 }
    );
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body.serviceAccount !== "string") {
    return NextResponse.json(
      { error: "Field 'serviceAccount' (JSON string) wajib diisi." },
      { status: 400 }
    );
  }

  const jsonStr = body.serviceAccount.trim();

  // Validate it's parseable JSON with the required fields.
  let parsed: any;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    return NextResponse.json(
      { error: "JSON tidak valid. Pastikan Anda menyalin seluruh isi file key JSON." },
      { status: 400 }
    );
  }

  if (!parsed.client_email || !parsed.private_key) {
    return NextResponse.json(
      {
        error:
          "JSON key tidak lengkap. Pastikan mengandung 'client_email' dan 'private_key'. File yang benar diunduh dari Google Cloud Console → IAM & Admin → Service Accounts → Keys → Add Key → JSON.",
      },
      { status: 400 }
    );
  }

  // Basic sanity check on the private key format.
  if (!parsed.private_key.includes("PRIVATE KEY")) {
    return NextResponse.json(
      { error: "Private key tidak terlihat valid (tidak ada marker PEM)." },
      { status: 400 }
    );
  }

  // Store in the DB. The value is the raw JSON string (which includes the
  // private key). The DB is access-controlled via the Turso auth token
  // (Worker secret), so this is no more exposed than any other app data.
  await setSetting("google_service_account", jsonStr);

  // Invalidate the in-memory cache so the next call re-reads from the DB.
  invalidateServiceAccountCache();

  // Re-load to confirm.
  const sa = await getServiceAccount();

  return NextResponse.json({
    success: true,
    configured: !!sa,
    clientEmail: sa?.clientEmail || null,
    source: sa?.source || null,
    message: `Service Account berhasil disimpan. Email: ${sa?.clientEmail}`,
  });
}

// DELETE /api/settings/service-account
// Removes the DB-stored service account. Admin only.
// Note: this only clears the DB setting — if the SA is set via the
// GOOGLE_SERVICE_ACCOUNT env var (Worker secret), that remains active and
// cannot be cleared from the UI (use `wrangler secret delete` instead).
export async function DELETE(req: NextRequest) {
  await ensureSeed();
  const userEmail = req.headers.get("x-user-email") || undefined;
  const role = await getAccountRole(userEmail);
  if (!role) {
    return NextResponse.json(
      { error: "Akses ditolak. Fitur admin only." },
      { status: 403 }
    );
  }

  const dbStored = !!(await getSetting("google_service_account"));
  const envConfigured = !!process.env.GOOGLE_SERVICE_ACCOUNT;

  if (dbStored) {
    await deleteSetting("google_service_account");
    invalidateServiceAccountCache();
  }

  // After deleting the DB copy, is the SA still active via env?
  const sa = await getServiceAccount();

  return NextResponse.json({
    success: true,
    dbCleared: dbStored,
    stillActiveViaEnv: !!sa,
    clientEmail: sa?.clientEmail || null,
    source: sa?.source || null,
    message: dbStored
      ? envConfigured
        ? "SA dihapus dari database, tapi SA dari env var masih aktif."
        : "Service Account berhasil dihapus dari database."
      : "Tidak ada SA di database untuk dihapus.",
  });
}
