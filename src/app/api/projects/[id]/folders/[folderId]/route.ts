import { NextRequest, NextResponse } from "next/server";
import { ensureSeed, getAccountRole } from "@/lib/lihum";
import { deleteProjectFolder } from "@/lib/queries";

// DELETE /api/projects/:id/folders/:folderId
// Removes an additional Drive folder from a gallery (admin/manager only).
// Does NOT delete the primary folder (that's edited via PUT /api/projects/:id).
// Does NOT delete the photos that came from this folder — they remain until
// the next sync (which will recompute the merged set).
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; folderId: string }> }
) {
  await ensureSeed();
  const userEmail = req.headers.get("x-user-email") || undefined;
  const role = await getAccountRole(userEmail);
  if (!role) {
    return NextResponse.json(
      { error: "Akses ditolak. Fitur admin only." },
      { status: 403 }
    );
  }

  const { id, folderId } = await params;
  const ok = await deleteProjectFolder(id, folderId);
  if (!ok) {
    return NextResponse.json(
      { error: "Folder tidak ditemukan atau sudah dihapus." },
      { status: 404 }
    );
  }
  return NextResponse.json({
    success: true,
    message: "Folder tambahan dihapus. Klik 'Sinkron Drive' untuk memperbarui daftar foto.",
  });
}
