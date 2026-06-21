import { NextRequest, NextResponse } from "next/server";
import { ensureSeed } from "@/lib/lihum";
import { getAllAccounts, createAccount, type AccountRow } from "@/lib/queries";
import { emailToId } from "@/lib/lihum";

function accountOut(a: AccountRow) {
  return {
    id: a.id,
    email: a.email,
    role: a.role,
    displayName: a.displayName,
    addedAt: a.addedAt,
  };
}

// GET /api/accounts — Admin only
export async function GET(req: NextRequest) {
  await ensureSeed();
  const userEmail = req.headers.get("x-user-email") || undefined;
  const { getAccountRole } = await import("@/lib/lihum");
  const role = await getAccountRole(userEmail);
  if (role !== "admin") {
    return NextResponse.json(
      { error: "Akses ditolak. Hanya Admin yang dapat melihat daftar pengguna." },
      { status: 403 }
    );
  }
  const accounts = await getAllAccounts();
  return NextResponse.json(accounts.map(accountOut));
}

// POST /api/accounts — Admin only
export async function POST(req: NextRequest) {
  await ensureSeed();
  const userEmail = req.headers.get("x-user-email") || undefined;
  const { getAccountRole } = await import("@/lib/lihum");
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
    return NextResponse.json({ error: "Email dan Peran wajib diisi." }, { status: 400 });
  }
  if (incomingRole !== "admin" && incomingRole !== "manager") {
    return NextResponse.json(
      { error: "Peran tidak valid. Gunakan 'admin' atau 'manager'." },
      { status: 400 }
    );
  }

  const normalizedEmail = email.trim().toLowerCase();
  const { findAccountByEmail } = await import("@/lib/queries");
  const existing = await findAccountByEmail(normalizedEmail);
  if (existing) {
    return NextResponse.json(
      { error: "Akun dengan email ini sudah terdaftar." },
      { status: 400 }
    );
  }

  const newAcc = await createAccount({
    id: emailToId(normalizedEmail),
    email: normalizedEmail,
    role: incomingRole,
    displayName: displayName || "",
    addedAt: new Date().toISOString().split("T")[0],
  });

  return NextResponse.json(accountOut(newAcc), { status: 201 });
}
