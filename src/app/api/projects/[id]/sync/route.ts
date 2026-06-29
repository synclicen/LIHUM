import { NextRequest, NextResponse } from "next/server";
import { ensureSeed, getAccountRole } from "@/lib/lihum";
import {
  findProjectById,
  replaceProjectPhotos,
  updateProjectSync,
  type NewPhotoInput,
} from "@/lib/queries";

/**
 * Recursively lists all images in a Google Drive folder and its subfolders.
 *
 * Uses Breadth-First Search (BFS) to traverse the folder tree so that
 * shallow photos appear first. For each image found, we also record the
 * name of its immediate parent folder so we can prefix the stored name —
 * this lets the manager identify which petugas/subfolder each photo came
 * from and prevents confusion when different subfolders contain files
 * with the same name (e.g. "IMG_001.jpg" from two different officers).
 *
 * Safety limits prevent runaway scanning on pathological trees.
 *
 * @param token     Google OAuth Bearer token (drive.readonly scope)
 * @param rootFolderId  The Drive folder ID the manager provided
 * @returns array of { file, parentName } where parentName is "" for
 *          photos directly inside rootFolderId.
 */
async function listImagesRecursively(
  token: string,
  rootFolderId: string
): Promise<{
  results: { file: any; parentName: string }[];
  foldersScanned: number;
  maxDepthReached: number;
  nonImageFilesSkipped: number;
  foldersSkipped: number;
}> {
  const results: { file: any; parentName: string }[] = [];
  const visited = new Set<string>([rootFolderId]);
  // Queue of folders to scan: { id, parentName, depth }
  // parentName is the NAME of this folder's immediate parent (for prefixing photos).
  const queue: { id: string; parentName: string; depth: number }[] = [
    { id: rootFolderId, parentName: "", depth: 0 },
  ];

  const MAX_DEPTH = 15; // plenty for any real-world folder structure
  const MAX_FOLDERS = 1000; // safety cap to prevent runaway scans
  let foldersScanned = 0;
  let maxDepthReached = 0;
  let nonImageFilesSkipped = 0;
  let foldersSkipped = 0;

  while (queue.length > 0) {
    if (foldersScanned >= MAX_FOLDERS) {
      console.warn(`[Sync] Reached MAX_FOLDERS (${MAX_FOLDERS}), stopping traversal.`);
      break;
    }

    const { id, parentName, depth } = queue.shift()!;
    foldersScanned++;
    if (depth > maxDepthReached) maxDepthReached = depth;

    // List items in this folder, handling Drive API pagination.
    // supportsAllDrives + includeItemsFromAllDrives are REQUIRED for folders
    // that live inside Shared Drives (team drives) — without them the API
    // silently returns an empty file list even though the folder is shared.
    let pageToken: string | undefined = undefined;
    do {
      const q = `'${id}' in parents and trashed = false`;
      const fields =
        "nextPageToken, files(id, name, mimeType, thumbnailLink, webContentLink, createdTime, modifiedTime, size)";
      const params = new URLSearchParams({
        q,
        fields,
        pageSize: "1000",
        supportsAllDrives: "true",
        includeItemsFromAllDrives: "true",
        corpora: "allDrives",
      });
      if (pageToken) params.set("pageToken", pageToken);
      const url = `https://www.googleapis.com/drive/v3/files?${params.toString()}`;

      let response: Response;
      try {
        response = await fetch(url, {
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch (err) {
        console.error(`[Sync] Network error scanning folder ${id}:`, err);
        foldersSkipped++;
        break; // skip this folder, continue with the rest of the queue
      }

      if (!response.ok) {
        // Folder might not be shared with this account — skip it gracefully.
        const errorText = await response.text();
        console.warn(
          `[Sync] Skipping folder ${id} (HTTP ${response.status}): ${errorText.slice(0, 200)}`
        );
        foldersSkipped++;
        break;
      }

      const data: any = await response.json();
      const files: any[] = data.files || [];

      for (const file of files) {
        if (file.mimeType === "application/vnd.google-apps.folder") {
          // Subfolder — queue it for scanning (respecting depth + visited guards)
          if (depth + 1 <= MAX_DEPTH && !visited.has(file.id)) {
            visited.add(file.id);
            queue.push({ id: file.id, parentName: file.name, depth: depth + 1 });
          }
        } else if (file.mimeType && file.mimeType.startsWith("image/")) {
          // Image file — collect it. parentName is the folder it lives in.
          results.push({ file, parentName });
        } else {
          // Non-image file (video, document, etc.) — count for diagnostics.
          nonImageFilesSkipped++;
        }
      }

      pageToken = data.nextPageToken;
    } while (pageToken);
  }

  return { results, foldersScanned, maxDepthReached, nonImageFilesSkipped, foldersSkipped };
}

// POST /api/projects/:id/sync — Admin/Manager only.
// Pulls image metadata from a Google Drive folder AND all its subfolders
// using the signed-in manager's Bearer token.
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
    // Recursively scan the root folder + all subfolders.
    const scanResult = await listImagesRecursively(token, folderId);
    const scanned = scanResult.results;

    const mappedPhotos: NewPhotoInput[] = scanned.map(({ file, parentName }) => {
      // Prefix photos from subfolders with the subfolder name so the
      // manager can tell which petugas/subfolder each photo came from.
      // Photos directly in the root folder keep their original name.
      // We use " — " (em-dash) as separator because it's filename-safe.
      const displayName = parentName
        ? `${parentName} — ${file.name}`
        : file.name;

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
        name: displayName,
        mimeType: file.mimeType,
        thumbnailLink: file.thumbnailLink || "",
        webContentLink: file.webContentLink || "",
        size: sizeFormatted,
        createdTime: file.createdTime ? file.createdTime.split("T")[0] : "Unknown",
        modifiedTime: file.modifiedTime ? file.modifiedTime.split("T")[0] : (file.createdTime ? file.createdTime.split("T")[0] : ""),
      };
    });

    const lastSyncedAt = new Date().toISOString();

    // Replace photos + update counts in one go.
    await replaceProjectPhotos(id, mappedPhotos);
    await updateProjectSync(id, mappedPhotos.length, lastSyncedAt);

    return NextResponse.json({
      success: true,
      photoCount: mappedPhotos.length,
      foldersScanned: scanResult.foldersScanned,
      maxDepthReached: scanResult.maxDepthReached,
      nonImageFilesSkipped: scanResult.nonImageFilesSkipped,
      foldersSkipped: scanResult.foldersSkipped,
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
