import { NextRequest, NextResponse } from "next/server";
import { findPhotoById } from "@/lib/queries";

// GET /api/photo-proxy/download?id=FILE_ID&name=FILENAME
//
// Streams the file from Google Drive through our Worker with a custom
// Content-Disposition header so the file saves with our clean name
// (e.g. "Lomba Hut RI Ke 81 - 001.jpg" instead of "IMG_0001.JPG").
//
// Uses Response streaming — the Worker just pipes the response body
// through without buffering the entire file in memory, keeping CPU
// time minimal for free tier compatibility.

const CACHE_7_DAYS = "public, max-age=604800, s-maxage=604800";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const fileId = searchParams.get("id") || "";
  const fileName = searchParams.get("name") || "photo.jpg";

  if (!fileId) {
    return new NextResponse("Missing file id", { status: 400 });
  }

  // Sample mock photo → fetch from Unsplash and stream with our filename
  if (fileId.startsWith("sample-")) {
    const sample = await findPhotoById(fileId);
    if (sample && sample.webContentLink) {
      try {
        const response = await fetch(sample.webContentLink);
        if (response.ok) {
          return new NextResponse(response.body, {
            status: 200,
            headers: {
              "Content-Disposition": `attachment; filename="${fileName}"`,
              "Content-Type": response.headers.get("content-type") || "image/jpeg",
              "Cache-Control": CACHE_7_DAYS,
            },
          });
        }
      } catch {
        /* fall through to redirect */
      }
      return NextResponse.redirect(sample.webContentLink, {
        headers: { "Cache-Control": CACHE_7_DAYS },
      });
    }
  }

  // Real Google Drive photo → fetch and stream with our clean filename.
  // This ensures the browser saves the file as "Gallery Name - 001.jpg"
  // instead of Google Drive's original filename.
  try {
    const driveDownloadUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;
    const response = await fetch(driveDownloadUrl);

    if (response.ok) {
      // Stream the response body through — no buffering, minimal CPU.
      return new NextResponse(response.body, {
        status: 200,
        headers: {
          "Content-Disposition": `attachment; filename="${fileName}"`,
          "Content-Type":
            response.headers.get("content-type") || "application/octet-stream",
          "Content-Length": response.headers.get("content-length") || "",
          "Cache-Control": CACHE_7_DAYS,
        },
      });
    }

    // Fallback: redirect (filename will be Google's default)
    return NextResponse.redirect(driveDownloadUrl, {
      status: 302,
      headers: { "Cache-Control": CACHE_7_DAYS },
    });
  } catch (error) {
    console.error("Download Error:", error);
    return new NextResponse("Gagal mengunduh file.", { status: 500 });
  }
}
