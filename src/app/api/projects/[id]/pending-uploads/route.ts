import { NextRequest, NextResponse } from "next/server";
import { ensureSeed, getAccountRole } from "@/lib/lihum";
import {
  findProjectById,
  getPendingUploads,
  deletePendingUploadsForProject,
  countPendingUploads,
} from "@/lib/queries";
import { isServiceAccountConfigured } from "@/lib/google-service-account";

// GET /api/projects/:id/pending-uploads
// Returns the list of pending visitor uploads for a gallery (admin only).
// Does NOT include base64 payload — fetch /api/pending-uploads/[id] to download.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
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

  const { id } = await params;
  const project = await findProjectById(id);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const uploads = await getPendingUploads(id);
  const count = await countPendingUploads(id);

  return NextResponse.json({
    projectId: id,
    projectName: project.name,
    serviceAccountConfigured: isServiceAccountConfigured(),
    count,
    uploads: uploads.map((u) => ({
      id: u.id,
      fileName: u.fileName,
      mimeType: u.mimeType,
      sizeKB: Math.ceil(u.size / 1024),
      uploaderIp: u.uploaderIp,
      createdAt: u.createdAt,
    })),
  });
}

// DELETE /api/projects/:id/pending-uploads
// Clears ALL pending uploads for a gallery (admin only). Used after admin
// has downloaded them, or to reject a batch.
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
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

  const { id } = await params;
  const deleted = await deletePendingUploadsForProject(id);
  return NextResponse.json({ success: true, deleted });
}
