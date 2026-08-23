import { NextRequest, NextResponse } from "next/server";
import { ensureSeed, getAccountRole } from "@/lib/lihum";
import {
  findProjectById,
  setPhotoAiHidden,
  resetAiHidden,
  type PhotoRow,
} from "@/lib/queries";
import { db } from "@/lib/db";

// POST /api/projects/:id/ai-score
// Scores a single photo using VLM (Vision Language Model) and hides it
// if quality is too low. Client calls this repeatedly with delays.
//
// Input: { photoId: string }
// Output: { photoId, score, hidden, reason }
//
// This endpoint processes ONE photo per request to stay within Cloudflare
// Workers free tier limits (CPU time + request duration). The client-side
// AdminPanel controls the pace with 2-second delays between calls.

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await ensureSeed();
  const userEmail = req.headers.get("x-user-email") || undefined;
  const role = await getAccountRole(userEmail);
  if (!role) {
    return NextResponse.json(
      { error: "Akses ditolak. Hubungi Admin Utama untuk didaftarkan." },
      { status: 403 }
    );
  }

  const { id } = await params;
  const project = await findProjectById(id);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  // SERVER-SIDE LIMIT: reject if gallery has more than 200 photos.
  // This protects the Worker from excessive VLM API calls that could
  // exhaust free tier limits (100k requests/day) or cause timeout.
  // Client-side also has this check, but server-side is the real gate.
  const MAX_AI_FILTER_PHOTOS = 200;
  if (project.photoCount > MAX_AI_FILTER_PHOTOS) {
    return NextResponse.json({
      error: `Filter AI dibatasi maksimal ${MAX_AI_FILTER_PHOTOS} foto. Galeri ini memiliki ${project.photoCount} foto. Untuk galeri besar, gunakan Filter Otomatis (file <100KB) saat sync, atau bagi foto ke beberapa galeri lebih kecil.`,
    }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const { photoId } = body;
  if (!photoId) {
    return NextResponse.json({ error: "photoId wajib diisi" }, { status: 400 });
  }

  // Get photo from DB
  const photoResult = await db.execute({
    sql: "SELECT * FROM Photo WHERE projectId = ? AND id = ?",
    args: [id, photoId],
  });
  if (photoResult.rows.length === 0) {
    return NextResponse.json({ error: "Photo not found" }, { status: 404 });
  }

  const photo = photoResult.rows[0] as Record<string, unknown>;
  const photoName = String(photo.name);
  const fileId = String(photo.id);

  // Build thumbnail URL — use Google Drive thumbnail directly
  const thumbnailUrl = `https://drive.google.com/thumbnail?id=${fileId}&sz=w400`;

  try {
    // Use z-ai-web-dev-sdk VLM to score photo quality
    const ZAI = (await import("z-ai-web-dev-sdk")).default;
    const zai = await ZAI.create();

    const response = await zai.chat.completions.createVision({
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "You are a professional photography judge. Rate this photo's quality for a public gallery on a scale of 1-10. Consider: sharpness, composition, lighting, exposure, subject clarity, and overall appeal. Reply with ONLY a single number (1-10). No words, no explanation.",
            },
            {
              type: "image_url",
              image_url: { url: thumbnailUrl },
            },
          ],
        },
      ],
      thinking: { type: "disabled" },
    });

    const rawResponse = response.choices[0]?.message?.content || "";
    // Extract number from response
    const scoreMatch = rawResponse.match(/\d+/);
    const score = scoreMatch ? parseInt(scoreMatch[0], 10) : 10; // default to 10 (keep) if parsing fails

    // Hide photos with score < 5 (below average quality)
    const shouldHide = score < 5;
    if (shouldHide) {
      await setPhotoAiHidden(id, photoId, true);
    }

    console.log(`[AI-Score] Photo ${photoId}: score=${score}, hidden=${shouldHide}`);

    return NextResponse.json({
      photoId,
      photoName,
      score,
      hidden: shouldHide,
      reason: shouldHide
        ? `Score ${score}/10 — kualitas rendah, disembunyikan`
        : `Score ${score}/10 — kualitas baik, tetap ditampilkan`,
    });
  } catch (err: any) {
    console.error(`[AI-Score] Error scoring photo ${photoId}:`, err);
    // On error, don't hide the photo — keep it visible (fail safe)
    return NextResponse.json({
      photoId,
      photoName,
      score: 10,
      hidden: false,
      reason: `Error saat menilai: ${err.message?.slice(0, 100) || "unknown"}`,
    });
  }
}

// DELETE /api/projects/:id/ai-score
// Reset all AI hidden flags (undo AI filter)
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await ensureSeed();
  const userEmail = req.headers.get("x-user-email") || undefined;
  const role = await getAccountRole(userEmail);
  if (!role) {
    return NextResponse.json(
      { error: "Akses ditolak." },
      { status: 403 }
    );
  }

  const { id } = await params;
  const { resetAiHidden } = await import("@/lib/queries");
  const visibleCount = await resetAiHidden(id);

  // Update photoCount on project
  const { updateProjectSync } = await import("@/lib/queries");
  await updateProjectSync(id, visibleCount, new Date().toISOString());

  return NextResponse.json({
    success: true,
    message: `Filter AI direset. ${visibleCount} foto kembali terlihat.`,
    visibleCount,
  });
}
