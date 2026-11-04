import { NextRequest, NextResponse } from "next/server";
import { ensureSeed, getAccountRole } from "@/lib/lihum";
import {
  getMaintenanceConfig,
  setMaintenanceConfig,
} from "@/lib/queries";

/**
 * GET /api/settings/maintenance — Public endpoint.
 *
 * Returns the current maintenance mode config. This is called by every
 * visitor's browser on page load (and periodically) to determine whether
 * to show the maintenance notice screen or the normal UI.
 *
 * Response shape: { enabled: boolean, message: string }
 *
 * Cost: 2 D1 reads per request (one for each Setting row).
 * Cached in the browser for 30s, so actual D1 reads are minimal.
 */
export async function GET() {
  await ensureSeed();
  const config = await getMaintenanceConfig();
  return NextResponse.json(config);
}

/**
 * PUT /api/settings/maintenance — Admin/Manager only.
 *
 * Updates the maintenance mode config. Body: { enabled, message }.
 * When enabled=true, all non-admin visitors will see the maintenance screen.
 */
export async function PUT(req: NextRequest) {
  await ensureSeed();
  const userEmail = req.headers.get("x-user-email") || undefined;
  const role = await getAccountRole(userEmail);
  if (!role) {
    return NextResponse.json(
      { error: "Akses ditolak. Hanya admin/manager yang dapat mengubah pengaturan." },
      { status: 403 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const { enabled, message } = body;

  if (typeof enabled !== "boolean") {
    return NextResponse.json(
      { error: "Field 'enabled' (boolean) wajib diisi." },
      { status: 400 }
    );
  }

  // Cap message length to prevent abuse (4KB is plenty for a notice).
  const cleanMessage =
    typeof message === "string" ? message.slice(0, 4000) : "";

  await setMaintenanceConfig(enabled, cleanMessage);

  console.log(
    `[Maintenance] ${enabled ? "ENABLED" : "DISABLED"} by ${userEmail} — message: ${cleanMessage.slice(0, 80)}`
  );

  return NextResponse.json({
    success: true,
    enabled,
    message: cleanMessage,
  });
}
