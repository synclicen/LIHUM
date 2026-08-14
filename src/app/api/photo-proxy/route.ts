import { NextRequest, NextResponse } from "next/server";
import { findPhotoById } from "@/lib/queries";

// GET /api/photo-proxy?id=FILE_ID&size=full|thumb
//
// OPTIMIZATION: Instead of fetching the image through the Worker (which
// counts as a Worker request + subrequest per image), we REDIRECT to the
// Google Drive thumbnail URL directly. The browser then fetches the image
// from Google's servers — ZERO Worker invocations for the actual image bytes.
//
// This is critical for free-tier Cloudflare Workers: a gallery with 1700
// photos previously caused 1700 Worker requests per page view. With redirects,
// it's only 1 Worker request per photo (the redirect itself, which is cached
// by the browser for 7 days — so repeat views are 0 Worker requests).
//
// The redirect response includes a 7-day cache header so the browser caches
// the redirect itself, eliminating even the redirect request on repeat views.

const CACHE_7_DAYS = "public, max-age=604800, s-maxage=604800";

export async function GET(req: NextRequest) {
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
      return NextResponse.redirect(sample.thumbnailLink, {
        headers: { "Cache-Control": CACHE_7_DAYS },
      });
    }
  }

  // Real Google Drive photo → redirect directly to Google's thumbnail endpoint.
  // Browser fetches the image from Google, NOT through the Worker.
  // This saves 1 subrequest (fetch to Google) per image — massive savings
  // when thousands of visitors load 1700+ thumbnails.
  const googleThumbUrl = `https://drive.google.com/thumbnail?id=${fileId}&sz=${size}`;

  return NextResponse.redirect(googleThumbUrl, {
    status: 302,
    headers: {
      "Cache-Control": CACHE_7_DAYS,
    },
  });
}
