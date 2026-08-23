import { NextRequest, NextResponse } from "next/server";
import { ensureSeed, getAccountRole } from "@/lib/lihum";
import {
  findProjectById,
  setPhotoAiHidden,
  resetAiHidden,
} from "@/lib/queries";
import { db } from "@/lib/db";

// POST /api/projects/:id/ai-score
//
// Processes a BATCH of photos (up to 5) using VLM in a single Worker request.
// The client calls this repeatedly with { offset } until all photos are scored.
//
// This design avoids:
//  - Client-side pacing (admin doesn't need to keep tab open)
//  - Per-photo API calls (5 photos per request = 5x fewer Worker requests)
//  - Rate limiting (total requests = photoCount / 5, not photoCount)
//
// Input: { offset: number, limit: number (default 5) }
// Output: { processed, hidden, remaining, done }

const BATCH_SIZE = 5;

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

  const body = await req.json().catch(() => ({}));
  const offset = Math.max(0, Number(body.offset) || 0);
  const limit = Math.min(BATCH_SIZE, Number(body.limit) || BATCH_SIZE);

  // Fetch a batch of photos that haven't been AI-scored yet.
  // We use aiHidden = 0 as "not yet scored" — after scoring, we either
  // keep it 0 (good quality, visible) or set to 1 (hidden).
  // To track "scored" vs "not scored", we use a separate approach:
  // we fetch ALL photos ordered by name, offset by the given offset.
  const allPhotosResult = await db.execute({
    sql: "SELECT id FROM Photo WHERE projectId = ? ORDER BY name ASC",
    args: [id],
  });
  const allPhotoIds: string[] = allPhotosResult.rows.map(
    (r) => String((r as Record<string, unknown>).id)
  );
  const totalCount = allPhotoIds.length;

  if (offset >= totalCount) {
    return NextResponse.json({
      processed: 0,
      hidden: 0,
      remaining: 0,
      done: true,
    });
  }

  const batchIds = allPhotoIds.slice(offset, offset + limit);
  let hiddenInBatch = 0;

  // Process each photo in the batch sequentially
  for (const photoId of batchIds) {
    try {
      // Fetch photo thumbnail directly from Google Drive
      const thumbnailUrl = `https://drive.google.com/thumbnail?id=${photoId}&sz=w400`;

      // Use VLM to score photo quality
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
      const scoreMatch = rawResponse.match(/\d+/);
      const score = scoreMatch ? parseInt(scoreMatch[0], 10) : 10;
      const shouldHide = score < 5;

      if (shouldHide) {
        await setPhotoAiHidden(id, photoId, true);
        hiddenInBatch++;
      }

      console.log(`[AI-Score] Photo ${photoId}: score=${score}, hidden=${shouldHide}`);
    } catch (err: any) {
      console.error(`[AI-Score] Error on photo ${photoId}:`, err.message?.slice(0, 100));
      // Fail safe — don't hide on error
    }
  }

  const newOffset = offset + batchIds.length;
  const remaining = totalCount - newOffset;

  return NextResponse.json({
    processed: batchIds.length,
    hidden: hiddenInBatch,
    offset: newOffset,
    remaining,
    done: remaining <= 0,
  });
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
  const visibleCount = await resetAiHidden(id);

  const { updateProjectSync } = await import("@/lib/queries");
  await updateProjectSync(id, visibleCount, new Date().toISOString());

  return NextResponse.json({
    success: true,
    message: `Filter AI direset. ${visibleCount} foto kembali terlihat.`,
    visibleCount,
  });
}
