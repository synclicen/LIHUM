import { NextRequest, NextResponse } from "next/server";
import { ensureSeed, getAccountRole } from "@/lib/lihum";
import { findProjectById } from "@/lib/queries";

// POST /api/projects/:id/upload
//
// Receives photos from visitors (via /upload page) and uploads them to
// the project's Google Drive folder. Uses admin's OAuth token (passed
// via Authorization header) OR a stored service account token.
//
// Since visitors don't have admin OAuth tokens, we use a different approach:
// The /upload page opens a Google Drive picker or uses a simple form that
// uploads directly to Google Drive via their own Google account (if logged in),
// OR we accept the photo as base64 and upload via the Worker using a
// pre-configured service account.
//
// For simplicity and to avoid needing a service account setup, this route
// accepts base64-encoded photos and stores them temporarily in the DB
// as "pending uploads". Admin can then approve and sync them to Drive.
//
// However, the most practical approach for free tier is:
// Upload directly to Google Drive via the visitor's own Google account
// (Google Identity + Drive API in the browser).
//
// This API route handles the simpler case: admin provides their token
// via the /upload page which has a Google sign-in button.

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await ensureSeed();
  const { id } = await params;
  const project = await findProjectById(id);

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  if (!project.allowVisitorUpload) {
    return NextResponse.json(
      { error: "Galeri ini tidak mengizinkan upload dari pengunjung." },
      { status: 403 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const { photos, accessToken } = body;

  if (!accessToken) {
    return NextResponse.json(
      { error: "Token Google diperlukan untuk upload. Silakan login Google terlebih dahulu." },
      { status: 401 }
    );
  }

  if (!photos || !Array.isArray(photos) || photos.length === 0) {
    return NextResponse.json({ error: "Tidak ada foto untuk diupload." }, { status: 400 });
  }

  if (photos.length > 5) {
    return NextResponse.json(
      { error: "Maksimal 5 foto per upload." },
      { status: 400 }
    );
  }

  const folderId = project.driveFolderId;
  const galleryName = project.name;

  const results: { name: string; success: boolean; error?: string }[] = [];

  for (let i = 0; i < photos.length; i++) {
    const photo = photos[i];
    const { base64Data, mimeType, fileName } = photo;

    if (!base64Data || !mimeType || !fileName) {
      results.push({ name: fileName || `photo_${i + 1}`, success: false, error: "Data tidak lengkap" });
      continue;
    }

    // Generate clean filename: Gallery Name - visitor-001.jpg
    const ext = fileName.match(/\.([^.]+)$/)?.[1] || "jpg";
    const cleanName = `${galleryName} - visitor-${Date.now()}-${i + 1}.${ext}`;

    try {
      // Upload to Google Drive using visitor's own Google OAuth token
      // (they signed in via Google on the /upload page)
      const uploadResponse = await fetch(
        "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "multipart/related; boundary=lihum_boundary",
          },
          body: `--lihum_boundary\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({
            name: cleanName,
            parents: [folderId],
          })}\r\n--lihum_boundary\r\nContent-Type: ${mimeType}\r\n\r\n${base64Data}\r\n--lihum_boundary--`,
        }
      );

      if (uploadResponse.ok) {
        results.push({ name: cleanName, success: true });
      } else {
        const errText = await uploadResponse.text();
        results.push({ name: cleanName, success: false, error: `Drive API error: ${errText.slice(0, 100)}` });
      }
    } catch (err: any) {
      results.push({ name: cleanName, success: false, error: err.message?.slice(0, 100) });
    }
  }

  const successCount = results.filter((r) => r.success).length;

  // Trigger sync if any uploads succeeded
  // (The sync will be triggered by the admin's auto-sync or manually)
  // We don't auto-sync here to avoid needing admin's token.

  return NextResponse.json({
    success: successCount > 0,
    uploaded: successCount,
    failed: results.length - successCount,
    results,
    message: successCount > 0
      ? `${successCount} foto berhasil diupload! Foto akan muncul di galeri setelah admin sinkron.`
      : "Gagal upload. Pastikan Anda login dengan Google yang punya akses ke folder Drive.",
  });
}
