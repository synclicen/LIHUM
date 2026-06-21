import { ensureSchema } from "@/lib/db";
import {
  countProjects,
  countAccounts,
  createProject,
  addProjectPhotos,
  createAccounts,
  type NewProjectInput,
  type NewPhotoInput,
  type NewAccountInput,
} from "@/lib/queries";

// Beautiful initial mock photos curated for Purple Haze, Gold and White theme
export const SAMPLE_PHOTOS_LUMINA: NewPhotoInput[] = [
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

const DEFAULT_PROJECTS: NewProjectInput[] = [
  {
    id: "lumina-asgard",
    name: "Lumina Place Gallery Demo",
    description:
      "Galeri demo terbuka bertema Purple Haze, Gold, dan White Asgard. Siap digunakan secara publik untuk membagikan foto tempat favorit.",
    driveFolderUrl: "https://drive.google.com/drive/folders/1z8P2p_placeholder_folder_id",
    driveFolderId: "1z8P2p_placeholder_folder_id",
    displayMode: "all",
    visibility: "public",
    password: "",
    autoSyncEnabled: false,
    autoSyncInterval: "3m",
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
    visibility: "public",
    password: "",
    autoSyncEnabled: false,
    autoSyncInterval: "3m",
    createdAt: "2026-05-28",
  },
];

const DEFAULT_ACCOUNTS: NewAccountInput[] = [
  {
    id: "admin-seed",
    email: "synclicen@gmail.com",
    role: "admin",
    displayName: "Admin Utama",
    addedAt: "2026-05-28",
  },
];

let seedPromise: Promise<void> | null = null;

/**
 * Idempotently creates the schema and seeds default galleries + admin account.
 * Safe to call on every request — only inserts when tables are empty.
 * Concurrent calls are deduplicated.
 */
export async function ensureSeed(): Promise<void> {
  if (seedPromise) return seedPromise;
  seedPromise = (async () => {
    await ensureSchema();

    if ((await countProjects()) === 0) {
      for (const p of DEFAULT_PROJECTS) {
        await createProject(p);
        await addProjectPhotos(p.id, SAMPLE_PHOTOS_LUMINA);
        // keep photoCount in sync on the Project row
        const { updateProjectSync } = await import("@/lib/queries");
        await updateProjectSync(p.id, SAMPLE_PHOTOS_LUMINA.length, "");
      }
    }

    if ((await countAccounts()) === 0) {
      await createAccounts(DEFAULT_ACCOUNTS);
    }
  })();
  try {
    await seedPromise;
  } finally {
    seedPromise = null;
  }
}

export { ensureSchema };
