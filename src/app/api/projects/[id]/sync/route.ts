import { NextRequest, NextResponse } from "next/server";
import { ensureSeed, getAccountRole } from "@/lib/lihum";
import { findProjectById, getProjectFolders } from "@/lib/queries";
import { syncProjectWithToken } from "@/lib/drive-sync";

// POST /api/projects/:id/sync — Admin/Manager only.
// Scans the project's primary Google Drive folder + any additional linked
// folders (from the ProjectFolder table) and refreshes the Photo table with
// the merged, deduplicated set of images.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await ensureSeed();
  const userEmail = req.headers.get("x-user-email") || undefined;
  const role = await getAccountRole(userEmail);
  if (!role) {
    return NextResponse.json(
      { error: "Akses ditolak. Hubungi Admin Utama untuk didaftarkan." },
      { status: 403 }
    );
  }

  const { id } = await params;
  const authHeader = req.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return NextResponse.json(
      {
        error:
          "Token otorisasi Google tidak ditemukan. Silakan masuk (Login) Admin terlebih dahulu.",
      },
      { status: 401 }
    );
  }
  const token = authHeader.split(" ")[1];

  const project = await findProjectById(id);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const folderId = project.driveFolderId;
  if (!folderId) {
    return NextResponse.json(
      { error: "Format ID folder Google Drive tidak valid." },
      { status: 400 }
    );
  }

  // Collect all folders to scan: primary + any additional linked folders.
  const additionalFolders = await getProjectFolders(id);
  const allFolders = [
    {
      driveFolderId: folderId,
      driveFolderUrl: project.driveFolderUrl,
      label: "Folder Utama",
    },
    ...additionalFolders.map((f) => ({
      driveFolderId: f.driveFolderId,
      driveFolderUrl: f.driveFolderUrl,
      label: f.label || "Folder Tambahan",
    })),
  ];

  try {
    const result = await syncProjectWithToken(id, token, allFolders);
    console.log(
      `[Sync] Project ${id}: user=${userEmail}, ${result.photoCount} photos from ${allFolders.length} folder(s)`
    );
    return NextResponse.json(result);
  } catch (err: any) {
    console.error("Drive Sync Error:", err);
    return NextResponse.json(
      { error: err.message || "Gagal sinkronisasi Google Drive." },
      { status: 500 }
    );
  }
}
