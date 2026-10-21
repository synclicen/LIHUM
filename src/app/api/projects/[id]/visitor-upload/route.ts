import { NextRequest, NextResponse } from "next/server";
import { ensureSeed } from "@/lib/lihum";
import {
  findProjectById,
  addPendingUpload,
  countPendingUploads,
} from "@/lib/queries";

// POST /api/projects/:id/visitor-upload
//
// "Upload Mandiri" — visitors upload photos directly to a galeri (no login
// required). Photos are stored as base64 in the PendingUpload table for
// admin review. Admin downloads them and manually adds to the Drive folder,
// or deletes (rejects).
//
// Rate limited: max 5 photos per request, max ~15 photos per IP per 10 min.
// Photos are expected to be pre-resized client-side (max 1600px, JPEG 0.8).

const MAX_PHOTOS = 5;
const MAX_BYTES_PER_PHOTO = 6 * 1024 * 1024; // 6MB base64 (≈4.5MB raw)

// ── Best-effort in-memory rate limiter (per uploader IP) ──
// Workers isolates are short-lived, so this is a soft limit.
const ipBuckets = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX = 15;

function checkRateLimit(ip: string): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const bucket = ipBuckets.get(ip);
  if (!bucket || bucket.resetAt < now) {
    ipBuckets.set(ip, { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return { allowed: true, remaining: RATE_LIMIT_MAX };
  }
  if (bucket.count >= RATE_LIMIT_MAX) return { allowed: false, remaining: 0 };
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

// GET /api/projects/:id/visitor-upload
// Returns whether visitor upload is enabled + gallery name (public, no auth).
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
    pendingCount: await countPendingUploads(id),
  });
}

// POST /api/projects/:id/visitor-upload
// Public endpoint — visitors submit photos (base64, pre-resized client-side).
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
    const approxBytes = Math.ceil((p.base64Data.length * 3) / 4);
    if (approxBytes > MAX_BYTES_PER_PHOTO) {
      return NextResponse.json(
        { error: `Foto "${p.fileName}" terlalu besar (maks ${MAX_BYTES_PER_PHOTO / (1024 * 1024)}MB).` },
        { status: 413 }
      );
    }
  }

  // Rate limit check
  const rl = checkRateLimit(clientIp);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Anda telah mencapai batas upload. Silakan coba lagi beberapa menit lagi." },
      { status: 429 }
    );
  }
  incrementRateLimit(clientIp, photos.length);

  const galleryName = project.name;
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
    uploaded: stored,
    failed: results.length - stored,
    results,
    message:
      stored > 0
        ? `${stored} foto berhasil dikirim! Foto akan ditinjau admin lalu ditambahkan ke galeri.`
        : "Gagal menyimpan foto. Silakan coba lagi.",
  });
}
