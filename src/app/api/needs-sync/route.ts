import { NextRequest, NextResponse } from "next/server";
import { ensureSeed, getAccountRole } from "@/lib/lihum";
import { getProjectsNeedingSync } from "@/lib/queries";

/**
 * GET /api/needs-sync — Returns the list of project IDs that currently have
 * needsSync=1 (i.e., Google Drive sent a push notification that something
 * changed in this admin's Drive, and we haven't synced yet).
 *
 * The admin's browser scheduler calls this every 60s. If any projects are
 * returned, the browser triggers an immediate delta-sync for each one —
 * bypassing the normal 5m interval. This gives near-instant sync (within 60s)
 * when Drive changes, without polling Google Drive directly.
 *
 * Cost: 1 D1 read per 60s = 1,440 reads/day = 0.03% of the 5M/day limit.
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

  const projectIds = await getProjectsNeedingSync();
  return NextResponse.json({
    needsSync: projectIds,
    count: projectIds.length,
    checkedAt: new Date().toISOString(),
  });
}
