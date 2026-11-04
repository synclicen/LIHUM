import { NextRequest, NextResponse } from "next/server";
import { ensureSeed, getAccountRole } from "@/lib/lihum";
import {
  getCollageConfig,
  setCollageConfig,
} from "@/lib/queries";

// Max template size: 2MB base64 (PNG with transparent holes is typically
// 100-500KB even at high resolution).
const MAX_TEMPLATE_SIZE = 2 * 1024 * 1024;

/**
 * GET /api/settings/collage-template — Public endpoint.
 *
 * Returns the current collage template config. Called by the visitor /upload
 * page to fetch the template + detect how many photo slots it has.
 *
 * Response: { enabled, templateImage, fitMode }
 *   templateImage is a base64 data URL or empty string.
 *   fitMode is "fit" (contain, no crop) or "fill" (cover, crop).
 */
export async function GET() {
  await ensureSeed();
  const config = await getCollageConfig();
  return NextResponse.json(config);
}

/**
 * PUT /api/settings/collage-template — Admin/Manager only.
 *
 * Updates the collage template config. Body: { enabled, templateImage, fitMode }.
 *
 * When enabled=true, visitor uploads are composited into a collage:
 *   - Visitor takes N photos (where N = detected slot count from the PNG)
 *   - Photos are drawn into detected slots (with rotation support)
 *   - 1 composite JPEG is stored in the gallery
 *
 * fitMode controls how photos fill slots:
 *   "fit"  = contain (entire photo visible, may have black borders)
 *   "fill" = cover (fill entire slot, may crop)
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
  const { enabled, templateImage, fitMode } = body;

  if (typeof enabled !== "boolean") {
    return NextResponse.json(
      { error: "Field 'enabled' (boolean) wajib diisi." },
      { status: 400 }
    );
  }

  if (fitMode !== "fit" && fitMode !== "fill") {
    return NextResponse.json(
      { error: "Field 'fitMode' harus 'fit' atau 'fill'." },
      { status: 400 }
    );
  }

  // Validate templateImage if provided
  let cleanTemplate = "";
  if (typeof templateImage === "string" && templateImage.length > 0) {
    // Must be a valid data URL for a PNG image (transparency required for slots)
    if (!templateImage.startsWith("data:image/png;base64,")) {
      return NextResponse.json(
        { error: "Template harus berupa PNG dengan transparansi (data:image/png;base64,...)." },
        { status: 400 }
      );
    }
    if (templateImage.length > MAX_TEMPLATE_SIZE) {
      return NextResponse.json(
        {
          error: `Template terlalu besar (maks ${MAX_TEMPLATE_SIZE / 1024}KB). Kompres PNG atau kurangi resolusi.`,
        },
        { status: 413 }
      );
    }
    cleanTemplate = templateImage;
  }

  await setCollageConfig(enabled, cleanTemplate, fitMode);

  console.log(
    `[Collage] ${enabled ? "ENABLED" : "DISABLED"} by ${userEmail} — fitMode: ${fitMode}, size: ${cleanTemplate.length} chars`
  );

  return NextResponse.json({
    success: true,
    enabled,
    templateImage: cleanTemplate,
    fitMode,
  });
}
