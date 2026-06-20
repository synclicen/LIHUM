import { NextRequest, NextResponse } from "next/server";
import { ensureSeed, getAccountRole, parseDriveFolderId, slugify } from "@/lib/lihum";
import {
  getAllProjectSummaries,
  findProjectById,
  createProject,
  toBool,
  type ProjectRow,
} from "@/lib/queries";

function summaryOut(p: ProjectRow) {
  return {
    id: p.id,
    name: p.name,
    description: p.description,
    driveFolderUrl: p.driveFolderUrl,
    driveFolderId: p.driveFolderId,
    displayMode: p.displayMode as "all" | "search",
    autoSyncEnabled: toBool(p.autoSyncEnabled),
    autoSyncInterval: p.autoSyncInterval as "1m" | "3m" | "5m" | "1h" | "6h",
    lastSyncedAt: p.lastSyncedAt,
    photoCount: p.photoCount,
    createdAt: p.createdAt,
  };
}

// GET /api/projects — lightweight summaries (photoCount stored on Project row)
export async function GET() {
  await ensureSeed();
  const projects = await getAllProjectSummaries();
  return NextResponse.json(projects.map(summaryOut));
}

// POST /api/projects — Admin/Manager only
export async function POST(req: NextRequest) {
  await ensureSeed();
  const userEmail = req.headers.get("x-user-email") || undefined;
  const role = await getAccountRole(userEmail);
  if (!role) {
    return NextResponse.json(
      { error: "Akses ditolak. Hubungi Admin Utama untuk didaftarkan." },
      { status: 403 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const { name, description, driveFolderUrl, displayMode, autoSyncEnabled, autoSyncInterval } = body;
  if (!name || !driveFolderUrl) {
    return NextResponse.json(
      { error: "Nama galeri dan Link Google Drive wajib diisi." },
      { status: 400 }
    );
  }

  const driveFolderId = parseDriveFolderId(driveFolderUrl);
  if (!driveFolderId) {
    return NextResponse.json(
      { error: "Tautan Google Drive tidak valid. Pastikan format /folders/ID benar." },
      { status: 400 }
    );
  }

  const id = slugify(name);
  const existing = await findProjectById(id);
  if (existing) {
    return NextResponse.json(
      { error: "Galeri dengan nama serupa sudah ada. Harap gunakan nama lain." },
      { status: 400 }
    );
  }

  const created = await createProject({
    id,
    name,
    description: description || "",
    driveFolderUrl,
    driveFolderId,
    displayMode: displayMode || "all",
    autoSyncEnabled: autoSyncEnabled === true,
    autoSyncInterval: autoSyncInterval || "3m",
    createdAt: new Date().toISOString().split("T")[0],
  });

  return NextResponse.json(summaryOut(created), { status: 201 });
}
