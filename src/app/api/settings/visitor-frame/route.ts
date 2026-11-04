import { NextRequest, NextResponse } from "next/server";
import { ensureSeed, getAccountRole } from "@/lib/lihum";
import {
  getVisitorFrameConfig,
  setVisitorFrameConfig,
} from "@/lib/queries";

// Max frame image size: 2MB base64 (a PNG frame is typically 100-500KB).
// This is small enough to store in D1 Setting + fast to download on mobile.
const MAX_FRAME_SIZE = 2 * 1024 * 1024;

/**
 * GET /api/settings/visitor-frame — Public endpoint.
 *
 * Returns the current visitor frame config. Called by the visitor upload
 * page (/upload) to fetch the frame overlay before compositing photos.
 *
 * Response: { enabled: boolean, frameImage: string }
 *   frameImage is a base64 data URL (e.g. "data:image/png;base64,...")
 *   or empty string if no frame is set.
 */
export async function GET() {
  await ensureSeed();
  const config = await getVisitorFrameConfig();
  return NextResponse.json(config);
}

/**
 * PUT /api/settings/visitor-frame — Admin/Manager only.
 *
 * Updates the visitor frame config. Body: { enabled, frameImage }.
 * When enabled=true, all visitor-uploaded photos get the frame composited
 * on top (client-side via canvas) before being uploaded.
 */
export async function PUT(req: NextRequest) {
  await ensureSeed();
  const userEmail = req.headers.get("x-user-email") || undefined;
  const role = await getAccountRole(userEmail);
  if (!role) {
    return NextResponse.json(
      { error: "Akses ditolak. Hanya admin/manager yang dapat mengubah pengaturan." },
      { status: 403 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const { enabled, frameImage } = body;

  if (typeof enabled !== "boolean") {
    return NextResponse.json(
      { error: "Field 'enabled' (boolean) wajib diisi." },
      { status: 400 }
    );
  }

  // Validate frameImage if provided
  let cleanFrame = "";
  if (typeof frameImage === "string" && frameImage.length > 0) {
    // Must be a valid data URL for a PNG image
    if (!frameImage.startsWith("data:image/png;base64,")) {
      return NextResponse.json(
        { error: "Frame harus berupa PNG (data:image/png;base64,...)." },
        { status: 400 }
      );
    }
    if (frameImage.length > MAX_FRAME_SIZE) {
      return NextResponse.json(
        {
          error: `Frame terlalu besar (maks ${MAX_FRAME_SIZE / 1024}KB). Kompres PNG atau kurangi resolusi.`,
        },
        { status: 413 }
      );
    }
    cleanFrame = frameImage;
  }

  await setVisitorFrameConfig(enabled, cleanFrame);

  console.log(
    `[VisitorFrame] ${enabled ? "ENABLED" : "DISABLED"} by ${userEmail} — frame size: ${cleanFrame.length} chars`
  );

  return NextResponse.json({
    success: true,
    enabled,
    frameImage: cleanFrame,
  });
}
