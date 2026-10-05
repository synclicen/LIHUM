/**
 * Google Drive sync logic, shared between:
 *  - /api/projects/[id]/sync   (uses admin's OAuth token)
 *  - /api/projects/[id]/upload (uses service account token, for auto-sync)
 *
 * Extracted so both paths share identical recursive-scan + rename + store
 * behavior. Only the source of the access token differs.
 */

import {
  findProjectById,
  replaceProjectPhotos,
  updateProjectSync,
  type NewPhotoInput,
} from "@/lib/queries";

export interface SyncResult {
  success: boolean;
  photoCount: number;
  foldersScanned: number;
  driveFoldersCount?: number;
  maxDepthReached: number;
  nonImageFilesSkipped: number;
  foldersSkipped: number;
  rootStrategy?: string;
  isSharedDrive?: boolean;
  sharedDriveName?: string;
  filteredStats?: { smallFiles: number; total: number };
  debug?: string;
  lastSyncedAt: string;
}

const MIN_FILE_SIZE_BYTES = 100 * 1024; // 100KB

interface RawPhoto {
  id: string;
  name: string;
  mimeType: string;
  thumbnailLink: string;
  webContentLink: string;
  size: string;
  createdTime: string;
  modifiedTime: string;
  parentName: string;
}

const DRIVE_FIELDS =
  "files(id, name, mimeType, thumbnailLink, webContentLink, createdTime, modifiedTime, size, parents)";

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
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
      const errText = await res.text();
      return { files: allFiles, error: `HTTP ${res.status}: ${errText.slice(0, 200)}` };
    }
    const data: any = await res.json();
    allFiles.push(...(data.files || []));
    pageToken = data.nextPageToken;
  } while (pageToken);
  return { files: allFiles };
}

async function listFolderChildren(
  token: string,
  folderId: string,
  driveId?: string
): Promise<{ files: any[]; strategy: string; error?: string }> {
  const allFiles: any[] = [];
  let pageToken: string | undefined = undefined;
  do {
    const params = new URLSearchParams({
      q: `'${folderId}' in parents and trashed = false`,
      fields: `nextPageToken, ${DRIVE_FIELDS}`,
      pageSize: "1000",
      supportsAllDrives: "true",
      includeItemsFromAllDrives: "true",
    });
    if (driveId) {
      params.set("corpora", "drive");
      params.set("driveId", driveId);
    }
    if (pageToken) params.set("pageToken", pageToken);
    const url = `https://www.googleapis.com/drive/v3/files?${params.toString()}`;
    try {
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) {
        const errText = await res.text();
        return { files: allFiles, strategy: "none", error: `HTTP ${res.status}: ${errText.slice(0, 150)}` };
      }
      const data: any = await res.json();
      allFiles.push(...(data.files || []));
      pageToken = data.nextPageToken;
    } catch (err) {
      return { files: allFiles, strategy: "none", error: String(err) };
    }
  } while (pageToken);
  return { files: allFiles, strategy: driveId ? "drive-scoped" : "default" };
}

async function listImagesRecursively(token: string, rootFolderId: string) {
  const driveCheck = await checkIsSharedDrive(token, rootFolderId);
  if (driveCheck.isSharedDrive) {
    const { files, error } = await listAllImagesInSharedDrive(token, rootFolderId);
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
    for (const file of files) {
      if (file.driveId && !detectedDriveId) detectedDriveId = file.driveId;
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

  if (results.length === 0 && !rootFolderError) {
    try {
      const checkRes = await fetch(
        `https://www.googleapis.com/drive/v3/files/${rootFolderId}?supportsAllDrives=true&fields=id,name,mimeType,shared,driveId`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!checkRes.ok) {
        rootFolderError = `Folder tidak dapat diakses (HTTP ${checkRes.status}). Token/service account mungkin tidak punya akses.`;
      } else {
        const info: any = await checkRes.json();
        if (info.driveId) {
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
        rootFolderError = `Folder "${info.name}" berisi 0 file gambar.`;
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

function filterPhotos(photos: RawPhoto[]): { kept: RawPhoto[]; stats: { smallFiles: number; total: number } } {
  const stats = { smallFiles: 0, total: photos.length };
  const kept = photos.filter((p) => {
    const bytes = parseInt(p.size) || 0;
    if (bytes > 0 && bytes < MIN_FILE_SIZE_BYTES) {
      stats.smallFiles++;
      return false;
    }
    return true;
  });
  return { kept, stats };
}

/**
 * Syncs a project's Google Drive folder(s) into the database using the given
 * admin OAuth access token.
 *
 * Scans the primary folder + all additional folders (passed in `folders`),
 * merges the results, and dedupes photos by Drive file ID (so a photo that
 * appears in multiple folders is only stored once).
 *
 * SAFETY GUARD: if the scan returns 0 photos, existing photos are NOT replaced.
 */
export async function syncProjectWithToken(
  projectId: string,
  token: string,
  folders: { driveFolderId: string; driveFolderUrl: string; label: string }[]
): Promise<SyncResult> {
  const project = await findProjectById(projectId);
  if (!project) {
    throw new Error("Project not found");
  }
  if (folders.length === 0 || !folders[0].driveFolderId) {
    throw new Error("Drive folder ID tidak valid.");
  }

  // Scan each folder and merge results. Photos are deduped by Drive file ID
  // (a photo may legitimately appear in multiple folders if photographers
  // share the same file across their folders).
  const allResults: { file: any; parentName: string }[] = [];
  const seenFileIds = new Set<string>();
  const folderErrors: string[] = [];
  let totalFoldersScanned = 0;
  let totalMaxDepth = 0;
  let totalNonImageSkipped = 0;
  let totalFoldersSkipped = 0;
  let rootStrategy: string | undefined;
  let isSharedDrive = false;
  let sharedDriveName: string | undefined;

  for (let i = 0; i < folders.length; i++) {
    const f = folders[i];
    try {
      const scanResult = await listImagesRecursively(token, f.driveFolderId);
      totalFoldersScanned += scanResult.foldersScanned;
      if (scanResult.maxDepthReached > totalMaxDepth) totalMaxDepth = scanResult.maxDepthReached;
      totalNonImageSkipped += scanResult.nonImageFilesSkipped;
      totalFoldersSkipped += scanResult.foldersSkipped;
      if (i === 0) {
        rootStrategy = scanResult.rootStrategy;
        isSharedDrive = !!scanResult.isSharedDrive;
        sharedDriveName = scanResult.sharedDriveName;
      }
      if (scanResult.rootFolderError && scanResult.results.length === 0) {
        folderErrors.push(`${f.label}: ${scanResult.rootFolderError}`);
      }
      for (const r of scanResult.results) {
        if (!seenFileIds.has(r.file.id)) {
          seenFileIds.add(r.file.id);
          allResults.push(r);
        }
      }
    } catch (err: any) {
      folderErrors.push(`${f.label}: ${err?.message || err}`);
    }
  }

  const scanned = allResults;

  if (scanned.length === 0) {
    return {
      success: false,
      photoCount: 0,
      foldersScanned: totalFoldersScanned,
      maxDepthReached: totalMaxDepth,
      nonImageFilesSkipped: totalNonImageSkipped,
      foldersSkipped: totalFoldersSkipped,
      rootStrategy,
      isSharedDrive,
      sharedDriveName,
      debug: folderErrors.length > 0
        ? `Tidak ada foto dari ${folders.length} folder. Errors: ${folderErrors.join("; ")}`
        : "Scan mengembalikan 0 foto. Foto yang ada dipertahankan.",
      lastSyncedAt: new Date().toISOString(),
    };
  }

  let filteredStats: { smallFiles: number; total: number } | undefined;
  let photosToStore = scanned;
  if (project.autoFilterEnabled) {
    const rawPhotos: RawPhoto[] = scanned.map(({ file, parentName }) => ({
      id: file.id,
      name: file.name,
      mimeType: file.mimeType,
      thumbnailLink: file.thumbnailLink || "",
      webContentLink: file.webContentLink || "",
      size: file.size || "0",
      createdTime: file.createdTime || "",
      modifiedTime: file.modifiedTime || "",
      parentName,
    }));
    const filterResult = filterPhotos(rawPhotos);
    photosToStore = filterResult.kept.map((p) => ({ file: p, parentName: p.parentName }));
    filteredStats = filterResult.stats;
  }

  const galleryName = project.name;
  const mappedPhotos: NewPhotoInput[] = photosToStore.map(({ file }, index) => {
    const extMatch = file.name.match(/\.([^.]+)$/);
    const ext = extMatch ? `.${extMatch[1].toLowerCase()}` : ".jpg";
    const displayName = `${galleryName} - ${String(index + 1).padStart(3, "0")}${ext}`;
    let sizeFormatted = "Unknown";
    if (file.size) {
      const bytes = parseInt(file.size);
      if (bytes > 1048576) sizeFormatted = (bytes / 1048576).toFixed(1) + " MB";
      else sizeFormatted = (bytes / 1024).toFixed(0) + " KB";
    }
    return {
      id: file.id,
      name: displayName,
      mimeType: file.mimeType,
      thumbnailLink: file.thumbnailLink || "",
      webContentLink: file.webContentLink || "",
      size: sizeFormatted,
      createdTime: file.createdTime ? file.createdTime.split("T")[0] : "Unknown",
      modifiedTime: file.modifiedTime
        ? file.modifiedTime.split("T")[0]
        : file.createdTime
        ? file.createdTime.split("T")[0]
        : "",
    };
  });

  const lastSyncedAt = new Date().toISOString();
  await replaceProjectPhotos(projectId, mappedPhotos);
  await updateProjectSync(projectId, mappedPhotos.length, lastSyncedAt);

  return {
    success: true,
    photoCount: mappedPhotos.length,
    foldersScanned: totalFoldersScanned,
    driveFoldersCount: folders.length,
    maxDepthReached: totalMaxDepth,
    nonImageFilesSkipped: totalNonImageSkipped,
    foldersSkipped: totalFoldersSkipped,
    rootStrategy,
    isSharedDrive,
    sharedDriveName,
    filteredStats,
    debug: folderErrors.length > 0 ? folderErrors.join("; ") : undefined,
    lastSyncedAt,
  };
}
