import { NextRequest, NextResponse } from "next/server";
import { ensureSeed, getAccountRole } from "@/lib/lihum";
import { db } from "@/lib/db";

// POST /api/admin/backfill-stats
//
// One-time admin endpoint to backfill viewCount + downloadCount for all
// galleries based on estimates from Cloudflare Analytics (30-day window).
//
// Request body: { estimates: [{ id, views, downloads }, ...] }
// Only admin role can call this. After backfill, this route can be removed.
export async function POST(req: NextRequest) {
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
  if (!body || !Array.isArray(body.estimates)) {
    return NextResponse.json(
      { error: "Body harus berisi { estimates: [{id, views, downloads}, ...] }" },
      { status: 400 }
    );
  }

  let updated = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const e of body.estimates) {
    if (!e.id || typeof e.views !== "number" || typeof e.downloads !== "number") {
      skipped++;
      continue;
    }
    try {
      await db.execute({
        sql: "UPDATE Project SET viewCount = ?, downloadCount = ? WHERE id = ?",
        args: [Math.max(0, e.views), Math.max(0, e.downloads), e.id],
      });
      updated++;
    } catch (err: any) {
      errors.push(`${e.id}: ${err?.message || err}`);
    }
  }

  return NextResponse.json({
    success: true,
    updated,
    skipped,
    errors: errors.length > 0 ? errors.slice(0, 10) : undefined,
  });
}
