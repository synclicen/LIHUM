import { NextRequest, NextResponse } from "next/server";
import { ensureSeed, getAccountRole } from "@/lib/lihum";
import { countAllPendingUploads } from "@/lib/queries";
import { isServiceAccountConfigured } from "@/lib/google-service-account";

// GET /api/pending-uploads
// Returns a map of { projectId: count } for ALL galleries, plus whether a
// service account is configured. Used by the admin panel to render pending
// upload badges without N separate requests.
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

  const counts = await countAllPendingUploads();
  // Convert Map → plain object for JSON serialization.
  const obj: Record<string, number> = {};
  counts.forEach((v, k) => {
    obj[k] = v;
  });
  const total = Array.from(counts.values()).reduce((a, b) => a + b, 0);

  return NextResponse.json({
    serviceAccountConfigured: isServiceAccountConfigured(),
    total,
    counts: obj,
  });
}
