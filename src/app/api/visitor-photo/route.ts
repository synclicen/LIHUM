import { NextRequest, NextResponse } from "next/server";
import { findPhotoById } from "@/lib/queries";

/**
 * GET /api/visitor-photo?id=PHOTO_ID&size=full|thumb
 *
 * Serves a visitor-uploaded photo from the DB (base64 stored in visitorData).
 * Returns the image bytes with appropriate Content-Type + cache headers.
 *
 * Visitor photos have no Google Drive thumbnail (thumbnailLink=""), so they
 * must be served from the DB. The base64 data is stored in the visitorData
 * column during upload.
 *
 * Cache: 7 days (visitor photos are immutable — once uploaded, they don't change).
 */
const CACHE_7_DAYS = "public, max-age=604800, s-maxage=604800";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const fileId = searchParams.get("id") || "";

  if (!fileId) {
    return new NextResponse("Missing file id", { status: 400 });
  }

  const photo = await findPhotoById(fileId);
  if (!photo) {
    return new NextResponse("Photo not found", { status: 404 });
  }

  // Only serve visitor photos (those with visitorData stored)
  if (!photo.visitorData) {
    return new NextResponse("Not a visitor photo", { status: 404 });
  }

  // Parse the data URL: "data:image/jpeg;base64,..."
  const match = photo.visitorData.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    return new NextResponse("Invalid photo data", { status: 500 });
  }

  const mimeType = match[1];
  const base64Data = match[2];

  // Convert base64 to binary
  const binaryString = atob(base64Data);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  return new NextResponse(bytes, {
    status: 200,
    headers: {
      "Content-Type": mimeType,
      "Cache-Control": CACHE_7_DAYS,
    },
  });
}
