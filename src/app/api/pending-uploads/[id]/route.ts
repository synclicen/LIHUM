import { NextRequest, NextResponse } from "next/server";
import { ensureSeed, getAccountRole } from "@/lib/lihum";
import { findPendingUpload, deletePendingUpload } from "@/lib/queries";

// Robust base64 → Uint8Array decoder that works on Node.js and Cloudflare
// Workers. `atob` is strict and rejects some otherwise-valid base64 strings
// (it throws "The string contains invalid characters"), so we prefer Node's
// `Buffer` (available on Workers via the nodejs_compat flag) which is lenient.
function decodeBase64(b64: string): Uint8Array {
  const clean = b64.replace(/\s+/g, "");
  try {
    // Buffer is available in Node.js and Cloudflare Workers (nodejs_compat).
    if (typeof Buffer !== "undefined") {
      return Buffer.from(clean, "base64");
    }
  } catch {
    /* fall through to atob */
  }
  try {
    const bin = atob(clean);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  } catch {
    throw new Error("Base64 decode failed");
  }
}

// GET /api/pending-uploads/:id
// Streams the raw image bytes of a pending upload to the admin (download).
// Returns the image with Content-Disposition: attachment so the browser
// downloads it with the original filename.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await ensureSeed();
  // Auth: prefer the x-user-email header (fetch calls); fall back to the
  // ?admin= query param (used by <a download> link clicks, which can't set
  // custom request headers).
  const userEmail =
    req.headers.get("x-user-email") ||
    new URL(req.url).searchParams.get("admin") ||
    undefined;
  const role = await getAccountRole(userEmail);
  if (!role) {
    return NextResponse.json(
      { error: "Akses ditolak. Fitur admin only." },
      { status: 403 }
    );
  }

  const { id } = await params;
  const upload = await findPendingUpload(id);
  if (!upload) {
    return NextResponse.json({ error: "Upload tidak ditemukan." }, { status: 404 });
  }

  try {
    const bytes = decodeBase64(upload.base64Data);

    // RFC 5987 encoded filename for non-ASCII safety
    const safeName = upload.fileName.replace(/[^\x20-\x7E]/g, "_");
    const encodedName = encodeURIComponent(upload.fileName);

    return new NextResponse(bytes, {
      status: 200,
      headers: {
        "Content-Type": upload.mimeType || "image/jpeg",
        "Content-Length": String(bytes.length),
        "Content-Disposition": `attachment; filename="${safeName}"; filename*=UTF-8''${encodedName}`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err: any) {
    console.error("[PendingUpload] Download error:", err);
    return NextResponse.json(
      { error: "Gagal mendekode data foto: " + (err?.message || "unknown") },
      { status: 500 }
    );
  }
}

// DELETE /api/pending-uploads/:id
// Deletes a single pending upload (admin only).
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await ensureSeed();
  const userEmail = req.headers.get("x-user-email") || undefined;
  const role = await getAccountRole(userEmail);
  if (!role) {
    return NextResponse.json(
      { error: "Akses ditolak. Fitur admin only." },
      { status: 403 }
    );
  }

  const { id } = await params;
  const ok = await deletePendingUpload(id);
  return NextResponse.json({ success: ok });
}
