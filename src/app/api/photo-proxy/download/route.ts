import { NextRequest, NextResponse } from "next/server";
import { findPhotoById, incrementProjectDownloads } from "@/lib/queries";
import { ensureSeed, getAccountRole } from "@/lib/lihum";

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
//
// HIGH-TRAFFIC OPTIMIZATION: For non-admin visitors, we REDIRECT (302) to
// Google Drive's download URL instead of streaming through the Worker.
// This saves Worker CPU + bandwidth — critical for events like wisuda where
// 20K visitors may download photos. Admins still get the streaming path
// (with custom filenames) since they're low-volume.

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

  // Real Google Drive photo — check if requester is admin.
  // Non-admins get a 302 redirect to Google Drive directly (saves Worker CPU).
  // Admins get the streaming path (custom filename, reliable for management).
  await ensureSeed();
  const userEmail = req.headers.get("x-user-email") || undefined;
  const role = await getAccountRole(userEmail);

  // Look up the photo to get webContentLink + projectId (for counter).
  const photo = await findPhotoById(fileId);

  // ── Non-admin path: redirect directly to Google Drive ──
  // This is the high-traffic path. 302 redirect = 1 Worker request, no
  // streaming, no CPU. Browser downloads directly from Google's servers.
  if (role === null) {
    // Increment download counter (fire-and-forget).
    if (photo && photo.projectId) {
      incrementProjectDownloads(photo.projectId).catch(() => {});
    }
    // Redirect to Google's download URL. Filename will be Google's default
    // (the file ID), but the download works reliably without Worker load.
    const downloadUrl =
      photo?.webContentLink ||
      `https://drive.google.com/uc?export=download&id=${fileId}`;
    return NextResponse.redirect(downloadUrl, {
      status: 302,
      headers: { "Cache-Control": CACHE_7_DAYS },
    });
  }

  // ── Admin path: stream through Worker with custom filename ──
  // Admins are low-volume, so the CPU cost is acceptable. They get
  // properly named files (useful for bulk download/management).
  try {
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
