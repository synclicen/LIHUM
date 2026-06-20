import { db } from "@/lib/db";

// Beautiful initial mock photos curated for Purple Haze, Gold and White theme
export const SAMPLE_PHOTOS_LUMINA = [
  {
    id: "sample-lumina-1",
    name: "Cottage Garden Sanctuary.jpg",
    mimeType: "image/jpeg",
    thumbnailLink:
      "https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?auto=format&fit=crop&q=80&w=600",
    webContentLink:
      "https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?auto=format&fit=crop&q=80&w=1600",
    size: "1.2 MB",
    createdTime: "2026-05-20",
  },
  {
    id: "sample-lumina-2",
    name: "Purple Haze Autumn Mist.png",
    mimeType: "image/png",
    thumbnailLink:
      "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&q=80&w=600",
    webContentLink:
      "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&q=80&w=1600",
    size: "2.4 MB",
    createdTime: "2026-05-21",
  },
  {
    id: "sample-lumina-3",
    name: "White Asgard Marble Palace.jpg",
    mimeType: "image/jpeg",
    thumbnailLink:
      "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&q=80&w=600",
    webContentLink:
      "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&q=80&w=1600",
    size: "950 KB",
    createdTime: "2026-05-22",
  },
  {
    id: "sample-lumina-4",
    name: "Aurora Borealis over Mountains.jpeg",
    mimeType: "image/jpeg",
    thumbnailLink:
      "https://images.unsplash.com/photo-1483168527879-c66136b56105?auto=format&fit=crop&q=80&w=600",
    webContentLink:
      "https://images.unsplash.com/photo-1483168527879-c66136b56105?auto=format&fit=crop&q=80&w=1600",
    size: "1.8 MB",
    createdTime: "2026-05-23",
  },
  {
    id: "sample-lumina-5",
    name: "Golden Hour Ocean Horizon.jpg",
    mimeType: "image/jpeg",
    thumbnailLink:
      "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&q=80&w=600",
    webContentLink:
      "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&q=80&w=1600",
    size: "1.5 MB",
    createdTime: "2026-05-24",
  },
  {
    id: "sample-lumina-6",
    name: "Purple Neon City Night.png",
    mimeType: "image/png",
    thumbnailLink:
      "https://images.unsplash.com/photo-1508739773434-c26b3d09e071?auto=format&fit=crop&q=80&w=600",
    webContentLink:
      "https://images.unsplash.com/photo-1508739773434-c26b3d09e071?auto=format&fit=crop&q=80&w=1600",
    size: "3.1 MB",
    createdTime: "2026-05-25",
  },
];

const DEFAULT_PROJECTS = [
  {
    id: "lumina-asgard",
    name: "Lumina Place Gallery Demo",
    description:
      "Galeri demo terbuka bertema Purple Haze, Gold, dan White Asgard. Siap digunakan secara publik untuk membagikan foto tempat favorit.",
    driveFolderUrl: "https://drive.google.com/drive/folders/1z8P2p_placeholder_folder_id",
    driveFolderId: "1z8P2p_placeholder_folder_id",
    displayMode: "all",
    createdAt: "2026-05-27",
  },
  {
    id: "secret-vault",
    name: "Galeri Privat Asgard (Mode Cari)",
    description:
      "Galeri ini hanya menampilkan foto setelah pengunjung memasukkan kata kunci pencarian nama foto yang tepat (contoh: cari 'Marble' atau 'Autumn' atau 'Golden').",
    driveFolderUrl: "https://drive.google.com/drive/folders/2z9Q3q_placeholder_folder_id",
    driveFolderId: "2z9Q3q_placeholder_folder_id",
    displayMode: "search",
    createdAt: "2026-05-28",
  },
];

const DEFAULT_ACCOUNTS = [
  {
    id: "admin-seed",
    email: "synclicen@gmail.com",
    role: "admin",
    displayName: "Admin Utama",
    addedAt: "2026-05-28",
  },
];

let seedingPromise: Promise<void> | null = null;

// Idempotent seed: deduplicates concurrent calls and only inserts when DB is empty.
export async function ensureSeed() {
  if (seedingPromise) return seedingPromise;
  seedingPromise = (async () => {
    const projectCount = await db.project.count();
    if (projectCount === 0) {
      for (const p of DEFAULT_PROJECTS) {
        await db.project.create({
          data: {
            ...p,
            autoSyncEnabled: false,
            autoSyncInterval: "3m",
            lastSyncedAt: "",
            photoCount: SAMPLE_PHOTOS_LUMINA.length,
            photos: {
              create: SAMPLE_PHOTOS_LUMINA.map((ph) => ({ ...ph })),
            },
          },
        });
      }
    }

    const accountCount = await db.account.count();
    if (accountCount === 0) {
      await db.account.createMany({ data: DEFAULT_ACCOUNTS });
    }
  })();
  try {
    await seedingPromise;
  } finally {
    seedingPromise = null;
  }
}
