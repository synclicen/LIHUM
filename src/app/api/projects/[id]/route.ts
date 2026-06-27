import { NextRequest, NextResponse } from "next/server";
import {
  ensureSeed,
  getAccountRole,
  parseDriveFolderId,
  hashPassword,
  verifyPassword,
} from "@/lib/lihum";
import {
  getProjectWithPhotos,
  findProjectById,
  updateProject,
  deleteProject,
  toBool,
  type ProjectRow,
  type PhotoRow,
  type PhotoSort,
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
    modifiedTime: p.modifiedTime || undefined,
  };
}

function projectOut(p: ProjectRow) {
  // NOTE: never include `password` here — it must never leave the server.
  return {
    id: p.id,
    name: p.name,
    description: p.description,
    driveFolderUrl: p.driveFolderUrl,
    driveFolderId: p.driveFolderId,
    displayMode: p.displayMode as "all" | "search",
    visibility: p.visibility as "public" | "private",
    isHidden: toBool(p.isHidden),
    autoSyncEnabled: toBool(p.autoSyncEnabled),
    autoSyncInterval: p.autoSyncInterval as "1m" | "3m" | "5m" | "1h" | "6h",
    lastSyncedAt: p.lastSyncedAt,
    photoCount: p.photoCount,
    createdAt: p.createdAt,
  };
}

// GET /api/projects/:id — filters photos by display mode + search query.
// For private galleries, requires a correct `password` query param to return photos.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await ensureSeed();
  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const search = searchParams.get("search") || "";
  const password = searchParams.get("password") || "";
  const sortRaw = searchParams.get("sort") || "default";
  const VALID_SORTS: PhotoSort[] = ["default", "name-asc", "name-desc", "modified-desc", "modified-asc"];
  const sort: PhotoSort = (VALID_SORTS as string[]).includes(sortRaw) ? (sortRaw as PhotoSort) : "default";

  const data = await getProjectWithPhotos(id, sort);
  if (!data) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const { project, photos } = data;

  // ── Private gallery: verify password before returning any photos ──
  // Admins/managers bypass the password check (they manage the gallery).
  if (project.visibility === "private") {
    const userEmail = req.headers.get("x-user-email") || undefined;
    const adminRole = await getAccountRole(userEmail);
    const isAdmin = adminRole !== null;

    const ok = isAdmin || (password ? await verifyPassword(password, project.password) : false);
    if (!ok) {
      // Return project metadata (so the UI can render the password prompt)
      // but with NO photos and a requiresPassword flag.
      return NextResponse.json({
        ...projectOut(project),
        photos: [],
        requiresPassword: true,
        passwordError: password
          ? "Password salah. Silakan coba lagi atau hubungi admin."
          : undefined,
      });
    }
  }

  // ── Password OK (or public gallery) — filter photos by display mode + search ──
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
  const {
    name,
    description,
    driveFolderUrl,
    displayMode,
    visibility,
    password,
    isHidden,
    autoSyncEnabled,
    autoSyncInterval,
    lastSyncedAt,
  } = body;

  let driveFolderId = existing.driveFolderId;
  if (driveFolderUrl) {
    const parsed = parseDriveFolderId(driveFolderUrl);
    if (parsed) driveFolderId = parsed;
  }

  // ── Handle visibility + password updates ──
  const vis: "public" | "private" =
    visibility === "private" ? "private" : visibility === "public" ? "public" : (existing.visibility as "public" | "private");

  let hashedPassword: string | undefined = undefined;
  if (vis === "private") {
    // If switching to private or already private and a new password is provided
    if (typeof password === "string" && password.trim().length > 0) {
      if (password.trim().length < 3) {
        return NextResponse.json(
          { error: "Password minimal 3 karakter." },
          { status: 400 }
        );
      }
      hashedPassword = await hashPassword(password.trim());
    } else if (vis === "private" && !existing.password) {
      // Switching to private but no password provided and no existing password
      return NextResponse.json(
        { error: "Galeri privat wajib memiliki password." },
        { status: 400 }
      );
    }
    // If password is empty/undefined and existing.password exists, keep the old one
    // (handled by updateProject: password !== undefined ? password : existing.password)
  } else if (vis === "public") {
    // Switching to public — clear the password
    hashedPassword = "";
  }

  const updated = await updateProject(id, {
    name,
    description,
    driveFolderUrl,
    driveFolderId,
    displayMode,
    visibility: vis,
    password: hashedPassword,
    isHidden: typeof isHidden === "boolean" ? isHidden : undefined,
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
