import { NextRequest, NextResponse } from "next/server";

// GET /api/config — returns the public APP_URL so the share modal can build absolute links.
export async function GET(req: NextRequest) {
  const forwardedHost = req.headers.get("x-forwarded-host");
  const forwardedProto = req.headers.get("x-forwarded-proto") || "https";
  const host = req.headers.get("host");

  const finalHost = forwardedHost || host || "";
  const dynamicUrl = finalHost ? `${forwardedProto}://${finalHost}` : "";

  return NextResponse.json({
    appUrl: process.env.APP_URL || dynamicUrl || "",
  });
}
