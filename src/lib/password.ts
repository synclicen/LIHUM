/**
 * Password hashing utilities using the Web Crypto API.
 *
 * Stored in a separate module (not lihum.ts) to avoid circular imports:
 * seed.ts needs hashPassword, but lihum.ts imports ensureSeed from seed.ts.
 *
 * Works identically on Node.js (>= 15) and Cloudflare Workers.
 */

/**
 * Hashes a password with a salt using SHA-256.
 * Returns "salt:hash" format for storage.
 */
export async function hashPassword(password: string, salt?: string): Promise<string> {
  const s = salt || generateSalt();
  const encoder = new TextEncoder();
  const data = encoder.encode(s + ":" + password);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hash = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${s}:${hash}`;
}

/** Generates a random 16-byte salt as a hex string. */
export function generateSalt(): string {
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  return Array.from(arr).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Verifies a plaintext password against a stored "salt:hash" string.
 * Returns true if the password matches.
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  if (!stored || !password) return false;
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const computed = await hashPassword(password, salt);
  const computedHash = computed.split(":")[1];
  return computedHash === hash;
}
