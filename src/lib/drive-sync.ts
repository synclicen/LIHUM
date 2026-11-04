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
  clearNeedsSync,
  getDriveSyncRefreshToken,
  getSetting,
  setSetting,
  type NewPhotoInput,
  type SyncDelta,
} from "@/lib/queries";
import { db } from "@/lib/db";

export interface SyncResult {
  success: boolean;
  photoCount: number;
  syncDelta?: SyncDelta;
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
  const syncDelta = await replaceProjectPhotos(projectId, mappedPhotos);

  // Skip the lastSyncedAt write when nothing changed. Even though auto-sync
  // has been removed from the frontend, admins can still hit "Sinkron Drive"
  // repeatedly — this skip ensures a no-op manual sync costs 0 D1 writes.
  if (syncDelta.upserted > 0 || syncDelta.deleted > 0) {
    await updateProjectSync(projectId, mappedPhotos.length, lastSyncedAt);
    console.log(`[Sync] Project ${projectId}: ${syncDelta.upserted} upserted, ${syncDelta.deleted} deleted, ${syncDelta.unchanged} unchanged — updated lastSyncedAt`);
  } else {
    console.log(`[Sync] Project ${projectId}: 0 changes (${syncDelta.unchanged} unchanged) — SKIPPED write`);
  }

  // Always clear the needsSync flag after a sync attempt — whether or not
  // there were changes. The webhook may have fired (set needsSync=1), and we
  // just confirmed the current state. Clearing prevents re-syncing the same
  // notification on the next 60s check.
  await clearNeedsSync(projectId);

  return {
    success: true,
    photoCount: mappedPhotos.length,
    syncDelta,
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

// ===========================================================================
// Visitor Photo → Google Drive sync (LIHUM → Drive direction)
//
// Visitors upload photos via /upload; those photos are stored as base64 data
// URLs in the Photo.visitorData column. This module periodically uploads them
// to the project's Google Drive folder (so D1 storage doesn't fill up) and
// clears visitorData after a successful upload.
//
// Auth: the admin's Firebase refresh token is stored in D1 (key
// `drive_sync_refresh_token`). It is exchanged for a short-lived (1h) Google
// OAuth access token via Firebase's securetoken endpoint. Firebase Auth
// tokens ARE Google OAuth tokens, so the resulting access token works with
// the Drive API directly — no client_id / client_secret required.
// ===========================================================================

const FIREBASE_API_KEY = "AIzaSyAC_DfA1kfZhDn8DcHcJdl4edM3J52Gt-I";
const LAST_DRIVE_SYNC_KEY = "last_drive_sync";

/** Visitor-photo sync result returned by `syncVisitorPhotosToDrive()`. */
export interface VisitorPhotoSyncResult {
  synced: number;
  failed: number;
  remaining: number;
}

/**
 * Exchanges a Firebase refresh token for a short-lived Google OAuth access
 * token (valid ~1 hour). Firebase Auth tokens are Google OAuth tokens under
 * the hood, so the returned access_token works with the Drive API.
 *
 * Endpoint: https://securetoken.googleapis.com/v1/token?key=<API_KEY>
 * Body:    grant_type=refresh_token&refresh_token=<token>
 */
export async function exchangeRefreshTokenForAccessToken(
  refreshToken: string
): Promise<string> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
  const res = await fetch(
    `https://securetoken.googleapis.com/v1/token?key=${FIREBASE_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    }
  );
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(
      `Failed to exchange refresh token: HTTP ${res.status} — ${errText.slice(0, 200)}`
    );
  }
  const data = (await res.json()) as { access_token?: string };
  if (!data.access_token) {
    throw new Error("securetoken response missing access_token field");
  }
  return data.access_token;
}

export interface DriveUploadResult {
  fileId: string;
  thumbnailLink: string;
  webContentLink: string;
}

/**
 * Uploads a single photo (base64-encoded) to a Drive folder using multipart
 * upload. Returns the Drive file metadata on success, or null on failure.
 *
 * Endpoint:
 *   https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart
 *
 * Body layout (multipart/related):
 *   --BOUNDARY\r\n
 *   Content-Type: application/json; charset=UTF-8\r\n\r\n
 *   {"name":"file.jpg","parents":["FOLDER_ID"]}\r\n
 *   --BOUNDARY\r\n
 *   Content-Type: image/jpeg\r\n\r\n
 *   <binary image bytes>\r\n
 *   --BOUNDARY--\r\n
 */
export async function uploadPhotoToDrive(
  accessToken: string,
  folderId: string,
  fileName: string,
  base64Data: string,
  mimeType: string
): Promise<DriveUploadResult | null> {
  // Decode base64 → binary. `atob` is a Web Standard available on Workers.
  const binaryString = atob(base64Data);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  const boundary =
    "lihum-" + Math.random().toString(36).slice(2) + "-" + Date.now();
  const metadata = JSON.stringify({ name: fileName, parents: [folderId] });

  // Build the multipart body by concatenating Uint8Array parts. Using
  // TextEncoder ensures correct UTF-8 encoding of the textual frame parts.
  const enc = new TextEncoder();
  const parts: Uint8Array[] = [
    enc.encode(
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`
    ),
    enc.encode(metadata),
    enc.encode(`\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`),
    bytes,
    enc.encode(`\r\n--${boundary}--\r\n`),
  ];
  const totalLength = parts.reduce((sum, p) => sum + p.length, 0);
  const body = new Uint8Array(totalLength);
  let offset = 0;
  for (const p of parts) {
    body.set(p, offset);
    offset += p.length;
  }

  const res = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,thumbnailLink,webContentLink",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body,
    }
  );

  if (!res.ok) {
    const errText = await res.text();
    console.error(
      `[DriveSync] Upload failed for "${fileName}" → HTTP ${res.status}: ${errText.slice(0, 200)}`
    );
    return null;
  }

  const data = (await res.json()) as {
    id?: string;
    thumbnailLink?: string;
    webContentLink?: string;
  };
  if (!data.id) {
    console.error(
      `[DriveSync] Upload returned no file id for "${fileName}"`
    );
    return null;
  }

  return {
    fileId: String(data.id),
    thumbnailLink: String(data.thumbnailLink ?? ""),
    webContentLink: String(data.webContentLink ?? ""),
  };
}

/**
 * Parses a visitorData data URL into { mimeType, base64 }.
 * Format: "data:image/jpeg;base64,<base64>"
 * Returns null if the format is invalid.
 */
function parseVisitorData(
  visitorData: string
): { mimeType: string; base64: string } | null {
  const match = visitorData.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  return { mimeType: match[1], base64: match[2] };
}

interface PendingVisitorPhoto {
  id: string;
  name: string;
  mimeType: string;
  visitorData: string;
  projectId: string;
  driveFolderId: string;
}

/**
 * Main sync routine. Fetches pending visitor photos (those with visitorData
 * set, whose parent project has a Drive folder configured), uploads each to
 * the project's Drive folder, and on success sets `thumbnailLink` /
 * `webContentLink` from the Drive response and CLEARS `visitorData` to free
 * up D1 storage.
 *
 * The photo's id (the local `visitor_<ts>_<i>_<rand>` UUID) is intentionally
 * NOT changed — the gallery view, /api/visitor-photo endpoint, and any
 * external share links continue to reference the same row. After sync the
 * gallery shows the Drive-hosted thumbnailLink directly (no DB hit).
 *
 * Defaults to 5 photos per call to stay within the Cloudflare Worker CPU
 * limit (~10s wall time). Call this endpoint repeatedly to drain a backlog.
 *
 * Returns a summary: { synced, failed, remaining }.
 */
export async function syncVisitorPhotosToDrive(
  limit = 5
): Promise<VisitorPhotoSyncResult> {
  // 1. Refresh token must be configured.
  const refreshToken = await getDriveSyncRefreshToken();
  if (!refreshToken) {
    // Nothing to do — admin hasn't connected their Google account.
    return { synced: 0, failed: 0, remaining: 0 };
  }

  // 2. Fetch pending visitor photos. We JOIN Project so we only pick photos
  //    whose gallery has a Drive folder to upload into. After sync,
  //    visitorData is cleared so the row no longer matches this query.
  const pendingRes = await db.execute({
    sql: `SELECT p.id, p.name, p.mimeType, p.visitorData, p.projectId,
                 proj.driveFolderId
          FROM Photo p
          JOIN Project proj ON proj.id = p.projectId
          WHERE p.visitorData != ''
            AND proj.driveFolderId != ''
          ORDER BY p.createdTime ASC
          LIMIT ?`,
    args: [limit],
  });

  const pending = pendingRes.rows as unknown as PendingVisitorPhoto[];
  if (pending.length === 0) {
    // Still record the sync attempt so the admin UI's "last sync" updates.
    await setSetting(LAST_DRIVE_SYNC_KEY, new Date().toISOString());
    return { synced: 0, failed: 0, remaining: 0 };
  }

  // 3. Exchange refresh token for short-lived access token.
  let accessToken: string;
  try {
    accessToken = await exchangeRefreshTokenForAccessToken(refreshToken);
  } catch (err: any) {
    console.error(
      `[DriveSync] Failed to obtain access token: ${err?.message || err}`
    );
    // Don't write last_sync — the sync didn't actually run. Admin can see
    // the same error in Worker logs (Cloudflare dashboard).
    return { synced: 0, failed: 0, remaining: pending.length };
  }

  // 4. Upload each pending photo. Continue on individual failure so one
  //    bad photo (e.g. invalid base64, transient Drive 5xx) doesn't block
  //    the rest of the batch.
  let synced = 0;
  let failed = 0;
  for (const photo of pending) {
    const parsed = parseVisitorData(photo.visitorData);
    if (!parsed) {
      console.warn(
        `[DriveSync] Photo ${photo.id} has invalid visitorData format — skipping`
      );
      failed++;
      continue;
    }

    // Use the stored display name if present, else a sane fallback.
    const fileName =
      photo.name && photo.name.trim().length > 0
        ? photo.name
        : `visitor-${photo.id}.jpg`;

    const result = await uploadPhotoToDrive(
      accessToken,
      photo.driveFolderId,
      fileName,
      parsed.base64,
      parsed.mimeType
    );

    if (!result) {
      failed++;
      continue;
    }

    // 5. On success: store Drive links + clear visitorData. We do NOT touch
    //    the row's id, mimeType, or any other column — those are already
    //    correct from the original visitor-upload insert.
    try {
      await db.execute({
        sql: `UPDATE Photo
              SET thumbnailLink = ?, webContentLink = ?, visitorData = ''
              WHERE id = ? AND projectId = ?`,
        args: [
          result.thumbnailLink,
          result.webContentLink,
          photo.id,
          photo.projectId,
        ],
      });
      synced++;
      console.log(
        `[DriveSync] Uploaded ${photo.id} → Drive file ${result.fileId}`
      );
    } catch (err: any) {
      // Photo was uploaded to Drive but the DB update failed. Log loudly —
      // this needs manual attention (otherwise re-running sync would
      // duplicate the file on Drive on the next pass, since visitorData
      // is still set).
      console.error(
        `[DriveSync] Drive upload succeeded for ${photo.id} (Drive id ${result.fileId}) but DB update failed: ${err?.message || err}`
      );
      failed++;
    }
  }

  // 6. Count remaining pending photos (across the whole table, not just
  //    this batch) for the response.
  const remainingRes = await db.execute(
    "SELECT COUNT(*) AS c FROM Photo WHERE visitorData != ''"
  );
  const remaining = Number(
    (remainingRes.rows[0] as Record<string, unknown>)?.c ?? 0
  );

  await setSetting(LAST_DRIVE_SYNC_KEY, new Date().toISOString());

  return { synced, failed, remaining };
}

/**
 * Returns the visitor-photo → Drive sync status for the admin UI:
 *   - pending: count of photos still holding base64 in D1 (visitorData != '')
 *   - refreshConnected: whether an admin refresh token is stored
 *   - lastSyncAt: ISO timestamp of the last sync attempt (or '')
 *
 * Used by GET /api/settings/drive-sync.
 */
export async function getDriveSyncStatus(): Promise<{
  pending: number;
  refreshConnected: boolean;
  lastSyncAt: string;
}> {
  const [countRes, token, lastSyncAt] = await Promise.all([
    db.execute("SELECT COUNT(*) AS c FROM Photo WHERE visitorData != ''"),
    getDriveSyncRefreshToken(),
    getSetting(LAST_DRIVE_SYNC_KEY),
  ]);
  return {
    pending: Number((countRes.rows[0] as Record<string, unknown>)?.c ?? 0),
    refreshConnected: !!token,
    lastSyncAt: lastSyncAt || "",
  };
}
