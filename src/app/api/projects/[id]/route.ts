import { NextRequest, NextResponse } from "next/server";
import { ensureSeed, getAccountRole, parseDriveFolderId } from "@/lib/lihum";
import {
  getProjectWithPhotos,
  findProjectById,
  updateProject,
  deleteProject,
  toBool,
  type ProjectRow,
  type PhotoRow,
} from "@/lib/queries";

function photoOut(p: PhotoRow) {
  return {
    id: p.id,
    name: p.name,
    mimeType: p.mimeType,
    thumbnailLink: p.thumbnailLink || undefined,
    webContentLink: p.webContentLink || undefined,
    size: p.size || undefined,
    createdTime: p.createdTime || undefined,
  };
}

function projectOut(p: ProjectRow) {
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

// GET /api/projects/:id — filters photos by display mode + search query
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await ensureSeed();
  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const search = searchParams.get("search") || "";

  const data = await getProjectWithPhotos(id);
  if (!data) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const { project, photos } = data;
  let filtered = photos;
  if (project.displayMode === "search") {
    if (!search || search.trim() === "") {
      filtered = [];
    } else {
      const q = search.toLowerCase().trim();
      filtered = photos.filter((p) => p.name.toLowerCase().includes(q));
    }
  } else if (search && search.trim() !== "") {
    const q = search.toLowerCase().trim();
    filtered = photos.filter((p) => p.name.toLowerCase().includes(q));
  }

  return NextResponse.json({
    ...projectOut(project),
    photos: filtered.map(photoOut),
  });
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
  const existing = await findProjectById(id);
  if (!existing) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const { name, description, driveFolderUrl, displayMode, autoSyncEnabled, autoSyncInterval, lastSyncedAt } = body;

  let driveFolderId = existing.driveFolderId;
  if (driveFolderUrl) {
    const parsed = parseDriveFolderId(driveFolderUrl);
    if (parsed) driveFolderId = parsed;
  }

  const updated = await updateProject(id, {
    name,
    description,
    driveFolderUrl,
    driveFolderId,
    displayMode,
    autoSyncEnabled,
    autoSyncInterval,
    lastSyncedAt,
  });

  return NextResponse.json(updated ? projectOut(updated) : { error: "Project not found" });
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
  const existing = await findProjectById(id);
  if (!existing) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }
  await deleteProject(id);
  return NextResponse.json({ success: true });
}
