import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureSeed, getAccountRole, emailToId } from "@/lib/lihum";

// GET /api/accounts — Admin only
export async function GET(req: NextRequest) {
  await ensureSeed();
  const userEmail = req.headers.get("x-user-email") || undefined;
  const role = await getAccountRole(userEmail);
  if (role !== "admin") {
    return NextResponse.json(
      { error: "Akses ditolak. Hanya Admin yang dapat melihat daftar pengguna." },
      { status: 403 }
    );
  }
  const accounts = await db.account.findMany({ orderBy: { addedAt: "asc" } });
  return NextResponse.json(accounts);
}

// POST /api/accounts — Admin only
export async function POST(req: NextRequest) {
  await ensureSeed();
  const userEmail = req.headers.get("x-user-email") || undefined;
  const role = await getAccountRole(userEmail);
  if (role !== "admin") {
    return NextResponse.json(
      { error: "Akses ditolak. Hanya Admin yang dapat mendaftarkan akun baru." },
      { status: 403 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const { email, role: incomingRole, displayName } = body;
  if (!email || !incomingRole) {
    return NextResponse.json(
      { error: "Email dan Peran wajib diisi." },
      { status: 400 }
    );
  }

  if (incomingRole !== "admin" && incomingRole !== "manager") {
    return NextResponse.json(
      { error: "Peran tidak valid. Gunakan 'admin' atau 'manager'." },
      { status: 400 }
    );
  }

  const normalizedEmail = email.trim().toLowerCase();
  const existing = await db.account.findUnique({ where: { email: normalizedEmail } });
  if (existing) {
    return NextResponse.json(
      { error: "Akun dengan email ini sudah terdaftar." },
      { status: 400 }
    );
  }

  const newAcc = await db.account.create({
    data: {
      id: emailToId(normalizedEmail),
      email: normalizedEmail,
      role: incomingRole,
      displayName: displayName || "",
      addedAt: new Date().toISOString().split("T")[0],
    },
  });

  return NextResponse.json(newAcc, { status: 201 });
}
