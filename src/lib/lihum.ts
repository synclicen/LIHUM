import { ensureSeed } from "@/lib/seed";
import { findAccountByEmail, createAccount } from "@/lib/queries";
import { hashPassword, generateSalt, verifyPassword } from "@/lib/password";

// Re-export so API routes can import everything from a single module.
export { ensureSeed, hashPassword, generateSalt, verifyPassword };

/** Returns the role for an email, or null if not registered. */
export async function getAccountRole(
  email: string | undefined | null
): Promise<"admin" | "manager" | null> {
  if (!email) return null;
  await ensureSeed();
  const acc = await findAccountByEmail(email);
  return acc ? (acc.role as "admin" | "manager") : null;
}

/** Auto-registers synclicen@gmail.com as admin if missing. */
export async function ensurePrimaryAdmin(email: string): Promise<void> {
  if (email.toLowerCase() !== "synclicen@gmail.com") return;
  const existing = await findAccountByEmail(email);
  if (!existing) {
    await createAccount({
      id: "admin-synclicen",
      email: "synclicen@gmail.com",
      role: "admin",
      displayName: "Admin Utama",
      addedAt: new Date().toISOString().split("T")[0],
    });
  }
}

/** Extracts the Google Drive folder id from a folder URL. */
export function parseDriveFolderId(url: string): string {
  const match = url.match(/(?:folders\/|id=)([a-zA-Z0-9-_]{25,50})/);
  return match ? match[1] : "";
}

/** Slugifies a gallery name into a URL-safe id. */
export function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || Math.random().toString(36).substring(2, 9)
  );
}

/** Converts an email into a URL-safe account id. */
export function emailToId(email: string): string {
  return email.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-");
}
