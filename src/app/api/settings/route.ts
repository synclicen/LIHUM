import { NextRequest, NextResponse } from "next/server";
import { ensureSeed, getAccountRole } from "@/lib/lihum";
import {
  countProjects,
  countAccounts,
  countAllPendingUploads,
} from "@/lib/queries";
import { db } from "@/lib/db";
import {
  getServiceAccount,
  isServiceAccountConfigured,
} from "@/lib/google-service-account";

// GET /api/settings
// Returns aggregated app config + SA status + DB stats. Admin only.
// NEVER includes the SA private key — only non-sensitive metadata.
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

  // ── Service Account status (non-sensitive fields only) ──
  const sa = await getServiceAccount();
  const saInfo = sa
    ? {
        configured: true,
        clientEmail: sa.clientEmail,
        source: sa.source || "unknown",
        // Never expose the private key or full JSON.
      }
    : {
        configured: false,
        clientEmail: null,
        source: null,
      };

  // ── DB stats ──
  const [projectCount, accountCount, pendingMap] = await Promise.all([
    countProjects(),
    countAccounts(),
    countAllPendingUploads(),
  ]);
  const pendingTotal = Array.from(pendingMap.values()).reduce(
    (a, b) => a + b,
    0
  );

  // Total photo count (sum across all projects)
  let photoCount = 0;
  try {
    const r = await db.execute("SELECT COUNT(*) AS c FROM Photo");
    photoCount = Number((r.rows[0] as Record<string, unknown>)?.c ?? 0);
  } catch {
    /* non-critical */
  }

  // Total pending upload storage (sum of size)
  let pendingStorageBytes = 0;
  try {
    const r = await db.execute(
      "SELECT COALESCE(SUM(size), 0) AS s FROM PendingUpload"
    );
    pendingStorageBytes = Number(
      (r.rows[0] as Record<string, unknown>)?.s ?? 0
    );
  } catch {
    /* non-critical */
  }

  // ── App config (read-only display) ──
  const appConfig = {
    appUrl: process.env.APP_URL || "",
    databaseUrl: process.env.DATABASE_URL || "",
    nodeEnv: process.env.NODE_ENV || "production",
  };

  return NextResponse.json({
    serviceAccount: saInfo,
    stats: {
      projects: projectCount,
      photos: photoCount,
      accounts: accountCount,
      pendingUploads: pendingTotal,
      pendingStorageBytes,
    },
    app: appConfig,
  });
}
