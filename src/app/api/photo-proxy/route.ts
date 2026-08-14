import { NextRequest, NextResponse } from "next/server";
import { findPhotoById } from "@/lib/queries";

// GET /api/photo-proxy?id=FILE_ID&size=full|thumb
// High-reliability image proxy that bypasses CORS / auth barriers.
// Images are cached for 7 days (604800s) in the browser AND at the
// Cloudflare edge to dramatically reduce Worker invocations on repeat
// views — critical for free tier when thousands of visitors load
// thumbnails simultaneously.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const fileId = searchParams.get("id") || "";
  const size = searchParams.get("size") === "full" ? "w1600" : "w600";
  if (!fileId) {
    return new NextResponse("Missing file id", { status: 400 });
  }

  // Cache headers — 7 days browser + 7 days Cloudflare edge
  const CACHE_HEADERS = {
    "Content-Type": "image/jpeg",
    "Cache-Control": "public, max-age=604800, s-maxage=604800",
  };

  // Sample mock photo → redirect to its Unsplash thumbnail
  if (fileId.startsWith("sample-")) {
    const sample = await findPhotoById(fileId);
    if (sample && sample.thumbnailLink) {
      return NextResponse.redirect(sample.thumbnailLink, {
        headers: { "Cache-Control": "public, max-age=604800, s-maxage=604800" },
      });
    }
  }

  try {
    const googleThumbUrl = `https://drive.google.com/thumbnail?id=${fileId}&sz=${size}`;
    const response = await fetch(googleThumbUrl);
    if (response.ok) {
      const buffer = await response.arrayBuffer();
      return new NextResponse(Buffer.from(buffer), {
        status: 200,
        headers: {
          ...CACHE_HEADERS,
          "Content-Type": response.headers.get("content-type") || "image/jpeg",
        },
      });
    }

    // Secondary fallback
    const driveDownloadUrl = `https://drive.google.com/uc?export=view&id=${fileId}`;
    const dlResponse = await fetch(driveDownloadUrl);
    if (dlResponse.ok) {
      const buffer = await dlResponse.arrayBuffer();
      return new NextResponse(Buffer.from(buffer), {
        status: 200,
        headers: {
          ...CACHE_HEADERS,
          "Content-Type": dlResponse.headers.get("content-type") || "image/jpeg",
        },
      });
    }

    return new NextResponse(
      "Image not viewable. Ensure Drive file has link sharing turned on.",
      { status: 404 }
    );
  } catch (error) {
    console.error("Proxy Error:", error);
    return new NextResponse("Error loading image from Google Drive", { status: 500 });
  }
}
