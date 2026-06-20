import { db } from "@/lib/db";
import { ensureSeed } from "@/lib/seed";

// Re-export so API routes can import everything from a single module.
export { ensureSeed };

export async function getAccountRole(
  email: string | undefined | null
): Promise<"admin" | "manager" | null> {
  if (!email) return null;
  await ensureSeed();
  const acc = await db.account.findUnique({
    where: { email: email.toLowerCase() },
  });
  return acc ? (acc.role as "admin" | "manager") : null;
}

export async function ensurePrimaryAdmin(email: string) {
  if (email.toLowerCase() !== "synclicen@gmail.com") return;
  const existing = await db.account.findUnique({
    where: { email: "synclicen@gmail.com" },
  });
  if (!existing) {
    await db.account.create({
      data: {
        id: "admin-synclicen",
        email: "synclicen@gmail.com",
        role: "admin",
        displayName: "Admin Utama",
        addedAt: new Date().toISOString().split("T")[0],
      },
    });
  }
}

export function parseDriveFolderId(url: string): string {
  const match = url.match(/(?:folders\/|id=)([a-zA-Z0-9-_]{25,50})/);
  return match ? match[1] : "";
}

export function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || Math.random().toString(36).substring(2, 9)
  );
}

export function emailToId(email: string): string {
  return email.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-");
}
