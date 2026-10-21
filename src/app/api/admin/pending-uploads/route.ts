import { NextRequest, NextResponse } from "next/server";
import { ensureSeed, getAccountRole } from "@/lib/lihum";
import {
  getAllPendingUploads,
  getPendingUploads,
  countAllPendingUploads,
  deletePendingUploadsForProject,
} from "@/lib/queries";

// GET /api/admin/pending-uploads?projectId=X
// Returns all pending visitor uploads across all galleries (admin only).
// Optional ?projectId=X filters to a single gallery.
// Does NOT include base64 payload — fetch /api/admin/pending-uploads/[id] to download.
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

  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("projectId");

  let uploads;
  if (projectId) {
    uploads = await getPendingUploads(projectId);
  } else {
    uploads = await getAllPendingUploads();
  }

  const counts = await countAllPendingUploads();
  const total = Array.from(counts.values()).reduce((a, b) => a + b, 0);
  const countsObj: Record<string, number> = {};
  counts.forEach((v, k) => { countsObj[k] = v; });

  return NextResponse.json({
    uploads: uploads.map((u) => ({
      id: u.id,
      projectId: u.projectId,
      fileName: u.fileName,
      mimeType: u.mimeType,
      sizeKB: Math.ceil(u.size / 1024),
      uploaderIp: u.uploaderIp,
      createdAt: u.createdAt,
    })),
    total,
    counts: countsObj,
  });
}

// DELETE /api/admin/pending-uploads?projectId=X
// Clears ALL pending uploads for a gallery (admin only).
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

  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("projectId");
  if (!projectId) {
    return NextResponse.json(
      { error: "Parameter ?projectId= wajib diisi." },
      { status: 400 }
    );
  }

  const deleted = await deletePendingUploadsForProject(projectId);
  return NextResponse.json({ success: true, deleted });
}
