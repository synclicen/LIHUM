import { NextRequest, NextResponse } from "next/server";
import { ensureSeed } from "@/lib/lihum";
import { findPhotoById } from "@/lib/queries";

// GET /api/photo-proxy?id=FILE_ID&size=full|thumb
// High-reliability image proxy that bypasses CORS / auth barriers.
export async function GET(req: NextRequest) {
  await ensureSeed();
  const { searchParams } = new URL(req.url);
  const fileId = searchParams.get("id") || "";
  const size = searchParams.get("size") === "full" ? "w1600" : "w600";
  if (!fileId) {
    return new NextResponse("Missing file id", { status: 400 });
  }

  // Sample mock photo → redirect to its Unsplash thumbnail
  if (fileId.startsWith("sample-")) {
    const sample = await findPhotoById(fileId);
    if (sample && sample.thumbnailLink) {
      return NextResponse.redirect(sample.thumbnailLink);
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
          "Content-Type": response.headers.get("content-type") || "image/jpeg",
          "Cache-Control": "public, max-age=86400",
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
