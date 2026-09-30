import { NextRequest, NextResponse } from "next/server";
import { ensureSeed } from "@/lib/lihum";
import { findProjectById, addPendingUpload } from "@/lib/queries";
import {
  getServiceAccount,
  getServiceAccountAccessToken,
  isServiceAccountConfigured,
  DRIVE_SCOPE,
} from "@/lib/google-service-account";
import { syncProjectWithToken } from "@/lib/drive-sync";

// POST /api/projects/:id/upload
//
// "Upload Mandiri" — visitors upload photos directly to a gallery.
//
// Two modes (auto-selected based on whether a Google Service Account is
// configured via the GOOGLE_SERVICE_ACCOUNT env var):
//
//   A) Service Account mode (Option A — the requested design):
//      Worker uploads each photo to the project's Google Drive folder using
//      the service account's access token (RS256 JWT exchange). The service
//      account email must be added as an Editor on the folder. After all
//      uploads succeed, the gallery is auto-synced so the new photos appear
//      immediately. Visitors do NOT need to log in.
//
//   B) Fallback (pending) mode — when no service account is configured:
//      Photos are stored in the PendingUpload table. The admin can review,
//      download, and clear them from the Admin Panel. This makes the feature
//      usable immediately, before the one-time service account setup.
//
// Rate limiting: max 5 photos per request, and max ~15 photos per IP per
// 10 minutes (best-effort, in-memory — see rateLimiter).

const MAX_PHOTOS = 5;
const MAX_BYTES_PER_PHOTO = 8 * 1024 * 1024; // 8MB after base64 (≈6MB raw)

// ── Best-effort in-memory rate limiter (per uploader IP) ──
// Workers isolates are short-lived, so this is a soft limit, not a hard guarantee.
const ipBuckets = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const RATE_LIMIT_MAX = 15; // max uploads per IP per window

function checkRateLimit(ip: string): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const bucket = ipBuckets.get(ip);
  if (!bucket || bucket.resetAt < now) {
    ipBuckets.set(ip, { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return { allowed: true, remaining: RATE_LIMIT_MAX };
  }
  if (bucket.count >= RATE_LIMIT_MAX) {
    return { allowed: false, remaining: 0 };
  }
  return { allowed: true, remaining: RATE_LIMIT_MAX - bucket.count };
}

function incrementRateLimit(ip: string, by: number) {
  const now = Date.now();
  const bucket = ipBuckets.get(ip);
  if (!bucket || bucket.resetAt < now) {
    ipBuckets.set(ip, { count: by, resetAt: now + RATE_LIMIT_WINDOW_MS });
  } else {
    bucket.count += by;
  }
}

function getClientIp(req: NextRequest): string {
  return (
    req.headers.get("cf-connecting-ip") ||
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

interface IncomingPhoto {
  base64Data: string;
  mimeType: string;
  fileName: string;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await ensureSeed();
  const { id } = await params;
  const project = await findProjectById(id);

  if (!project) {
    return NextResponse.json({ error: "Galeri tidak ditemukan." }, { status: 404 });
  }

  if (!project.allowVisitorUpload) {
    return NextResponse.json(
      { error: "Galeri ini tidak mengizinkan upload dari pengunjung." },
      { status: 403 }
    );
  }

  const clientIp = getClientIp(req);

  const body = await req.json().catch(() => null);
  if (!body || !Array.isArray(body.photos)) {
    return NextResponse.json({ error: "Format request tidak valid." }, { status: 400 });
  }
  const photos = body.photos as IncomingPhoto[];

  if (photos.length === 0) {
    return NextResponse.json({ error: "Tidak ada foto untuk diupload." }, { status: 400 });
  }
  if (photos.length > MAX_PHOTOS) {
    return NextResponse.json(
      { error: `Maksimal ${MAX_PHOTOS} foto per upload.` },
      { status: 400 }
    );
  }

  // Validate each photo
  for (let i = 0; i < photos.length; i++) {
    const p = photos[i];
    if (!p.base64Data || !p.mimeType || !p.fileName) {
      return NextResponse.json(
        { error: `Foto ke-${i + 1} tidak lengkap (base64Data/mimeType/fileName wajib).` },
        { status: 400 }
      );
    }
    if (!p.mimeType.startsWith("image/")) {
      return NextResponse.json(
        { error: `Foto ke-${i + 1} bukan file gambar.` },
        { status: 400 }
      );
    }
    // base64 string length ≈ 4/3 of raw bytes
    const approxBytes = Math.ceil((p.base64Data.length * 3) / 4);
    if (approxBytes > MAX_BYTES_PER_PHOTO) {
      return NextResponse.json(
        { error: `Foto "${p.fileName}" terlalu besar (maks ${MAX_BYTES_PER_PHOTO / (1024 * 1024)}MB).` },
        { status: 413 }
      );
    }
  }

  // ── Rate limit check ──
  const rl = checkRateLimit(clientIp);
  if (!rl.allowed) {
    return NextResponse.json(
      {
        error:
          "Anda telah mencapai batas upload. Silakan coba lagi beberapa menit lagi.",
      },
      { status: 429 }
    );
  }
  incrementRateLimit(clientIp, photos.length);

  const sa = getServiceAccount();
  const folderId = project.driveFolderId;
  const galleryName = project.name;

  // ── Mode A: Service Account → upload to Drive + auto-sync ──
  if (sa) {
    const results: { name: string; success: boolean; error?: string }[] = [];

    try {
      const accessToken = await getServiceAccountAccessToken(DRIVE_SCOPE);

      for (let i = 0; i < photos.length; i++) {
        const photo = photos[i];
        const ext = photo.fileName.match(/\.([^.]+)$/)?.[1] || "jpg";
        const cleanName = `${galleryName} - visitor-${Date.now()}-${i + 1}.${ext}`;

        try {
          // Multipart/related upload to Google Drive
          const boundary = "lihum_sa_boundary_" + Math.random().toString(36).slice(2);
          const metadata = JSON.stringify({
            name: cleanName,
            parents: [folderId],
          });
          const body =
            `--${boundary}\r\n` +
            `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
            `${metadata}\r\n` +
            `--${boundary}\r\n` +
            `Content-Type: ${photo.mimeType}\r\n\r\n` +
            `${photo.base64Data}\r\n` +
            `--${boundary}--`;

          const uploadRes = await fetch(
            "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true",
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": `multipart/related; boundary=${boundary}`,
              },
              body,
            }
          );

          if (uploadRes.ok) {
            results.push({ name: cleanName, success: true });
          } else {
            const errText = await uploadRes.text();
            results.push({
              name: cleanName,
              success: false,
              error: `Drive API HTTP ${uploadRes.status}: ${errText.slice(0, 120)}`,
            });
          }
        } catch (err: any) {
          results.push({
            name: cleanName,
            success: false,
            error: err?.message?.slice(0, 120) || "Unknown error",
          });
        }
      }

      const successCount = results.filter((r) => r.success).length;

      // Auto-sync the gallery so new photos appear immediately.
      let synced = false;
      if (successCount > 0) {
        try {
          const syncResult = await syncProjectWithToken(id, accessToken);
          synced = !!syncResult.success;
        } catch (syncErr) {
          console.warn("[Upload] Auto-sync failed (uploads still succeeded):", syncErr);
        }
      }

      return NextResponse.json({
        success: successCount > 0,
        mode: "service-account",
        uploaded: successCount,
        failed: results.length - successCount,
        results,
        synced,
        message:
          successCount > 0
            ? `${successCount} foto berhasil diupload${synced ? " dan galeri disinkronisasi" : ""}. Foto sudah tampil di galeri!`
            : "Gagal upload ke Google Drive. Pastikan email service account sudah diberi akses Editor ke folder.",
      });
    } catch (err: any) {
      console.error("[Upload] Service account flow error:", err);
      return NextResponse.json(
        {
          success: false,
          mode: "service-account",
          error: err?.message || "Service account error.",
        },
        { status: 500 }
      );
    }
  }

  // ── Mode B: Fallback → store in PendingUpload table ──
  const results: { name: string; success: boolean; error?: string }[] = [];
  let stored = 0;

  for (let i = 0; i < photos.length; i++) {
    const photo = photos[i];
    const ext = photo.fileName.match(/\.([^.]+)$/)?.[1] || "jpg";
    const cleanName = `${galleryName} - visitor-${Date.now()}-${i + 1}.${ext}`;
    const uploadId = `pu_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

    try {
      const approxBytes = Math.ceil((photo.base64Data.length * 3) / 4);
      await addPendingUpload({
        id: uploadId,
        projectId: id,
        fileName: cleanName,
        mimeType: photo.mimeType,
        base64Data: photo.base64Data,
        size: approxBytes,
        uploaderIp: clientIp,
        createdAt: new Date().toISOString(),
      });
      results.push({ name: cleanName, success: true });
      stored++;
    } catch (err: any) {
      results.push({
        name: cleanName,
        success: false,
        error: err?.message?.slice(0, 120) || "DB error",
      });
    }
  }

  return NextResponse.json({
    success: stored > 0,
    mode: "pending",
    uploaded: stored,
    failed: results.length - stored,
    results,
    message:
      stored > 0
        ? `${stored} foto berhasil dikirim! Foto akan ditinjau admin lalu ditambahkan ke galeri.`
        : "Gagal menyimpan foto. Silakan coba lagi.",
  });
}

// GET /api/projects/:id/upload — returns whether upload is enabled + mode.
// Used by the /upload page to render the correct UI (no secrets exposed).
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await ensureSeed();
  const { id } = await params;
  const project = await findProjectById(id);
  if (!project) {
    return NextResponse.json({ error: "Galeri tidak ditemukan." }, { status: 404 });
  }
  return NextResponse.json({
    id: project.id,
    name: project.name,
    allowVisitorUpload: !!project.allowVisitorUpload,
    mode: isServiceAccountConfigured() ? "service-account" : "pending",
    // Bump lastSyncedAt into the response so the upload page can show
    // "last synced" status without a separate call.
    lastSyncedAt: project.lastSyncedAt || "",
  });
}
