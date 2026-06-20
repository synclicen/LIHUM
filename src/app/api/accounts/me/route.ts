import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureSeed, ensurePrimaryAdmin } from "@/lib/lihum";

// GET /api/accounts/me
export async function GET(req: NextRequest) {
  await ensureSeed();
  const userEmail = req.headers.get("x-user-email") || undefined;
  if (!userEmail) {
    return NextResponse.json({ email: null, role: null });
  }

  const emailLower = userEmail.toLowerCase();

  // Auto-seed synclicen@gmail.com if not in list
  if (emailLower === "synclicen@gmail.com") {
    await ensurePrimaryAdmin(emailLower);
  }

  const acc = await db.account.findUnique({ where: { email: emailLower } });
  if (acc) {
    return NextResponse.json({
      email: acc.email,
      role: acc.role,
      displayName: acc.displayName,
    });
  }
  return NextResponse.json({ email: userEmail, role: null });
}
