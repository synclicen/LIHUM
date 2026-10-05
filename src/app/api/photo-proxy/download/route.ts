import { NextRequest, NextResponse } from "next/server";
import { findPhotoById, incrementProjectDownloads } from "@/lib/queries";

// GET /api/photo-proxy/download?id=FILE_ID&name=FILENAME
//
// Streams the file from Google Drive through our Worker with a custom
// Content-Disposition header so the file saves with our clean name.
//
// Uses multiple strategies to get the actual file from Google Drive:
// 1. webContentLink (stored in DB during sync) — most reliable
// 2. uc?export=download with redirect:follow
// 3. Fallback: redirect to Google Drive (filename = Google's default)
//
// On every successful download, increments the parent gallery's downloadCount.

const CACHE_7_DAYS = "public, max-age=604800, s-maxage=604800";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const fileId = searchParams.get("id") || "";
  const fileName = searchParams.get("name") || "photo.jpg";

  if (!fileId) {
    return new NextResponse("Missing file id", { status: 400 });
  }

  // Use RFC 5987 encoding for filenames with special characters
  const encodedName = encodeURIComponent(fileName).replace(/'/g, "%27");

  // Sample mock photo → fetch from Unsplash
  if (fileId.startsWith("sample-")) {
    const sample = await findPhotoById(fileId);
    if (sample && sample.webContentLink) {
      try {
        const response = await fetch(sample.webContentLink, { redirect: "follow" });
        if (response.ok) {
          // Increment download counter (fire-and-forget)
          if (sample.projectId) {
            incrementProjectDownloads(sample.projectId).catch(() => {});
          }
          return new NextResponse(response.body, {
            status: 200,
            headers: {
              "Content-Disposition": `attachment; filename*=UTF-8''${encodedName}`,
              "Content-Type": response.headers.get("content-type") || "image/jpeg",
              "Cache-Control": CACHE_7_DAYS,
            },
          });
        }
      } catch {
        /* fall through */
      }
      return NextResponse.redirect(sample.webContentLink, {
        headers: { "Cache-Control": CACHE_7_DAYS },
      });
    }
  }

  // Real Google Drive photo — try multiple strategies to get the file.
  try {
    // Strategy 1: Use webContentLink from DB (most reliable for shared files)
    const photo = await findPhotoById(fileId);
    const urlsToTry: string[] = [];

    if (photo) {
      if (photo.webContentLink) {
        urlsToTry.push(photo.webContentLink);
      }
    }
    // Strategy 2: uc?export=download (follows redirects)
    urlsToTry.push(`https://drive.google.com/uc?export=download&id=${fileId}`);
    // Strategy 3: thumbnail endpoint with full size (w1600)
    urlsToTry.push(`https://drive.google.com/thumbnail?id=${fileId}&sz=w1600`);

    for (const url of urlsToTry) {
      try {
        const response = await fetch(url, { redirect: "follow" });
        if (response.ok) {
          const contentType = response.headers.get("content-type") || "";
          // Make sure we got an actual image, not an HTML confirmation page
          if (contentType.startsWith("image/") ||
              contentType.startsWith("application/octet-stream") ||
              contentType.startsWith("application/binary")) {
            // Increment download counter (fire-and-forget, only on real success)
            if (photo && photo.projectId) {
              incrementProjectDownloads(photo.projectId).catch(() => {});
            }
            return new NextResponse(response.body, {
              status: 200,
              headers: {
                "Content-Disposition": `attachment; filename*=UTF-8''${encodedName}`,
                "Content-Type": contentType || "image/jpeg",
                "Content-Length": response.headers.get("content-length") || "",
                "Cache-Control": CACHE_7_DAYS,
              },
            });
          }
        }
      } catch (err) {
        console.warn(`[Download] Strategy failed for ${fileId} (${url}):`, err);
      }
    }

    // All strategies failed — redirect as fallback.
    // Still count as a download attempt since the user clicked download
    // (the browser will fetch directly from Google Drive).
    if (photo && photo.projectId) {
      incrementProjectDownloads(photo.projectId).catch(() => {});
    }
    return NextResponse.redirect(
      `https://drive.google.com/uc?export=download&id=${fileId}`,
      {
        status: 302,
        headers: { "Cache-Control": CACHE_7_DAYS },
      }
    );
  } catch (error) {
    console.error("Download Error:", error);
    return new NextResponse("Gagal mengunduh file.", { status: 500 });
  }
}
