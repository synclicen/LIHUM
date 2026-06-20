import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureSeed, getAccountRole, parseDriveFolderId, slugify } from "@/lib/lihum";

// GET /api/projects — returns lightweight project summaries (no bulky photo lists)
export async function GET() {
  await ensureSeed();
  const projects = await db.project.findMany({
    include: { _count: { select: { photos: true } } },
    orderBy: { createdAt: "asc" },
  });

  const summary = projects.map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    driveFolderUrl: p.driveFolderUrl,
    driveFolderId: p.driveFolderId,
    displayMode: p.displayMode,
    autoSyncEnabled: p.autoSyncEnabled,
    autoSyncInterval: p.autoSyncInterval,
    lastSyncedAt: p.lastSyncedAt,
    photoCount: p._count.photos,
    createdAt: p.createdAt,
  }));

  return NextResponse.json(summary);
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
  const existing = await db.project.findUnique({ where: { id } });
  if (existing) {
    return NextResponse.json(
      { error: "Galeri dengan nama serupa sudah ada. Harap gunakan nama lain." },
      { status: 400 }
    );
  }

  const newProject = await db.project.create({
    data: {
      id,
      name,
      description: description || "",
      driveFolderUrl,
      driveFolderId,
      displayMode: displayMode || "all",
      autoSyncEnabled: autoSyncEnabled === true,
      autoSyncInterval: autoSyncInterval || "3m",
      lastSyncedAt: "",
      photoCount: 0,
      createdAt: new Date().toISOString().split("T")[0],
    },
  });

  return NextResponse.json(newProject, { status: 201 });
}
