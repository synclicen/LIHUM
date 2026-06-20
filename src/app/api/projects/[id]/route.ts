import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureSeed, getAccountRole, parseDriveFolderId } from "@/lib/lihum";

// GET /api/projects/:id — returns project with photos filtered by display mode + search query
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await ensureSeed();
  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const search = searchParams.get("search") || "";

  const project = await db.project.findUnique({
    where: { id },
    include: { photos: true },
  });
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  let photos = project.photos;
  if (project.displayMode === "search") {
    if (!search || search.trim() === "") {
      photos = [];
    } else {
      const q = search.toLowerCase().trim();
      photos = photos.filter((p) => p.name.toLowerCase().includes(q));
    }
  } else if (search && search.trim() !== "") {
    const q = search.toLowerCase().trim();
    photos = photos.filter((p) => p.name.toLowerCase().includes(q));
  }

  const responseProject = {
    ...project,
    photos,
  };
  return NextResponse.json(responseProject);
}

// PUT /api/projects/:id — Admin/Manager only
export async function PUT(
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
  const body = await req.json().catch(() => ({}));
  const { name, description, driveFolderUrl, displayMode, autoSyncEnabled, autoSyncInterval, lastSyncedAt } = body;

  const existing = await db.project.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  let driveFolderId = existing.driveFolderId;
  if (driveFolderUrl) {
    const parsed = parseDriveFolderId(driveFolderUrl);
    if (parsed) driveFolderId = parsed;
  }

  const updated = await db.project.update({
    where: { id },
    data: {
      name: name || existing.name,
      description: description !== undefined ? description : existing.description,
      driveFolderUrl: driveFolderUrl || existing.driveFolderUrl,
      driveFolderId,
      displayMode: displayMode || existing.displayMode,
      autoSyncEnabled:
        autoSyncEnabled !== undefined ? autoSyncEnabled === true : existing.autoSyncEnabled,
      autoSyncInterval: autoSyncInterval || existing.autoSyncInterval || "3m",
      lastSyncedAt:
        lastSyncedAt !== undefined ? lastSyncedAt : existing.lastSyncedAt || "",
    },
  });

  return NextResponse.json(updated);
}

// DELETE /api/projects/:id — Admin/Manager only
export async function DELETE(
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
  const existing = await db.project.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }
  await db.project.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
