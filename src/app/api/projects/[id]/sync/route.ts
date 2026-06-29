import { NextRequest, NextResponse } from "next/server";
import { ensureSeed, getAccountRole } from "@/lib/lihum";
import {
  findProjectById,
  replaceProjectPhotos,
  updateProjectSync,
  type NewPhotoInput,
} from "@/lib/queries";

/**
 * Lists children of a Drive folder using multiple strategies.
 * Different strategies are needed because:
 *  - My Drive folders: default corpus works
 *  - Shared Drive folders: need supportsAllDrives + includeItemsFromAllDrives
 *  - Shared Drive root: may need corpora=drive + driveId
 *  - Link-shared folders not owned by user: API may return 0 even if web UI works
 *
 * Returns the raw file list + which strategy succeeded.
 */
async function listFolderChildren(
  token: string,
  folderId: string
): Promise<{ files: any[]; strategy: string; error?: string }> {
  const fields =
    "nextPageToken, files(id, name, mimeType, thumbnailLink, webContentLink, createdTime, modifiedTime, size)";

  // Strategy 1: default corpus (user) + shared drive support
  const strategies: { name: string; params: URLSearchParams }[] = [
    new URLSearchParams({
      q: `'${folderId}' in parents and trashed = false`,
      fields,
      pageSize: "1000",
      supportsAllDrives: "true",
      includeItemsFromAllDrives: "true",
    }),
    // Strategy 2: corpora=allDrives (search across all drives the user can access)
    new URLSearchParams({
      q: `'${folderId}' in parents and trashed = false`,
      fields,
      pageSize: "1000",
      supportsAllDrives: "true",
      includeItemsFromAllDrives: "true",
      corpora: "allDrives",
    }),
    // Strategy 3: corpora=drive + driveId (if folderId is a Shared Drive root)
    new URLSearchParams({
      q: `'${folderId}' in parents and trashed = false`,
      fields,
      pageSize: "1000",
      supportsAllDrives: "true",
      includeItemsFromAllDrives: "true",
      corpora: "drive",
      driveId: folderId,
    }),
  ];

  for (const strategy of strategies) {
    const url = `https://www.googleapis.com/drive/v3/files?${strategy.params.toString()}`;
    try {
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        const errorText = await response.text();
        console.warn(
          `[Sync] Strategy "${strategy.name}" failed (HTTP ${response.status}): ${errorText.slice(0, 150)}`
        );
        continue;
      }
      const data: any = await response.json();
      const files: any[] = data.files || [];
      if (files.length > 0) {
        return { files, strategy: strategy.name };
      }
    } catch (err) {
      console.warn(`[Sync] Strategy "${strategy.name}" error:`, err);
    }
  }

  // All strategies returned 0 files. Diagnose why:
  // 1. Is it a Shared Drive? (drives.get)
  // 2. Is it a regular folder? (files.get with full fields)
  // 3. Is it accessible at all?

  // Check if folderId is a Shared Drive ID
  try {
    const driveCheckUrl = `https://www.googleapis.com/drive/v3/drives/${folderId}?fields=id,name`;
    const driveCheckRes = await fetch(driveCheckUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (driveCheckRes.ok) {
      const driveInfo: any = await driveCheckRes.json();
      return {
        files: [],
        strategy: "none",
        error: `Folder "${driveInfo.name}" adalah Shared Drive (Team Drive). Admin harus ditambahkan sebagai ANGGOTA Shared Drive oleh pemiliknya agar API bisa membaca isi. Link sharing "Anyone with link" TIDAK cukup untuk akses API pada Shared Drive. Solusi: minta pemilik Shared Drive menambahkan email admin sebagai member, ATAU pindahkan foto ke folder biasa di My Drive dan share ke email admin.`,
      };
    }
  } catch {
    // Not a shared drive, continue to files.get check
  }

  // Check if it's a regular folder accessible with this token
  try {
    const checkUrl = `https://www.googleapis.com/drive/v3/files/${folderId}?supportsAllDrives=true&fields=id,name,mimeType,shared,driveId`;
    const checkRes = await fetch(checkUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!checkRes.ok) {
      const errText = await checkRes.text();
      return {
        files: [],
        strategy: "none",
        error: `Folder tidak dapat diakses dengan token admin (HTTP ${checkRes.status}). Folder di-share via "Anyone with link" tetapi email admin belum ditambahkan secara eksplisit. Solusi: buka folder di Google Drive, klik "Add shortcut to Drive" atau minta pemilik share ke email admin. Detail: ${errText.slice(0, 150)}`,
      };
    }
    const folderInfo: any = await checkRes.json();
    // If folder has driveId, it's inside a Shared Drive
    if (folderInfo.driveId) {
      return {
        files: [],
        strategy: "none",
        error: `Folder "${folderInfo.name}" berada di dalam Shared Drive. Admin belum terdaftar sebagai anggota Shared Drive tersebut. Link sharing tidak cukup untuk akses API. Solusi: minta pemilik Shared Drive menambahkan email admin sebagai member.`,
      };
    }
    // Regular folder but 0 files — maybe link sharing only (not explicit share)
    if (folderInfo.shared) {
      return {
        files: [],
        strategy: "none",
        error: `Folder "${folderInfo.name}" di-share via link, tetapi API tidak bisa list isi folder. Solusi: buka folder di Google Drive (via link), klik tombol "Add shortcut to Drive" atau "Add to My Drive" — ini memberi akses eksplisit ke akun admin sehingga API bisa membaca foto.`,
      };
    }
    return {
      files: [],
      strategy: "none",
      error: `Folder "${folderInfo.name}" accessible tapi 0 file gambar ditemukan. Pastikan folder berisi file gambar (JPG/PNG) dan bukan kosong.`,
    };
  } catch (err) {
    return { files: [], strategy: "none", error: `Gagal mengecek akses folder: ${err}` };
  }
}

/**
 * Recursively scans a Drive folder and all subfolders for images.
 * Uses the multi-strategy listFolderChildren for each folder.
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
  rootFolderError?: string;
  rootStrategy?: string;
}> {
  const results: { file: any; parentName: string }[] = [];
  const visited = new Set<string>([rootFolderId]);
  const queue: { id: string; parentName: string; depth: number }[] = [
    { id: rootFolderId, parentName: "", depth: 0 },
  ];

  const MAX_DEPTH = 15;
  const MAX_FOLDERS = 1000;
  let foldersScanned = 0;
  let maxDepthReached = 0;
  let nonImageFilesSkipped = 0;
  let foldersSkipped = 0;
  let rootFolderError: string | undefined;
  let rootStrategy: string | undefined;

  while (queue.length > 0) {
    if (foldersScanned >= MAX_FOLDERS) break;

    const { id, parentName, depth } = queue.shift()!;
    foldersScanned++;
    if (depth > maxDepthReached) maxDepthReached = depth;

    const { files, strategy, error } = await listFolderChildren(token, id);

    if (depth === 0) {
      rootStrategy = strategy;
      if (error) rootFolderError = error;
    }

    if (error && files.length === 0) {
      foldersSkipped++;
      continue;
    }

    console.log(`[Sync] Folder ${id} (depth ${depth}, strategy "${strategy}"): ${files.length} items`);

    for (const file of files) {
      if (file.mimeType === "application/vnd.google-apps.folder") {
        if (depth + 1 <= MAX_DEPTH && !visited.has(file.id)) {
          visited.add(file.id);
          queue.push({ id: file.id, parentName: file.name, depth: depth + 1 });
        }
      } else if (file.mimeType && file.mimeType.startsWith("image/")) {
        results.push({ file, parentName });
      } else {
        nonImageFilesSkipped++;
      }
    }
  }

  return { results, foldersScanned, maxDepthReached, nonImageFilesSkipped, foldersSkipped, rootFolderError, rootStrategy };
}

// POST /api/projects/:id/sync — Admin/Manager only.
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
    const scanResult = await listImagesRecursively(token, folderId);
    const scanned = scanResult.results;
    console.log(`[Sync] Project ${id}: ${scanned.length} images, strategy="${scanResult.rootStrategy}", foldersScanned=${scanResult.foldersScanned}, nonImage=${scanResult.nonImageFilesSkipped}, skipped=${scanResult.foldersSkipped}`);

    const mappedPhotos: NewPhotoInput[] = scanned.map(({ file, parentName }) => {
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

    await replaceProjectPhotos(id, mappedPhotos);
    await updateProjectSync(id, mappedPhotos.length, lastSyncedAt);

    return NextResponse.json({
      success: true,
      photoCount: mappedPhotos.length,
      foldersScanned: scanResult.foldersScanned,
      maxDepthReached: scanResult.maxDepthReached,
      nonImageFilesSkipped: scanResult.nonImageFilesSkipped,
      foldersSkipped: scanResult.foldersSkipped,
      rootStrategy: scanResult.rootStrategy,
      debug: scanResult.rootFolderError || undefined,
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
