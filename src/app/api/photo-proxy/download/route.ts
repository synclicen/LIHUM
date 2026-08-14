import { NextRequest, NextResponse } from "next/server";
import { findPhotoById } from "@/lib/queries";

// GET /api/photo-proxy/download?id=FILE_ID&name=FILENAME
//
// OPTIMIZATION: Redirect directly to Google Drive's download URL instead of
// proxying the file through the Worker. This saves a subrequest per download
// and avoids streaming large file bytes through the Worker (which counts
// against CPU time limits on free tier).
//
// For sample photos (Unsplash), redirect to their webContentLink.
// For real Drive photos, redirect to Google's download endpoint.

const CACHE_7_DAYS = "public, max-age=604800, s-maxage=604800";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const fileId = searchParams.get("id") || "";
  const fileName = searchParams.get("name") || "photo.jpg";

  if (!fileId) {
    return new NextResponse("Missing file id", { status: 400 });
  }

  // Sample mock photo → redirect to Unsplash
  if (fileId.startsWith("sample-")) {
    const sample = await findPhotoById(fileId);
    if (sample && sample.webContentLink) {
      return NextResponse.redirect(sample.webContentLink, {
        headers: { "Cache-Control": CACHE_7_DAYS },
      });
    }
  }

  // Real Google Drive photo → redirect directly to Google's download endpoint.
  // Browser handles the download directly from Google's servers.
  const driveDownloadUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;

  return NextResponse.redirect(driveDownloadUrl, {
    status: 302,
    headers: {
      "Cache-Control": CACHE_7_DAYS,
    },
  });
}
