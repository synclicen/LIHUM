import { NextRequest, NextResponse } from "next/server";
import { ensureSeed, getAccountRole } from "@/lib/lihum";
import {
  findProjectById,
  replaceProjectPhotos,
  updateProjectSync,
  type NewPhotoInput,
} from "@/lib/queries";

const DRIVE_FIELDS =
  "files(id, name, mimeType, thumbnailLink, webContentLink, createdTime, modifiedTime, size, parents)";

/**
 * Checks if the given ID is a Shared Drive (Team Drive).
 * Returns the drive name if yes, null if no.
 */
async function checkIsSharedDrive(
  token: string,
  id: string
): Promise<{ isSharedDrive: boolean; name?: string }> {
  try {
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/drives/${id}?fields=id,name`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (res.ok) {
      const data: any = await res.json();
      return { isSharedDrive: true, name: data.name };
    }
  } catch {
    /* not a shared drive */
  }
  return { isSharedDrive: false };
}

/**
 * Lists ALL image files in a Shared Drive in one flat query (with pagination).
 * This gets every image across all folders/subfolders in the shared drive.
 */
async function listAllImagesInSharedDrive(
  token: string,
  driveId: string
): Promise<{ files: any[]; error?: string }> {
  const allFiles: any[] = [];
  let pageToken: string | undefined = undefined;

  do {
    const params = new URLSearchParams({
      corpora: "drive",
      driveId,
      q: "mimeType contains 'image/' and trashed = false",
      fields: `nextPageToken, ${DRIVE_FIELDS}`,
      pageSize: "1000",
      supportsAllDrives: "true",
      includeItemsFromAllDrives: "true",
    });
    if (pageToken) params.set("pageToken", pageToken);

    const url = `https://www.googleapis.com/drive/v3/files?${params.toString()}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      const errText = await res.text();
      return {
        files: allFiles,
        error: `Gagal query Shared Drive (HTTP ${res.status}): ${errText.slice(0, 200)}`,
      };
    }

    const data: any = await res.json();
    const files: any[] = data.files || [];
    allFiles.push(...files);
    pageToken = data.nextPageToken;
  } while (pageToken);

  return { files: allFiles };
}

/**
 * Lists children of a regular folder (My Drive or subfolder inside Shared Drive).
 * Tries multiple strategies for robustness.
 */
async function listFolderChildren(
  token: string,
  folderId: string,
  driveId?: string
): Promise<{ files: any[]; strategy: string; error?: string }> {
  const params = new URLSearchParams({
    q: `'${folderId}' in parents and trashed = false`,
    fields: `nextPageToken, ${DRIVE_FIELDS}`,
    pageSize: "1000",
    supportsAllDrives: "true",
    includeItemsFromAllDrives: "true",
  });
  // If we know the driveId (inside a shared drive), scope the query to that drive
  if (driveId) {
    params.set("corpora", "drive");
    params.set("driveId", driveId);
  }

  const url = `https://www.googleapis.com/drive/v3/files?${params.toString()}`;
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const errText = await res.text();
      return {
        files: [],
        strategy: "none",
        error: `HTTP ${res.status}: ${errText.slice(0, 150)}`,
      };
    }
    const data: any = await res.json();
    return { files: data.files || [], strategy: driveId ? "drive-scoped" : "default" };
  } catch (err) {
    return { files: [], strategy: "none", error: String(err) };
  }
}

/**
 * Recursively scans a folder tree for images.
 * If the root is a Shared Drive, uses flat query instead of recursive traversal.
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
  isSharedDrive?: boolean;
  sharedDriveName?: string;
}> {
  // Step 1: Check if rootFolderId is a Shared Drive
  const driveCheck = await checkIsSharedDrive(token, rootFolderId);

  if (driveCheck.isSharedDrive) {
    console.log(`[Sync] Root is Shared Drive: "${driveCheck.name}" — using flat query`);
    // Shared Drive → list ALL images in one flat query (across all subfolders)
    const { files, error } = await listAllImagesInSharedDrive(token, rootFolderId);
    console.log(`[Sync] Shared Drive "${driveCheck.name}": ${files.length} images found`);

    if (files.length === 0 && error) {
      return {
        results: [],
        foldersScanned: 0,
        maxDepthReached: 0,
        nonImageFilesSkipped: 0,
        foldersSkipped: 0,
        rootFolderError: error,
        rootStrategy: "shared-drive-flat",
        isSharedDrive: true,
        sharedDriveName: driveCheck.name,
      };
    }

    // For shared drive flat query, parentName is empty (we don't know which
    // subfolder each photo came from, but that's OK — all photos are captured)
    return {
      results: files.map((file) => ({ file, parentName: "" })),
      foldersScanned: 1,
      maxDepthReached: 0,
      nonImageFilesSkipped: 0,
      foldersSkipped: 0,
      rootStrategy: "shared-drive-flat",
      isSharedDrive: true,
      sharedDriveName: driveCheck.name,
    };
  }

  // Step 2: Regular folder → recursive BFS traversal
  console.log(`[Sync] Root is regular folder — recursive traversal`);
  const results: { file: any; parentName: string }[] = [];
  const visited = new Set<string>([rootFolderId]);
  const queue: { id: string; parentName: string; depth: number; driveId?: string }[] = [
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
  let detectedDriveId: string | undefined;

  while (queue.length > 0) {
    if (foldersScanned >= MAX_FOLDERS) break;

    const { id, parentName, depth, driveId } = queue.shift()!;
    foldersScanned++;
    if (depth > maxDepthReached) maxDepthReached = depth;

    const { files, strategy, error } = await listFolderChildren(token, id, driveId || detectedDriveId);

    if (depth === 0) {
      rootStrategy = strategy;
      if (error) rootFolderError = error;
      // Detect driveId from returned files (if inside a shared drive)
      for (const f of files) {
        if (f.driveId) {
          detectedDriveId = f.driveId;
          break;
        }
      }
    }

    if (error && files.length === 0) {
      foldersSkipped++;
      continue;
    }

    console.log(`[Sync] Folder ${id} (depth ${depth}): ${files.length} items`);

    for (const file of files) {
      // Detect driveId from any file
      if (file.driveId && !detectedDriveId) {
        detectedDriveId = file.driveId;
      }

      if (file.mimeType === "application/vnd.google-apps.folder") {
        if (depth + 1 <= MAX_DEPTH && !visited.has(file.id)) {
          visited.add(file.id);
          queue.push({ id: file.id, parentName: file.name, depth: depth + 1, driveId: detectedDriveId });
        }
      } else if (file.mimeType && file.mimeType.startsWith("image/")) {
        results.push({ file, parentName });
      } else {
        nonImageFilesSkipped++;
      }
    }
  }

  // If regular folder returned 0, diagnose
  if (results.length === 0 && !rootFolderError) {
    // Check folder accessibility
    try {
      const checkRes = await fetch(
        `https://www.googleapis.com/drive/v3/files/${rootFolderId}?supportsAllDrives=true&fields=id,name,mimeType,shared,driveId`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!checkRes.ok) {
        rootFolderError = `Folder tidak dapat diakses dengan token ini (HTTP ${checkRes.status}). Email yang login mungkin tidak punya akses ke folder.`;
      } else {
        const info: any = await checkRes.json();
        if (info.driveId) {
          // It's inside a shared drive but we got 0 — try flat query on the drive
          console.log(`[Sync] Folder inside Shared Drive ${info.driveId} — trying flat query`);
          const flatResult = await listAllImagesInSharedDrive(token, info.driveId);
          if (flatResult.files.length > 0) {
            return {
              results: flatResult.files.map((file) => ({ file, parentName: "" })),
              foldersScanned: 1,
              maxDepthReached: 0,
              nonImageFilesSkipped: 0,
              foldersSkipped: 0,
              rootStrategy: "shared-drive-flat-fallback",
              isSharedDrive: true,
              sharedDriveName: info.name,
            };
          }
        }
        rootFolderError = `Folder "${info.name}" accessible tapi 0 file gambar. Pastikan folder berisi file gambar (JPG/PNG).`;
      }
    } catch (err) {
      rootFolderError = `Gagal mengecek folder: ${err}`;
    }
  }

  return {
    results,
    foldersScanned,
    maxDepthReached,
    nonImageFilesSkipped,
    foldersSkipped,
    rootFolderError,
    rootStrategy,
    isSharedDrive: false,
  };
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
        error: "Token otorisasi Google tidak ditemukan. Silakan masuk (Login) Admin terlebih dahulu.",
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
    console.log(`[Sync] Project ${id}: user=${userEmail}, ${scanned.length} images, strategy="${scanResult.rootStrategy}", sharedDrive=${scanResult.isSharedDrive}`);

    if (scanned.length === 0 && scanResult.rootFolderError) {
      scanResult.rootFolderError = `Email login: ${userEmail}. ${scanResult.rootFolderError}`;
    }

    const mappedPhotos: NewPhotoInput[] = scanned.map(({ file, parentName }) => {
      const displayName = parentName ? `${parentName} — ${file.name}` : file.name;

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
      isSharedDrive: scanResult.isSharedDrive,
      sharedDriveName: scanResult.sharedDriveName,
      debug: scanResult.rootFolderError || undefined,
      photos: mappedPhotos,
      lastSyncedAt,
    });
  } catch (err: any) {
    console.error("Drive Sync Error:", err);
    return NextResponse.json(
      { error: err.message || "Gagal sinkronisasi Google Drive." },
      { status: 500 }
    );
  }
}
