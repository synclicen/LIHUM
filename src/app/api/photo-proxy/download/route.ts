import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureSeed } from "@/lib/lihum";

// GET /api/photo-proxy/download?id=FILE_ID&name=FILENAME
// Streams the original file with Content-Disposition: attachment.
export async function GET(req: NextRequest) {
  await ensureSeed();
  const { searchParams } = new URL(req.url);
  const fileId = searchParams.get("id") || "";
  const fileName = searchParams.get("name") || "photo.jpg";

  if (!fileId) {
    return new NextResponse("Missing file id", { status: 400 });
  }

  if (fileId.startsWith("sample-")) {
    const sample = await db.photo.findFirst({ where: { id: fileId } });
    if (sample && sample.webContentLink) {
      try {
        const response = await fetch(sample.webContentLink);
        if (response.ok) {
          const buffer = await response.arrayBuffer();
          return new NextResponse(Buffer.from(buffer), {
            status: 200,
            headers: {
              "Content-Disposition": `attachment; filename="${fileName}"`,
              "Content-Type": response.headers.get("content-type") || "image/jpeg",
            },
          });
        }
      } catch {
        /* fall through to redirect */
      }
      return NextResponse.redirect(sample.webContentLink);
    }
  }

  try {
    const driveDownloadUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;
    const response = await fetch(driveDownloadUrl);

    if (response.ok) {
      const buffer = await response.arrayBuffer();
      return new NextResponse(Buffer.from(buffer), {
        status: 200,
        headers: {
          "Content-Disposition": `attachment; filename="${fileName}"`,
          "Content-Type":
            response.headers.get("content-type") || "application/octet-stream",
        },
      });
    }

    // Direct redirect as ultimate backup fallback
    return NextResponse.redirect(driveDownloadUrl);
  } catch (error) {
    console.error("Download Error:", error);
    return new NextResponse("Gagal mengunduh file.", { status: 500 });
  }
}
