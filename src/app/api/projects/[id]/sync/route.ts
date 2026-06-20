import { NextRequest, NextResponse } from "next/server";
import { ensureSeed, getAccountRole } from "@/lib/lihum";
import {
  findProjectById,
  replaceProjectPhotos,
  updateProjectSync,
  type NewPhotoInput,
} from "@/lib/queries";

// POST /api/projects/:id/sync — Admin/Manager only.
// Pulls image metadata from a Google Drive folder using the user's Bearer token.
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

  try {
    const q = `'${folderId}' in parents and mimeType contains 'image/' and trashed = false`;
    const fields =
      "files(id, name, mimeType, thumbnailLink, webContentLink, createdTime, size)";
    const driveUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
      q
    )}&fields=${encodeURIComponent(fields)}&pageSize=300`;

    const driveResponse = await fetch(driveUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!driveResponse.ok) {
      const errorText = await driveResponse.text();
      throw new Error(`Google Drive API response error: ${errorText}`);
    }

    const driveData: any = await driveResponse.json();
    const files = driveData.files || [];

    const mappedPhotos: NewPhotoInput[] = files.map((file: any) => {
      let sizeFormatted = "Unknown";
      if (file.size) {
        const bytes = parseInt(file.size);
        if (bytes > 1048576) {
          sizeFormatted = (bytes / 1048576).toFixed(1) + " MB";
        } else {
          sizeFormatted = (bytes / 1024).toFixed(0) + " KB";
        }
      }
      return {
        id: file.id,
        name: file.name,
        mimeType: file.mimeType,
        thumbnailLink: file.thumbnailLink || "",
        webContentLink: file.webContentLink || "",
        size: sizeFormatted,
        createdTime: file.createdTime ? file.createdTime.split("T")[0] : "Unknown",
      };
    });

    const lastSyncedAt = new Date().toISOString();

    // Replace photos + update counts in one go.
    await replaceProjectPhotos(id, mappedPhotos);
    await updateProjectSync(id, mappedPhotos.length, lastSyncedAt);

    return NextResponse.json({
      success: true,
      photoCount: mappedPhotos.length,
      photos: mappedPhotos,
      lastSyncedAt,
    });
  } catch (err: any) {
    console.error("Drive Sync Error:", err);
    return NextResponse.json(
      {
        error:
          err.message ||
          "Gagal sinkronisasi Google Drive. Pastikan folder tersebut dibagikan (public) dan akun Anda memiliki izin.",
      },
      { status: 500 }
    );
  }
}
