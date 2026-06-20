import { NextRequest, NextResponse } from "next/server";
import { ensureSeed, getAccountRole } from "@/lib/lihum";
import { findAccountById, deleteAccount } from "@/lib/queries";

// DELETE /api/accounts/:id — Admin only
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await ensureSeed();
  const userEmail = req.headers.get("x-user-email") || undefined;
  const role = await getAccountRole(userEmail);
  if (role !== "admin") {
    return NextResponse.json(
      { error: "Akses ditolak. Hanya Admin yang dapat menghapus akun." },
      { status: 403 }
    );
  }

  const { id } = await params;
  const acc = await findAccountById(id);
  if (!acc) {
    return NextResponse.json({ error: "Akun tidak ditemukan." }, { status: 404 });
  }

  if (acc.email.toLowerCase() === (userEmail || "").toLowerCase()) {
    return NextResponse.json(
      { error: "Anda tidak dapat menghapus akun Anda sendiri." },
      { status: 400 }
    );
  }

  if (acc.email.toLowerCase() === "synclicen@gmail.com") {
    return NextResponse.json(
      { error: "Admin Utama (synclicen@gmail.com) tidak dapat dihapus." },
      { status: 400 }
    );
  }

  await deleteAccount(id);
  return NextResponse.json({ success: true });
}
