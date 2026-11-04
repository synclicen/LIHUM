import { NextRequest, NextResponse } from "next/server";
import { getCameraConfig } from "@/lib/queries";

// GET /api/config — returns the public APP_URL + camera config (maxPhotos, etc.)
// Public endpoint — no auth required. Called by the /upload page to know
// how many photos a visitor can upload per session.
export async function GET(req: NextRequest) {
  const forwardedHost = req.headers.get("x-forwarded-host");
  const forwardedProto = req.headers.get("x-forwarded-proto") || "https";
  const host = req.headers.get("host");

  const finalHost = forwardedHost || host || "";
  const dynamicUrl = finalHost ? `${forwardedProto}://${finalHost}` : "";

  // Fetch camera config (public fields only — maxPhotos is needed by /upload page)
  const cameraConfig = await getCameraConfig();

  return NextResponse.json({
    appUrl: process.env.APP_URL || dynamicUrl || "",
    maxPhotos: cameraConfig.maxPhotos,
  });
}
