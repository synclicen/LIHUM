#!/usr/bin/env bun
/**
 * scripts/backfill-stats.ts
 *
 * Backfill viewCount + downloadCount untuk semua galeri berdasarkan estimasi
 * dari Cloudflare Workers Analytics (30 hari terakhir, max retention free plan).
 *
 * ESTIMASI (bukan angka eksak):
 *  - views: request ke /api/projects/[id] dibagi faktor koreksi polling.
 *    Satu "view" = 1 first-load + pagination + polling selama session.
 *    Untuk galeri kecil (≤100 foto): ~4 request per view (1 load + 3 polling).
 *    Untuk galeri besar (≥1000 foto): ~12 request per view (1 load + 10 pagination + polling).
 *    Formula adaptif: faktor = 3 + (photoCount / 100) * 0.8, cap 15.
 *  - downloads: request ke /api/photo-proxy/download (1:1, 1 request = 1 download).
 *
 * Catatan:
 *  - Hanya 30 hari terakhir yang tersedia (limit Cloudflare free plan).
 *  - Request admin (sync, polling saat admin login) ikut terhitung, sedikit over-estimate.
 *  - Estimasi ini kasar, bukan angka eksak. Setelah backfill, counter baru akan naik natural.
 *
 * Cara pakai:
 *   CLOUDFLARE_API_TOKEN=xxx CLOUDFLARE_ACCOUNT_ID=xxx \
 *   DATABASE_URL=libsql://... TURSO_AUTH_TOKEN=xxx \
 *   bun run scripts/backfill-stats.ts
 *
 * Untuk dry-run (lihat angka tanpa apply ke DB):
 *   ... bun run scripts/backfill-stats.ts --dry-run
 */

import { createClient } from "@libsql/client";

const CF_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const CF_ACCOUNT = process.env.CLOUDFLARE_ACCOUNT_ID || "d8a5b04ca8fc4894e0541c83899f8d97";
const DB_URL = process.env.DATABASE_URL;
const DB_TOKEN = process.env.TURSO_AUTH_TOKEN;
const DRY_RUN = process.argv.includes("--dry-run");

if (!CF_TOKEN) {
  console.error("✗ CLOUDFLARE_API_TOKEN env var required");
  process.exit(1);
}
if (!DB_URL || !DB_TOKEN) {
  console.error("✗ DATABASE_URL + TURSO_AUTH_TOKEN env vars required");
  process.exit(1);
}

const DAYS = 30; // Cloudflare free plan max retention

async function cfGraphQL(query: string): Promise<any> {
  const res = await fetch("https://api.cloudflare.com/client/v4/graphql", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${CF_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) {
    throw new Error(`Cloudflare API HTTP ${res.status}: ${await res.text()}`);
  }
  const data = await res.json();
  if (data.errors) {
    throw new Error(`GraphQL errors: ${JSON.stringify(data.errors)}`);
  }
  return data.data;
}

/** Query Cloudflare Analytics untuk semua request path dalam N hari terakhir. */
async function getPathStats(): Promise<Map<string, number>> {
  const since = new Date(Date.now() - DAYS * 24 * 3600 * 1000)
    .toISOString()
    .split("T")[0] + "T00:00:00Z";
  const until = new Date().toISOString().split("T")[0] + "T23:59:59Z";

  console.log(`Querying Cloudflare Analytics (${DAYS} days: ${since} → ${until})...`);

  const pathCounts = new Map<string, number>();
  let offset = 0;
  const LIMIT = 1000;

  while (true) {
    const query = `query {
      viewer {
        accounts(filter: {accountTag: "${CF_ACCOUNT}"}) {
          httpRequestsAdaptiveGroups(
            filter: {
              datetime_geq: "${since}"
              datetime_leq: "${until}"
            }
            limit: ${LIMIT}
            offset: ${offset}
            orderBy: [count_DESC]
          ) {
            count
            dimensions { clientRequestPath }
          }
        }
      }
    }`;

    const data = await cfGraphQL(query);
    const groups = data?.viewer?.accounts?.[0]?.httpRequestsAdaptiveGroups || [];

    for (const g of groups) {
      const path = g.dimensions?.clientRequestPath || "";
      const count = g.count || 0;
      if (path) {
        pathCounts.set(path, (pathCounts.get(path) || 0) + count);
      }
    }

    console.log(`  Fetched ${groups.length} paths (offset ${offset}), total unique: ${pathCounts.size}`);

    if (groups.length < LIMIT) break;
    offset += LIMIT;
    if (offset >= 10000) break;
  }

  return pathCounts;
}

function extractGalleryId(path: string): string | null {
  const match = path.match(/^\/api\/projects\/([^/?]+)/);
  return match ? match[1] : null;
}

function isGallerySubResource(path: string): boolean {
  return (
    path.includes("/sync") ||
    path.includes("/upload") ||
    path.includes("/pending") ||
    path.includes("/folders") ||
    path.includes("/ai-score")
  );
}

function viewFactor(photoCount: number): number {
  return Math.min(15, 3 + (photoCount / 100) * 0.8);
}

async function main() {
  console.log("=== LIHUM Stats Backfill (Estimasi dari Cloudflare Analytics) ===\n");
  if (DRY_RUN) console.log("⚠ DRY RUN MODE — tidak akan apply ke DB\n");

  const pathCounts = await getPathStats();

  const db = createClient({ url: DB_URL!, authToken: DB_TOKEN! });

  const galRes = await db.execute(
    "SELECT id, name, photoCount FROM Project ORDER BY photoCount DESC"
  );
  const galleries = galRes.rows.map((r) => ({
    id: String(r.id),
    name: String(r.name),
    photoCount: Number(r.photoCount || 0),
  }));
  console.log(`\nFound ${galleries.length} galleries in DB`);

  const viewRequestsByGallery = new Map<string, number>();
  let totalDownloadRequests = 0;

  for (const [path, count] of pathCounts) {
    if (path.startsWith("/api/projects/")) {
      if (isGallerySubResource(path)) continue;
      const galleryId = extractGalleryId(path);
      if (galleryId) {
        viewRequestsByGallery.set(
          galleryId,
          (viewRequestsByGallery.get(galleryId) || 0) + count
        );
      }
    } else if (path.startsWith("/api/photo-proxy/download")) {
      totalDownloadRequests += count;
    }
  }

  const totalViewRequests = Array.from(viewRequestsByGallery.values()).reduce(
    (a, b) => a + b,
    0
  );

  console.log(`\nAggregated stats (last ${DAYS} days):`);
  console.log(`  Total view requests (/api/projects/[id]): ${totalViewRequests.toLocaleString()}`);
  console.log(`  Total download requests (/api/photo-proxy/download): ${totalDownloadRequests.toLocaleString()}`);
  console.log(`  Galleries with view traffic: ${viewRequestsByGallery.size}`);

  const estimates = galleries.map((g) => {
    const vReq = viewRequestsByGallery.get(g.id) || 0;
    const factor = viewFactor(g.photoCount);
    const views = Math.round(vReq / factor);
    const downloadShare = totalViewRequests > 0 ? vReq / totalViewRequests : 0;
    const downloads = Math.round(totalDownloadRequests * downloadShare);
    return { ...g, viewRequests: vReq, viewFactor: factor, views, downloads };
  });

  console.log("\nEstimasi per galeri (top 15 by views):\n");
  console.log(
    "Gallery".padEnd(55) +
      "Foto".padStart(6) +
      "Req".padStart(9) +
      "Factor".padStart(8) +
      "Views".padStart(9) +
      "Downloads".padStart(11)
  );
  console.log("-".repeat(98));
  estimates
    .sort((a, b) => b.views - a.views)
    .slice(0, 15)
    .forEach((e) => {
      console.log(
        e.name.slice(0, 54).padEnd(55) +
          String(e.photoCount).padStart(6) +
          e.viewRequests.toLocaleString().padStart(9) +
          e.viewFactor.toFixed(1).padStart(8) +
          e.views.toLocaleString().padStart(9) +
          e.downloads.toLocaleString().padStart(11)
      );
    });

  const totalEstViews = estimates.reduce((s, e) => s + e.views, 0);
  const totalEstDownloads = estimates.reduce((s, e) => s + e.downloads, 0);
  console.log("-".repeat(98));
  console.log(
    "TOTAL".padEnd(55) +
      "".padStart(6) +
      totalViewRequests.toLocaleString().padStart(9) +
      "".padStart(8) +
      totalEstViews.toLocaleString().padStart(9) +
      totalEstDownloads.toLocaleString().padStart(11)
  );

  if (DRY_RUN) {
    console.log("\n⚠ Dry run — tidak ada perubahan DB. Jalankan tanpa --dry-run untuk apply.");
    return;
  }

  console.log("\nApplying to database...");
  let updated = 0;
  for (const e of estimates) {
    await db.execute({
      sql: "UPDATE Project SET viewCount = ?, downloadCount = ? WHERE id = ?",
      args: [e.views, e.downloads, e.id],
    });
    updated++;
  }
  console.log(`✓ Updated ${updated} galleries.`);
  console.log("\n✓ Backfill selesai!");
}

main().catch((err) => {
  console.error("✗ Error:", err);
  process.exit(1);
});
