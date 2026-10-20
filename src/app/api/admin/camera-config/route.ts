import { NextRequest, NextResponse } from "next/server";
import { ensureSeed, getAccountRole } from "@/lib/lihum";
import { getCameraConfig, setCameraConfig, type CameraConfig } from "@/lib/queries";

// GET /api/admin/camera-config
// Returns the global camera config (admin only).
export async function GET(req: NextRequest) {
  await ensureSeed();
  const userEmail = req.headers.get("x-user-email") || undefined;
  const role = await getAccountRole(userEmail);
  if (!role) {
    return NextResponse.json(
      { error: "Akses ditolak. Fitur admin only." },
      { status: 403 }
    );
  }
  const config = await getCameraConfig();
  return NextResponse.json(config);
}

// PUT /api/admin/camera-config
// Saves the global camera config (admin only). Body: partial CameraConfig.
export async function PUT(req: NextRequest) {
  await ensureSeed();
  const userEmail = req.headers.get("x-user-email") || undefined;
  const role = await getAccountRole(userEmail);
  if (!role) {
    return NextResponse.json(
      { error: "Akses ditolak. Fitur admin only." },
      { status: 403 }
    );
  }
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json(
      { error: "Body harus berupa objek konfigurasi kamera." },
      { status: 400 }
    );
  }
  const current = await getCameraConfig();
  const updated: CameraConfig = {
    filter: typeof body.filter === "string" ? body.filter : current.filter,
    aspectRatio:
      typeof body.aspectRatio === "string" ? body.aspectRatio : current.aspectRatio,
    resolution:
      typeof body.resolution === "string" ? body.resolution : current.resolution,
    countdown:
      typeof body.countdown === "number" ? body.countdown : current.countdown,
    mirror: typeof body.mirror === "boolean" ? body.mirror : current.mirror,
    facing: body.facing === "user" ? "user" : "environment",
    maxPhotos:
      typeof body.maxPhotos === "number" && body.maxPhotos > 0
        ? Math.min(body.maxPhotos, 20)
        : current.maxPhotos,
  };
  await setCameraConfig(updated);
  return NextResponse.json({
    success: true,
    config: updated,
    message: "Pengaturan kamera global disimpan. Berlaku untuk semua galeri dengan Upload Mandiri aktif.",
  });
}
