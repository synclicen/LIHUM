import { NextRequest, NextResponse } from "next/server";
import { ensureSeed, getAccountRole, parseDriveFolderId, slugify } from "@/lib/lihum";
import {
  findProjectById,
  getProjectFolders,
  addProjectFolder,
  findProjectFolderByDriveId,
  type ProjectFolderRow,
} from "@/lib/queries";

function folderOut(f: ProjectFolderRow) {
  return {
    id: f.id,
    driveFolderUrl: f.driveFolderUrl,
    driveFolderId: f.driveFolderId,
    label: f.label,
    addedBy: f.addedBy,
    addedAt: f.addedAt,
  };
}

// GET /api/projects/:id/folders
// Returns all additional Drive folders linked to a gallery (admin/manager only).
// The primary folder (Project.driveFolderUrl) is NOT included here — it's part
// of the project itself.
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

  const folders = await getProjectFolders(id);
  return NextResponse.json({
    projectId: id,
    primaryFolder: {
      driveFolderUrl: project.driveFolderUrl,
      driveFolderId: project.driveFolderId,
    },
    additionalFolders: folders.map(folderOut),
    total: folders.length,
  });
}

// POST /api/projects/:id/folders
// Adds an additional Drive folder to a gallery (admin/manager only).
// Body: { driveFolderUrl: string, label?: string }
export async function POST(
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

  const body = await req.json().catch(() => null);
  if (!body || typeof body.driveFolderUrl !== "string") {
    return NextResponse.json(
      { error: "Field 'driveFolderUrl' wajib diisi." },
      { status: 400 }
    );
  }

  const driveFolderUrl = body.driveFolderUrl.trim();
  const label = typeof body.label === "string" ? body.label.trim() : "";
  const driveFolderId = parseDriveFolderId(driveFolderUrl);

  if (!driveFolderId) {
    return NextResponse.json(
      {
        error:
          "Tautan Google Drive tidak valid. Pastikan format /folders/ID benar (contoh: https://drive.google.com/drive/folders/XXXX).",
      },
      { status: 400 }
    );
  }

  // Check if this folder is already linked (primary or additional) to this project
  const existing = await findProjectFolderByDriveId(id, driveFolderId);
  if (existing) {
    return NextResponse.json(
      {
        error:
          existing.source === "primary"
            ? "Folder ini sudah dipakai sebagai folder UTAMA galeri ini."
            : `Folder ini sudah ditambahkan sebagai folder tambahan${existing.folder?.label ? ` dengan label '${existing.folder.label}'` : ""}.`,
      },
      { status: 409 }
    );
  }

  const folderId = `pf_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  const created = await addProjectFolder({
    id: folderId,
    projectId: id,
    driveFolderUrl,
    driveFolderId,
    label,
    addedBy: userEmail || "",
    addedAt: new Date().toISOString(),
  });

  return NextResponse.json(
    {
      success: true,
      folder: folderOut(created),
      message: `Folder tambahan berhasil ditambahkan. Klik "Sinkron Drive" untuk memuat foto dari folder baru.`,
    },
    { status: 201 }
  );
}
