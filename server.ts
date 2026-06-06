import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";

const app = express();
const PORT = 3000;

app.use(express.json());

const DATA_DIR = path.join(process.cwd(), "data");
const PROJECTS_FILE = path.join(DATA_DIR, "projects.json");

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Beautiful initial mock photos curated for Purple Haze, Gold and White theme
const SAMPLE_PHOTOS_LUMINA = [
  {
    id: "sample-lumina-1",
    name: "Cottage Garden Sanctuary.jpg",
    mimeType: "image/jpeg",
    thumbnailLink: "https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?auto=format&fit=crop&q=80&w=600",
    webContentLink: "https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?auto=format&fit=crop&q=80&w=1600",
    size: "1.2 MB",
    createdTime: "2026-05-20"
  },
  {
    id: "sample-lumina-2",
    name: "Purple Haze Autumn Mist.png",
    mimeType: "image/png",
    thumbnailLink: "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&q=80&w=600",
    webContentLink: "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&q=80&w=1600",
    size: "2.4 MB",
    createdTime: "2026-05-21"
  },
  {
    id: "sample-lumina-3",
    name: "White Asgard Marble Palace.jpg",
    mimeType: "image/jpeg",
    thumbnailLink: "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&q=80&w=600",
    webContentLink: "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&q=80&w=1600",
    size: "950 KB",
    createdTime: "2026-05-22"
  },
  {
    id: "sample-lumina-4",
    name: "Aurora Borealis over Mountains.jpeg",
    mimeType: "image/jpeg",
    thumbnailLink: "https://images.unsplash.com/photo-1483168527879-c66136b56105?auto=format&fit=crop&q=80&w=600",
    webContentLink: "https://images.unsplash.com/photo-1483168527879-c66136b56105?auto=format&fit=crop&q=80&w=1600",
    size: "1.8 MB",
    createdTime: "2026-05-23"
  },
  {
    id: "sample-lumina-5",
    name: "Golden Hour Ocean Horizon.jpg",
    mimeType: "image/jpeg",
    thumbnailLink: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&q=80&w=600",
    webContentLink: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&q=80&w=1600",
    size: "1.5 MB",
    createdTime: "2026-05-24"
  },
  {
    id: "sample-lumina-6",
    name: "Purple Neon City Night.png",
    mimeType: "image/png",
    thumbnailLink: "https://images.unsplash.com/photo-1508739773434-c26b3d09e071?auto=format&fit=crop&q=80&w=600",
    webContentLink: "https://images.unsplash.com/photo-1508739773434-c26b3d09e071?auto=format&fit=crop&q=80&w=1600",
    size: "3.1 MB",
    createdTime: "2026-05-25"
  }
];

const DEFAULT_PROJECTS = [
  {
    id: "lumina-asgard",
    name: "Lumina Place Gallery Demo",
    description: "Galeri demo terbuka bertema Purple Haze, Gold, dan White Asgard. Siap digunakan secara publik untuk membagikan foto tempat favorit.",
    driveFolderUrl: "https://drive.google.com/drive/folders/1z8P2p_placeholder_folder_id",
    driveFolderId: "1z8P2p_placeholder_folder_id",
    displayMode: "all",
    photos: SAMPLE_PHOTOS_LUMINA,
    photoCount: SAMPLE_PHOTOS_LUMINA.length,
    createdAt: "2026-05-27"
  },
  {
    id: "secret-vault",
    name: "Galeri Privat Asgard (Mode Cari)",
    description: "Galeri ini hanya menampilkan foto setelah pengunjung memasukkan kata kunci pencarian nama foto yang tepat (contoh: cari 'Marble' atau 'Autumn' atau 'Golden').",
    driveFolderUrl: "https://drive.google.com/drive/folders/2z9Q3q_placeholder_folder_id",
    driveFolderId: "2z9Q3q_placeholder_folder_id",
    displayMode: "search",
    photos: SAMPLE_PHOTOS_LUMINA,
    photoCount: SAMPLE_PHOTOS_LUMINA.length,
    createdAt: "2026-05-28"
  }
];

if (!fs.existsSync(PROJECTS_FILE)) {
  fs.writeFileSync(PROJECTS_FILE, JSON.stringify(DEFAULT_PROJECTS, null, 2), "utf-8");
}

function getProjects() {
  try {
    const data = fs.readFileSync(PROJECTS_FILE, "utf-8");
    return JSON.parse(data);
  } catch (err) {
    return DEFAULT_PROJECTS;
  }
}

function saveProjects(projects: any) {
  fs.writeFileSync(PROJECTS_FILE, JSON.stringify(projects, null, 2), "utf-8");
}

const ACCOUNTS_FILE = path.join(DATA_DIR, "accounts.json");
const DEFAULT_ACCOUNTS = [
  {
    id: "admin-seed",
    email: "synclicen@gmail.com",
    role: "admin",
    displayName: "Admin Utama",
    addedAt: "2026-05-28"
  }
];

if (!fs.existsSync(ACCOUNTS_FILE)) {
  fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(DEFAULT_ACCOUNTS, null, 2), "utf-8");
}

function getAccounts() {
  try {
    if (!fs.existsSync(ACCOUNTS_FILE)) {
      fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(DEFAULT_ACCOUNTS, null, 2), "utf-8");
    }
    const data = fs.readFileSync(ACCOUNTS_FILE, "utf-8");
    return JSON.parse(data);
  } catch (err) {
    return DEFAULT_ACCOUNTS;
  }
}

function saveAccounts(accounts: any) {
  fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(accounts, null, 2), "utf-8");
}

function getAccountRole(email: string | undefined): "admin" | "manager" | null {
  if (!email) return null;
  const accounts = getAccounts();
  const acc = accounts.find((a: any) => a.email.toLowerCase() === email.toLowerCase());
  return acc ? (acc.role as "admin" | "manager") : null;
}

// API Routes

// Get system configuration (e.g. injected APP_URL for absolute sharing links)
app.get("/api/config", (req, res) => {
  const forwardedHost = req.headers["x-forwarded-host"];
  const forwardedProto = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers.host;
  
  // Choose forwarded host (from Cloud Run reverse proxy) or fall back to standard header
  const finalHost = forwardedHost || host || "";
  const dynamicUrl = finalHost ? `${forwardedProto}://${finalHost}` : "";

  res.json({
    appUrl: process.env.APP_URL || dynamicUrl || ""
  });
});

// GET /api/accounts (Admin Only)
app.get("/api/accounts", (req, res) => {
  const userEmail = req.headers["x-user-email"] as string | undefined;
  const role = getAccountRole(userEmail);
  if (role !== "admin") {
    return res.status(403).json({ error: "Akses ditolak. Hanya Admin yang dapat melihat daftar pengguna." });
  }
  res.json(getAccounts());
});

// GET /api/accounts/me
app.get("/api/accounts/me", (req, res) => {
  const userEmail = req.headers["x-user-email"] as string | undefined;
  if (!userEmail) {
    return res.json({ email: null, role: null });
  }

  const emailLower = userEmail.toLowerCase();
  
  // Auto-seed synclicen@gmail.com if not in list
  if (emailLower === "synclicen@gmail.com") {
    const list = getAccounts();
    if (!list.some((a: any) => a.email.toLowerCase() === "synclicen@gmail.com")) {
      const newAcc = {
        id: "admin-synclicen",
        email: "synclicen@gmail.com",
        role: "admin",
        displayName: "Admin Utama",
        addedAt: new Date().toISOString().split("T")[0]
      };
      list.push(newAcc);
      saveAccounts(list);
    }
  }

  const accounts = getAccounts();
  const acc = accounts.find((a: any) => a.email.toLowerCase() === emailLower);
  if (acc) {
    res.json({ email: acc.email, role: acc.role, displayName: acc.displayName });
  } else {
    res.json({ email: userEmail, role: null });
  }
});

// POST /api/accounts (Admin Only)
app.post("/api/accounts", (req, res) => {
  const userEmail = req.headers["x-user-email"] as string | undefined;
  const role = getAccountRole(userEmail);
  if (role !== "admin") {
    return res.status(403).json({ error: "Akses ditolak. Hanya Admin yang dapat mendaftarkan akun baru." });
  }

  const { email, role: incomingRole, displayName } = req.body;
  if (!email || !incomingRole) {
    return res.status(400).json({ error: "Email dan Peran wajib diisi." });
  }

  if (incomingRole !== "admin" && incomingRole !== "manager") {
    return res.status(400).json({ error: "Peran tidak valid. Gunakan 'admin' atau 'manager'." });
  }

  const accounts = getAccounts();
  if (accounts.some((a: any) => a.email.toLowerCase() === email.trim().toLowerCase())) {
    return res.status(400).json({ error: "Akun dengan email ini sudah terdaftar." });
  }

  const newAcc = {
    id: email.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    email: email.trim().toLowerCase(),
    role: incomingRole,
    displayName: displayName || "",
    addedAt: new Date().toISOString().split("T")[0]
  };

  accounts.push(newAcc);
  saveAccounts(accounts);
  res.status(201).json(newAcc);
});

// DELETE /api/accounts/:id (Admin Only)
app.delete("/api/accounts/:id", (req, res) => {
  const userEmail = req.headers["x-user-email"] as string | undefined;
  const role = getAccountRole(userEmail);
  if (role !== "admin") {
    return res.status(403).json({ error: "Akses ditolak. Hanya Admin yang dapat menghapus akun." });
  }

  const { id } = req.params;
  const accounts = getAccounts();
  const accIndex = accounts.findIndex((a: any) => a.id === id);

  if (accIndex === -1) {
    return res.status(404).json({ error: "Akun tidak ditemukan." });
  }

  const targetAcc = accounts[accIndex];
  if (targetAcc.email.toLowerCase() === userEmail.toLowerCase()) {
    return res.status(400).json({ error: "Anda tidak dapat menghapus akun Anda sendiri." });
  }

  if (targetAcc.email.toLowerCase() === "synclicen@gmail.com") {
    return res.status(400).json({ error: "Admin Utama (synclicen@gmail.com) tidak dapat dihapus." });
  }

  accounts.splice(accIndex, 1);
  saveAccounts(accounts);
  res.json({ success: true });
});

// Get all projects metadata (no bulky photo lists)
app.get("/api/projects", (req, res) => {
  const projects = getProjects();
  const summary = projects.map((p: any) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    driveFolderUrl: p.driveFolderUrl,
    driveFolderId: p.driveFolderId,
    displayMode: p.displayMode,
    autoSyncEnabled: p.autoSyncEnabled || false,
    autoSyncInterval: p.autoSyncInterval || "3m",
    lastSyncedAt: p.lastSyncedAt || "",
    photoCount: p.photoCount || (p.photos ? p.photos.length : 0),
    createdAt: p.createdAt
  }));
  res.json(summary);
});

// Get a specific project (filter photos list based on display mode/search query)
app.get("/api/projects/:id", (req, res) => {
  const { id } = req.params;
  const { search } = req.query;
  const projects = getProjects();
  const project = projects.find((p: any) => p.id === id);
  if (!project) return res.status(404).json({ error: "Project not found" });

  const responseProject = { ...project };

  if (project.displayMode === "search") {
    if (!search || (typeof search === "string" && search.trim() === "")) {
      // In search-only mode, return empty photos list unless searched
      responseProject.photos = [];
    } else {
      const query = (search as string).toLowerCase().trim();
      responseProject.photos = (project.photos || []).filter((p: any) =>
        p.name.toLowerCase().includes(query)
      );
    }
  } else {
    // Mode 'all': return all but filter if query given
    if (search && (search as string).trim() !== "") {
      const query = (search as string).toLowerCase().trim();
      responseProject.photos = (project.photos || []).filter((p: any) =>
        p.name.toLowerCase().includes(query)
      );
    } else {
      responseProject.photos = project.photos || [];
    }
  }

  res.json(responseProject);
});

// Create new project
app.post("/api/projects", (req, res) => {
  const userEmail = req.headers["x-user-email"] as string | undefined;
  const role = getAccountRole(userEmail);
  if (!role) {
    return res.status(403).json({ error: "Akses ditolak. Hubungi Admin Utama untuk didaftarkan." });
  }

  const { name, description, driveFolderUrl, displayMode, autoSyncEnabled, autoSyncInterval } = req.body;
  if (!name || !driveFolderUrl) {
    return res.status(400).json({ error: "Nama galeri dan Link Google Drive wajib diisi." });
  }

  // Parse folder ID
  const folderIdMatch = driveFolderUrl.match(/(?:folders\/|id=)([a-zA-Z0-9-_]{25,50})/);
  const driveFolderId = folderIdMatch ? folderIdMatch[1] : "";

  if (!driveFolderId) {
    return res.status(400).json({ error: "Tautan Google Drive tidak valid. Pastikan format /folders/ID benar." });
  }

  const id = name.toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "") || Math.random().toString(36).substring(2, 9);

  const projects = getProjects();
  if (projects.some((p: any) => p.id === id)) {
    return res.status(400).json({ error: "Galeri dengan nama serupa sudah ada. Harap gunakan nama lain." });
  }

  const newProject = {
    id,
    name,
    description: description || "",
    driveFolderUrl,
    driveFolderId,
    displayMode: displayMode || "all",
    autoSyncEnabled: autoSyncEnabled === true,
    autoSyncInterval: autoSyncInterval || "3m",
    lastSyncedAt: "",
    photos: [],
    photoCount: 0,
    createdAt: new Date().toISOString().split("T")[0]
  };

  projects.push(newProject);
  saveProjects(projects);
  res.status(201).json(newProject);
});

// Update project settings
app.put("/api/projects/:id", (req, res) => {
  const userEmail = req.headers["x-user-email"] as string | undefined;
  const role = getAccountRole(userEmail);
  if (!role) {
    return res.status(403).json({ error: "Akses ditolak. Hubungi Admin Utama untuk didaftarkan." });
  }

  const { id } = req.params;
  const { name, description, driveFolderUrl, displayMode, autoSyncEnabled, autoSyncInterval, lastSyncedAt } = req.body;

  const projects = getProjects();
  const index = projects.findIndex((p: any) => p.id === id);
  if (index === -1) return res.status(404).json({ error: "Project not found" });

  let driveFolderId = projects[index].driveFolderId;
  if (driveFolderUrl) {
    const folderIdMatch = driveFolderUrl.match(/(?:folders\/|id=)([a-zA-Z0-9-_]{25,50})/);
    driveFolderId = folderIdMatch ? folderIdMatch[1] : driveFolderId;
  }

  projects[index] = {
    ...projects[index],
    name: name || projects[index].name,
    description: description !== undefined ? description : projects[index].description,
    driveFolderUrl: driveFolderUrl || projects[index].driveFolderUrl,
    driveFolderId,
    displayMode: displayMode || projects[index].displayMode,
    autoSyncEnabled: autoSyncEnabled !== undefined ? (autoSyncEnabled === true) : projects[index].autoSyncEnabled,
    autoSyncInterval: autoSyncInterval || projects[index].autoSyncInterval || "3m",
    lastSyncedAt: lastSyncedAt !== undefined ? lastSyncedAt : projects[index].lastSyncedAt || ""
  };

  saveProjects(projects);
  res.json(projects[index]);
});

// Delete project
app.delete("/api/projects/:id", (req, res) => {
  const userEmail = req.headers["x-user-email"] as string | undefined;
  const role = getAccountRole(userEmail);
  if (!role) {
    return res.status(403).json({ error: "Akses ditolak. Hubungi Admin Utama untuk didaftarkan." });
  }

  const { id } = req.params;
  const projects = getProjects();
  const filtered = projects.filter((p: any) => p.id !== id);
  if (projects.length === filtered.length) {
    return res.status(404).json({ error: "Project not found" });
  }
  saveProjects(filtered);
  res.json({ success: true });
});

// Sync Google Drive photos
app.post("/api/projects/:id/sync", async (req, res) => {
  const userEmail = req.headers["x-user-email"] as string | undefined;
  const role = getAccountRole(userEmail);
  if (!role) {
    return res.status(403).json({ error: "Akses ditolak. Hubungi Admin Utama untuk didaftarkan." });
  }

  const { id } = req.params;
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Token otorisasi Google tidak ditemukan. Silakan masuk (Login) Admin terlebih dahulu." });
  }
  const token = authHeader.split(" ")[1];

  const projects = getProjects();
  const index = projects.findIndex((p: any) => p.id === id);
  if (index === -1) return res.status(404).json({ error: "Project not found" });

  const project = projects[index];
  const folderId = project.driveFolderId;

  if (!folderId) {
    return res.status(400).json({ error: "Format ID folder Google Drive tidak valid." });
  }

  try {
    // List images in folder using Google Drive API v3
    const q = `'${folderId}' in parents and mimeType contains 'image/' and trashed = false`;
    const fields = "files(id, name, mimeType, thumbnailLink, webContentLink, createdTime, size)";
    const driveUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=${encodeURIComponent(fields)}&pageSize=300`;

    const driveResponse = await fetch(driveUrl, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    if (!driveResponse.ok) {
      const errorText = await driveResponse.text();
      throw new Error(`Google Drive API response error: ${errorText}`);
    }

    const driveData: any = await driveResponse.json();
    const files = driveData.files || [];

    const mappedPhotos = files.map((file: any) => {
      let sizeFormatted = "Unknown";
      if (file.size) {
        const bytes = parseInt(file.size);
        if (bytes > 1048576) {
          sizeFormatted = (bytes / 1048576).toFixed(1) + " MB";
        } else {
          sizeFormatted = (bytes / 1024).toFixed(0) + " KB";
        }
      }

      return {
        id: file.id,
        name: file.name,
        mimeType: file.mimeType,
        thumbnailLink: file.thumbnailLink,
        webContentLink: file.webContentLink,
        size: sizeFormatted,
        createdTime: file.createdTime ? file.createdTime.split("T")[0] : "Unknown"
      };
    });

    projects[index].photos = mappedPhotos;
    projects[index].photoCount = mappedPhotos.length;
    projects[index].lastSyncedAt = new Date().toISOString();
    saveProjects(projects);

    res.json({
      success: true,
      photoCount: mappedPhotos.length,
      photos: mappedPhotos,
      lastSyncedAt: projects[index].lastSyncedAt
    });
  } catch (err: any) {
    console.error("Drive Sync Error:", err);
    res.status(500).json({ error: err.message || "Gagal sinkronisasi Google Drive. Pastikan folder tersebut dibagikan (public) dan akun Anda memiliki izin." });
  }
});

// Image Proxy route for high reliability & bypassing CORS/Auth barriers on user viewports
app.get("/api/photo-proxy", async (req, res) => {
  const fileId = req.query.id as string;
  const size = req.query.size === "full" ? "w1600" : "w600";
  if (!fileId) return res.status(400).send("Missing file id");

  // If it's a sample mock photo, redirect directly to free Unsplash asset
  if (fileId.startsWith("sample-")) {
    const projects = getProjects();
    const sample = projects.flatMap((p: any) => p.photos || []).find((ph: any) => ph.id === fileId);
    if (sample && sample.thumbnailLink) {
      return res.redirect(sample.thumbnailLink);
    }
  }

  try {
    // Fetch high-res optimized view from Google Drive Thumbnail server (accessible publicly)
    const googleThumbUrl = `https://drive.google.com/thumbnail?id=${fileId}&sz=${size}`;
    const response = await fetch(googleThumbUrl);
    if (response.ok) {
      res.setHeader("Content-Type", response.headers.get("content-type") || "image/jpeg");
      res.setHeader("Cache-Control", "public, max-age=86400"); // Cache for 1 day
      const buffer = await response.arrayBuffer();
      return res.send(Buffer.from(buffer));
    }

    // Secondary fallback
    const driveDownloadUrl = `https://drive.google.com/uc?export=view&id=${fileId}`;
    const dlResponse = await fetch(driveDownloadUrl);
    if (dlResponse.ok) {
      res.setHeader("Content-Type", dlResponse.headers.get("content-type") || "image/jpeg");
      const buffer = await dlResponse.arrayBuffer();
      return res.send(Buffer.from(buffer));
    }

    res.status(404).send("Image not viewable. Ensure Drive file has link sharing turned on.");
  } catch (error) {
    console.error("Proxy Error:", error);
    res.status(500).send("Error loading image from Google Drive");
  }
});

// Download Proxy Route with Content-Disposition Attachment
app.get("/api/photo-proxy/download", async (req, res) => {
  const fileId = req.query.id as string;
  const fileName = (req.query.name as string) || "photo.jpg";

  if (!fileId) return res.status(400).send("Missing file id");

  if (fileId.startsWith("sample-")) {
    const projects = getProjects();
    const sample = projects.flatMap((p: any) => p.photos || []).find((ph: any) => ph.id === fileId);
    if (sample && sample.webContentLink) {
      try {
        const response = await fetch(sample.webContentLink);
        if (response.ok) {
          res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
          res.setHeader("Content-Type", response.headers.get("content-type") || "image/jpeg");
          const buffer = await response.arrayBuffer();
          return res.send(Buffer.from(buffer));
        }
      } catch (err) {}
      return res.redirect(sample.webContentLink);
    }
  }

  try {
    const driveDownloadUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;
    const response = await fetch(driveDownloadUrl);

    if (response.ok) {
      res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
      res.setHeader("Content-Type", response.headers.get("content-type") || "application/octet-stream");
      const buffer = await response.arrayBuffer();
      return res.send(Buffer.from(buffer));
    }

    // Direct redirect as ultimate backup fallback
    res.redirect(`https://drive.google.com/uc?export=download&id=${fileId}`);
  } catch (error) {
    console.error("Download Error:", error);
    res.status(500).send("Gagal mengunduh file.");
  }
});

// Handle Vite & SPAs
async function start() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[Lumina Server] Running on http://0.0.0.0:${PORT}`);
  });
}

start();
